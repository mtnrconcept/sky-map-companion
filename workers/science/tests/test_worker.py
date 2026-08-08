from types import SimpleNamespace
from uuid import uuid4

from sky_worker.models import Job, StageOutcome
from sky_worker.worker import Worker


class FakeGateway:
    def __init__(self):
        self.config = SimpleNamespace(worker_id="test-worker", poll_seconds=0.01)
        self.job = Job(id=uuid4(), job_type="cluster_cosmos", status="uploaded", version=0, attempts=1, pipeline_version="test")
        self.transitions = []
        self.failures = []

    def lease(self):
        job, self.job = self.job, None
        return job

    def heartbeat(self, job):
        return True

    def transition(self, job, status, progress, result):
        self.transitions.append((status, progress, result))

    def fail(self, job, code, detail, retry_after):
        self.failures.append((job.id, code, detail, retry_after))


def test_worker_heartbeats_and_transitions_one_job():
    gateway = FakeGateway()
    worker = Worker(gateway=gateway, worker_id="test-worker")
    worker.handlers.handle = lambda _job, _workdir: StageOutcome("extracting", 25, {})
    assert worker.run_once() is True
    assert gateway.transitions == [("extracting", 25, {})]
    assert gateway.failures == []


def test_worker_records_a_retryable_failure():
    gateway = FakeGateway()
    worker = Worker(gateway=gateway, worker_id="test-worker")

    def fail_handler(_job, _workdir):
        raise RuntimeError("transient failure")

    worker.handlers.handle = fail_handler
    assert worker.run_once() is True
    assert gateway.transitions == []
    assert gateway.failures[0][1:3] == ("RUNTIMEERROR", "transient failure")
    assert gateway.failures[0][3] == 2
