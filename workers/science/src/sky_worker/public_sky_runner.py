from __future__ import annotations

import argparse
import logging
from typing import Any

from .archive_ingest import _update_run
from .catalog_mosaic import CatalogGateway
from .config import Config
from .public_sky_mosaic import (
    _ingest_seed,
    _publish_seed_run,
    _select_seed_target,
)


logger = logging.getLogger("sky_public_sky_runner")

RECOVERABLE_SEED_FAILURES = (
    "all archive files were rejected during scientific qualification",
    "public sky seed has no scientifically eligible source",
    "public sky seed returned no Pan-STARRS FITS candidate",
    "public sky seed registered no reusable or new FITS source",
)


def _is_recoverable_seed_failure(error: Exception) -> bool:
    message = str(error)
    return any(fragment in message for fragment in RECOVERABLE_SEED_FAILURES)


def _log(event: str, **values: Any) -> None:
    import json

    logger.info(json.dumps({"event": event, **values}, default=str, separators=(",", ":"), sort_keys=True))


def advance(args: argparse.Namespace) -> int:
    gateway = CatalogGateway(Config.from_environment())
    rejected_targets: list[dict[str, Any]] = []

    for attempt in range(1, args.max_attempts + 1):
        target = _select_seed_target(
            gateway,
            args.seed_order,
            args.filter,
            args.min_dec,
            args.max_dec,
        )
        _log(
            "sky_seed_attempt_started",
            attempt=attempt,
            max_attempts=args.max_attempts,
            seed_order=target.order,
            seed_index=target.index,
            ra_deg=target.ra_deg,
            dec_deg=target.dec_deg,
        )

        try:
            run = _ingest_seed(
                gateway,
                target,
                args.filter,
                args.max_files,
                args.max_bytes,
                args.cutout_size,
                args.width_arcmin,
                args.height_arcmin,
                args.request_delay,
                args.timeout,
            )
        except Exception as error:
            if not _is_recoverable_seed_failure(error):
                raise
            rejected_targets.append(
                {
                    "seed_index": target.index,
                    "stage": "ingest",
                    "reason": str(error),
                }
            )
            _log(
                "sky_seed_skipped",
                attempt=attempt,
                seed_index=target.index,
                stage="ingest",
                reason=str(error),
            )
            continue

        try:
            publication = _publish_seed_run(
                gateway,
                run,
                target,
                args.filter,
                args.watch_timeout,
            )
        except Exception as error:
            _update_run(gateway, run["id"], "failed", str(error))
            if not _is_recoverable_seed_failure(error):
                raise
            rejected_targets.append(
                {
                    "seed_index": target.index,
                    "stage": "qualification",
                    "reason": str(error),
                }
            )
            _log(
                "sky_seed_skipped",
                attempt=attempt,
                run_id=str(run["id"]),
                seed_index=target.index,
                stage="qualification",
                reason=str(error),
            )
            continue

        _log(
            "sky_seed_advanced",
            attempt=attempt,
            run_id=str(run["id"]),
            seed_order=target.order,
            seed_index=target.index,
            ra_deg=target.ra_deg,
            dec_deg=target.dec_deg,
            publication=publication,
            rejected_targets=rejected_targets,
        )
        return 0

    raise RuntimeError(
        f"no scientifically eligible public sky field after {args.max_attempts} bounded attempts"
    )


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        description="Advance one scientifically eligible public sky field while skipping rejected probes"
    )
    root.add_argument("--filter", choices=list("grizy"), default="r")
    root.add_argument("--seed-order", type=int, default=4)
    root.add_argument("--min-dec", type=float, default=-29.0)
    root.add_argument("--max-dec", type=float, default=85.0)
    root.add_argument("--max-files", type=int, default=1)
    root.add_argument("--max-bytes", type=int, default=512 * 1024**2)
    root.add_argument("--cutout-size", type=int, default=2400)
    root.add_argument("--width-arcmin", type=float, default=24.0)
    root.add_argument("--height-arcmin", type=float, default=24.0)
    root.add_argument("--request-delay", type=float, default=0.3)
    root.add_argument("--timeout", type=int, default=120)
    root.add_argument("--watch-timeout", type=int, default=3600)
    root.add_argument("--max-attempts", type=int, default=4)
    root.set_defaults(handler=advance)
    return root


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = parser().parse_args()
    if not 1 <= args.max_files <= 8:
        raise ValueError("max-files must be between 1 and 8")
    if not 1 <= args.max_bytes <= 2 * 1024**3:
        raise ValueError("max-bytes must be between 1 byte and 2 GiB")
    if not 256 <= args.cutout_size <= 4096:
        raise ValueError("cutout-size must be between 256 and 4096 pixels")
    if not 0 <= args.seed_order <= 8:
        raise ValueError("seed-order must be between 0 and 8")
    if not 1 <= args.max_attempts <= 12:
        raise ValueError("max-attempts must be between 1 and 12")
    raise SystemExit(args.handler(args))


if __name__ == "__main__":
    main()
