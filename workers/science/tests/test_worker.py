from types import SimpleNamespace
from threading import Event
from uuid import uuid4

import pytest

from sky_worker.handlers import Handlers
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


def test_worker_stops_without_leasing_after_shutdown_request():
    gateway = FakeGateway()
    worker = Worker(gateway=gateway, worker_id="test-worker")
    shutdown = Event()
    shutdown.set()

    worker.run_forever(shutdown)

    assert gateway.job is not None


def test_only_verified_ps1_stack_products_can_trust_archive_wcs():
    record_id = "a" * 64
    row = {
        "source_kind": "public_archive",
        "archive_item_id": uuid4(),
        "provenance": {
            "source_id": "mast-ps1",
            "archive_record_id": record_id,
        },
        "metadata": {
            "product_type": "stack-cutout",
            "archive": {
                "source_id": "mast-ps1",
                "archive_record_id": record_id,
            },
        },
    }

    assert Handlers._has_trusted_archive_wcs(row) is True
    assert Handlers._has_trusted_archive_wcs({**row, "source_kind": "community"}) is False
    assert Handlers._has_trusted_archive_wcs(
        {**row, "provenance": {"source_id": "unknown", "archive_record_id": "not-a-sha"}, "metadata": {}}
    ) is False


class ArchiveRetryGateway:
    def __init__(self, responses):
        self.responses = list(responses)
        self.executions = []

    def execute(self, query, parameters=()):
        self.executions.append((query, parameters))
        if not self.responses:
            raise AssertionError("unexpected database call")
        return self.responses.pop(0)


def archive_retry_job():
    return Job(
        id=uuid4(),
        job_type="publish_mosaic",
        status="publishing",
        version=3,
        attempts=2,
        pipeline_version="archive-mosaic-v9",
        object_id="M31",
        payload={"mode": "build_archive_v9", "run_id": str(uuid4()), "spectral_band": "r"},
    )


def test_archive_v9_retry_reuses_generation_by_source_job_id():
    job = archive_retry_job()
    layer_id = uuid4()
    run_id = job.payload["run_id"]
    recipe = {
        "method": "quality-weighted-mean-reprojection",
        "object_id": "M31",
        "archive_source": "mast-ps1",
        "spectral_band": "r",
        "partial": True,
    }
    generation = {
        "id": uuid4(),
        "generation": 2,
        "layer_id": layer_id,
        "status": "building",
        "pipeline_version": job.pipeline_version,
        "recipe": recipe,
        "expected_tiles": 42,
        "planned_tiles": 42,
        "source_job_id": job.id,
        "archive_ingest_run_id": run_id,
        "expected_source_uploads": 13,
        "source_inventory_sha256": "a" * 64,
        "verification": {
            "worker_tile_plan_sha256": "b" * 64,
            "canvas_plan_sha256": "c" * 64,
        },
    }
    gateway = ArchiveRetryGateway([[generation]])

    actual = Handlers(gateway)._get_or_create_archive_generation_v9(
        job=job,
        object_id="M31",
        layer_id=layer_id,
        run_id=run_id,
        recipe=recipe,
        verification=generation["verification"],
        expected_tiles=42,
        expected_sources=13,
        source_inventory_sha256="a" * 64,
        worker_tile_plan_sha256="b" * 64,
        canvas_plan_sha256="c" * 64,
    )

    assert actual is generation
    assert len(gateway.executions) == 1
    assert "where source_job_id=%s" in gateway.executions[0][0]
    assert "insert into public.mosaic_generations" not in gateway.executions[0][0]


def archive_retry_tile():
    source_ids = (str(uuid4()), str(uuid4()))
    weights = {source_ids[0]: 0.75, source_ids[1]: 0.25}
    tile = SimpleNamespace(
        order=9,
        index=173385,
        media_type="image/webp",
        content=b"deterministic-webp",
        source_upload_ids=source_ids,
        source_weights=weights,
    )
    row = {
        "storage_path": "hips/m31-ps1-r/2/Norder9/Dir0/Npix173385.webp",
        "media_type": tile.media_type,
        "sha256": "d" * 64,
        "source_upload_ids": list(source_ids),
        "contribution_weights": weights,
    }
    return tile, row


def test_archive_v9_retry_accepts_an_exact_persisted_tile_without_rewriting_it():
    tile, row = archive_retry_tile()
    gateway = ArchiveRetryGateway([[row]])

    Handlers(gateway)._persist_archive_tile_v9(
        generation_id=uuid4(),
        tile=tile,
        path=row["storage_path"],
        checksum=row["sha256"],
    )

    assert len(gateway.executions) == 1
    assert "select storage_path" in gateway.executions[0][0]
    assert "insert into public.mosaic_tiles" not in gateway.executions[0][0]


@pytest.mark.parametrize(
    ("field", "divergent_value"),
    [
        ("storage_path", "hips/wrong.webp"),
        ("media_type", "image/png"),
        ("sha256", "e" * 64),
        ("source_upload_ids", [str(uuid4())]),
        ("contribution_weights", {str(uuid4()): 1.0}),
    ],
)
def test_archive_v9_retry_rejects_every_persisted_tile_divergence(field, divergent_value):
    tile, row = archive_retry_tile()
    row[field] = divergent_value
    gateway = ArchiveRetryGateway([[row]])

    with pytest.raises(ValueError, match=field):
        Handlers(gateway)._persist_archive_tile_v9(
            generation_id=uuid4(),
            tile=tile,
            path="hips/m31-ps1-r/2/Norder9/Dir0/Npix173385.webp",
            checksum="d" * 64,
        )

    assert len(gateway.executions) == 1
