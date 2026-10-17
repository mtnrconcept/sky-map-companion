from __future__ import annotations

import pytest

from sky_worker import healthcheck


class StubCursor:
    def __init__(self, response: tuple[int] | None) -> None:
        self.response = response
        self.sql: str | None = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql: str) -> None:
        self.sql = sql

    def fetchone(self) -> tuple[int] | None:
        return self.response


class StubConnection:
    def __init__(self, cursor: StubCursor) -> None:
        self.test_cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self) -> StubCursor:
        return self.test_cursor


def test_healthcheck_uses_short_timeout_and_simple_select(monkeypatch) -> None:
    cursor = StubCursor((1,))
    calls: list[tuple[str, int, bool]] = []

    def fake_connect(url: str, *, connect_timeout: int, autocommit: bool):
        calls.append((url, connect_timeout, autocommit))
        return StubConnection(cursor)

    monkeypatch.setattr(healthcheck.psycopg, "connect", fake_connect)
    healthcheck.check_database("postgres://example.invalid/test")
    assert cursor.sql == "select 1"
    assert calls == [("postgres://example.invalid/test", 10, True)]


def test_healthcheck_refuses_bad_database_response(monkeypatch) -> None:
    monkeypatch.setattr(
        healthcheck.psycopg,
        "connect",
        lambda *_args, **_kwargs: StubConnection(StubCursor(None)),
    )
    with pytest.raises(RuntimeError, match="health query failed"):
        healthcheck.check_database("postgres://example.invalid/test")