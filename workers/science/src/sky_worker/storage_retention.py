from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import os
import re
from typing import Any, Iterator
from urllib.parse import urlparse

from .ivoa_contract import HIPS_CURRENT_POINTER, HIPS_STORAGE_PREFIX


DERIVED_BUCKET = "astro-derived"
DEFAULT_RETAIN_COMPLETE_GENERATIONS = 2
DEFAULT_GRACE_HOURS = 24
DEFAULT_MAX_DELETE_OBJECTS = 200_000
LIST_PAGE_SIZE = 1_000
REMOVE_BATCH_SIZE = 1_000
GENERATION_NAME_PATTERN = re.compile(r"[0-9a-f]{20}-[0-9a-f]{12}-o(?:[0-9]|1[0-9]|2[0-9])")


@dataclass(frozen=True)
class StoredObject:
    path: str
    byte_size: int
    updated_at: datetime | None


@dataclass(frozen=True)
class GenerationSummary:
    root_path: str
    complete: bool
    updated_at: datetime | None


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _entry_timestamp(entry: dict[str, Any]) -> datetime | None:
    candidates = [
        _parse_timestamp(entry.get("updated_at")),
        _parse_timestamp(entry.get("created_at")),
        _parse_timestamp(entry.get("last_accessed_at")),
    ]
    present = [value for value in candidates if value is not None]
    return max(present) if present else None


def _entry_byte_size(entry: dict[str, Any]) -> int:
    metadata = entry.get("metadata")
    if not isinstance(metadata, dict):
        return 0
    value = metadata.get("size", metadata.get("contentLength", 0))
    try:
        size = int(value)
    except (TypeError, ValueError):
        return 0
    return max(size, 0)


def _safe_child_name(entry: dict[str, Any]) -> str:
    name = entry.get("name")
    if not isinstance(name, str) or not name or name in {".", ".."} or "/" in name:
        raise RuntimeError("storage returned an unsafe object name")
    return name


def _list_directory(bucket: Any, prefix: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    offset = 0
    while True:
        page = bucket.list(
            prefix,
            {
                "limit": LIST_PAGE_SIZE,
                "offset": offset,
                "sortBy": {"column": "name", "order": "asc"},
            },
        )
        if not isinstance(page, list):
            raise RuntimeError("storage list returned an unexpected response")
        if any(not isinstance(entry, dict) for entry in page):
            raise RuntimeError("storage list returned an invalid entry")
        entries.extend(page)
        if len(page) < LIST_PAGE_SIZE:
            break
        offset += len(page)
    return entries


def _walk_objects(bucket: Any, root_path: str) -> Iterator[StoredObject]:
    pending = [root_path]
    while pending:
        directory = pending.pop()
        for entry in _list_directory(bucket, directory):
            child_name = _safe_child_name(entry)
            child_path = f"{directory}/{child_name}"
            if entry.get("id") is None:
                pending.append(child_path)
                continue
            yield StoredObject(
                path=child_path,
                byte_size=_entry_byte_size(entry),
                updated_at=_entry_timestamp(entry),
            )


def _read_current_pointer(bucket: Any) -> dict[str, Any]:
    raw = bucket.download(HIPS_CURRENT_POINTER)
    if hasattr(raw, "read"):
        raw = raw.read()
    if not isinstance(raw, (bytes, bytearray)):
        raise RuntimeError("current HiPS pointer is not a byte payload")
    try:
        pointer = json.loads(bytes(raw).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("current HiPS pointer is not valid JSON") from error
    if not isinstance(pointer, dict):
        raise RuntimeError("current HiPS pointer is not an object")
    if pointer.get("schema") != "sky-map-ivoa-hips-pointer-v1":
        raise RuntimeError("current HiPS pointer has an unsupported schema")

    root_path = pointer.get("root_path")
    expected_prefix = f"{HIPS_STORAGE_PREFIX}/"
    if not isinstance(root_path, str) or not root_path.startswith(expected_prefix):
        raise RuntimeError("current HiPS pointer targets an unexpected prefix")
    generation_name = root_path.removeprefix(expected_prefix)
    if not GENERATION_NAME_PATTERN.fullmatch(generation_name):
        raise RuntimeError("current HiPS pointer has an invalid generation name")
    if pointer.get("manifest_path") != f"{root_path}/sky-map-manifest.json":
        raise RuntimeError("current HiPS pointer manifest does not belong to its generation")
    return pointer


def _generation_summary(bucket: Any, root_path: str) -> GenerationSummary:
    entries = _list_directory(bucket, root_path)
    file_entries = {
        _safe_child_name(entry): entry for entry in entries if entry.get("id") is not None
    }
    complete = {"Moc.fits", "properties", "sky-map-manifest.json"} <= file_entries.keys()
    timestamps = [_entry_timestamp(entry) for entry in file_entries.values()]
    updated_at = max((value for value in timestamps if value is not None), default=None)
    return GenerationSummary(root_path=root_path, complete=complete, updated_at=updated_at)


def _discover_generations(bucket: Any) -> tuple[dict[str, Any], list[GenerationSummary], list[str]]:
    pointer = _read_current_pointer(bucket)
    active_root = str(pointer["root_path"])
    roots: list[str] = []
    ignored_roots: list[str] = []
    for entry in _list_directory(bucket, HIPS_STORAGE_PREFIX):
        name = _safe_child_name(entry)
        if entry.get("id") is not None:
            if name != "current.json":
                ignored_roots.append(f"{HIPS_STORAGE_PREFIX}/{name}")
            continue
        root_path = f"{HIPS_STORAGE_PREFIX}/{name}"
        if GENERATION_NAME_PATTERN.fullmatch(name):
            roots.append(root_path)
        else:
            ignored_roots.append(root_path)

    if active_root not in roots:
        raise RuntimeError("active HiPS generation is missing from Storage")
    summaries = [_generation_summary(bucket, root_path) for root_path in sorted(roots)]
    active = next(summary for summary in summaries if summary.root_path == active_root)
    if not active.complete:
        raise RuntimeError("active HiPS generation is incomplete; retention stopped")
    return pointer, summaries, ignored_roots


def _retained_roots(
    active_root: str,
    summaries: list[GenerationSummary],
    retain_complete_generations: int,
) -> set[str]:
    complete = sorted(
        (summary for summary in summaries if summary.complete and summary.root_path != active_root),
        key=lambda summary: (
            summary.updated_at or datetime.min.replace(tzinfo=timezone.utc),
            summary.root_path,
        ),
        reverse=True,
    )
    retained = {active_root}
    retained.update(
        summary.root_path for summary in complete[: retain_complete_generations - 1]
    )
    return retained


def _eligible_for_pruning(
    summary: GenerationSummary,
    *,
    retained_roots: set[str],
    cutoff: datetime,
) -> bool:
    if summary.root_path in retained_roots:
        return False
    if summary.updated_at is None:
        return False
    return summary.updated_at <= cutoff


def _remove_batch(bucket: Any, paths: list[str]) -> None:
    if not paths or len(paths) > REMOVE_BATCH_SIZE:
        raise ValueError("storage removal batch must contain between 1 and 1000 objects")
    response = bucket.remove(paths)
    if response is None:
        raise RuntimeError("storage remove returned no response")


def prune_obsolete_ivoa_generations(
    bucket: Any,
    *,
    apply: bool = False,
    retain_complete_generations: int = DEFAULT_RETAIN_COMPLETE_GENERATIONS,
    grace_hours: int = DEFAULT_GRACE_HOURS,
    max_delete_objects: int = DEFAULT_MAX_DELETE_OBJECTS,
    now: datetime | None = None,
) -> dict[str, Any]:
    if not 2 <= retain_complete_generations <= 10:
        raise ValueError("retain_complete_generations must be between 2 and 10")
    if not 1 <= grace_hours <= 24 * 30:
        raise ValueError("grace_hours must be between 1 and 720")
    if not 1 <= max_delete_objects <= 1_000_000:
        raise ValueError("max_delete_objects must be between 1 and 1,000,000")

    clock = now or datetime.now(timezone.utc)
    if clock.tzinfo is None:
        clock = clock.replace(tzinfo=timezone.utc)
    clock = clock.astimezone(timezone.utc)
    cutoff = clock - timedelta(hours=grace_hours)

    pointer, summaries, ignored_roots = _discover_generations(bucket)
    active_root = str(pointer["root_path"])
    retained_roots = _retained_roots(
        active_root,
        summaries,
        retain_complete_generations,
    )
    candidates = sorted(
        (
            summary
            for summary in summaries
            if _eligible_for_pruning(summary, retained_roots=retained_roots, cutoff=cutoff)
        ),
        key=lambda summary: (
            summary.updated_at or datetime.min.replace(tzinfo=timezone.utc),
            summary.root_path,
        ),
    )

    planned_roots: list[str] = []
    deleted_roots: list[str] = []
    planned_objects = 0
    planned_bytes = 0
    deleted_objects = 0
    deleted_bytes = 0
    limit_reached = False

    for candidate in candidates:
        objects = list(_walk_objects(bucket, candidate.root_path))
        if not objects:
            continue
        remaining = max_delete_objects - (deleted_objects if apply else planned_objects)
        if remaining <= 0:
            limit_reached = True
            break
        if len(objects) > remaining:
            limit_reached = True
            break
        selected = objects

        planned_roots.append(candidate.root_path)
        planned_objects += len(selected)
        planned_bytes += sum(item.byte_size for item in selected)

        if apply:
            for offset in range(0, len(selected), REMOVE_BATCH_SIZE):
                current = _read_current_pointer(bucket)
                if current.get("root_path") != active_root:
                    raise RuntimeError("current HiPS pointer changed during retention")
                batch = selected[offset : offset + REMOVE_BATCH_SIZE]
                _remove_batch(bucket, [item.path for item in batch])
                deleted_objects += len(batch)
                deleted_bytes += sum(item.byte_size for item in batch)
            remaining_objects = list(_walk_objects(bucket, candidate.root_path))
            if remaining_objects:
                raise RuntimeError(
                    f"generation {candidate.root_path} still contains objects after removal"
                )
            deleted_roots.append(candidate.root_path)

    return {
        "status": "applied" if apply else "dry-run",
        "active_root": active_root,
        "retained_roots": sorted(retained_roots),
        "candidate_roots": [summary.root_path for summary in candidates],
        "planned_roots": planned_roots,
        "planned_objects": planned_objects,
        "planned_bytes": planned_bytes,
        "deleted_roots": deleted_roots,
        "deleted_objects": deleted_objects,
        "deleted_bytes": deleted_bytes,
        "ignored_roots": sorted(ignored_roots),
        "grace_hours": grace_hours,
        "max_delete_objects": max_delete_objects,
        "limit_reached": limit_reached,
    }


def _validate_server_key(key: str) -> None:
    if key.startswith("sb_secret_") and len(key) >= 32:
        return
    if key.startswith("sb_publishable_"):
        raise RuntimeError("SUPABASE_SECRET_KEY is a publishable key")
    parts = key.split(".")
    if len(parts) != 3:
        raise RuntimeError("SUPABASE_SECRET_KEY is not a server key")
    try:
        padding = "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + padding).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("SUPABASE_SECRET_KEY is not a valid legacy server key") from error
    if not isinstance(payload, dict) or payload.get("role") != "service_role":
        raise RuntimeError("SUPABASE_SECRET_KEY does not carry the service_role")


def _bucket_from_environment() -> Any:
    from supabase import create_client

    supabase_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not supabase_url or not secret_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY are required")
    parsed = urlparse(supabase_url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not parsed.hostname.endswith(".supabase.co")
        or parsed.path not in {"", "/"}
        or parsed.params
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError("SUPABASE_URL must be a hosted Supabase project URL")
    project_ref = os.environ.get("SKY_SUPABASE_PROJECT_REF", "").strip()
    if project_ref and parsed.hostname != f"{project_ref}.supabase.co":
        raise RuntimeError("SUPABASE_URL targets a different project")
    _validate_server_key(secret_key)
    return create_client(supabase_url, secret_key).storage.from_(DERIVED_BUCKET)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prune obsolete immutable IVOA HiPS generations from Supabase Storage."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Permanently remove eligible objects. Without this flag, only report the plan.",
    )
    parser.add_argument(
        "--retain-complete-generations",
        type=int,
        default=DEFAULT_RETAIN_COMPLETE_GENERATIONS,
    )
    parser.add_argument("--grace-hours", type=int, default=DEFAULT_GRACE_HOURS)
    parser.add_argument(
        "--max-delete-objects",
        type=int,
        default=DEFAULT_MAX_DELETE_OBJECTS,
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    result = prune_obsolete_ivoa_generations(
        _bucket_from_environment(),
        apply=args.apply,
        retain_complete_generations=args.retain_complete_generations,
        grace_hours=args.grace_hours,
        max_delete_objects=args.max_delete_objects,
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
