from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class ObjectMetadata:
    byte_size: int
    etag: str | None = None
    content_type: str | None = None


class ObjectAlreadyExists(RuntimeError):
    """Raised when an immutable object key is already occupied."""


class ObjectStorageBackend(Protocol):
    def download_file(
        self,
        bucket: str,
        key: str,
        target: Path,
        *,
        max_bytes: int,
    ) -> ObjectMetadata: ...

    def upload_file(
        self,
        bucket: str,
        key: str,
        source: Path,
        content_type: str,
    ) -> ObjectMetadata: ...

    def upload_bytes(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: str,
    ) -> ObjectMetadata: ...

    def head(self, bucket: str, key: str) -> ObjectMetadata | None: ...

    def delete_many(self, bucket: str, keys: list[str]) -> None: ...

    def public_url(self, bucket: str, key: str) -> str: ...
