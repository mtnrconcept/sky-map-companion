import hashlib
from pathlib import Path

import pytest

from sky_worker.config import Config
from sky_worker.gateway import Gateway
from sky_worker.object_storage import ObjectAlreadyExists, ObjectMetadata


class MemoryStorage:
    def __init__(self):
        self.objects = {}
        self.uploaded = []

    def download_file(self, bucket, key, target: Path, *, max_bytes: int):
        try:
            data = self.objects[(bucket, key)]
        except KeyError as error:
            raise FileNotFoundError(key) from error
        if len(data) > max_bytes:
            raise ValueError("source exceeds worker download limit")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return ObjectMetadata(byte_size=len(data))

    def upload_file(self, bucket, key, source: Path, content_type: str):
        self.uploaded.append((bucket, key, source.stat().st_size, content_type))
        if (bucket, key) in self.objects:
            raise ObjectAlreadyExists(key)
        data = source.read_bytes()
        self.objects[(bucket, key)] = data
        return ObjectMetadata(byte_size=len(data), content_type=content_type)

    def upload_bytes(self, bucket, key, data: bytes, content_type: str):
        if (bucket, key) in self.objects:
            raise ObjectAlreadyExists(key)
        self.objects[(bucket, key)] = bytes(data)
        return ObjectMetadata(byte_size=len(data), content_type=content_type)

    def head(self, bucket, key):
        data = self.objects.get((bucket, key))
        return None if data is None else ObjectMetadata(byte_size=len(data))

    def delete_many(self, bucket, keys):
        for key in keys:
            self.objects.pop((bucket, key), None)

    def public_url(self, bucket, key):
        return f"https://objects.invalid/{bucket}/{key}"


def _gateway(tmp_path, storage: MemoryStorage):
    gateway = Gateway.__new__(Gateway)
    gateway.config = Config(
        database_url="postgresql://example.invalid/postgres",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test",
        worker_id="test-worker",
        raw_cache_directory=tmp_path / "cache",
    )
    gateway.primary_storage = storage
    gateway.primary_raw_bucket = "astro-raw"
    return gateway


def test_large_raw_file_is_routed_to_primary_backend(tmp_path):
    source = tmp_path / "allwise.fits"
    with source.open("wb") as output:
        output.truncate(6 * 1024 * 1024 + 1)
    storage = MemoryStorage()
    gateway = _gateway(tmp_path, storage)

    gateway.upload_raw_file("archives/irsa/M31/allwise.fits", source, "application/fits")

    assert storage.uploaded == [
        (
            "astro-raw",
            "archives/irsa/M31/allwise.fits",
            6 * 1024 * 1024 + 1,
            "application/fits",
        )
    ]


def test_missing_raw_preserves_original_upload_error(tmp_path):
    source = tmp_path / "allwise.fits"
    source.write_bytes(b"SIMPLE  =" + b" " * 4096)
    storage = MemoryStorage()
    gateway = _gateway(tmp_path, storage)

    gateway.upload_raw_file = lambda *_args: (_ for _ in ()).throw(
        RuntimeError("original raw upload failure")
    )

    with pytest.raises(RuntimeError, match="original raw upload failure"):
        gateway.ensure_raw("archives/irsa/M31/allwise.fits", source)


def test_existing_raw_is_verified_by_checksum_after_immutable_conflict(tmp_path):
    source = tmp_path / "allwise.fits"
    source.write_bytes(b"SIMPLE  =" + b" " * 4096)
    expected = hashlib.sha256(source.read_bytes()).hexdigest()
    storage = MemoryStorage()
    storage.objects[("astro-raw", "archives/irsa/M31/allwise.fits")] = source.read_bytes()
    gateway = _gateway(tmp_path, storage)

    checksum = gateway.ensure_raw("archives/irsa/M31/allwise.fits", source)

    assert checksum == expected
    assert gateway._raw_cache_path(expected).is_file()
