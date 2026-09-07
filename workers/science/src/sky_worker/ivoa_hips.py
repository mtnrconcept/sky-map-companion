from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import hashlib
import json
import mimetypes
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from typing import Any
from uuid import UUID

from .config import Config
from .gateway import Gateway
from .ivoa_contract import (
    HIPS_CURRENT_POINTER,
    HIPS_DEEP_CURRENT_POINTER,
    HIPS_DEEP_STORAGE_PREFIX,
    HIPS_STORAGE_PREFIX,
)


HIPSGEN_VERSION = "12.677"
HIPSGEN_SHA256 = "26c6b303c005ccdbc3c0103cbbd590f420ac5609ff69807a4c42a461fd8d3466"
HIPSGEN_DOWNLOAD_URL = "https://aladin.cds.unistra.fr/java/Hipsgen.jar"
DEFAULT_HIPS_ORDER = 9
DEFAULT_FILTER = "r"
HIPS_ID = "SKYMAP/P/public-optical-r"
DEEP_HIPS_ID = "SKYMAP/P/public-optical-r-deep"
DEEP_MAX_NATIVE_PIXEL_SCALE_ARCSEC = 0.2
DEEP_MIN_HIPS_ORDER = 10
DEEP_MAX_HIPS_ORDER = 14
HIPS_TILE_WIDTH = 512
HIPS_ORDER_ZERO_PIXEL_WIDTH_DEG = 58.6323
PREVIEW_RENDER_VERSION = "regional-asinh-v1"
PREVIEW_PIXEL_CUT = "0.5% 99.995% byRegion/1Mpix asinh"
PUBLISH_RETRY_ATTEMPTS = 5
PUBLISH_RETRY_BASE_DELAY_SECONDS = 1.0


@dataclass(frozen=True)
class IvoaHipsProfile:
    name: str
    storage_prefix: str
    current_pointer: str
    hips_id: str
    max_native_pixel_scale_arcsec: float | None
    min_order: int
    max_order: int


HIPS_PROFILES: dict[str, IvoaHipsProfile] = {
    "standard": IvoaHipsProfile(
        name="standard",
        storage_prefix=HIPS_STORAGE_PREFIX,
        current_pointer=HIPS_CURRENT_POINTER,
        hips_id=HIPS_ID,
        max_native_pixel_scale_arcsec=None,
        min_order=0,
        max_order=29,
    ),
    "deep": IvoaHipsProfile(
        name="deep",
        storage_prefix=HIPS_DEEP_STORAGE_PREFIX,
        current_pointer=HIPS_DEEP_CURRENT_POINTER,
        hips_id=DEEP_HIPS_ID,
        max_native_pixel_scale_arcsec=DEEP_MAX_NATIVE_PIXEL_SCALE_ARCSEC,
        min_order=DEEP_MIN_HIPS_ORDER,
        max_order=DEEP_MAX_HIPS_ORDER,
    ),
}


@dataclass(frozen=True)
class IvoaHipsSource:
    upload_id: str
    storage_path: str
    content_sha256: str
    file_size_bytes: int
    object_id: str | None
    attribution_text: str
    rights_uri: str


@dataclass(frozen=True)
class IvoaHipsValidation:
    hips_order: int
    fits_tiles: int
    png_tiles: int
    properties_sha256: str
    moc_sha256: str
    allsky_sha256: str | None


def hips_pixel_scale_arcsec(order: int, tile_width: int = HIPS_TILE_WIDTH) -> float:
    if not 0 <= order <= 29:
        raise ValueError("HiPS order must be between 0 and 29")
    if tile_width < 1:
        raise ValueError("HiPS tile width must be positive")
    return (HIPS_ORDER_ZERO_PIXEL_WIDTH_DEG * 3600.0) / (tile_width * 2**order)


def recommended_hips_order(
    native_pixel_scales_arcsec: list[float],
    *,
    min_order: int = DEEP_MIN_HIPS_ORDER,
    max_order: int = DEEP_MAX_HIPS_ORDER,
) -> int:
    usable = sorted(scale for scale in native_pixel_scales_arcsec if scale > 0)
    if not usable:
        raise ValueError("at least one positive native pixel scale is required")
    if not 0 <= min_order <= max_order <= 29:
        raise ValueError("invalid HiPS order bounds")
    best_native_scale = usable[0]
    for order in range(min_order, max_order + 1):
        if hips_pixel_scale_arcsec(order) <= best_native_scale:
            return order
    return max_order


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_sha256(value: str, *, label: str) -> str:
    normalized = value.lower().strip()
    if len(normalized) != 64 or any(character not in "0123456789abcdef" for character in normalized):
        raise ValueError(f"{label} is not a SHA-256 digest")
    return normalized


def inventory_sha256(sources: list[IvoaHipsSource]) -> str:
    if not sources:
        raise ValueError("HiPS source inventory cannot be empty")
    canonical = [asdict(source) for source in sorted(sources, key=lambda item: item.upload_id)]
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def parse_properties(text: str) -> dict[str, str]:
    properties: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        properties[key.strip()] = value.strip()
    return properties


def validate_hips_output(root: Path, *, expected_order: int) -> IvoaHipsValidation:
    properties_path = root / "properties"
    moc_path = root / "Moc.fits"
    if not properties_path.is_file():
        raise RuntimeError("Hipsgen output is missing properties")
    if not moc_path.is_file():
        raise RuntimeError("Hipsgen output is missing Moc.fits")

    properties_bytes = properties_path.read_bytes()
    properties = parse_properties(properties_bytes.decode("utf-8"))
    try:
        hips_order = int(properties["hips_order"])
    except (KeyError, ValueError) as error:
        raise RuntimeError("Hipsgen properties do not contain a valid hips_order") from error
    if hips_order != expected_order:
        raise RuntimeError(
            f"Hipsgen produced order {hips_order}, expected frozen order {expected_order}"
        )
    if properties.get("hips_frame", "").lower() != "equatorial":
        raise RuntimeError("Hipsgen output is not in the equatorial frame")

    formats = {item.lower() for item in properties.get("hips_tile_format", "").split()}
    if not {"fits", "png"} <= formats:
        raise RuntimeError("Hipsgen output must publish both FITS and PNG tiles")

    fits_tiles = sorted(root.glob("Norder*/Dir*/Npix*.fits"))
    png_tiles = sorted(root.glob("Norder*/Dir*/Npix*.png"))
    if not fits_tiles or not png_tiles:
        raise RuntimeError("Hipsgen output contains no scientific or preview tiles")
    if len(fits_tiles) != len(png_tiles):
        raise RuntimeError("Hipsgen FITS and PNG tile inventories differ")

    allsky_path = root / "Norder3" / "Allsky.png"
    if expected_order >= 3 and not allsky_path.is_file():
        raise RuntimeError("Hipsgen output is missing Norder3/Allsky.png")

    return IvoaHipsValidation(
        hips_order=hips_order,
        fits_tiles=len(fits_tiles),
        png_tiles=len(png_tiles),
        properties_sha256=_sha256_file(properties_path),
        moc_sha256=_sha256_file(moc_path),
        allsky_sha256=_sha256_file(allsky_path) if allsky_path.is_file() else None,
    )


def _eligible_source_inventory(
    gateway: Gateway,
    spectral_filter: str,
    *,
    max_native_pixel_scale_arcsec: float | None = None,
) -> tuple[list[IvoaHipsSource], list[float]]:
    rows = gateway.execute(
        """
        select u.id::text as upload_id,
               u.storage_path,
               u.content_sha256,
               u.file_size_bytes,
               u.object_id,
               u.attribution_text,
               u.rights_uri,
               solution.native_pixel_scale_arcsec
        from public.astro_uploads u
        left join lateral (
          select min(s.native_pixel_scale_arcsec) as native_pixel_scale_arcsec
          from public.astrometric_solutions s
          where s.upload_id=u.id
            and s.native_pixel_scale_arcsec > 0
        ) solution on true
        where u.source_kind='public_archive'
          and u.frame_type='light'
          and u.status='published'
          and u.rejected=false
          and u.solved=true
          and u.deleted_at is null
          and u.licence_code='PUBLIC-ARCHIVE'
          and lower(coalesce(u.filter_name,''))=lower(%s)
          and u.storage_path is not null
          and u.content_sha256 is not null
          and u.attribution_text is not null
          and u.rights_uri is not null
          and (
            %s::double precision is null
            or solution.native_pixel_scale_arcsec <= %s::double precision
          )
        order by u.id
        """,
        (spectral_filter, max_native_pixel_scale_arcsec, max_native_pixel_scale_arcsec),
    )
    sources: list[IvoaHipsSource] = []
    native_pixel_scales: list[float] = []
    for row in rows:
        checksum = _validate_sha256(str(row["content_sha256"]), label="source checksum")
        byte_size = int(row["file_size_bytes"])
        if byte_size <= 0:
            raise RuntimeError(f"published source {row['upload_id']} has an invalid byte size")
        sources.append(
            IvoaHipsSource(
                upload_id=str(row["upload_id"]),
                storage_path=str(row["storage_path"]),
                content_sha256=checksum,
                file_size_bytes=byte_size,
                object_id=str(row["object_id"]) if row.get("object_id") is not None else None,
                attribution_text=str(row["attribution_text"]),
                rights_uri=str(row["rights_uri"]),
            )
        )
        native_scale = row.get("native_pixel_scale_arcsec")
        if native_scale is not None and float(native_scale) > 0:
            native_pixel_scales.append(float(native_scale))
    return sources, native_pixel_scales


def _eligible_sources(gateway: Gateway, spectral_filter: str) -> list[IvoaHipsSource]:
    sources, _ = _eligible_source_inventory(gateway, spectral_filter)
    if not sources:
        raise RuntimeError(f"no qualified public FITS are available for filter {spectral_filter}")
    return sources


def _read_current_pointer(gateway: Gateway, pointer_path: str = HIPS_CURRENT_POINTER) -> dict[str, Any] | None:
    try:
        payload = gateway.storage.storage.from_("astro-derived").download(pointer_path)
    except Exception:
        return None
    try:
        decoded = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return decoded if isinstance(decoded, dict) else None


def _verify_hipsgen_jar(path: Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(path)
    actual = _sha256_file(path)
    if actual != HIPSGEN_SHA256:
        raise RuntimeError(
            "Hipsgen artifact checksum mismatch: "
            f"expected {HIPSGEN_SHA256}, received {actual}"
        )


def _run_hipsgen(
    jar_path: Path,
    input_directory: Path,
    output_directory: Path,
    *,
    order: int,
    max_threads: int,
    hips_id: str = HIPS_ID,
) -> None:
    if not 0 <= order <= 29:
        raise ValueError("HiPS order must be between 0 and 29")
    if max_threads < 1:
        raise ValueError("Hipsgen max thread count must be positive")

    generation_command = [
        "java",
        "-Xmx6g",
        "-jar",
        str(jar_path),
        "-clean",
        f"in={input_directory}",
        f"out={output_directory}",
        f"id={hips_id}",
        f"order={order}",
        "minOrder=0",
        "frame=equatorial",
        f"maxThread={max_threads}",
        f"pixelCut={PREVIEW_PIXEL_CUT}",
        "INDEX",
        "TILES",
        "PNG",
        "CHECKCODE",
    ]
    subprocess.run(generation_command, check=True)
    subprocess.run(
        ["java", "-jar", str(jar_path), f"out={output_directory}", "CHECK"],
        check=True,
    )
    subprocess.run(
        ["java", "-jar", str(jar_path), f"out={output_directory}", "LINT"],
        check=True,
    )


def _stage_sources(gateway: Gateway, sources: list[IvoaHipsSource], root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    for source in sources:
        source_directory = root / source.upload_id
        source_directory.mkdir(parents=True, exist_ok=True)
        artifact = gateway.download_upload(UUID(source.upload_id), source_directory)
        staged_path = source_directory / "source.fits"
        if artifact.local_path != staged_path:
            artifact.local_path.replace(staged_path)
        if staged_path.stat().st_size != source.file_size_bytes:
            raise RuntimeError(f"staged source {source.upload_id} changed byte size")
        if _sha256_file(staged_path) != source.content_sha256:
            raise RuntimeError(f"staged source {source.upload_id} changed checksum")


def _content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".fits", ".fit", ".fts"}:
        return "application/fits"
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".json":
        return "application/json"
    if path.name == "properties" or suffix in {".txt", ".xml", ".html"}:
        return mimetypes.guess_type(path.name)[0] or "text/plain"
    return "application/octet-stream"


def _generation_storage_root(
    inventory_hash: str,
    validation: IvoaHipsValidation,
    *,
    storage_prefix: str = HIPS_STORAGE_PREFIX,
) -> str:
    identity = json.dumps(
        {
            "inventory_sha256": inventory_hash,
            "hips_order": validation.hips_order,
            "hipsgen_sha256": HIPSGEN_SHA256,
            "preview_render_version": PREVIEW_RENDER_VERSION,
            "preview_pixel_cut": PREVIEW_PIXEL_CUT,
            "properties_sha256": validation.properties_sha256,
            "moc_sha256": validation.moc_sha256,
            "allsky_sha256": validation.allsky_sha256,
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    generation_hash = hashlib.sha256(identity).hexdigest()
    return (
        f"{storage_prefix}/{inventory_hash[:20]}-"
        f"{generation_hash[:12]}-o{validation.hips_order}"
    )


def _ensure_derivative_file_with_retry(
    gateway: Gateway,
    storage_path: str,
    local_path: Path,
    content_type: str,
) -> str:
    last_error: Exception | None = None
    for attempt in range(1, PUBLISH_RETRY_ATTEMPTS + 1):
        try:
            return gateway.ensure_derivative_file(storage_path, local_path, content_type)
        except Exception as error:
            last_error = error
            if attempt >= PUBLISH_RETRY_ATTEMPTS:
                raise
            time.sleep(PUBLISH_RETRY_BASE_DELAY_SECONDS * attempt)
    if last_error is not None:
        raise last_error
    raise RuntimeError("derivative publication retry loop did not execute")


def _publish_generated_tree(
    gateway: Gateway,
    output_root: Path,
    storage_root: str,
) -> list[dict[str, Any]]:
    published: list[dict[str, Any]] = []
    for local_path in sorted(path for path in output_root.rglob("*") if path.is_file()):
        relative = local_path.relative_to(output_root)
        if relative.parts and relative.parts[0] == "HpxFinder":
            continue
        storage_path = f"{storage_root}/{relative.as_posix()}"
        checksum = _ensure_derivative_file_with_retry(
            gateway,
            storage_path,
            local_path,
            _content_type(local_path),
        )
        published.append(
            {
                "path": relative.as_posix(),
                "sha256": checksum,
                "byte_size": local_path.stat().st_size,
            }
        )
    if not published:
        raise RuntimeError("no Hipsgen artifacts were published")
    return published


def _publish_json_pointer(gateway: Gateway, path: str, payload: dict[str, Any]) -> None:
    encoded = (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    bucket = gateway.storage.storage.from_("astro-derived")
    last_error: Exception | None = None
    for attempt in range(1, PUBLISH_RETRY_ATTEMPTS + 1):
        try:
            response = bucket.upload(
                path,
                encoded,
                {
                    "content-type": "application/json",
                    "cache-control": "60",
                    "upsert": "true",
                },
            )
            if not response:
                raise RuntimeError("failed to publish current HiPS pointer")
            verified = bucket.download(path)
            if verified != encoded:
                raise RuntimeError("current HiPS pointer verification failed")
            return
        except Exception as error:
            last_error = error
            if attempt >= PUBLISH_RETRY_ATTEMPTS:
                raise
            time.sleep(PUBLISH_RETRY_BASE_DELAY_SECONDS * attempt)
    if last_error is not None:
        raise last_error
    raise RuntimeError("current HiPS pointer retry loop did not execute")


def build_public_ivoa_hips(
    gateway: Gateway,
    jar_path: Path,
    *,
    order: int | None = DEFAULT_HIPS_ORDER,
    spectral_filter: str = DEFAULT_FILTER,
    max_threads: int = 4,
    force: bool = False,
    profile: str = "standard",
) -> dict[str, Any]:
    _verify_hipsgen_jar(jar_path)
    try:
        publication = HIPS_PROFILES[profile]
    except KeyError as error:
        raise ValueError(f"unknown HiPS publication profile: {profile}") from error
    if spectral_filter.lower() != DEFAULT_FILTER:
        raise ValueError("public optical HiPS profiles currently require the r spectral filter")

    sources, native_pixel_scales = _eligible_source_inventory(
        gateway,
        spectral_filter,
        max_native_pixel_scale_arcsec=publication.max_native_pixel_scale_arcsec,
    )
    if not sources:
        if publication.name == "deep":
            result = {
                "status": "no-qualified-deep-sources",
                "profile": publication.name,
                "max_native_pixel_scale_arcsec": publication.max_native_pixel_scale_arcsec,
                "source_count": 0,
            }
            print(json.dumps(result, sort_keys=True))
            return result
        raise RuntimeError(f"no qualified public FITS are available for filter {spectral_filter}")

    resolved_order = order
    if resolved_order is None:
        if publication.name == "standard":
            resolved_order = DEFAULT_HIPS_ORDER
        else:
            resolved_order = recommended_hips_order(
                native_pixel_scales,
                min_order=publication.min_order,
                max_order=publication.max_order,
            )
    if not publication.min_order <= resolved_order <= publication.max_order:
        raise ValueError(
            f"HiPS order {resolved_order} is outside profile {publication.name} bounds "
            f"{publication.min_order}..{publication.max_order}"
        )

    inventory_hash = inventory_sha256(sources)
    current = _read_current_pointer(gateway, publication.current_pointer)
    if (
        not force
        and current
        and current.get("inventory_sha256") == inventory_hash
        and current.get("hips_order") == resolved_order
        and current.get("hipsgen_sha256") == HIPSGEN_SHA256
        and current.get("preview_render_version") == PREVIEW_RENDER_VERSION
        and current.get("preview_pixel_cut") == PREVIEW_PIXEL_CUT
        and isinstance(current.get("root_path"), str)
    ):
        result = {
            "status": "unchanged",
            "profile": publication.name,
            "root_path": current["root_path"],
            "inventory_sha256": inventory_hash,
            "source_count": len(sources),
            "hips_order": resolved_order,
            "preview_render_version": PREVIEW_RENDER_VERSION,
            "preview_pixel_cut": PREVIEW_PIXEL_CUT,
        }
        print(json.dumps(result, sort_keys=True))
        return result

    with tempfile.TemporaryDirectory(prefix=f"sky-map-ivoa-hips-{publication.name}-") as temporary:
        workspace = Path(temporary)
        input_directory = workspace / "inputs"
        output_directory = workspace / "hips"
        _stage_sources(gateway, sources, input_directory)
        _run_hipsgen(
            jar_path,
            input_directory,
            output_directory,
            order=resolved_order,
            max_threads=max_threads,
            hips_id=publication.hips_id,
        )
        validation = validate_hips_output(output_directory, expected_order=resolved_order)
        storage_root = _generation_storage_root(
            inventory_hash,
            validation,
            storage_prefix=publication.storage_prefix,
        )
        published_files = _publish_generated_tree(gateway, output_directory, storage_root)

        manifest = {
            "schema": "sky-map-ivoa-hips-v1",
            "profile": publication.name,
            "hips_id": publication.hips_id,
            "hips_order": validation.hips_order,
            "spectral_filter": spectral_filter,
            "inventory_sha256": inventory_hash,
            "source_count": len(sources),
            "sources": [asdict(source) for source in sources],
            "hipsgen_version": HIPSGEN_VERSION,
            "hipsgen_sha256": HIPSGEN_SHA256,
            "preview_render_version": PREVIEW_RENDER_VERSION,
            "preview_pixel_cut": PREVIEW_PIXEL_CUT,
            "max_native_pixel_scale_arcsec": publication.max_native_pixel_scale_arcsec,
            "validation": asdict(validation),
            "published_files": published_files,
        }
        manifest_bytes = (
            json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n"
        ).encode("utf-8")
        manifest_path = f"{storage_root}/sky-map-manifest.json"
        manifest_sha256 = gateway.ensure_derivative(
            manifest_path,
            manifest_bytes,
            "application/json",
        )

    pointer = {
        "schema": "sky-map-ivoa-hips-pointer-v1",
        "profile": publication.name,
        "root_path": storage_root,
        "manifest_path": manifest_path,
        "manifest_sha256": manifest_sha256,
        "inventory_sha256": inventory_hash,
        "source_count": len(sources),
        "hips_order": validation.hips_order,
        "hipsgen_version": HIPSGEN_VERSION,
        "hipsgen_sha256": HIPSGEN_SHA256,
        "spectral_filter": spectral_filter,
        "preview_render_version": PREVIEW_RENDER_VERSION,
        "preview_pixel_cut": PREVIEW_PIXEL_CUT,
        "max_native_pixel_scale_arcsec": publication.max_native_pixel_scale_arcsec,
    }
    _publish_json_pointer(gateway, publication.current_pointer, pointer)
    result = {"status": "published", **pointer}
    print(json.dumps(result, sort_keys=True))
    return result


def _parse_order(value: str) -> int | None:
    normalized = value.strip().lower()
    if normalized == "auto":
        return None
    try:
        return int(normalized)
    except ValueError as error:
        raise argparse.ArgumentTypeError("order must be an integer or 'auto'") from error


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build standards-compliant public optical HiPS using pinned CDS Hipsgen."
    )
    parser.add_argument("--hipsgen-jar", required=True, type=Path)
    parser.add_argument("--profile", choices=sorted(HIPS_PROFILES), default="standard")
    parser.add_argument("--order", type=_parse_order)
    parser.add_argument("--filter", default=DEFAULT_FILTER)
    parser.add_argument("--max-threads", type=int, default=4)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    gateway = Gateway(Config.from_environment())
    requested_order = args.order
    if requested_order is None and args.profile == "standard":
        requested_order = DEFAULT_HIPS_ORDER
    build_public_ivoa_hips(
        gateway,
        args.hipsgen_jar,
        order=requested_order,
        spectral_filter=args.filter,
        max_threads=args.max_threads,
        force=args.force,
        profile=args.profile,
    )


if __name__ == "__main__":
    main()
