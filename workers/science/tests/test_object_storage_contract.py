from __future__ import annotations

from pathlib import Path

import pytest

from sky_worker.object_storage import ObjectAlreadyExists, ObjectMetadata


class MemoryBackend:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], tuple[bytes, str]] = {}

    def download_file(
        self,
        bucket: str,
        key: str,
        target: Path,
        *,
        max_bytes: int,
    ) -> ObjectMetadata:
        data, content_type = self.objects[(bucket, key)]
        if len(data) > max_bytes:
            raise ValueError("source exceeds worker download limit")
        target.write_bytes(data)
        return ObjectMetadata(byte_size=len(data), content_type=content_type)

    def upload_file(
        self,
        bucket: str,
        key: str,
        source: Path,
        content_type: str,
    ) -> ObjectMetadata:
        return self.upload_bytes(bucket, key, source.read_bytes(), content_type)

    def upload_bytes(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str,
    ) -> ObjectMetadata:
        object_key = (bucket, key)
        if object_key in self.objects:
            raise ObjectAlreadyExists(key)
        self.objects[object_key] = (bytes(data), content_type)
        return ObjectMetadata(byte_size=len(data), content_type=content_type)

    def head(self, bucket: str, key: str) -> ObjectMetadata | None:
        stored = self.objects.get((bucket, key))
        if stored is None:
            return None
        data, content_type = stored
        return ObjectMetadata(byte_size=len(data), content_type=content_type)

    def delete_many(self, bucket: str, keys: list[str]) -> None:
        for key in keys:
            self.objects.pop((bucket, key), None)

    def public_url(self, bucket: str, key: str) -> str:
        return f"https://objects.invalid/{bucket}/{key}"


def assert_backend_contract(backend: MemoryBackend, tmp_path: Path) -> None:
    source = tmp_path / "source.bin"
    source.write_bytes(b"abc123")

    uploaded = backend.upload_file(
        "bucket",
        "a/b.bin",
        source,
        "application/octet-stream",
    )
    assert uploaded.byte_size == 6

    meta = backend.head("bucket", "a/b.bin")
    assert meta is not None
    assert meta.byte_size == 6

    target = tmp_path / "download.bin"
    downloaded = backend.download_file(
        "bucket",
        "a/b.bin",
        target,
        max_bytes=100,
    )
    assert downloaded.byte_size == 6
    assert target.read_bytes() == b"abc123"

    with pytest.raises(ObjectAlreadyExists):
        backend.upload_file(
            "bucket",
            "a/b.bin",
            source,
            "application/octet-stream",
        )

    backend.delete_many("bucket", ["a/b.bin"])
    assert backend.head("bucket", "a/b.bin") is None


def test_object_storage_contract(tmp_path: Path) -> None:
    assert_backend_contract(MemoryBackend(), tmp_path)


def test_download_limit_is_enforced(tmp_path: Path) -> None:
    backend = MemoryBackend()
    backend.upload_bytes("bucket", "large.bin", b"123456", "application/octet-stream")

    with pytest.raises(ValueError, match="download limit"):
        backend.download_file(
            "bucket",
            "large.bin",
            tmp_path / "large.bin",
            max_bytes=5,
        )
