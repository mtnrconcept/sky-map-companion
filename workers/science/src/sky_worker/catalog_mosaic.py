from __future__ import annotations

import argparse
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from .archive_ingest import (
    TERMINAL_UPLOAD_STATUSES,
    _enqueue_and_wait_for_mosaic,
    _update_run,
    _wait_for_qualification,
    ingest as ingest_ps1,
)
from .config import Config
from .gateway import Gateway
from .models import Job
from .worker import Worker


logger = logging.getLogger("sky_catalog_mosaic")


class CatalogGateway(Gateway):
    """Gateway that may lease only an explicitly requested PS1 catalogue job."""

    def lease(self, job_id: UUID | None = None) -> Job | None:
        if job_id is None:
            return super().lease()

        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                with candidate as (
                  select j.id
                  from public.processing_jobs j
                  where j.id=%s
                    and (
                      (
                        j.job_type='qualify_upload'
                        and j.upload_id is not null
                        and exists (
                          select 1
                          from public.astro_uploads u
                          join public.archive_items i on i.id=u.archive_item_id
                          where u.id=j.upload_id
                            and u.source_kind='public_archive'
                            and i.source_id='mast-ps1'
                        )
                      )
                      or (
                        j.job_type='publish_mosaic'
                        and j.payload->>'mode'='build_archive_v9'
                        and j.payload->>'lease_scope'='inline'
                        and starts_with(j.idempotency_key, 'archive-mosaic-v9:')
                      )
                    )
                    and j.completed_at is null
                    and j.status not in ('published','rejected','duplicate','cancelled')
                    and j.attempts < j.max_attempts
                    and j.available_at <= now()
                    and (j.lease_expires_at is null or j.lease_expires_at < now())
                  for update skip locked
                ), leased as (
                  update public.processing_jobs j
                  set status=case
                        when j.status='failed' and j.payload->>'retry_state'='approved'
                          then 'approved'
                        else j.status
                      end,
                      payload=case
                        when j.status='failed' and j.payload->>'retry_state'='approved'
                          then j.payload - 'retry_state'
                        else j.payload
                      end,
                      leased_by=%s,
                      lease_expires_at=now() + make_interval(secs => %s),
                      heartbeat_at=now(),
                      attempts=j.attempts+1,
                      updated_at=now()
                  from candidate c
                  where j.id=c.id
                  returning j.*
                )
                select id,job_type,status,upload_id,object_id,
                       cosmos_observation_id,cosmos_event_id,owner_user_id,
                       payload,attempts,pipeline_version,version
                from leased
                """,
                (job_id, self.config.worker_id, self.config.lease_seconds),
            )
            row = cursor.fetchone()
        return Job(**row) if row else None


def _json(value: dict[str, Any]) -> str:
    return json.dumps(value, default=str, separators=(",", ":"), sort_keys=True)


def _next_object_id(gateway: Gateway) -> str:
    rows = gateway.execute(
        """
        select o.id,
               latest.last_run_at,
               exists(
                 select 1 from public.astro_masters m
                 where m.object_id=o.id and m.is_current
               ) as has_master,
               o.total_lights
        from public.astro_objects o
        left join lateral (
          select max(r.started_at) as last_run_at
          from public.archive_ingest_runs r
          where r.object_id=o.id and r.source_id='mast-ps1'
        ) latest on true
        order by latest.last_run_at asc nulls first,
                 has_master asc,
                 o.total_lights asc,
                 o.id asc
        limit 1
        """
    )
    if not rows:
        raise RuntimeError("astro catalogue is empty")
    return str(rows[0]["id"])


def _resolve_created_run(
    gateway: Gateway,
    object_id: str,
    spectral_band: str,
    started_after: datetime,
) -> dict[str, Any]:
    rows = gateway.execute(
        """
        select id,object_id,spectral_band,status,registered_files,rejected_files,started_at
        from public.archive_ingest_runs
        where source_id='mast-ps1'
          and object_id=%s
          and spectral_band=%s
          and started_at >= %s
        order by started_at desc
        limit 1
        """,
        (object_id, spectral_band, started_after),
    )
    if not rows:
        raise RuntimeError("catalogue ingest did not create an archive run")
    return rows[0]


def _run_inventory(gateway: Gateway, run_id: Any) -> dict[str, int]:
    rows = gateway.execute(
        """
        select
          count(*) filter (where i.upload_id is not null)::integer as linked_uploads,
          count(*) filter (
            where i.upload_id is not null
              and coalesce(i.error_detail,'') <> 'reused previously qualified archive record'
          )::integer as new_uploads,
          count(*) filter (
            where u.status in ('approved','published','stacked')
              and not u.rejected
              and u.deleted_at is null
          )::integer as eligible_uploads
        from public.archive_items i
        left join public.astro_uploads u on u.id=i.upload_id
        where i.ingest_run_id=%s
        """,
        (run_id,),
    )
    row = rows[0] if rows else {}
    return {
        "linked_uploads": int(row.get("linked_uploads") or 0),
        "new_uploads": int(row.get("new_uploads") or 0),
        "eligible_uploads": int(row.get("eligible_uploads") or 0),
    }


def _has_current_master(gateway: Gateway, object_id: str) -> bool:
    rows = gateway.execute(
        "select exists(select 1 from public.astro_masters where object_id=%s and is_current) as present",
        (object_id,),
    )
    return bool(rows and rows[0]["present"])


def _pending_qualification_jobs(gateway: Gateway, run_id: Any) -> list[dict[str, Any]]:
    return gateway.execute(
        """
        select u.id as upload_id,u.status,j.id as job_id,j.available_at,j.completed_at
        from public.archive_items i
        join public.astro_uploads u on u.id=i.upload_id
        left join lateral (
          select p.id,p.available_at,p.completed_at
          from public.processing_jobs p
          where p.upload_id=u.id and p.job_type='qualify_upload'
          order by p.created_at desc
          limit 1
        ) j on true
        where i.ingest_run_id=%s
          and u.status <> all(%s::text[])
        order by u.uploaded_at,u.id
        """,
        (run_id, list(TERMINAL_UPLOAD_STATUSES)),
    )


def _process_qualification_inline(gateway: CatalogGateway, run_id: Any, timeout_seconds: int) -> None:
    worker = Worker(gateway)
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        pending = _pending_qualification_jobs(gateway, run_id)
        if not pending:
            _wait_for_qualification(gateway, run_id, 1)
            return

        progressed = False
        for row in pending:
            job_id = row.get("job_id")
            if not job_id:
                raise RuntimeError(f"qualification job missing for upload {row['upload_id']}")
            if worker.run_once(UUID(str(job_id))):
                progressed = True

        if not progressed:
            time.sleep(2)

    raise TimeoutError("catalogue qualification did not finish before timeout")


def build_object(args: argparse.Namespace) -> int:
    config = Config.from_environment()
    orchestration_gateway = CatalogGateway(config)
    object_id = args.object_id or _next_object_id(orchestration_gateway)
    started_after = datetime.now(timezone.utc) - timedelta(seconds=5)

    logger.info(
        _json(
            {
                "event": "catalog_mosaic_selected",
                "object_id": object_id,
                "spectral_band": args.filter,
                "max_files": args.max_files,
            }
        )
    )

    ingest_args = argparse.Namespace(
        object_id=object_id,
        filter=args.filter,
        max_files=args.max_files,
        max_bytes=args.max_bytes,
        cutout_size=args.cutout_size,
        width_arcmin=None,
        height_arcmin=None,
        request_delay=args.request_delay,
        timeout=args.timeout,
        watch_timeout=args.watch_timeout,
        watch=False,
        build_mosaic=False,
    )
    ingest_ps1(ingest_args)

    run = _resolve_created_run(orchestration_gateway, object_id, args.filter, started_after)
    inventory = _run_inventory(orchestration_gateway, run["id"])
    logger.info(_json({"event": "catalog_mosaic_inventory", "run_id": str(run["id"]), **inventory}))

    if inventory["new_uploads"] == 0 and _has_current_master(orchestration_gateway, object_id):
        _update_run(orchestration_gateway, run["id"], "complete")
        logger.info(
            _json(
                {
                    "event": "catalog_mosaic_unchanged",
                    "run_id": str(run["id"]),
                    "object_id": object_id,
                }
            )
        )
        return 0

    _process_qualification_inline(orchestration_gateway, run["id"], args.watch_timeout)
    _enqueue_and_wait_for_mosaic(
        orchestration_gateway,
        run["id"],
        object_id,
        args.filter,
        args.watch_timeout,
        expected_sources=None,
        inline_worker=True,
    )
    logger.info(
        _json(
            {
                "event": "catalog_mosaic_complete",
                "run_id": str(run["id"]),
                "object_id": object_id,
            }
        )
    )
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        description="Progressively ingest PS1 catalogue fields and publish immutable Sky Map mosaics"
    )
    subparsers = root.add_subparsers(dest="command", required=True)

    def add_common(command: argparse.ArgumentParser) -> None:
        command.add_argument("--filter", choices=list("grizy"), default="r")
        command.add_argument("--max-files", type=int, default=4)
        command.add_argument("--max-bytes", type=int, default=1024**3)
        command.add_argument("--cutout-size", type=int, default=2400)
        command.add_argument("--request-delay", type=float, default=0.3)
        command.add_argument("--timeout", type=int, default=120)
        command.add_argument("--watch-timeout", type=int, default=9000)
        command.set_defaults(handler=build_object)

    build = subparsers.add_parser("build", help="ingest and rebuild one named catalogue object")
    build.add_argument("--object-id", required=True)
    add_common(build)

    build_next = subparsers.add_parser(
        "build-next", help="select the least recently ingested catalogue object and advance it"
    )
    build_next.set_defaults(object_id=None)
    add_common(build_next)
    return root


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = parser().parse_args()
    if not 1 <= args.max_files <= 24:
        raise ValueError("max-files must be between 1 and 24")
    if not 1 <= args.max_bytes <= 2 * 1024**3:
        raise ValueError("max-bytes must be between 1 byte and 2 GiB")
    if not 256 <= args.cutout_size <= 4096:
        raise ValueError("cutout-size must be between 256 and 4096 pixels")
    raise SystemExit(args.handler(args))


if __name__ == "__main__":
    main()
