from __future__ import annotations

import psycopg

from .config import Config


def check_database(database_url: str) -> None:
    """Only probe DB connectivity, without loading the expensive science pipeline."""
    with psycopg.connect(database_url, connect_timeout=10, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1")
            if cursor.fetchone() != (1,):
                raise RuntimeError("Science database health query failed")


def main() -> None:
    check_database(Config.from_environment().database_url)


if __name__ == "__main__":
    main()
