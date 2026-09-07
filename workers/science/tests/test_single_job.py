from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from sky_worker import single_job


class FakeWorker:
    def __init__(self, gateway: object) -> None:
        self.gateway = gateway
        self.requested: list[UUID] = []

    def run_exact(self, job_id: UUID) -> bool:
        self.requested.append(job_id)
        return False


def test_single_job_runs_exact_job_and_treats_unavailable_lease_as_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    job_id = uuid4()
    config = SimpleNamespace()
    gateway = object()
    worker = FakeWorker(gateway)

    monkeypatch.setattr(single_job.Config, "from_environment", lambda: config)
    monkeypatch.setattr(single_job, "Gateway", lambda actual: gateway if actual is config else None)
    monkeypatch.setattr(single_job, "Worker", lambda actual: worker if actual is gateway else None)

    assert single_job.main(["--job-id", str(job_id)]) == 0
    assert worker.requested == [job_id]


def test_single_job_rejects_invalid_uuid_without_loading_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        single_job.Config,
        "from_environment",
        lambda: (_ for _ in ()).throw(AssertionError("config must not be loaded")),
    )

    with pytest.raises(SystemExit) as error:
        single_job.main(["--job-id", "not-a-uuid"])

    assert error.value.code == 2
