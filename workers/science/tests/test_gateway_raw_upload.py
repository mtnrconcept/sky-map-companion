import hashlib
from types import SimpleNamespace

import pytest

from sky_worker.config import Config
from sky_worker.gateway import Gateway


def _gateway(tmp_path):
    gateway = Gateway.__new__(Gateway)
    gateway.config = Config(
        database_url="postgresql://example.invalid/postgres",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test",
        worker_id="test-worker",
        raw_cache_directory=tmp_path / "cache",
    )
    return gateway


def test_large_raw_file_uses_resumable_storage_upload(tmp_path, monkeypatch):
    source = tmp_path / "allwise.fits"
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
            raise AssertionError("large RAW used the standard upload API")

    monkeypatch.setattr("sky_worker.gateway.tus_client.TusClient", TusClient)
    gateway = _gateway(tmp_path)
    gateway.storage = SimpleNamespace(storage=StandardStorage())

    gateway.upload_raw_file("archives/irsa/M31/allwise.fits", source, "application/fits")

    assert captured["url"] == "https://example.storage.supabase.co/storage/v1/upload/resumable"
    assert captured["headers"] == {
        "Authorization": "Bearer sb_secret_test",
        "apikey": "sb_secret_test",
    }
    assert captured["chunk_size"] == 6 * 1024 * 1024
    assert captured["metadata"] == {
        "bucketName": "astro-raw",
        "objectName": "archives/irsa/M31/allwise.fits",
        "contentType": "application/fits",
        "cacheControl": "31536000",
    }
    assert captured["retries"] == 5
    assert captured["retry_delay"] == 2
    assert captured["stream_open_during_upload"] is True
    assert captured["file_stream"].closed is True


def test_missing_raw_preserves_original_upload_error(tmp_path):
    source = tmp_path / "allwise.fits"
    source.write_bytes(b"SIMPLE  =" + b" " * 4096)
    gateway = _gateway(tmp_path)

    class MissingBucket:
        @staticmethod
        def download(_path):
            raise RuntimeError("object does not exist")

    class Storage:
        @staticmethod
        def from_(bucket):
            assert bucket == "astro-raw"
            return MissingBucket()

    gateway.storage = SimpleNamespace(storage=Storage())
    gateway.upload_raw_file = lambda *_args: (_ for _ in ()).throw(
        RuntimeError("original raw upload failure")
    )

    with pytest.raises(RuntimeError, match="original raw upload failure"):
        gateway.ensure_raw("archives/irsa/M31/allwise.fits", source)


def test_existing_raw_is_verified_by_checksum_after_immutable_conflict(tmp_path):
    source = tmp_path / "allwise.fits"
    source.write_bytes(b"SIMPLE  =" + b" " * 4096)
    expected = hashlib.sha256(source.read_bytes()).hexdigest()
    gateway = _gateway(tmp_path)

    class ExistingBucket:
        @staticmethod
        def download(path):
            assert path == "archives/irsa/M31/allwise.fits"
            return source.read_bytes()

    class Storage:
        @staticmethod
        def from_(bucket):
            assert bucket == "astro-raw"
            return ExistingBucket()

    gateway.storage = SimpleNamespace(storage=Storage())
    gateway.upload_raw_file = lambda *_args: (_ for _ in ()).throw(
        RuntimeError("immutable object already exists")
    )

    checksum = gateway.ensure_raw("archives/irsa/M31/allwise.fits", source)

    assert checksum == expected
    assert gateway._raw_cache_path(expected).is_file()
