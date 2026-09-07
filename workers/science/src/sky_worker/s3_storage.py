from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from .object_storage import ObjectAlreadyExists, ObjectMetadata


_DOWNLOAD_CHUNK_BYTES = 1024 * 1024
_DELETE_BATCH_SIZE = 1_000
_TRANSFER_CONFIG = TransferConfig(
    multipart_threshold=16 * 1024 * 1024,
    multipart_chunksize=16 * 1024 * 1024,
    max_concurrency=8,
    use_threads=True,
)


class S3StorageBackend:
    def __init__(
        self,
        endpoint_url: str,
        region_name: str,
        access_key_id: str,
        secret_access_key: str,
        public_base_url: str | None = None,
    ) -> None:
        self.public_base_url = public_base_url.rstrip("/") if public_base_url else None
        self.client = boto3.client(
            service_name="s3",
            endpoint_url=endpoint_url.rstrip("/"),
            region_name=region_name,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            config=BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    @staticmethod
    def _metadata(response: dict[str, object]) -> ObjectMetadata:
        byte_size = int(response.get("ContentLength", 0) or 0)
        raw_etag = response.get("ETag")
        etag = raw_etag.strip('"') if isinstance(raw_etag, str) and raw_etag else None
        raw_content_type = response.get("ContentType")
        content_type = raw_content_type if isinstance(raw_content_type, str) else None
        return ObjectMetadata(byte_size=byte_size, etag=etag, content_type=content_type)

    @staticmethod
    def _is_missing(error: ClientError) -> bool:
        response = error.response if isinstance(error.response, dict) else {}
        error_info = response.get("Error") if isinstance(response, dict) else None
        code = error_info.get("Code") if isinstance(error_info, dict) else None
        metadata = response.get("ResponseMetadata") if isinstance(response, dict) else None
        status = metadata.get("HTTPStatusCode") if isinstance(metadata, dict) else None
        return code in {"404", "NoSuchKey", "NotFound"} or status == 404

    @staticmethod
    def _is_precondition_failure(error: ClientError) -> bool:
        response = error.response if isinstance(error.response, dict) else {}
        error_info = response.get("Error") if isinstance(response, dict) else None
        code = error_info.get("Code") if isinstance(error_info, dict) else None
        metadata = response.get("ResponseMetadata") if isinstance(response, dict) else None
        status = metadata.get("HTTPStatusCode") if isinstance(metadata, dict) else None
        return code in {"PreconditionFailed", "412"} or status == 412

    def head(self, bucket: str, key: str) -> ObjectMetadata | None:
        try:
            response = self.client.head_object(Bucket=bucket, Key=key)
        except ClientError as error:
            if self._is_missing(error):
                return None
            raise
        return self._metadata(response)

    def download_file(
        self,
        bucket: str,
        key: str,
        target: Path,
        *,
        max_bytes: int,
    ) -> ObjectMetadata:
        metadata = self.head(bucket, key)
        if metadata is None:
            raise FileNotFoundError(f"storage object not found: {bucket}/{key}")
        if metadata.byte_size > max_bytes:
            raise ValueError("source exceeds worker download limit")

        response = self.client.get_object(Bucket=bucket, Key=key)
        body = response["Body"]
        target.parent.mkdir(parents=True, exist_ok=True)
        total = 0
        try:
            with target.open("wb") as output:
                while True:
                    chunk = body.read(_DOWNLOAD_CHUNK_BYTES)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError("source exceeds worker download limit")
                    output.write(chunk)
        except Exception:
            target.unlink(missing_ok=True)
            raise
        finally:
            close = getattr(body, "close", None)
            if callable(close):
                close()

        if metadata.byte_size and total != metadata.byte_size:
            target.unlink(missing_ok=True)
            raise ValueError("source size differs from object metadata")
        return ObjectMetadata(
            byte_size=total,
            etag=metadata.etag,
            content_type=metadata.content_type,
        )

    def upload_file(
        self,
        bucket: str,
        key: str,
        source: Path,
        content_type: str,
    ) -> ObjectMetadata:
        if self.head(bucket, key) is not None:
            raise ObjectAlreadyExists(f"immutable object already exists: {bucket}/{key}")

        self.client.upload_file(
            str(source),
            bucket,
            key,
            ExtraArgs={"ContentType": content_type},
            Config=_TRANSFER_CONFIG,
        )
        metadata = self.head(bucket, key)
        if metadata is None:
            raise RuntimeError("S3 upload completed but object metadata is unavailable")
        expected_size = source.stat().st_size
        if metadata.byte_size != expected_size:
            raise RuntimeError(
                f"S3 upload size mismatch ({metadata.byte_size} != {expected_size})"
            )
        return ObjectMetadata(
            byte_size=metadata.byte_size,
            etag=metadata.etag,
            content_type=metadata.content_type or content_type,
        )

    def upload_bytes(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str,
    ) -> ObjectMetadata:
        if self.head(bucket, key) is not None:
            raise ObjectAlreadyExists(f"immutable object already exists: {bucket}/{key}")
        try:
            response = self.client.put_object(
                Bucket=bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                IfNoneMatch="*",
            )
        except ClientError as error:
            if self._is_precondition_failure(error):
                raise ObjectAlreadyExists(
                    f"immutable object already exists: {bucket}/{key}"
                ) from error
            raise
        raw_etag = response.get("ETag")
        etag = raw_etag.strip('"') if isinstance(raw_etag, str) and raw_etag else None
        return ObjectMetadata(byte_size=len(data), etag=etag, content_type=content_type)

    def delete_many(self, bucket: str, keys: list[str]) -> None:
        for offset in range(0, len(keys), _DELETE_BATCH_SIZE):
            batch = keys[offset : offset + _DELETE_BATCH_SIZE]
            if not batch:
                continue
            response = self.client.delete_objects(
                Bucket=bucket,
                Delete={
                    "Objects": [{"Key": key} for key in batch],
                    "Quiet": True,
                },
            )
            errors = response.get("Errors", [])
            if errors:
                raise RuntimeError(f"S3 delete failed for {len(errors)} object(s)")

    def public_url(self, bucket: str, key: str) -> str:
        if self.public_base_url is None:
            raise RuntimeError("public S3 base URL is not configured")
        encoded = quote(f"{bucket}/{key.lstrip('/')}", safe="/")
        return f"{self.public_base_url}/{encoded}"
