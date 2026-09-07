from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

import pytest

from sky_worker.object_storage import ObjectAlreadyExists
from sky_worker.supabase_storage import SupabaseStorageBackend


class FakeBucket:
    def __init__(self, name: str, objects: dict[tuple[str, str], tuple[bytes, str]]) -> None:
        self.name = name
        self.objects = objects
        self.removed: list[str] = []

    def list(self, folder: str, options: dict[str, Any]) -> list[dict[str, Any]]:
        expected = options.get("search")
        prefix = f"{folder}/" if folder else ""
        rows: list[dict[str, Any]] = []
        for (bucket, key), (data, content_type) in self.objects.items():
            if bucket != self.name or not key.startswith(prefix):
                continue
            remainder = key[len(prefix) :]
            if "/" in remainder or (expected and remainder != expected):
                continue
            rows.append(
                {
                    "name": remainder,
                    "id": f"id-{remainder}",
                    "metadata": {
                        "size": len(data),
                        "mimetype": content_type,
                        "eTag": f'"etag-{remainder}"',
                    },
                }
            )
        return rows

    def upload(self, key: str, payload: Any, options: dict[str, Any]) -> dict[str, str]:
        data = payload.read_bytes() if isinstance(payload, Path) else bytes(payload)
        content_type = str(options["content-type"])
        self.objects[(self.name, key)] = (data, content_type)
        return {"path": key}

    def remove(self, keys: list[str]) -> list[dict[str, str]]:
        for key in keys:
            self.objects.pop((self.name, key), None)
            self.removed.append(key)
        return [{"name": key} for key in keys]

    def create_signed_url(self, key: str, _expires: int) -> dict[str, str]:
        return {"signedURL": f"https://signed.invalid/{self.name}/{key}"}

    def get_public_url(self, key: str) -> str:
        return f"https://public.invalid/{self.name}/{key}"


class FakeStorage:
    def __init__(self, objects: dict[tuple[str, str], tuple[bytes, str]]) -> None:
        self.objects = objects
        self.buckets: dict[str, FakeBucket] = {}

    def from_(self, name: str) -> FakeBucket:
        return self.buckets.setdefault(name, FakeBucket(name, self.objects))


class FakeClient:
    def __init__(self) -> None:
        self.supabase_url = "https://project-ref.supabase.co"
        self.supabase_key = "sb_secret_test_server_key"
        self.objects: dict[tuple[str, str], tuple[bytes, str]] = {}
        self.storage = FakeStorage(self.objects)


class FakeResponse(BytesIO):
    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        self.close()


def test_head_and_immutable_upload_bytes() -> None:
    client = FakeClient()
    backend = SupabaseStorageBackend(client, signed_url_seconds=300)  # type: ignore[arg-type]

    metadata = backend.upload_bytes(
        "astro-derived",
        "preview/a.png",
        b"image-bytes",
        "image/png",
    )
    assert metadata.byte_size == 11
    assert backend.head("astro-derived", "preview/a.png") is not None

    with pytest.raises(ObjectAlreadyExists):
        backend.upload_bytes(
            "astro-derived",
            "preview/a.png",
            b"replacement",
            "image/png",
        )


def test_download_uses_signed_url_and_enforces_size(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient()
    client.objects[("astro-raw", "user/frame.jpg")] = (b"abcdef", "image/jpeg")
    backend = SupabaseStorageBackend(client, signed_url_seconds=300)  # type: ignore[arg-type]

    def fake_urlopen(request: Any, timeout: int) -> FakeResponse:
        assert request.full_url.endswith("/astro-raw/user/frame.jpg")
        assert timeout == 60
        return FakeResponse(b"abcdef")

    monkeypatch.setattr("sky_worker.supabase_storage.urlopen", fake_urlopen)
    target = tmp_path / "frame.jpg"
    metadata = backend.download_file(
        "astro-raw",
        "user/frame.jpg",
        target,
        max_bytes=6,
    )
    assert target.read_bytes() == b"abcdef"
    assert metadata.byte_size == 6

    with pytest.raises(ValueError, match="download limit"):
        backend.download_file(
            "astro-raw",
            "user/frame.jpg",
            tmp_path / "too-small.jpg",
            max_bytes=5,
        )


def test_large_file_routes_to_direct_storage_tus(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = FakeClient()
    backend = SupabaseStorageBackend(client, signed_url_seconds=300)  # type: ignore[arg-type]
    source = tmp_path / "large.fits"
    source.write_bytes(b"x" * (6 * 1024 * 1024 + 1))
    calls: list[tuple[str, str, int, str]] = []

    def fake_resumable(bucket: str, key: str, path: Path, content_type: str) -> None:
        calls.append((bucket, key, path.stat().st_size, content_type))

    monkeypatch.setattr(backend, "_upload_resumable_file", fake_resumable)
    metadata = backend.upload_file(
        "astro-raw",
        "user/large.fits",
        source,
        "application/fits",
    )

    assert calls == [
        ("astro-raw", "user/large.fits", 6 * 1024 * 1024 + 1, "application/fits")
    ]
    assert metadata.byte_size == source.stat().st_size
    assert (
        backend._resumable_storage_endpoint()
        == "https://project-ref.storage.supabase.co/storage/v1/upload/resumable"
    )


def test_delete_many_and_public_url() -> None:
    client = FakeClient()
    client.objects[("astro-derived", "a.bin")] = (b"a", "application/octet-stream")
    client.objects[("astro-derived", "b.bin")] = (b"b", "application/octet-stream")
    backend = SupabaseStorageBackend(client, signed_url_seconds=300)  # type: ignore[arg-type]

    backend.delete_many("astro-derived", ["a.bin", "b.bin"])
    assert backend.head("astro-derived", "a.bin") is None
    assert backend.head("astro-derived", "b.bin") is None
    assert (
        backend.public_url("astro-derived", "preview/x.png")
        == "https://public.invalid/astro-derived/preview/x.png"
    )
