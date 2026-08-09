from contextlib import contextmanager
from types import SimpleNamespace
from uuid import uuid4

from sky_worker.gateway import Gateway
from sky_worker.models import Job, StageOutcome
from sky_worker.worker import Worker


def test_staged_archive_master_reset_is_bound_to_the_active_job_lease():
    captured = {}

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, query, parameters):
            captured["query"] = query
            captured["parameters"] = parameters

        def fetchone(self):
            return {"reset_count": 1}

    class Connection:
        def cursor(self):
            return Cursor()

    gateway = Gateway.__new__(Gateway)
    gateway.config = SimpleNamespace(worker_id="github-m31-test")

    @contextmanager
    def connection():
        yield Connection()

    gateway.connection = connection
    job = Job(
        id=uuid4(),
        job_type="publish_mosaic",
        status="approved",
        version=11,
        attempts=1,
        pipeline_version="science-v1",
        object_id="M31",
        payload={"mode": "build_archive_v9", "lease_scope": "inline"},
    )

    assert gateway.reset_staged_archive_master_retry(job) == 1
    assert "private.reset_archive_master_retry_stage" in captured["query"]
    assert captured["parameters"] == (job.id, "github-m31-test", 11)


def test_archive_v9_worker_resets_staged_master_before_rendering():
    order = []
    job = Job(
        id=uuid4(),
        job_type="publish_mosaic",
        status="approved",
        version=3,
        attempts=1,
        pipeline_version="science-v1",
        object_id="M31",
        payload={"mode": "build_archive_v9", "lease_scope": "inline"},
    )

    class GatewayStub:
        def __init__(self):
            self.config = SimpleNamespace(
                worker_id="github-m31-test",
                lease_seconds=300,
                poll_seconds=0.01,
            )
            self.available_job = job
            self.transitions = []

        def lease(self, job_id=None):
            assert job_id == job.id
            leased, self.available_job = self.available_job, None
            return leased

        def heartbeat(self, leased_job):
            assert leased_job is job
            return True

        def reset_staged_archive_master_retry(self, leased_job):
            assert leased_job is job
            order.append("reset")
            return 1

        def transition(self, leased_job, status, progress, result):
            assert leased_job is job
            self.transitions.append((status, progress, result))

        def fail(self, *_args):
            raise AssertionError("successful rebuild should not fail")

    gateway = GatewayStub()
    worker = Worker(gateway)

    def handle(leased_job, _workdir):
        assert leased_job is job
        order.append("render")
        return StageOutcome("published", 100, {"tiles": 79})

    worker.handlers.handle = handle

    assert worker.run_once(job.id) is True
    assert order == ["reset", "render"]
    assert gateway.transitions == [("published", 100, {"tiles": 79})]
