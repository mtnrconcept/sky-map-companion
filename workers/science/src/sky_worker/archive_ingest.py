from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import tempfile
import time
from typing import Any

from astropy.coordinates import SkyCoord
from astropy.wcs import WCS
import astropy.units as u

from .archive import PS1_ACKNOWLEDGEMENT, PS1Archive, target_grid
from .config import Config
from .extraction import extract_frame
from .gateway import Gateway


logger = logging.getLogger("sky_archive_ingest")
TERMINAL_UPLOAD_STATUSES = {"published", "rejected", "duplicate", "cancelled", "failed"}
JSON_ADAPTER_ERROR_DETAIL_LIKE = "cannot adapt type %dict%"
ASTROMETRY_PROCESS_ERROR_DETAIL_LIKE = "%solve-field%"
FINITE_PIXEL_ERROR_DETAIL = "too few finite image pixels"
LEGACY_PS1_REJECTION_REASON = "poor-fwhm,dense-clouds"


def _json(value: Any) -> str:
    return json.dumps(value, default=str, separators=(",", ":"), sort_keys=True)


def _create_run(
    gateway: Gateway,
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
        ) values ('mast-ps1',%s,%s,'discovering',%s::jsonb,%s,%s)
        returning *
        """,
        (object_id, spectral_band, _json(query), max_files, max_bytes),
    )[0]


def _update_run(gateway: Gateway, run_id: Any, status: str | None = None, error: str | None = None) -> None:
    gateway.execute(
        """
        update public.archive_ingest_runs
        set status=coalesce(%s,status), error_detail=%s, updated_at=now(),
            completed_at=case when %s in ('complete','failed','cancelled') then now() else completed_at end
        where id=%s
        """,
        (status, error[:2000] if error else None, status, run_id),
    )


def _validate_frame(path: Path, expected_ra: float, expected_dec: float, max_offset_deg: float) -> Any:
    frame = extract_frame(path)
    wcs = WCS(frame.header)
    if not wcs.has_celestial:
        raise ValueError("archive FITS has no celestial WCS")
    ra, dec = wcs.pixel_to_world_values((frame.native_width - 1) / 2, (frame.native_height - 1) / 2)
    measured = SkyCoord(float(ra) * u.deg, float(dec) * u.deg, frame="icrs")
    expected = SkyCoord(expected_ra * u.deg, expected_dec * u.deg, frame="icrs")
    if measured.separation(expected).deg > max_offset_deg:
        raise ValueError("archive FITS WCS does not match requested position")
    return frame


def ingest(args: argparse.Namespace) -> int:
    gateway = Gateway(Config.from_environment())
    object_rows = gateway.execute(
        "select id,ra_deg,dec_deg,size_arcmin from public.astro_objects where id=%s",
        (args.object_id,),
    )
    if not object_rows:
        raise ValueError(f"unknown astro object: {args.object_id}")
    target = object_rows[0]
    width_arcmin = float(args.width_arcmin or max(30, float(target["size_arcmin"] or 60) * 1.15))
    height_arcmin = float(args.height_arcmin or max(30, width_arcmin * 0.36))
    positions = target_grid(
        float(target["ra_deg"]),
        float(target["dec_deg"]),
        width_arcmin,
        height_arcmin,
        args.cutout_size,
    )
    query = {
        "archive": "MAST PS1",
        "product_type": "stack-cutout",
        "object_id": args.object_id,
        "spectral_band": args.filter,
        "cutout_size_px": args.cutout_size,
        "width_arcmin": width_arcmin,
        "height_arcmin": height_arcmin,
        "grid_positions": len(positions),
    }
    run = _create_run(gateway, args.object_id, args.filter, args.max_files, args.max_bytes, query)
    run_id = run["id"]
    logger.info(_json({"event": "archive_run_created", "run_id": str(run_id), **query}))
    archive = PS1Archive(request_delay_seconds=args.request_delay, timeout_seconds=args.timeout)
    try:
        candidates = archive.discover(positions, args.filter, args.cutout_size, args.max_files)
        gateway.execute(
            "update public.archive_ingest_runs set discovered_files=%s,status='downloading',updated_at=now() where id=%s",
            (len(candidates), run_id),
        )
        registered = 0
        rejected = 0
        downloaded_bytes = 0
        with tempfile.TemporaryDirectory(prefix=f"sky-archive-{run_id}-") as temporary:
            directory = Path(temporary)
            for candidate in candidates:
                item_rows = gateway.execute(
                    """
                    insert into public.archive_items(
                      ingest_run_id,source_id,object_id,archive_record_id,remote_url,remote_filename,
                      data_rights,calibration_level,spectral_band,metadata,status
                    ) values (%s,'mast-ps1',%s,%s,%s,%s,'public',%s,%s,%s::jsonb,'discovered')
                    on conflict (ingest_run_id,source_id,archive_record_id) do nothing returning id
                    """,
                    (
                        run_id,
                        args.object_id,
                        candidate.record_id,
                        candidate.remote_url,
                        candidate.remote_filename,
                        candidate.calibration_level,
                        candidate.spectral_band,
                        _json(
                            {
                                "source_filename": candidate.source_filename,
                                "product_type": candidate.product_type,
                                "requested_ra_deg": candidate.ra_deg,
                                "requested_dec_deg": candidate.dec_deg,
                                "mjd": candidate.mjd,
                            }
                        ),
                    ),
                )
                if not item_rows:
                    logger.info(_json({"event": "archive_item_replayed", "record_id": candidate.record_id}))
                    continue
                item_id = item_rows[0]["id"]
                target_path = directory / candidate.remote_filename
                try:
                    prior = gateway.execute(
                        """
                        select upload_id,content_sha256,byte_size
                        from public.archive_items
                        where source_id='mast-ps1' and archive_record_id=%s
                          and upload_id is not null and id<>%s
                        order by created_at limit 1
                        """,
                        (candidate.record_id, item_id),
                    )
                    if prior:
                        gateway.execute(
                            """
                            update public.archive_items set status='duplicate',content_sha256=%s,byte_size=%s,
                              error_detail='archive record already registered',updated_at=now() where id=%s
                            """,
                            (prior[0]["content_sha256"], prior[0]["byte_size"], item_id),
                        )
                        rejected += 1
                        continue
                    gateway.execute(
                        "update public.archive_items set status='downloading',updated_at=now() where id=%s",
                        (item_id,),
                    )
                    byte_size = archive.download(candidate, target_path, args.max_bytes - downloaded_bytes)
                    frame = _validate_frame(
                        target_path,
                        candidate.ra_deg,
                        candidate.dec_deg,
                        max(0.25, args.cutout_size * 0.25 / 3600),
                    )
                    duplicate = gateway.execute(
                        "select id from public.astro_uploads where content_sha256=%s and deleted_at is null limit 1",
                        (frame.content_sha256,),
                    )
                    if duplicate:
                        gateway.execute(
                            """
                            update public.archive_items set status='duplicate',content_sha256=%s,byte_size=%s,
                              error_detail='content already registered',updated_at=now() where id=%s
                            """,
                            (frame.content_sha256, byte_size, item_id),
                        )
                        rejected += 1
                        continue
                    storage_path = (
                        f"archives/mast-ps1/{args.object_id}/{args.filter}/"
                        f"{candidate.record_id}.fits"
                    )
                    uploaded_sha = gateway.ensure_raw(storage_path, target_path)
                    if uploaded_sha != frame.content_sha256:
                        raise RuntimeError("raw storage checksum mismatch")
                    provenance = {
                        "source_id": "mast-ps1",
                        "archive_record_id": candidate.record_id,
                        "remote_url": candidate.remote_url,
                        "source_filename": candidate.source_filename,
                        "data_rights": "public",
                        "calibration_level": candidate.calibration_level,
                        "retrieved_at": datetime.now(timezone.utc).isoformat(),
                        "terms_url": "https://archive.stsci.edu/publishing/mission-acknowledgements",
                        "acknowledgement": PS1_ACKNOWLEDGEMENT,
                    }
                    metadata = {
                        **frame.metadata,
                        "archive": provenance,
                        "requested_ra_deg": candidate.ra_deg,
                        "requested_dec_deg": candidate.dec_deg,
                        "product_type": candidate.product_type,
                    }
                    upload = gateway.execute(
                        """
                        insert into public.astro_uploads(
                          user_id,object_id,frame_type,storage_path,file_url,file_size_bytes,original_filename,
                          metadata,telescope,camera,exposure_s,filter_name,captured_at,instrument_group,
                          status,content_sha256,licence_code,licence_accepted_at,pipeline_version,
                          source_kind,archive_item_id,provenance,rights_uri,attribution_text
                        ) values (
                          null,%s,'light',%s,%s,%s,%s,%s::jsonb,'Pan-STARRS1','GPC1',%s,%s,%s,
                          %s,'uploaded',%s,'PUBLIC-ARCHIVE',now(),%s,'public_archive',%s,%s::jsonb,%s,%s
                        ) returning id
                        """,
                        (
                            args.object_id,
                            storage_path,
                            candidate.remote_url,
                            byte_size,
                            candidate.remote_filename,
                            _json(metadata),
                            frame.metadata.get("exposure_s"),
                            args.filter,
                            frame.metadata.get("captured_at"),
                            f"mast-ps1:gpc1:{args.filter}:stack",
                            frame.content_sha256,
                            gateway.config.pipeline_version,
                            item_id,
                            _json(provenance),
                            "https://archive.stsci.edu/publishing/mission-acknowledgements",
                            "MAST Pan-STARRS1 Public Archive",
                        ),
                    )[0]
                    gateway.execute(
                        """
                        update public.archive_items set status='registered',upload_id=%s,content_sha256=%s,
                          byte_size=%s,metadata=metadata || %s::jsonb,updated_at=now() where id=%s
                        """,
                        (upload["id"], frame.content_sha256, byte_size, _json({"fits": frame.metadata}), item_id),
                    )
                    registered += 1
                    downloaded_bytes += byte_size
                    logger.info(
                        _json(
                            {
                                "event": "archive_item_registered",
                                "run_id": str(run_id),
                                "upload_id": str(upload["id"]),
                                "record_id": candidate.record_id,
                                "byte_size": byte_size,
                            }
                        )
                    )
                except Exception as error:
                    rejected += 1
                    gateway.execute(
                        """
                        update public.archive_items set status='failed',error_detail=%s,updated_at=now()
                        where id=%s
                        """,
                        (str(error)[:2000], item_id),
                    )
                    logger.warning(
                        _json(
                            {
                                "event": "archive_item_failed",
                                "run_id": str(run_id),
                                "record_id": candidate.record_id,
                                "error": str(error),
                            }
                        )
                    )
                finally:
                    target_path.unlink(missing_ok=True)
                    gateway.execute(
                        """
                        update public.archive_ingest_runs set registered_files=%s,rejected_files=%s,
                          downloaded_bytes=%s,updated_at=now() where id=%s
                        """,
                        (registered, rejected, downloaded_bytes, run_id),
                    )
        if registered == 0:
            raise RuntimeError("no public archive FITS file was registered")
        _update_run(gateway, run_id, "qualifying")
        if args.watch:
            _wait_for_qualification(gateway, run_id, args.watch_timeout)
            if args.build_mosaic:
                _enqueue_and_wait_for_mosaic(gateway, run_id, args.object_id, args.filter, args.watch_timeout)
        logger.info(
            _json(
                {
                    "event": "archive_ingest_finished",
                    "run_id": str(run_id),
                    "registered_files": registered,
                    "downloaded_bytes": downloaded_bytes,
                    "mosaic_requested": bool(args.watch and args.build_mosaic),
                }
            )
        )
        return 0
    except Exception as error:
        _update_run(gateway, run_id, "failed", str(error))
        raise


def _wait_for_qualification(gateway: Gateway, run_id: Any, timeout_seconds: int) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        rows = gateway.execute(
            """
            select u.status,count(*)::integer as count
            from public.archive_items i join public.astro_uploads u on u.id=i.upload_id
            where i.ingest_run_id=%s group by u.status order by u.status
            """,
            (run_id,),
        )
        counts = {row["status"]: row["count"] for row in rows}
        logger.info(_json({"event": "archive_qualification_status", "run_id": str(run_id), "counts": counts}))
        exhausted = gateway.execute(
            """
            select count(*)::integer as count,
              coalesce(string_agg(distinct j.error_code,','),'UNKNOWN') as error_codes
            from public.archive_items i
            join public.processing_jobs j on j.upload_id=i.upload_id
            where i.ingest_run_id=%s and j.job_type='qualify_upload'
              and j.attempts >= j.max_attempts and j.error_code is not null
              and j.leased_by is null
            """,
            (run_id,),
        )[0]
        if exhausted["count"]:
            raise RuntimeError(
                f"{exhausted['count']} archive qualification jobs exhausted retries "
                f"({exhausted['error_codes']})"
            )
        if counts and all(status in TERMINAL_UPLOAD_STATUSES for status in counts):
            if counts.get("published", 0) < 1:
                raise RuntimeError("all archive files were rejected during scientific qualification")
            return
        time.sleep(10)
    raise TimeoutError("archive qualification did not finish before timeout")


def _enqueue_and_wait_for_mosaic(
    gateway: Gateway,
    run_id: Any,
    object_id: str,
    spectral_band: str,
    timeout_seconds: int,
    expected_sources: int | None = None,
    inline_worker: bool = False,
) -> None:
    payload: dict[str, Any] = {
        "mode": "build_archive_v9",
        "run_id": str(run_id),
        "spectral_band": spectral_band,
    }
    if inline_worker:
        payload["lease_scope"] = "inline"
    if expected_sources is not None:
        payload["expected_sources"] = expected_sources
    idempotency_key = f"archive-mosaic-v9:{run_id}"
    job_rows = gateway.execute(
        """
        insert into public.processing_jobs as existing(
          job_type,object_id,status,payload,idempotency_key,pipeline_version,max_attempts
        ) values (
          'publish_mosaic',%s,'approved',%s::jsonb,%s,%s,10
        ) on conflict (idempotency_key) do update set
          status='approved',payload=excluded.payload,progress=0,result=null,
          error_code=null,error_detail=null,available_at=now(),leased_by=null,
          lease_expires_at=null,heartbeat_at=null,completed_at=null,
          attempts=0,max_attempts=excluded.max_attempts,
          version=existing.version+1,pipeline_version=excluded.pipeline_version,
          updated_at=now()
        where existing.status='failed'
          and existing.payload->>'retry_state'='approved'
          and excluded.payload->>'lease_scope'='inline'
        returning id,status,completed_at
        """,
        (
            object_id,
            _json(payload),
            idempotency_key,
            gateway.config.pipeline_version,
        ),
    )
    if not job_rows:
        job_rows = gateway.execute(
            """
            select id,status,completed_at
            from public.processing_jobs
            where idempotency_key=%s
            """,
            (idempotency_key,),
        )
    if len(job_rows) != 1:
        raise RuntimeError("archive mosaic job did not resolve uniquely")
    job = job_rows[0]
    if job["status"] == "published":
        _update_run(gateway, run_id, "complete")
        logger.info(
            _json(
                {
                    "event": "archive_mosaic_status",
                    "run_id": str(run_id),
                    "status": "published",
                    "completed_at": job["completed_at"],
                    "replayed": True,
                }
            )
        )
        return
    _update_run(gateway, run_id, "building")
    inline = None
    if inline_worker:
        from .worker import Worker

        inline = Worker(gateway)
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        current = gateway.execute(
            "select status,completed_at,error_code,error_detail from public.processing_jobs where id=%s",
            (job["id"],),
        )[0]
        logger.info(_json({"event": "archive_mosaic_status", "run_id": str(run_id), **current}))
        if current["status"] == "published":
            _update_run(gateway, run_id, "complete")
            return
        if current["completed_at"] is not None and current["status"] in {"failed", "rejected", "cancelled"}:
            failure = current.get("error_detail") or "archive mosaic job failed"
            _update_run(gateway, run_id, "failed", failure)
            raise RuntimeError(failure)
        if inline is not None and inline.run_once(job["id"]):
            continue
        time.sleep(10)
    raise TimeoutError("archive mosaic did not finish before timeout")


def rebuild(args: argparse.Namespace) -> int:
    """Rebuild only the derived products from an already-qualified archive run."""
    gateway = Gateway(Config.from_environment())
    run_rows = gateway.execute(
        """
        select r.id,r.object_id,r.spectral_band,r.status,
          count(i.upload_id) filter (
            where u.status in ('approved','published','stacked')
              and u.rejected=false and u.deleted_at is null
          )::integer as eligible_uploads
        from public.archive_ingest_runs r
        left join public.archive_items i on i.ingest_run_id=r.id
        left join public.astro_uploads u on u.id=i.upload_id
        where r.source_id='mast-ps1'
          and ((%s::uuid is not null and r.id=%s::uuid)
            or (%s::uuid is null and r.object_id=%s))
        group by r.id
        order by r.started_at desc
        limit 1
        """,
        (args.run_id, args.run_id, args.run_id, args.object_id),
    )
    if not run_rows:
        raise LookupError("archive ingest run not found")
    run = run_rows[0]
    if int(run["eligible_uploads"] or 0) != args.expected_sources:
        raise RuntimeError(
            f"rebuild requires exactly {args.expected_sources} qualified sources; "
            f"found {int(run['eligible_uploads'] or 0)}"
        )
    logger.info(
        _json(
            {
                "event": "archive_mosaic_rebuild_requested",
                "run_id": str(run["id"]),
                "object_id": run["object_id"],
                "eligible_uploads": run["eligible_uploads"],
                "mode": "derived-only-v9",
            }
        )
    )
    _enqueue_and_wait_for_mosaic(
        gateway,
        run["id"],
        run["object_id"],
        run["spectral_band"],
        args.watch_timeout,
        args.expected_sources,
        args.inline_worker,
    )
    return 0


def status(args: argparse.Namespace) -> int:
    gateway = Gateway(Config.from_environment())
    rows = gateway.execute(
        """
        select r.id,r.source_id,r.object_id,r.spectral_band,r.status,r.discovered_files,
          r.registered_files,r.rejected_files,r.downloaded_bytes,r.error_detail,
          r.started_at,r.completed_at,
          coalesce(jsonb_object_agg(s.status,s.count) filter (where s.status is not null),'{}'::jsonb) as upload_statuses
        from public.archive_ingest_runs r
        left join lateral (
          select u.status,count(*)::integer as count
          from public.archive_items i join public.astro_uploads u on u.id=i.upload_id
          where i.ingest_run_id=r.id group by u.status
        ) s on true
        where (%s is null or r.object_id=%s)
        group by r.id order by r.started_at desc limit %s
        """,
        (args.object_id, args.object_id, args.limit),
    )
    for row in rows:
        logger.info(_json(row))
    return 0


def _reset_recoverable_archive_failures(cursor: Any, run_id: Any) -> int:
    cursor.execute(
        """
        with target_uploads as (
          select i.upload_id
          from public.archive_items i
          where i.ingest_run_id=%s and i.upload_id is not null
            and i.source_id='mast-ps1'
            and i.calibration_level=3
        ), reset_jobs as (
          update public.processing_jobs j
          set status='uploaded',progress=0,result=null,error_code=null,error_detail=null,
              attempts=0,available_at=now(),leased_by=null,lease_expires_at=null,
              heartbeat_at=null,completed_at=null,payload=payload - 'retry_state',
              version=version+1,updated_at=now()
          from public.astro_uploads u
          where j.job_type='qualify_upload'
            and u.id=j.upload_id
            and j.upload_id in (select upload_id from target_uploads)
            and (
              (j.status in ('failed','extracting') and j.error_code='PROGRAMMINGERROR' and j.error_detail like %s)
              or
              (j.status in ('failed','extracting') and j.error_code='CALLEDPROCESSERROR' and j.error_detail like %s)
              or
              (j.status='failed' and j.error_code='VALUEERROR' and j.error_detail=%s)
              or
              (j.status='rejected' and u.rejection_reason=%s)
            )
          returning j.upload_id
        ), reset_uploads as (
          update public.astro_uploads u
          set status='uploaded',rejected=false,rejection_reason=null,
              fwhm=null,eccentricity=null,snr=null,star_count=null,
              quality_score=0,ai_analysis=null,updated_at=now()
          where u.id in (select upload_id from reset_jobs)
            and u.status in ('extracting','solving','qualifying','rejected','failed')
          returning u.id
        )
        select count(*)::integer as count from reset_uploads
        """,
        (
            run_id,
            JSON_ADAPTER_ERROR_DETAIL_LIKE,
            ASTROMETRY_PROCESS_ERROR_DETAIL_LIKE,
            FINITE_PIXEL_ERROR_DETAIL,
            LEGACY_PS1_REJECTION_REASON,
        ),
    )
    row = cursor.fetchone()
    return int(row["count"])


def retry(args: argparse.Namespace) -> int:
    gateway = Gateway(Config.from_environment())
    run_rows = gateway.execute(
        """
        select id,object_id,status
        from public.archive_ingest_runs
        where (%s::uuid is not null and id=%s::uuid)
           or (%s::uuid is null and object_id=%s)
        order by started_at desc
        limit 1
        """,
        (args.run_id, args.run_id, args.run_id, args.object_id),
    )
    if not run_rows:
        raise LookupError("archive ingest run not found")
    run = run_rows[0]
    with gateway.connection() as connection, connection.cursor() as cursor:
        reset_count = _reset_recoverable_archive_failures(cursor, run["id"])
        cursor.execute(
            """
            update public.archive_ingest_runs
            set status='qualifying',error_detail=null,completed_at=null,updated_at=now()
            where id=%s and status not in ('cancelled','complete')
            """,
            (run["id"],),
        )
    logger.info(
        _json(
            {
                "event": "archive_run_retried",
                "run_id": str(run["id"]),
                "object_id": run["object_id"],
                "reset_uploads": reset_count,
            }
        )
    )
    if args.watch:
        _wait_for_qualification(gateway, run["id"], args.watch_timeout)
        if args.build_mosaic:
            _enqueue_and_wait_for_mosaic(
                gateway,
                run["id"],
                run["object_id"],
                args.filter,
                args.watch_timeout,
            )
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Ingest verified public astronomy archive FITS files")
    subparsers = root.add_subparsers(dest="command", required=True)
    ingest_parser = subparsers.add_parser("ingest", help="discover, verify and register a bounded archive batch")
    ingest_parser.add_argument("--object-id", default="M31")
    ingest_parser.add_argument("--filter", choices=list("grizy"), default="r")
    ingest_parser.add_argument("--max-files", type=int, default=24)
    ingest_parser.add_argument("--max-bytes", type=int, default=2 * 1024**3)
    ingest_parser.add_argument("--cutout-size", type=int, default=2400)
    ingest_parser.add_argument("--width-arcmin", type=float)
    ingest_parser.add_argument("--height-arcmin", type=float)
    ingest_parser.add_argument("--request-delay", type=float, default=0.3)
    ingest_parser.add_argument("--timeout", type=int, default=120)
    ingest_parser.add_argument("--watch-timeout", type=int, default=4 * 60 * 60)
    ingest_parser.add_argument("--watch", action="store_true")
    ingest_parser.add_argument("--build-mosaic", action="store_true")
    ingest_parser.set_defaults(handler=ingest)
    status_parser = subparsers.add_parser("status", help="show recent archive ingestion runs")
    status_parser.add_argument("--object-id")
    status_parser.add_argument("--limit", type=int, default=10)
    status_parser.set_defaults(handler=status)
    retry_parser = subparsers.add_parser(
        "retry", help="retry only recoverable qualification failures from the verified PS1 run"
    )
    retry_parser.add_argument("--run-id")
    retry_parser.add_argument("--object-id", default="M31")
    retry_parser.add_argument("--filter", choices=list("grizy"), default="r")
    retry_parser.add_argument("--watch-timeout", type=int, default=4 * 60 * 60)
    retry_parser.add_argument("--watch", action="store_true")
    retry_parser.add_argument("--build-mosaic", action="store_true")
    retry_parser.set_defaults(handler=retry)
    rebuild_parser = subparsers.add_parser(
        "rebuild", help="rebuild derived products from an already-qualified archive run"
    )
    rebuild_parser.add_argument("--run-id")
    rebuild_parser.add_argument("--object-id", default="M31")
    rebuild_parser.add_argument("--expected-sources", type=int, default=13)
    rebuild_parser.add_argument("--watch-timeout", type=int, default=4 * 60 * 60)
    rebuild_parser.add_argument(
        "--inline-worker",
        action="store_true",
        help="lease and process only the rebuild job in this process",
    )
    rebuild_parser.set_defaults(handler=rebuild)
    return root


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = parser().parse_args()
    if args.command == "ingest":
        if not 1 <= args.max_files <= 10000:
            raise ValueError("max-files must be between 1 and 10000")
        if not 1 <= args.max_bytes <= 1024**4:
            raise ValueError("max-bytes must be between 1 byte and 1 TiB")
    if args.command in {"ingest", "retry"}:
        if args.build_mosaic and not args.watch:
            raise ValueError("--build-mosaic requires --watch")
    if args.command == "rebuild" and not 1 <= args.expected_sources <= 10000:
        raise ValueError("expected-sources must be between 1 and 10000")
    raise SystemExit(args.handler(args))


if __name__ == "__main__":
    main()
