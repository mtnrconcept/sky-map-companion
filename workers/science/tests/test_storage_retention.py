from __future__ import annotations

import base64
from datetime import datetime, timezone
import json
from typing import Any

import pytest

from sky_worker.storage_retention import (
    HIPS_CURRENT_POINTER,
    HIPS_STORAGE_PREFIX,
    REMOVE_BATCH_SIZE,
    _validate_server_key,
    prune_obsolete_ivoa_generations,
)


ACTIVE = "aaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaa-o9"
PREVIOUS = "bbbbbbbbbbbbbbbbbbbb-bbbbbbbbbbbb-o9"
OLD_COMPLETE = "cccccccccccccccccccc-cccccccccccc-o9"
OLD_INCOMPLETE = "dddddddddddddddddddd-dddddddddddd-o9"
RECENT_INCOMPLETE = "eeeeeeeeeeeeeeeeeeee-eeeeeeeeeeee-o9"


class FakeBucket:
    def __init__(self) -> None:
        self.objects: dict[str, dict[str, Any]] = {}
        self.payloads: dict[str, bytes] = {}
        self.remove_calls: list[list[str]] = []

    def add(
        self,
        path: str,
        *,
        size: int = 1,
        updated_at: str = "2026-08-01T00:00:00+00:00",
        payload: bytes = b"object",
    ) -> None:
        self.objects[path] = {
            "id": f"id-{len(self.objects)}",
            "name": path.rsplit("/", 1)[-1],
            "updated_at": updated_at,
            "created_at": updated_at,
            "metadata": {"size": size},
        }
        self.payloads[path] = payload

    def add_generation(
        self,
        name: str,
        *,
        complete: bool,
        updated_at: str,
        nested_files: int = 1,
    ) -> None:
        root = f"{HIPS_STORAGE_PREFIX}/{name}"
        self.add(f"{root}/Moc.fits", size=10, updated_at=updated_at)
        if complete:
            self.add(f"{root}/properties", size=10, updated_at=updated_at)
            self.add(f"{root}/sky-map-manifest.json", size=10, updated_at=updated_at)
        for index in range(nested_files):
            self.add(
                f"{root}/Norder9/Dir0/Npix{index}.fits",
                size=100,
                updated_at=updated_at,
            )

    def set_pointer(self, name: str = ACTIVE) -> None:
        root = f"{HIPS_STORAGE_PREFIX}/{name}"
        pointer = {
            "schema": "sky-map-ivoa-hips-pointer-v1",
            "root_path": root,
            "manifest_path": f"{root}/sky-map-manifest.json",
        }
        self.add(
            HIPS_CURRENT_POINTER,
            payload=json.dumps(pointer).encode("utf-8"),
            updated_at="2026-08-10T00:00:00+00:00",
        )

    def download(self, path: str) -> bytes:
        return self.payloads[path]

    def list(self, prefix: str, options: dict[str, Any]) -> list[dict[str, Any]]:
        start = f"{prefix.rstrip('/')}/"
        children: dict[str, dict[str, Any]] = {}
        for path, stored in self.objects.items():
            if not path.startswith(start):
                continue
            remainder = path[len(start) :]
            child, separator, _ = remainder.partition("/")
            if separator:
                children.setdefault(child, {"id": None, "name": child, "metadata": None})
            else:
                children[child] = {**stored, "name": child}
        ordered = [children[name] for name in sorted(children)]
        offset = int(options.get("offset", 0))
        limit = int(options.get("limit", 100))
        return ordered[offset : offset + limit]

    def remove(self, paths: list[str]) -> list[dict[str, str]]:
        self.remove_calls.append(list(paths))
        for path in paths:
            self.objects.pop(path, None)
            self.payloads.pop(path, None)
        return [{"name": path} for path in paths]


def _populated_bucket(*, old_complete_files: int = 1) -> FakeBucket:
    bucket = FakeBucket()
    bucket.add_generation(
        ACTIVE,
        complete=True,
        updated_at="2026-08-10T00:00:00+00:00",
    )
    bucket.add_generation(
        PREVIOUS,
        complete=True,
        updated_at="2026-08-09T00:00:00+00:00",
    )
    bucket.add_generation(
        OLD_COMPLETE,
        complete=True,
        updated_at="2026-08-01T00:00:00+00:00",
        nested_files=old_complete_files,
    )
    bucket.add_generation(
        OLD_INCOMPLETE,
        complete=False,
        updated_at="2026-08-01T00:00:00+00:00",
    )
    bucket.add_generation(
        RECENT_INCOMPLETE,
        complete=False,
        updated_at="2026-08-10T18:00:00+00:00",
    )
    bucket.set_pointer()
    return bucket


def test_dry_run_keeps_active_previous_and_recent_generations() -> None:
    bucket = _populated_bucket()

    result = prune_obsolete_ivoa_generations(
        bucket,
        now=datetime(2026, 8, 11, tzinfo=timezone.utc),
    )

    assert result["status"] == "dry-run"
    assert set(result["retained_roots"]) == {
        f"{HIPS_STORAGE_PREFIX}/{ACTIVE}",
        f"{HIPS_STORAGE_PREFIX}/{PREVIOUS}",
    }
    assert set(result["candidate_roots"]) == {
        f"{HIPS_STORAGE_PREFIX}/{OLD_COMPLETE}",
        f"{HIPS_STORAGE_PREFIX}/{OLD_INCOMPLETE}",
    }
    assert result["planned_objects"] == 6
    assert result["deleted_objects"] == 0
    assert bucket.remove_calls == []


def test_apply_removes_only_eligible_roots_in_bounded_batches() -> None:
    bucket = _populated_bucket(old_complete_files=REMOVE_BATCH_SIZE + 1)

    result = prune_obsolete_ivoa_generations(
        bucket,
        apply=True,
        max_delete_objects=10_000,
        now=datetime(2026, 8, 11, tzinfo=timezone.utc),
    )

    assert result["status"] == "applied"
    assert set(result["deleted_roots"]) == {
        f"{HIPS_STORAGE_PREFIX}/{OLD_COMPLETE}",
        f"{HIPS_STORAGE_PREFIX}/{OLD_INCOMPLETE}",
    }
    assert all(len(batch) <= REMOVE_BATCH_SIZE for batch in bucket.remove_calls)
    assert len(bucket.remove_calls) >= 3
    assert not any(f"/{OLD_COMPLETE}/" in path for path in bucket.objects)
    assert not any(f"/{OLD_INCOMPLETE}/" in path for path in bucket.objects)
    assert any(f"/{ACTIVE}/" in path for path in bucket.objects)
    assert any(f"/{PREVIOUS}/" in path for path in bucket.objects)
    assert any(f"/{RECENT_INCOMPLETE}/" in path for path in bucket.objects)


def test_invalid_pointer_fails_closed_without_removing_objects() -> None:
    bucket = _populated_bucket()
    bucket.payloads[HIPS_CURRENT_POINTER] = b'{"root_path":"other-bucket/root"}'

    with pytest.raises(RuntimeError, match="unsupported schema"):
        prune_obsolete_ivoa_generations(
            bucket,
            apply=True,
            now=datetime(2026, 8, 11, tzinfo=timezone.utc),
        )

    assert bucket.remove_calls == []


def test_delete_limit_never_partially_removes_a_generation() -> None:
    bucket = _populated_bucket(old_complete_files=20)

    result = prune_obsolete_ivoa_generations(
        bucket,
        apply=True,
        max_delete_objects=5,
        now=datetime(2026, 8, 11, tzinfo=timezone.utc),
    )

    assert result["deleted_objects"] == 0
    assert result["deleted_roots"] == []
    assert result["limit_reached"] is True
    assert bucket.remove_calls == []
    assert any(f"/{OLD_COMPLETE}/" in path for path in bucket.objects)


def test_server_key_validation_accepts_only_secret_or_service_role() -> None:
    _validate_server_key("sb_secret_" + "x" * 32)
    payload = base64.urlsafe_b64encode(json.dumps({"role": "service_role"}).encode()).decode()
    _validate_server_key(f"header.{payload.rstrip('=')}.signature")

    with pytest.raises(RuntimeError, match="publishable"):
        _validate_server_key("sb_publishable_" + "x" * 32)
    anon = base64.urlsafe_b64encode(json.dumps({"role": "anon"}).encode()).decode()
    with pytest.raises(RuntimeError, match="service_role"):
        _validate_server_key(f"header.{anon.rstrip('=')}.signature")
