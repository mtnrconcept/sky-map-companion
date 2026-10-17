from __future__ import annotations

import os
from pathlib import Path
import tempfile

import psycopg

from .config import Config


def check_runtime_paths() -> None:
    """Ensure the real runtime can write before any worker job is leased.

    Docker runs with a read-only root filesystem. Probe each configured
    scratch/cache/home path without printing credentials or host paths.
    """
    for name in ("TMPDIR", "XDG_CACHE_HOME", "HOME"):
        value = os.environ.get(name)
        if not value:
            continue
        directory = Path(value)
        if not directory.is_absolute():
            raise RuntimeError(f"Science runtime {name} must be an absolute directory")
        try:
            directory.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryFile(prefix=".sky-health-", dir=directory) as probe:
                probe.write(b"ok")
                probe.flush()
        except OSError as error:
            raise RuntimeError(f"Science runtime {name} is not writable") from error


def check_database(database_url: str) -> None:
    """Only probe DB connectivity, without loading the expensive science pipeline."""
    with psycopg.connect(database_url, connect_timeout=10, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1")
            if cursor.fetchone() != (1,):
                raise RuntimeError("Science database health query failed")


def main() -> None:
    check_runtime_paths()
    check_database(Config.from_environment().database_url)


if __name__ == "__main__":
    main()
