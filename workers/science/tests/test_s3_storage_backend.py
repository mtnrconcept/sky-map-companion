from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from botocore.response import StreamingBody
from botocore.stub import Stubber

from sky_worker.object_storage import ObjectAlreadyExists
from sky_worker.s3_storage import S3StorageBackend


def backend() -> S3StorageBackend:
    return S3StorageBackend(
        endpoint_url="https://account-id.r2.cloudflarestorage.com",
        region_name="auto",
        access_key_id="test-access",
        secret_access_key="test-secret",
        public_base_url="https://objects.example.test",
    )


def test_upload_bytes_uses_conditional_immutable_put() -> None:
    storage = backend()
    with Stubber(storage.client) as stubber:
        stubber.add_client_error(
            "head_object",
            service_error_code="404",
            service_message="Not Found",
            http_status_code=404,
            expected_params={"Bucket": "sky-raw", "Key": "raw/a.bin"},
        )
        stubber.add_response(
            "put_object",
            {"ETag": '"etag-1"'},
            expected_params={
                "Bucket": "sky-raw",
                "Key": "raw/a.bin",
                "Body": b"abc123",
                "ContentType": "application/octet-stream",
                "IfNoneMatch": "*",
            },
        )

        metadata = storage.upload_bytes(
            "sky-raw",
            "raw/a.bin",
            b"abc123",
            "application/octet-stream",
        )

    assert metadata.byte_size == 6
    assert metadata.etag == "etag-1"


def test_existing_key_is_rejected_before_write() -> None:
    storage = backend()
    with Stubber(storage.client) as stubber:
        stubber.add_response(
            "head_object",
            {
                "ContentLength": 6,
                "ContentType": "application/octet-stream",
                "ETag": '"etag-existing"',
            },
            expected_params={"Bucket": "sky-raw", "Key": "raw/a.bin"},
        )
        with pytest.raises(ObjectAlreadyExists):
            storage.upload_bytes(
                "sky-raw",
                "raw/a.bin",
                b"abc123",
                "application/octet-stream",
            )


def test_download_file_streams_and_enforces_metadata_size(tmp_path: Path) -> None:
    storage = backend()
    payload = b"abcdef"
    with Stubber(storage.client) as stubber:
        stubber.add_response(
            "head_object",
            {
                "ContentLength": len(payload),
                "ContentType": "application/fits",
                "ETag": '"etag-download"',
            },
            expected_params={"Bucket": "sky-raw", "Key": "raw/frame.fits"},
        )
        stubber.add_response(
            "get_object",
            {
                "Body": StreamingBody(BytesIO(payload), len(payload)),
                "ContentLength": len(payload),
                "ContentType": "application/fits",
                "ETag": '"etag-download"',
            },
            expected_params={"Bucket": "sky-raw", "Key": "raw/frame.fits"},
        )

        target = tmp_path / "frame.fits"
        metadata = storage.download_file(
            "sky-raw",
            "raw/frame.fits",
            target,
            max_bytes=100,
        )

    assert target.read_bytes() == payload
    assert metadata.byte_size == len(payload)
    assert metadata.content_type == "application/fits"


def test_download_refuses_object_larger_than_limit(tmp_path: Path) -> None:
    storage = backend()
    with Stubber(storage.client) as stubber:
        stubber.add_response(
            "head_object",
            {"ContentLength": 101, "ETag": '"etag"'},
            expected_params={"Bucket": "sky-raw", "Key": "raw/too-large.bin"},
        )
        with pytest.raises(ValueError, match="download limit"):
            storage.download_file(
                "sky-raw",
                "raw/too-large.bin",
                tmp_path / "too-large.bin",
                max_bytes=100,
            )


def test_upload_file_uses_transfer_and_verifies_size(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = backend()
    source = tmp_path / "frame.fits"
    source.write_bytes(b"abcdef")
    calls: list[tuple[str, str, str]] = []

    def fake_upload_file(
        filename: str,
        bucket: str,
        key: str,
        *,
        ExtraArgs: dict[str, str],
        Config: object,
    ) -> None:
        assert Path(filename) == source
        assert ExtraArgs == {"ContentType": "application/fits"}
        assert Config is not None
        calls.append((filename, bucket, key))

    monkeypatch.setattr(storage.client, "upload_file", fake_upload_file)
    with Stubber(storage.client) as stubber:
        stubber.add_client_error(
            "head_object",
            service_error_code="404",
            service_message="Not Found",
            http_status_code=404,
            expected_params={"Bucket": "sky-raw", "Key": "raw/frame.fits"},
        )
        stubber.add_response(
            "head_object",
            {
                "ContentLength": 6,
                "ContentType": "application/fits",
                "ETag": '"etag-upload"',
            },
            expected_params={"Bucket": "sky-raw", "Key": "raw/frame.fits"},
        )

        metadata = storage.upload_file(
            "sky-raw",
            "raw/frame.fits",
            source,
            "application/fits",
        )

    assert calls
    assert metadata.byte_size == 6


def test_public_url_contains_bucket_and_encoded_key() -> None:
    storage = backend()
    assert (
        storage.public_url("sky-hips", "hips/M 31/properties")
        == "https://objects.example.test/sky-hips/hips/M%2031/properties"
    )
