from __future__ import annotations

import argparse
from collections.abc import Sequence
from uuid import UUID

from .config import Config
from .gateway import Gateway
from .worker import Worker


def parse_job_id(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("job id must be a valid UUID") from error


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Process exactly one shared science job")
    parser.add_argument("--job-id", required=True, type=parse_job_id)
    args = parser.parse_args(argv)

    config = Config.from_environment()
    worker = Worker(Gateway(config))
    worker.run_exact(args.job_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
