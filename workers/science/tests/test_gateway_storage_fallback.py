from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import uuid4

import pytest

from sky_worker.config import Config
from sky_worker.gateway import Gateway
from sky_worker.object_storage import ObjectAlreadyExists, ObjectMetadata


class MemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.download_calls: list[tuple[str, str]] = []
        self.upload_calls: list[tuple[str, str]] = []

    def download_file(
        self,
        bucket: str,
        key: str,
        target: Path,
        *,
        max_bytes: int,
    ) -> ObjectMetadata:
        self.download_calls.append((bucket, key))
        try:
            data = self.objects[(bucket, key)]
        except KeyError as error:
            raise FileNotFoundError(key) from error
        if len(data) > max_bytes:
            raise ValueError("source exceeds worker download limit")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return ObjectMetadata(byte_size=len(data), content_type="application/octet-stream")

    def upload_file(
        self,
        bucket: str,
        key: str,
        source: Path,
        content_type: str,
    ) -> ObjectMetadata:
        self.upload_calls.append((bucket, key))
        if (bucket, key) in self.objects:
            raise ObjectAlreadyExists(key)
        data = source.read_bytes()
        self.objects[(bucket, key)] = data
        return ObjectMetadata(byte_size=len(data), content_type=content_type)

    def upload_bytes(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str,
    ) -> ObjectMetadata:
        self.upload_calls.append((bucket, key))
        if (bucket, key) in self.objects:
            raise ObjectAlreadyExists(key)
        self.objects[(bucket, key)] = bytes(data)
        return ObjectMetadata(byte_size=len(data), content_type=content_type)

    def head(self, bucket: str, key: str) -> ObjectMetadata | None:
        data = self.objects.get((bucket, key))
        return None if data is None else ObjectMetadata(byte_size=len(data))

    def delete_many(self, bucket: str, keys: list[str]) -> None:
        for key in keys:
            self.objects.pop((bucket, key), None)

    def public_url(self, bucket: str, key: str) -> str:
        return f"https://objects.invalid/{bucket}/{key}"


def config(tmp_path: Path) -> Config:
    return Config(
        database_url="postgresql://example.invalid/postgres",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test",
        worker_id="test-r2-worker",
        raw_cache_directory=tmp_path / "cache",
        storage_primary="r2",
        r2_endpoint="https://account.r2.cloudflarestorage.com",
        r2_access_key_id="access",
        r2_secret_access_key="secret",
        r2_raw_bucket="sky-raw",
        r2_derived_bucket="sky-derived",
        r2_hips_bucket="sky-hips",
    )


def upload_row(*, data: bytes, checksum: str | None = None) -> dict[str, object]:
    return {
        "id": uuid4(),
        "user_id": uuid4(),
        "object_id": "M31",
        "frame_type": "light",
        "storage_path": "legacy/user/frame.jpg",
        "storage_backend": "r2",
        "storage_bucket": "sky-raw",
        "storage_key": "raw/upload/frame.jpg",
        "legacy_storage_path": "legacy/user/frame.jpg",
        "storage_verified_at": None,
        "original_filename": "frame.jpg",
        "file_size_bytes": len(data),
        "metadata": {},
        "content_sha256": checksum,
    }


def test_r2_object_is_used_without_legacy_download(tmp_path: Path) -> None:
    primary = MemoryStorage()
    legacy = MemoryStorage()
    payload = b"M31-frame"
    primary.objects[("sky-raw", "raw/upload/frame.jpg")] = payload
    gateway = Gateway(config(tmp_path), primary_storage=primary, legacy_storage=legacy)
    row = upload_row(data=payload, checksum=hashlib.sha256(payload).hexdigest())
    gateway.fetch_upload = lambda _upload_id: row  # type: ignore[method-assign]

    artifact = gateway.download_upload(row["id"], tmp_path / "job")  # type: ignore[arg-type]

    assert artifact.local_path.read_bytes() == payload
    assert primary.download_calls == [("sky-raw", "raw/upload/frame.jpg")]
    assert legacy.download_calls == []


def test_missing_r2_object_falls_back_to_legacy_supabase_path(tmp_path: Path) -> None:
    primary = MemoryStorage()
    legacy = MemoryStorage()
    payload = b"legacy-frame"
    legacy.objects[("astro-raw", "legacy/user/frame.jpg")] = payload
    gateway = Gateway(config(tmp_path), primary_storage=primary, legacy_storage=legacy)
    row = upload_row(data=payload)
    gateway.fetch_upload = lambda _upload_id: row  # type: ignore[method-assign]

    artifact = gateway.download_upload(row["id"], tmp_path / "job")  # type: ignore[arg-type]

    assert artifact.local_path.read_bytes() == payload
    assert primary.download_calls == [("sky-raw", "raw/upload/frame.jpg")]
    assert legacy.download_calls == [("astro-raw", "legacy/user/frame.jpg")]


def test_downloaded_size_must_match_database(tmp_path: Path) -> None:
    primary = MemoryStorage()
    legacy = MemoryStorage()
    primary.objects[("sky-raw", "raw/upload/frame.jpg")] = b"abc"
    gateway = Gateway(config(tmp_path), primary_storage=primary, legacy_storage=legacy)
    row = upload_row(data=b"abcd")
    gateway.fetch_upload = lambda _upload_id: row  # type: ignore[method-assign]

    with pytest.raises(ValueError, match="registered upload"):
        gateway.download_upload(row["id"], tmp_path / "job")  # type: ignore[arg-type]


def test_downloaded_checksum_must_match_database(tmp_path: Path) -> None:
    primary = MemoryStorage()
    legacy = MemoryStorage()
    payload = b"abcdef"
    primary.objects[("sky-raw", "raw/upload/frame.jpg")] = payload
    gateway = Gateway(config(tmp_path), primary_storage=primary, legacy_storage=legacy)
    row = upload_row(data=payload, checksum=hashlib.sha256(b"xxxxxx").hexdigest())
    gateway.fetch_upload = lambda _upload_id: row  # type: ignore[method-assign]

    with pytest.raises(ValueError, match="checksum"):
        gateway.download_upload(row["id"], tmp_path / "job")  # type: ignore[arg-type]


def test_r2_write_collision_with_different_checksum_is_rejected(tmp_path: Path) -> None:
    primary = MemoryStorage()
    legacy = MemoryStorage()
    primary.objects[("sky-raw", "archive/frame.fits")] = b"existing"
    gateway = Gateway(config(tmp_path), primary_storage=primary, legacy_storage=legacy)
    source = tmp_path / "new.fits"
    source.write_bytes(b"different")

    with pytest.raises(RuntimeError, match="immutable raw archive checksum conflict"):
        gateway.ensure_raw("archive/frame.fits", source)
