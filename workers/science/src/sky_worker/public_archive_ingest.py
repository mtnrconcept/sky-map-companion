from __future__ import annotations

import argparse
from datetime import UTC
import json
import logging
from pathlib import Path
import tempfile
import time
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from astropy.coordinates import SkyCoord
from astropy.time import Time
from astropy.wcs import WCS
import astropy.units as u

from .archive_ingest import _wait_for_qualification
from .config import Config
from .extraction import extract_frame
from .gateway import Gateway
from .public_archives import (
    PROVIDERS,
    PublicArchiveCandidate,
    candidate_as_json,
    discover_public_archive,
    provider_ids,
    resolved_download_url,
)


logger = logging.getLogger("sky_public_archive_ingest")


def _json(value: Any) -> str:
    return json.dumps(value, default=str, separators=(",", ":"), sort_keys=True)


def _object_target(gateway: Gateway, object_id: str) -> dict[str, Any]:
    rows = gateway.execute(
        "select id,ra_deg,dec_deg,size_arcmin from public.astro_objects where id=%s",
        (object_id,),
    )
    if not rows:
        raise ValueError(f"unknown astro object: {object_id}")
    return rows[0]


def _create_run(
    gateway: Gateway,
    provider_id: str,
    object_id: str,
    spectral_band: str,
    max_files: int,
    max_bytes: int,
    query: dict[str, Any],
) -> dict[str, Any]:
    return gateway.execute(
        """
        insert into public.archive_ingest_runs(
          source_id,object_id,spectral_band,status,query,max_files,max_bytes
        ) values (%s,%s,%s,'discovering',%s::jsonb,%s,%s)
        returning *
        """,
        (provider_id, object_id, spectral_band, _json(query), max_files, max_bytes),
    )[0]


def _update_run(
    gateway: Gateway,
    run_id: Any,
    *,
    status: str | None = None,
    error: str | None = None,
    registered: int | None = None,
    rejected: int | None = None,
    downloaded_bytes: int | None = None,
    discovered: int | None = None,
) -> None:
    gateway.execute(
        """
        update public.archive_ingest_runs
        set status=coalesce(%s,status),
            error_detail=%s,
            registered_files=coalesce(%s,registered_files),
            rejected_files=coalesce(%s,rejected_files),
            downloaded_bytes=coalesce(%s,downloaded_bytes),
            discovered_files=coalesce(%s,discovered_files),
            completed_at=case
              when %s in ('complete','failed','cancelled') then now()
              else completed_at
            end,
            updated_at=now()
        where id=%s
        """,
        (
            status,
            error[:2000] if error else None,
            registered,
            rejected,
            downloaded_bytes,
            discovered,
            status,
            run_id,
        ),
    )


def _reuse_qualified_sources(
    gateway: Gateway,
    run_id: Any,
    provider_id: str,
    object_id: str,
) -> tuple[int, set[str]]:
    known_rows = gateway.execute(
        """
        select distinct archive_record_id
        from public.archive_items
        where source_id=%s and object_id=%s and ingest_run_id<>%s
          and archive_record_id is not null
        """,
        (provider_id, object_id, run_id),
    )
    known = {str(row["archive_record_id"]) for row in known_rows}
    reused = gateway.execute(
        """
        with reusable as (
          select distinct on (i.archive_record_id)
            i.source_id,i.object_id,i.archive_record_id,i.remote_url,i.remote_filename,
            i.data_rights,i.calibration_level,i.spectral_band,i.metadata,
            u.id as upload_id,u.content_sha256,u.file_size_bytes
          from public.archive_items i
          join public.astro_uploads u on u.id=i.upload_id
          where i.source_id=%s and i.object_id=%s and i.ingest_run_id<>%s
            and u.status in ('approved','published','stacked')
            and u.rejected=false and u.deleted_at is null
          order by i.archive_record_id,i.created_at
        ), inserted as (
          insert into public.archive_items(
            ingest_run_id,source_id,object_id,archive_record_id,remote_url,remote_filename,
            data_rights,calibration_level,spectral_band,metadata,status,upload_id,
            content_sha256,byte_size,error_detail
          )
          select %s,source_id,object_id,archive_record_id,remote_url,remote_filename,
            data_rights,calibration_level,spectral_band,metadata,'registered',upload_id,
            content_sha256,file_size_bytes,'reused previously qualified archive record'
          from reusable
          on conflict (ingest_run_id,source_id,archive_record_id) do nothing
          returning archive_record_id
        )
        select count(*)::integer as count from inserted
        """,
        (provider_id, object_id, run_id, run_id),
    )[0]
    return int(reused["count"]), known


def _download(
    candidate: PublicArchiveCandidate,
    target: Path,
    remaining_bytes: int,
    timeout_seconds: int,
) -> int:
    if remaining_bytes <= 0:
        raise ValueError("archive byte budget exhausted")
    url = resolved_download_url(candidate, timeout_seconds=timeout_seconds)
    request = Request(url, headers={"User-Agent": "sky-map-companion/1 public-archive-ingest"})
    total = 0
    policy = PROVIDERS[candidate.provider_id]
    with urlopen(request, timeout=timeout_seconds) as response, target.open("wb") as output:
        final = urlparse(response.url)
        if final.scheme != "https" or final.hostname not in policy.allowed_hosts:
            raise ValueError("archive download redirected outside provider allowlist")
        content_length = int(response.headers.get("Content-Length") or 0)
        if content_length and content_length > remaining_bytes:
            raise ValueError("archive file exceeds remaining byte budget")
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > remaining_bytes:
                raise ValueError("archive byte budget exceeded")
            output.write(chunk)
    if total < 2880:
        raise ValueError("archive response is too small to be a FITS file")
    with target.open("rb") as source:
        signature = source.read(30)
    if not (signature.startswith(b"SIMPLE  =") or signature.startswith(b"XTENSION=")):
        raise ValueError("archive response is not a FITS image")
    return total


def _validate_frame(
    path: Path,
    candidate: PublicArchiveCandidate,
    query_ra_deg: float,
    query_dec_deg: float,
    radius_deg: float,
) -> Any:
    frame = extract_frame(path)
    wcs = WCS(frame.header)
    if not wcs.has_celestial:
        raise ValueError("archive FITS has no celestial WCS")
    expected_ra = candidate.ra_deg if candidate.ra_deg is not None else query_ra_deg
    expected_dec = candidate.dec_deg if candidate.dec_deg is not None else query_dec_deg
    center_ra, center_dec = wcs.pixel_to_world_values(
        (frame.native_width - 1) / 2,
        (frame.native_height - 1) / 2,
    )
    measured = SkyCoord(float(center_ra) * u.deg, float(center_dec) * u.deg, frame="icrs")
    expected = SkyCoord(expected_ra * u.deg, expected_dec * u.deg, frame="icrs")
    if measured.separation(expected).deg > max(1.0, radius_deg * 4):
        raise ValueError("archive FITS WCS does not match discovered product position")
    return frame


def _captured_at(candidate: PublicArchiveCandidate) -> str | None:
    if candidate.observed_mjd is None:
        return None
    try:
        return Time(candidate.observed_mjd, format="mjd", scale="utc").to_datetime(
            timezone=UTC
        ).isoformat()
    except (ValueError, TypeError):
        return None


def _register_candidate(
    gateway: Gateway,
    run_id: Any,
    object_id: str,
    spectral_band: str,
    candidate: PublicArchiveCandidate,
    target_path: Path,
    byte_size: int,
    frame: Any,
) -> str | None:
    duplicate = gateway.execute(
        "select id from public.astro_uploads where content_sha256=%s and deleted_at is null limit 1",
        (frame.content_sha256,),
    )
    if duplicate:
        return None
    storage_path = (
        f"archives/{candidate.provider_id}/{object_id}/"
        f"{candidate.stable_record_hash}.fits"
    )
    uploaded_sha = gateway.ensure_raw(storage_path, target_path)
    if uploaded_sha != frame.content_sha256:
        raise RuntimeError("raw storage checksum mismatch")
    policy = PROVIDERS[candidate.provider_id]
    provenance = {
        "source_id": candidate.provider_id,
        "archive_record_id": candidate.provider_record_id,
        "collection_id": candidate.collection_id,
        "remote_url": candidate.access_url,
        "data_rights": candidate.data_rights,
        "rights_uri": candidate.rights_uri,
        "redistribution_allowed": candidate.redistribution_allowed,
        "calibration_level": candidate.calibration_level,
        "provider": policy.label,
    }
    metadata = {
        **frame.metadata,
        "archive": provenance,
        "provider_record_id": candidate.provider_record_id,
        "collection_id": candidate.collection_id,
        "product_type": "image",
        "dataproduct_type": candidate.dataproduct_type,
        "spatial_resolution_arcsec": candidate.spatial_resolution_arcsec,
        "em_min_m": candidate.em_min_m,
        "em_max_m": candidate.em_max_m,
    }
    instrument_group = ":".join(
        value.lower().replace(" ", "-")
        for value in (
            candidate.provider_id,
            candidate.facility or "unknown-facility",
            candidate.instrument or "unknown-instrument",
            spectral_band,
        )
    )[:160]
    item = gateway.execute(
        """
        insert into public.archive_items(
          ingest_run_id,source_id,object_id,archive_record_id,remote_url,remote_filename,
          data_rights,calibration_level,spectral_band,metadata,status,content_sha256,byte_size
        ) values (%s,%s,%s,%s,%s,%s,'public',%s,%s,%s::jsonb,'registered',%s,%s)
        on conflict (ingest_run_id,source_id,archive_record_id) do nothing
        returning id
        """,
        (
            run_id,
            candidate.provider_id,
            object_id,
            candidate.provider_record_id,
            candidate.access_url,
            candidate.source_filename,
            candidate.calibration_level or 2,
            spectral_band,
            _json(metadata),
            frame.content_sha256,
            byte_size,
        ),
    )
    if not item:
        return None
    item_id = item[0]["id"]
    upload = gateway.execute(
        """
        insert into public.astro_uploads(
          user_id,object_id,frame_type,storage_path,file_url,file_size_bytes,original_filename,
          metadata,telescope,camera,exposure_s,filter_name,captured_at,instrument_group,
          status,content_sha256,licence_code,licence_accepted_at,pipeline_version,
          source_kind,archive_item_id,provenance,rights_uri,attribution_text
        ) values (
          null,%s,'light',%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,
          'uploaded',%s,'PUBLIC-ARCHIVE',now(),%s,
          'public_archive',%s,%s::jsonb,%s,%s
        ) returning id
        """,
        (
            object_id,
            storage_path,
            candidate.access_url,
            byte_size,
            candidate.source_filename,
            _json(metadata),
            candidate.facility or policy.label,
            candidate.instrument or "Public archive",
            candidate.exposure_s,
            spectral_band,
            _captured_at(candidate),
            instrument_group,
            frame.content_sha256,
            gateway.config.pipeline_version,
            item_id,
            _json(provenance),
            candidate.rights_uri,
            candidate.attribution_text,
        ),
    )[0]
    gateway.execute(
        "update public.archive_items set upload_id=%s,updated_at=now() where id=%s",
        (upload["id"], item_id),
    )
    return str(upload["id"])


def discover(args: argparse.Namespace) -> int:
    provider_list = list(provider_ids()) if args.provider == "all" else [args.provider]
    for provider_id in provider_list:
        candidates = discover_public_archive(
            provider_id,
            args.ra,
            args.dec,
            args.radius,
            args.max_records,
            collection=args.collection,
            timeout_seconds=args.timeout,
        )
        for candidate in candidates:
            logger.info(candidate_as_json(candidate))
        logger.info(
            _json(
                {
                    "event": "public_archive_discovery_complete",
                    "provider_id": provider_id,
                    "records": len(candidates),
                    "redistributable": sum(
                        1 for candidate in candidates if candidate.redistribution_allowed
                    ),
                }
            )
        )
    return 0


def ingest(args: argparse.Namespace) -> int:
    gateway = Gateway(Config.from_environment())
    target = _object_target(gateway, args.object_id)
    ra_deg = float(args.ra if args.ra is not None else target["ra_deg"])
    dec_deg = float(args.dec if args.dec is not None else target["dec_deg"])
    radius_deg = float(
        args.radius
        if args.radius is not None
        else max(0.05, float(target.get("size_arcmin") or 30) / 120)
    )
    query = {
        "provider": args.provider,
        "collection": args.collection,
        "object_id": args.object_id,
        "ra_deg": ra_deg,
        "dec_deg": dec_deg,
        "radius_deg": radius_deg,
        "max_files": args.max_files,
        "spectral_band": args.spectral_band,
    }
    run = _create_run(
        gateway,
        args.provider,
        args.object_id,
        args.spectral_band,
        args.max_files,
        args.max_bytes,
        query,
    )
    run_id = run["id"]
    logger.info(_json({"event": "public_archive_run_created", "run_id": str(run_id), **query}))
    registered = 0
    rejected = 0
    downloaded_bytes = 0
    try:
        reused_count, known = _reuse_qualified_sources(
            gateway,
            run_id,
            args.provider,
            args.object_id,
        )
        registered += reused_count
        discovery_limit = min(1000, max(args.max_files * 8, args.max_files))
        candidates = discover_public_archive(
            args.provider,
            ra_deg,
            dec_deg,
            radius_deg,
            discovery_limit,
            collection=args.collection,
            timeout_seconds=args.timeout,
        )
        new_candidates = [
            candidate
            for candidate in candidates
            if candidate.provider_record_id not in known and candidate.redistribution_allowed
        ][: args.max_files]
        _update_run(
            gateway,
            run_id,
            status="downloading",
            discovered=reused_count + len(new_candidates),
            registered=registered,
        )
        with tempfile.TemporaryDirectory(prefix=f"sky-public-archive-{run_id}-") as temporary:
            directory = Path(temporary)
            for index, candidate in enumerate(new_candidates):
                target_path = directory / f"{index:04d}-{candidate.source_filename}"
                try:
                    byte_size = _download(
                        candidate,
                        target_path,
                        args.max_bytes - downloaded_bytes,
                        args.timeout,
                    )
                    frame = _validate_frame(
                        target_path,
                        candidate,
                        ra_deg,
                        dec_deg,
                        radius_deg,
                    )
                    upload_id = _register_candidate(
                        gateway,
                        run_id,
                        args.object_id,
                        args.spectral_band,
                        candidate,
                        target_path,
                        byte_size,
                        frame,
                    )
                    if upload_id is None:
                        rejected += 1
                        logger.info(
                            _json(
                                {
                                    "event": "public_archive_duplicate_skipped",
                                    "provider_id": args.provider,
                                    "record_id": candidate.provider_record_id,
                                }
                            )
                        )
                        continue
                    registered += 1
                    downloaded_bytes += byte_size
                    logger.info(
                        _json(
                            {
                                "event": "public_archive_item_registered",
                                "provider_id": args.provider,
                                "record_id": candidate.provider_record_id,
                                "upload_id": upload_id,
                                "byte_size": byte_size,
                            }
                        )
                    )
                except Exception as error:
                    rejected += 1
                    logger.warning(
                        _json(
                            {
                                "event": "public_archive_item_failed",
                                "provider_id": args.provider,
                                "record_id": candidate.provider_record_id,
                                "error": str(error),
                            }
                        )
                    )
                finally:
                    target_path.unlink(missing_ok=True)
                    _update_run(
                        gateway,
                        run_id,
                        registered=registered,
                        rejected=rejected,
                        downloaded_bytes=downloaded_bytes,
                    )
        if registered == 0:
            raise RuntimeError("no redistributable public archive FITS file was registered")
        _update_run(gateway, run_id, status="qualifying")
        if args.watch:
            _wait_for_qualification(gateway, run_id, args.watch_timeout)
        _update_run(gateway, run_id, status="complete")
        logger.info(
            _json(
                {
                    "event": "public_archive_ingest_complete",
                    "run_id": str(run_id),
                    "provider_id": args.provider,
                    "registered_files": registered,
                    "rejected_files": rejected,
                    "downloaded_bytes": downloaded_bytes,
                }
            )
        )
        return 0
    except Exception as error:
        _update_run(gateway, run_id, status="failed", error=str(error))
        raise


def status(args: argparse.Namespace) -> int:
    gateway = Gateway(Config.from_environment())
    rows = gateway.execute(
        """
        select id,source_id,object_id,spectral_band,status,discovered_files,
               registered_files,rejected_files,downloaded_bytes,error_detail,
               started_at,completed_at
        from public.archive_ingest_runs
        where source_id in ('eso','mast','irsa','noirlab')
          and (%s is null or object_id=%s)
        order by started_at desc limit %s
        """,
        (args.object_id, args.object_id, args.limit),
    )
    for row in rows:
        logger.info(_json(row))
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        description="Discover and ingest public FITS through official IVOA archive APIs"
    )
    subparsers = root.add_subparsers(dest="command", required=True)

    discover_parser = subparsers.add_parser("discover")
    discover_parser.add_argument("--provider", choices=["all", *provider_ids()], default="all")
    discover_parser.add_argument("--ra", type=float, required=True)
    discover_parser.add_argument("--dec", type=float, required=True)
    discover_parser.add_argument("--radius", type=float, default=0.1)
    discover_parser.add_argument("--max-records", type=int, default=10)
    discover_parser.add_argument("--collection")
    discover_parser.add_argument("--timeout", type=int, default=60)
    discover_parser.set_defaults(handler=discover)

    ingest_parser = subparsers.add_parser("ingest")
    ingest_parser.add_argument("--provider", choices=list(provider_ids()), required=True)
    ingest_parser.add_argument("--object-id", default="M31")
    ingest_parser.add_argument("--ra", type=float)
    ingest_parser.add_argument("--dec", type=float)
    ingest_parser.add_argument("--radius", type=float)
    ingest_parser.add_argument("--collection")
    ingest_parser.add_argument("--spectral-band", default="broadband")
    ingest_parser.add_argument("--max-files", type=int, default=2)
    ingest_parser.add_argument("--max-bytes", type=int, default=512 * 1024**2)
    ingest_parser.add_argument("--timeout", type=int, default=120)
    ingest_parser.add_argument("--watch-timeout", type=int, default=2 * 60 * 60)
    ingest_parser.add_argument("--watch", action="store_true")
    ingest_parser.set_defaults(handler=ingest)

    status_parser = subparsers.add_parser("status")
    status_parser.add_argument("--object-id")
    status_parser.add_argument("--limit", type=int, default=20)
    status_parser.set_defaults(handler=status)
    return root


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = parser().parse_args()
    if args.command == "ingest":
        if not 1 <= args.max_files <= 100:
            raise ValueError("max-files must be between 1 and 100")
        if not 1 <= args.max_bytes <= 16 * 1024**3:
            raise ValueError("max-bytes must be between 1 byte and 16 GiB")
    raise SystemExit(args.handler(args))


if __name__ == "__main__":
    main()
