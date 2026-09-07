from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace
from uuid import UUID, uuid4

from sky_worker.models import Job, StageOutcome
from sky_worker.worker import Worker


class ExactGateway:
    def __init__(self, job: Job | None) -> None:
        self.config = SimpleNamespace(
            worker_id="cloudflare-science-test",
            poll_seconds=0.01,
            lease_seconds=300,
        )
        self.job = job
        self.exact_requests: list[UUID] = []
        self.transitions: list[tuple[str, int, dict[str, object]]] = []
        self.failures: list[tuple[UUID, str, str, int | None]] = []

    def lease(self, *_args, **_kwargs):
        raise AssertionError("exact queue execution must never call generic lease()")

    def lease_exact(self, job_id: UUID) -> Job | None:
        self.exact_requests.append(job_id)
        if self.job is None or self.job.id != job_id:
            return None
        job, self.job = self.job, None
        return job

    def heartbeat(self, _job: Job) -> bool:
        return True

    def transition(
        self,
        _job: Job,
        status: str,
        progress: int,
        result: dict[str, object],
    ) -> None:
        self.transitions.append((status, progress, result))

    def fail(
        self,
        job: Job,
        code: str,
        detail: str,
        retry_after: int | None,
    ) -> None:
        self.failures.append((job.id, code, detail, retry_after))


def queue_job() -> Job:
    return Job(
        id=uuid4(),
        job_type="qualify_upload",
        status="uploaded",
        version=0,
        attempts=1,
        pipeline_version="science-v1",
        upload_id=uuid4(),
        payload={},
    )


def test_run_exact_uses_only_exact_lease_and_processes_that_job() -> None:
    job = queue_job()
    gateway = ExactGateway(job)
    worker = Worker(gateway=gateway, worker_id="cloudflare-science-test")
    worker.handlers.handle = lambda _job, _workdir: StageOutcome(
        "extracting",
        20,
        {"source": "queue"},
    )

    assert worker.run_exact(job.id) is True
    assert gateway.exact_requests == [job.id]
    assert gateway.transitions == [("extracting", 20, {"source": "queue"})]
    assert gateway.failures == []


def test_run_exact_is_a_successful_noop_when_job_cannot_be_leased() -> None:
    target = uuid4()
    gateway = ExactGateway(None)
    worker = Worker(gateway=gateway, worker_id="cloudflare-science-test")

    assert worker.run_exact(target) is False
    assert gateway.exact_requests == [target]
    assert gateway.transitions == []


def test_gateway_exact_lease_calls_only_dedicated_database_function() -> None:
    target = uuid4()
    captured: dict[str, object] = {}

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, query: str, parameters: tuple[object, ...]) -> None:
            captured["query"] = query
            captured["parameters"] = parameters

        def fetchone(self):
            return None

    class Connection:
        def cursor(self):
            return Cursor()

    from sky_worker.gateway import Gateway

    gateway = Gateway.__new__(Gateway)
    gateway.config = SimpleNamespace(worker_id="cloudflare-science-test", lease_seconds=300)

    @contextmanager
    def connection():
        yield Connection()

    gateway.connection = connection

    assert gateway.lease_exact(target) is None
    assert "private.lease_processing_job_by_id" in str(captured["query"])
    assert captured["parameters"] == (target, "cloudflare-science-test", 300)
