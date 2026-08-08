from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
from urllib.request import Request, urlopen
from uuid import UUID
import hashlib

import psycopg
from psycopg.rows import dict_row
from supabase import Client, create_client

from .config import Config
from .models import Job, SourceArtifact


class Gateway:
    def __init__(self, config: Config):
        self.config = config
        self.storage: Client = create_client(config.supabase_url, config.supabase_secret_key)

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection[dict[str, Any]]]:
        with psycopg.connect(self.config.database_url, row_factory=dict_row) as connection:
            yield connection

    def lease(self) -> Job | None:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                "select * from private.lease_processing_job(%s, %s)",
                (self.config.worker_id, self.config.lease_seconds),
            )
            row = cursor.fetchone()
        return Job(**row) if row else None

    def heartbeat(self, job: Job) -> bool:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                "select private.heartbeat_processing_job(%s, %s, %s, %s) as ok",
                (job.id, self.config.worker_id, job.version, self.config.lease_seconds),
            )
            row = cursor.fetchone()
        return bool(row and row["ok"])

    def transition(self, job: Job, status: str, progress: int, result: dict[str, Any]) -> None:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                "select private.transition_processing_job(%s, %s, %s, %s, %s, %s::jsonb)",
                (job.id, self.config.worker_id, job.version, status, progress, result),
            )

    def fail(self, job: Job, code: str, detail: str, retry_after: int | None) -> None:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                "select private.fail_processing_job(%s, %s, %s, %s, %s, %s)",
                (job.id, self.config.worker_id, job.version, code, detail, retry_after),
            )
            stacking_job_id = job.payload.get("stacking_job_id")
            if job.job_type == "stack_object" and stacking_job_id:
                cursor.execute(
                    """
                    update public.astro_stacking_jobs s
                    set status=case when j.completed_at is null then 'pending' else 'failed' end,
                        error_message=%s,
                        completed_at=case when j.completed_at is null then null else now() end
                    from public.processing_jobs j
                    where s.id=%s and j.id=%s
                    """,
                    (detail[:2000], stacking_job_id, job.id),
                )

    def fetch_upload(self, upload_id: UUID) -> dict[str, Any]:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select id, user_id, object_id, frame_type, storage_path, original_filename,
                       file_size_bytes, metadata, exposure_s, filter_name, content_sha256,
                       pixel_size_um, focal_length_mm, sensor_width_px, sensor_height_px,
                       licence_code, pipeline_version
                from public.astro_uploads where id = %s and deleted_at is null
                """,
                (upload_id,),
            )
            row = cursor.fetchone()
        if not row:
            raise LookupError("upload not found")
        return row

    def download_upload(self, upload_id: UUID, directory: Path) -> SourceArtifact:
        row = self.fetch_upload(upload_id)
        signed = self.storage.storage.from_("astro-raw").create_signed_url(
            row["storage_path"], self.config.signed_url_seconds
        )
        signed_url = signed.get("signedURL") or signed.get("signedUrl")
        if not signed_url:
            raise RuntimeError("storage did not return a signed URL")
        target = directory / Path(row["original_filename"]).name
        request = Request(signed_url, headers={"User-Agent": "sky-science-worker/1"})
        total = 0
        with urlopen(request, timeout=60) as response, target.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > self.config.max_download_bytes:
                    raise ValueError("source exceeds worker download limit")
                output.write(chunk)
        if total != row["file_size_bytes"]:
            raise ValueError("source size differs from registered upload")
        return SourceArtifact(
            upload_id=upload_id,
            local_path=target,
            storage_path=row["storage_path"],
            frame_type=row["frame_type"],
            metadata=row["metadata"] or {},
        )

    def execute(self, query: str, parameters: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(query, parameters)
            return cursor.fetchall() if cursor.description else []

    def upload_derivative(self, path: str, data: bytes, content_type: str) -> None:
        response = self.storage.storage.from_("astro-derived").upload(
            path,
            data,
            {"content-type": content_type, "cache-control": "31536000", "upsert": "false"},
        )
        if not response:
            raise RuntimeError("derivative upload failed")

    def ensure_derivative(self, path: str, data: bytes, content_type: str) -> str:
        checksum = hashlib.sha256(data).hexdigest()
        try:
            self.upload_derivative(path, data, content_type)
        except Exception:
            existing = self.storage.storage.from_("astro-derived").download(path)
            if hashlib.sha256(existing).hexdigest() != checksum:
                raise RuntimeError("immutable derivative checksum conflict")
        return checksum
