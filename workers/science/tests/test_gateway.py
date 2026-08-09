import hashlib
from contextlib import contextmanager
from types import SimpleNamespace
from uuid import uuid4

from psycopg.types.json import Jsonb
import pytest

from sky_worker.config import Config
from sky_worker.gateway import Gateway
from sky_worker.models import Job


def test_raw_cache_is_content_addressed_and_reusable(tmp_path):
    source = tmp_path / "source.fits"
    source.write_bytes(b"SIMPLE  =" + b" " * 4096)
    checksum = hashlib.sha256(source.read_bytes()).hexdigest()
    gateway = Gateway.__new__(Gateway)
    gateway.config = Config(
        database_url="postgresql://example.invalid/postgres",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test",
        worker_id="test-worker",
        raw_cache_directory=tmp_path / "cache",
    )

    gateway._store_raw_cache(checksum, source)
    cached = gateway._raw_cache_path(checksum)
    assert cached.read_bytes() == source.read_bytes()

    gateway._store_raw_cache(checksum, source)
    assert [path for path in cached.parent.iterdir()] == [cached]


def test_raw_cache_rejects_non_sha_key(tmp_path):
    gateway = Gateway.__new__(Gateway)
    gateway.config = Config(
        database_url="postgresql://example.invalid/postgres",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test",
        worker_id="test-worker",
        raw_cache_directory=tmp_path / "cache",
    )
    try:
        gateway._raw_cache_path("../escape")
    except ValueError as error:
        assert "SHA-256" in str(error)
    else:
        raise AssertionError("invalid cache key was accepted")


def test_derivative_file_is_rejected_before_upload_when_over_limit(tmp_path):
    source = tmp_path / "master.fits"
    source.write_bytes(b"x" * 65)
    gateway = Gateway.__new__(Gateway)
    gateway.config = Config(
        database_url="postgresql://example.invalid/postgres",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test",
        worker_id="test-worker",
        max_derivative_bytes=64,
    )

    try:
        gateway.ensure_derivative_file("masters/M31/master.fits", source, "application/fits")
    except ValueError as error:
        assert "storage limit" in str(error)
    else:
        raise AssertionError("oversized derivative was accepted")


def test_large_derivative_file_uses_resumable_storage_upload(tmp_path, monkeypatch):
    source = tmp_path / "master.fits"
    with source.open("wb") as output:
        output.truncate(6 * 1024 * 1024 + 1)
    captured = {}

    class Uploader:
        def upload(self):
            captured["stream_open_during_upload"] = not captured["file_stream"].closed

    class TusClient:
        def __init__(self, url, headers):
            captured["url"] = url
            captured["headers"] = headers

        def uploader(self, **options):
            captured.update(options)
            return Uploader()

    class StandardStorage:
        @staticmethod
        def from_(_bucket):
            raise AssertionError("large derivative used the standard upload API")

    monkeypatch.setattr("sky_worker.gateway.tus_client.TusClient", TusClient)
    gateway = Gateway.__new__(Gateway)
    gateway.config = Config(
        database_url="postgresql://example.invalid/postgres",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test",
        worker_id="test-worker",
    )
    gateway.storage = SimpleNamespace(storage=StandardStorage())

    gateway.upload_derivative_file(
        "masters/M31/master.fits", source, "application/fits"
    )

    assert captured["url"] == (
        "https://example.storage.supabase.co/storage/v1/upload/resumable"
    )
    assert captured["headers"] == {
        "Authorization": "Bearer sb_secret_test",
        "apikey": "sb_secret_test",
    }
    assert captured["chunk_size"] == 6 * 1024 * 1024
    assert captured["metadata"] == {
        "bucketName": "astro-derived",
        "objectName": "masters/M31/master.fits",
        "contentType": "application/fits",
        "cacheControl": "31536000",
    }
    assert captured["retries"] == 5
    assert captured["retry_delay"] == 2
    assert captured["stream_open_during_upload"] is True
    assert captured["file_stream"].closed is True


def test_resumable_storage_upload_falls_back_to_configured_custom_domain():
    gateway = Gateway.__new__(Gateway)
    gateway.config = SimpleNamespace(supabase_url="https://storage.example.test/")

    assert gateway._resumable_storage_endpoint() == (
        "https://storage.example.test/storage/v1/upload/resumable"
    )


def test_missing_derivative_preserves_the_original_upload_error(tmp_path, monkeypatch):
    source = tmp_path / "master.fits"
    source.write_bytes(b"valid derivative")
    gateway = Gateway.__new__(Gateway)
    gateway.config = Config(
        database_url="postgresql://example.invalid/postgres",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test",
        worker_id="test-worker",
    )

    def upload(*_args):
        raise RuntimeError("original upload failure")

    def missing(*_args, **_kwargs):
        raise OSError("object does not exist")

    gateway.upload_derivative_file = upload
    gateway.public_derivative_url = lambda _path: "https://example.test/missing.fits"
    monkeypatch.setattr("sky_worker.gateway.urlopen", missing)

    with pytest.raises(RuntimeError, match="original upload failure"):
        gateway.ensure_derivative_file(
            "masters/M31/master.fits", source, "application/fits"
        )


def test_existing_small_derivative_is_verified_through_the_storage_client(
    tmp_path, monkeypatch
):
    source = tmp_path / "preview.webp"
    source.write_bytes(b"existing preview")

    class Bucket:
        @staticmethod
        def download(path):
            assert path == "masters/M31/preview.webp"
            return source.read_bytes()

    class Storage:
        @staticmethod
        def from_(bucket):
            assert bucket == "astro-derived"
            return Bucket()

    gateway = Gateway.__new__(Gateway)
    gateway.config = Config(
        database_url="postgresql://example.invalid/postgres",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test",
        worker_id="test-worker",
    )
    gateway.storage = SimpleNamespace(storage=Storage())
    gateway.upload_derivative_file = lambda *_args: (_ for _ in ()).throw(
        RuntimeError("immutable object already exists")
    )
    monkeypatch.setattr(
        "sky_worker.gateway.urlopen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("small derivative used a public URL")
        ),
    )

    checksum = gateway.ensure_derivative_file(
        "masters/M31/preview.webp", source, "image/webp"
    )

    assert checksum == hashlib.sha256(source.read_bytes()).hexdigest()


def test_transition_wraps_structured_result_as_jsonb():
    captured = {}

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, query, parameters):
            captured["query"] = query
            captured["parameters"] = parameters

    class Connection:
        def cursor(self):
            return Cursor()

    gateway = Gateway.__new__(Gateway)
    gateway.config = SimpleNamespace(worker_id="test-worker")

    @contextmanager
    def connection():
        yield Connection()

    gateway.connection = connection
    job = Job(
        id=uuid4(),
        job_type="qualify_upload",
        status="uploaded",
        version=3,
        attempts=1,
        pipeline_version="test",
    )

    gateway.transition(job, "extracting", 20, {"metadata_fields": ["FILTER", "DATE-OBS"]})

    assert "%s::jsonb" in captured["query"]
    assert isinstance(captured["parameters"][-1], Jsonb)


def test_targeted_lease_never_claims_an_unrelated_queue_job():
    target_job_id = uuid4()
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
            return {
                "id": target_job_id,
                "job_type": "publish_mosaic",
                "status": "approved",
                "upload_id": None,
                "object_id": "M31",
                "cosmos_observation_id": None,
                "cosmos_event_id": None,
                "owner_user_id": None,
                "payload": {"mode": "build_archive_v9", "lease_scope": "inline"},
                "attempts": 1,
                "pipeline_version": "science-v1",
                "version": 0,
            }

    class Connection:
        def cursor(self):
            return Cursor()

    gateway = Gateway.__new__(Gateway)
    gateway.config = SimpleNamespace(
        worker_id="github-m31-test",
        lease_seconds=300,
    )

    @contextmanager
    def connection():
        yield Connection()

    gateway.connection = connection

    job = gateway.lease(target_job_id)

    assert job is not None
    assert job.id == target_job_id
    assert "where j.id=%s" in captured["query"]
    assert "j.job_type='publish_mosaic'" in captured["query"]
    assert "j.payload->>'mode'='build_archive_v9'" in captured["query"]
    assert "j.payload->>'lease_scope'='inline'" in captured["query"]
    assert "starts_with(j.idempotency_key, 'archive-mosaic-v9:')" in captured["query"]
    assert "like 'archive-mosaic-v9:%'" not in captured["query"]
    assert "for update skip locked" in captured["query"]
    assert "payload->>'retry_state'='approved'" in captured["query"]
    assert captured["parameters"][0] == target_job_id


def test_terminal_qualification_error_synchronizes_upload_status():
    executions = []

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, query, parameters):
            executions.append((query, parameters))

        def fetchone(self):
            return {"completed_at": "2026-08-09T12:00:00Z"}

    class Connection:
        def cursor(self):
            return Cursor()

    gateway = Gateway.__new__(Gateway)
    gateway.config = SimpleNamespace(worker_id="test-worker")

    @contextmanager
    def connection():
        yield Connection()

    gateway.connection = connection
    upload_id = uuid4()
    job = Job(
        id=uuid4(),
        job_type="qualify_upload",
        status="solving",
        version=4,
        attempts=3,
        pipeline_version="test",
        upload_id=upload_id,
    )

    gateway.fail(job, "VALUEERROR", "too few finite image pixels", None)

    assert len(executions) == 2
    assert "set status='rejected'" in executions[1][0]
    assert executions[1][1][1] == upload_id


def test_terminal_mosaic_error_marks_generation_and_archive_run_failed():
    executions = []

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, query, parameters):
            executions.append((query, parameters))

        def fetchone(self):
            return {"completed_at": "2026-08-09T12:00:00Z"}

    class Connection:
        def cursor(self):
            return Cursor()

    gateway = Gateway.__new__(Gateway)
    gateway.config = SimpleNamespace(worker_id="test-worker")

    @contextmanager
    def connection():
        yield Connection()

    gateway.connection = connection
    job = Job(
        id=uuid4(),
        job_type="publish_mosaic",
        status="approved",
        version=4,
        attempts=10,
        pipeline_version="test",
        object_id="M31",
        payload={"run_id": str(uuid4())},
    )

    gateway.fail(job, "MOSAICINTEGRITYERROR", "source missing", 2)

    assert len(executions) == 3
    assert "update public.mosaic_generations" in executions[1][0]
    assert "update public.archive_ingest_runs" in executions[2][0]
