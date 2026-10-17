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


def test_check_runtime_paths_creates_and_probes_writable_directories(
    tmp_path, monkeypatch
) -> None:
    paths = {
        "TMPDIR": tmp_path / "scratch",
        "XDG_CACHE_HOME": tmp_path / "cache",
        "HOME": tmp_path / "home",
    }
    for name, directory in paths.items():
        monkeypatch.setenv(name, str(directory))

    healthcheck.check_runtime_paths()

    assert all(directory.is_dir() for directory in paths.values())
    assert all(not list(directory.iterdir()) for directory in paths.values())


def test_check_runtime_paths_rejects_relative_directory(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TMPDIR", "relative/scratch")
    with pytest.raises(RuntimeError, match="TMPDIR must be an absolute directory"):
        healthcheck.check_runtime_paths()


def test_check_runtime_paths_detects_read_only_filesystem_before_db_access(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setenv("TMPDIR", str(tmp_path))
    monkeypatch.setattr(
        healthcheck.tempfile,
        "TemporaryFile",
        lambda **_kwargs: (_ for _ in ()).throw(PermissionError("Read-only file system")),
    )
    with pytest.raises(RuntimeError, match="TMPDIR is not writable"):
        healthcheck.check_runtime_paths()


def test_health_main_aborts_before_db_probe_when_runtime_unwritable(
    monkeypatch
) -> None:
    monkeypatch.setattr(
        healthcheck, "check_runtime_paths",
        lambda: (_ for _ in ()).throw(RuntimeError("Science runtime TMPDIR is not writable")),
    )
    monkeypatch.setattr(
        healthcheck, "check_database",
        lambda *_args: (_ for _ in ()).throw(AssertionError("DB must not be contacted")),
    )
    with pytest.raises(RuntimeError, match="TMPDIR is not writable"):
        healthcheck.main()
