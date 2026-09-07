from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from supabase import Client
from tusclient import client as tus_client

from .object_storage import ObjectAlreadyExists, ObjectMetadata


_RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024
_RESUMABLE_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024
_REMOVE_BATCH_SIZE = 1_000
_DOWNLOAD_CHUNK_BYTES = 1024 * 1024


class SupabaseStorageBackend:
    def __init__(self, client: Client, signed_url_seconds: int) -> None:
        self.client = client
        self.signed_url_seconds = signed_url_seconds

    def _bucket(self, bucket: str) -> Any:
        return self.client.storage.from_(bucket)

    @staticmethod
    def _split_key(key: str) -> tuple[str, str]:
        normalized = key.strip("/")
        if not normalized:
            raise ValueError("object key must not be empty")
        if "/" not in normalized:
            return "", normalized
        return normalized.rsplit("/", 1)

    @staticmethod
    def _metadata_size(entry: dict[str, Any]) -> int:
        metadata = entry.get("metadata")
        if not isinstance(metadata, dict):
            return 0
        value = metadata.get("size", metadata.get("contentLength", 0))
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _metadata_content_type(entry: dict[str, Any]) -> str | None:
        metadata = entry.get("metadata")
        if not isinstance(metadata, dict):
            return None
        value = metadata.get("mimetype", metadata.get("contentType"))
        return value if isinstance(value, str) and value else None

    def head(self, bucket: str, key: str) -> ObjectMetadata | None:
        folder, filename = self._split_key(key)
        entries = self._bucket(bucket).list(folder, {"search": filename, "limit": 10})
        if not isinstance(entries, list):
            raise RuntimeError("Supabase Storage list returned an invalid response")
        for entry in entries:
            if not isinstance(entry, dict) or entry.get("name") != filename:
                continue
            metadata = entry.get("metadata")
            etag = None
            if isinstance(metadata, dict):
                candidate = metadata.get("eTag", metadata.get("etag"))
                if isinstance(candidate, str) and candidate:
                    etag = candidate.strip('"')
            return ObjectMetadata(
                byte_size=self._metadata_size(entry),
                etag=etag,
                content_type=self._metadata_content_type(entry),
            )
        return None

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

        signed = self._bucket(bucket).create_signed_url(key, self.signed_url_seconds)
        signed_url = signed.get("signedURL") or signed.get("signedUrl") if isinstance(signed, dict) else None
        if not isinstance(signed_url, str) or not signed_url.startswith("http"):
            raise RuntimeError("storage did not return a signed URL")

        target.parent.mkdir(parents=True, exist_ok=True)
        total = 0
        try:
            request = Request(signed_url, headers={"User-Agent": "sky-science-worker/1"})
            with urlopen(request, timeout=60) as response, target.open("wb") as output:
                while chunk := response.read(_DOWNLOAD_CHUNK_BYTES):
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError("source exceeds worker download limit")
                    output.write(chunk)
        except Exception:
            target.unlink(missing_ok=True)
            raise

        if metadata.byte_size and total != metadata.byte_size:
            target.unlink(missing_ok=True)
            raise ValueError("source size differs from Storage metadata")
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
        byte_size = source.stat().st_size
        if byte_size > _RESUMABLE_UPLOAD_THRESHOLD_BYTES:
            self._upload_resumable_file(bucket, key, source, content_type)
        else:
            response = self._bucket(bucket).upload(
                key,
                source,
                {
                    "content-type": content_type,
                    "cache-control": "31536000",
                    "upsert": "false",
                },
            )
            if not response:
                raise RuntimeError("Supabase Storage upload returned no response")
        return ObjectMetadata(byte_size=byte_size, content_type=content_type)

    def upload_bytes(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str,
    ) -> ObjectMetadata:
        if self.head(bucket, key) is not None:
            raise ObjectAlreadyExists(f"immutable object already exists: {bucket}/{key}")
        response = self._bucket(bucket).upload(
            key,
            data,
            {
                "content-type": content_type,
                "cache-control": "31536000",
                "upsert": "false",
            },
        )
        if not response:
            raise RuntimeError("Supabase Storage upload returned no response")
        return ObjectMetadata(byte_size=len(data), content_type=content_type)

    def delete_many(self, bucket: str, keys: list[str]) -> None:
        for offset in range(0, len(keys), _REMOVE_BATCH_SIZE):
            batch = keys[offset : offset + _REMOVE_BATCH_SIZE]
            if not batch:
                continue
            response = self._bucket(bucket).remove(batch)
            if response is None:
                raise RuntimeError("Supabase Storage remove returned no response")

    def public_url(self, bucket: str, key: str) -> str:
        public_url = self._bucket(bucket).get_public_url(key)
        if not isinstance(public_url, str) or not public_url.startswith("https://"):
            raise RuntimeError("storage did not return a public URL")
        return public_url

    def _client_connection_values(self) -> tuple[str, str]:
        supabase_url = getattr(self.client, "supabase_url", None)
        supabase_key = getattr(self.client, "supabase_key", None)
        if not isinstance(supabase_url, str) or not supabase_url:
            raise RuntimeError("Supabase client does not expose its project URL")
        if not isinstance(supabase_key, str) or not supabase_key:
            raise RuntimeError("Supabase client does not expose its server key")
        return supabase_url.rstrip("/"), supabase_key

    def _resumable_storage_endpoint(self) -> str:
        supabase_url, _ = self._client_connection_values()
        parsed = urlparse(supabase_url)
        hostname = parsed.hostname or ""
        if parsed.scheme == "https" and hostname.endswith(".supabase.co"):
            project_ref = hostname.removesuffix(".supabase.co")
            if project_ref and "." not in project_ref:
                return f"https://{project_ref}.storage.supabase.co/storage/v1/upload/resumable"
        return f"{supabase_url}/storage/v1/upload/resumable"

    def _upload_resumable_file(
        self,
        bucket: str,
        key: str,
        source: Path,
        content_type: str,
    ) -> None:
        _, supabase_key = self._client_connection_values()
        resumable_client = tus_client.TusClient(
            self._resumable_storage_endpoint(),
            headers={
                "Authorization": f"Bearer {supabase_key}",
                "apikey": supabase_key,
            },
        )
        with source.open("rb") as file_stream:
            uploader = resumable_client.uploader(
                file_stream=file_stream,
                chunk_size=_RESUMABLE_UPLOAD_CHUNK_BYTES,
                metadata={
                    "bucketName": bucket,
                    "objectName": key,
                    "contentType": content_type,
                    "cacheControl": "31536000",
                },
                retries=5,
                retry_delay=2,
            )
            uploader.upload()
