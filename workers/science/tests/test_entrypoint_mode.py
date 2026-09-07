from __future__ import annotations

from threading import Event

import pytest

from sky_worker import entrypoint


def test_default_mode_runs_existing_daemon(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.delenv("WORKER_MODE", raising=False)
    monkeypatch.setattr(entrypoint, "run_daemon", lambda: calls.append("daemon"))
    monkeypatch.setattr(
        entrypoint,
        "run_container_host",
        lambda: (_ for _ in ()).throw(AssertionError("host must not run")),
    )

    assert entrypoint.main() == 0
    assert calls == ["daemon"]


def test_explicit_daemon_mode_runs_existing_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setenv("WORKER_MODE", "daemon")
    monkeypatch.setattr(entrypoint, "run_daemon", lambda: calls.append("daemon"))

    assert entrypoint.main() == 0
    assert calls == ["daemon"]


def test_container_host_waits_without_starting_generic_worker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ImmediateEvent:
        def __init__(self) -> None:
            self.wait_calls: list[float | None] = []

        def wait(self, timeout: float | None = None) -> bool:
            self.wait_calls.append(timeout)
            return True

        def set(self) -> None:
            pass

    event = ImmediateEvent()
    monkeypatch.setattr(entrypoint, "Event", lambda: event)
    monkeypatch.setattr(entrypoint.signal, "signal", lambda *_args: None)
    monkeypatch.setattr(
        entrypoint,
        "run_daemon",
        lambda: (_ for _ in ()).throw(AssertionError("daemon must not run")),
    )

    entrypoint.run_container_host()

    assert event.wait_calls == [None]


def test_unknown_worker_mode_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WORKER_MODE", "unknown")

    with pytest.raises(RuntimeError, match="WORKER_MODE"):
        entrypoint.main()
