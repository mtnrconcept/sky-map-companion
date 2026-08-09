from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import shutil
from typing import Any, Iterator
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import UUID
from uuid import uuid4
import hashlib

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from supabase import Client, create_client
from tusclient import client as tus_client

from .config import Config
from .models import Job, SourceArtifact


_RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024
_RESUMABLE_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024


class Gateway:
    def __init__(self, config: Config):
        self.config = config
        self.storage: Client = create_client(config.supabase_url, config.supabase_secret_key)

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection[dict[str, Any]]]:
        with psycopg.connect(self.config.database_url, row_factory=dict_row) as connection:
            yield connection

    def lease(self, job_id: UUID | None = None) -> Job | None:
        with self.connection() as connection, connection.cursor() as cursor:
            if job_id is None:
                cursor.execute(
                    "select * from private.lease_processing_job(%s, %s)",
                    (self.config.worker_id, self.config.lease_seconds),
                )
            else:
                cursor.execute(
                    """
                    with candidate as (
                      select j.id
                      from public.processing_jobs j
                      where j.id=%s
                        and j.job_type='publish_mosaic'
                        and j.payload->>'mode'='build_archive_v9'
                        and j.payload->>'lease_scope'='inline'
                        and starts_with(j.idempotency_key, 'archive-mosaic-v9:')
                        and j.completed_at is null
                        and j.status not in ('published','rejected','duplicate','cancelled')
                        and j.attempts < j.max_attempts
                        and j.available_at <= now()
                        and (j.lease_expires_at is null or j.lease_expires_at < now())
                      for update skip locked
                    ), leased as (
                      update public.processing_jobs j
                      set status=case
                            when j.status='failed' and j.payload->>'retry_state'='approved'
                              then 'approved'
                            else j.status
                          end,
                          payload=case
                            when j.status='failed' and j.payload->>'retry_state'='approved'
                              then j.payload - 'retry_state'
                            else j.payload
                          end,
                          leased_by=%s,
                          lease_expires_at=now() + make_interval(secs => %s),
                          heartbeat_at=now(),
                          attempts=j.attempts+1,
                          updated_at=now()
                      from candidate c
                      where j.id=c.id
                      returning j.*
                    )
                    select id,job_type,status,upload_id,object_id,
                           cosmos_observation_id,cosmos_event_id,owner_user_id,
                           payload,attempts,pipeline_version,version
                    from leased
                    """,
                    (job_id, self.config.worker_id, self.config.lease_seconds),
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
                (job.id, self.config.worker_id, job.version, status, progress, Jsonb(result)),
            )

    def fail(self, job: Job, code: str, detail: str, retry_after: int | None) -> None:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                "select (private.fail_processing_job(%s, %s, %s, %s, %s, %s)).completed_at as completed_at",
                (job.id, self.config.worker_id, job.version, code, detail, retry_after),
            )
            failure = cursor.fetchone()
            terminal = retry_after is None or bool(failure and failure.get("completed_at"))
            if (
                job.job_type == "qualify_upload"
                and job.upload_id is not None
                and terminal
            ):
                cursor.execute(
                    """
                    update public.astro_uploads
                    set status='rejected', rejected=true, rejection_reason=%s, updated_at=now()
                    where id=%s
                    """,
                    (f"{code.lower()}:{detail}"[:500], job.upload_id),
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
            if job.job_type == "publish_mosaic" and terminal:
                cursor.execute(
                    """
                    update public.mosaic_generations
                    set status='failed', failed_tiles=greatest(expected_tiles-published_tiles,1),
                        verification=coalesce(verification,'{}'::jsonb) ||
                          jsonb_build_object('failure_code',%s,'failed_at',now()),
                        updated_at=now()
                    where source_job_id=%s and status<>'complete'
                    """,
                    (code[:100], job.id),
                )
                run_id = job.payload.get("run_id")
                if run_id:
                    cursor.execute(
                        """
                        update public.archive_ingest_runs
                        set status='failed',error_detail=%s,completed_at=now(),updated_at=now()
                        where id=%s
                        """,
                        (detail[:2000], run_id),
                    )

    def fetch_upload(self, upload_id: UUID) -> dict[str, Any]:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                select id, user_id, object_id, frame_type, storage_path, original_filename,
                       file_size_bytes, metadata, exposure_s, filter_name, content_sha256,
                       pixel_size_um, focal_length_mm, sensor_width_px, sensor_height_px,
                       licence_code, pipeline_version, source_kind, provenance, archive_item_id
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
        target = directory / Path(row["original_filename"]).name
        expected_checksum = row.get("content_sha256")
        if expected_checksum:
            cached = self._raw_cache_path(expected_checksum)
            if cached.is_file() and cached.stat().st_size == row["file_size_bytes"]:
                if self._path_sha256(cached) == expected_checksum:
                    shutil.copyfile(cached, target)
                    return SourceArtifact(
                        upload_id=upload_id,
                        local_path=target,
                        storage_path=row["storage_path"],
                        frame_type=row["frame_type"],
                        metadata=row["metadata"] or {},
                    )
        signed = self.storage.storage.from_("astro-raw").create_signed_url(
            row["storage_path"], self.config.signed_url_seconds
        )
        signed_url = signed.get("signedURL") or signed.get("signedUrl")
        if not signed_url:
            raise RuntimeError("storage did not return a signed URL")
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
        actual_checksum = self._path_sha256(target)
        if expected_checksum and actual_checksum != expected_checksum:
            raise ValueError("source checksum differs from registered upload")
        self._store_raw_cache(expected_checksum or actual_checksum, target)
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

    def upload_derivative_file(self, path: str, local_path: Path, content_type: str) -> None:
        if local_path.stat().st_size > _RESUMABLE_UPLOAD_THRESHOLD_BYTES:
            resumable_client = tus_client.TusClient(
                self._resumable_storage_endpoint(),
                headers={
                    "Authorization": f"Bearer {self.config.supabase_secret_key}",
                    "apikey": self.config.supabase_secret_key,
                },
            )
            with local_path.open("rb") as file_stream:
                uploader = resumable_client.uploader(
                    file_stream=file_stream,
                    chunk_size=_RESUMABLE_UPLOAD_CHUNK_BYTES,
                    metadata={
                        "bucketName": "astro-derived",
                        "objectName": path,
                        "contentType": content_type,
                        "cacheControl": "31536000",
                    },
                    retries=5,
                    retry_delay=2,
                )
                uploader.upload()
            return

        response = self.storage.storage.from_("astro-derived").upload(
            path,
            local_path,
            {"content-type": content_type, "cache-control": "31536000", "upsert": "false"},
        )
        if not response:
            raise RuntimeError("derivative upload failed")

    def _resumable_storage_endpoint(self) -> str:
        parsed = urlparse(self.config.supabase_url.rstrip("/"))
        hostname = parsed.hostname or ""
        if parsed.scheme == "https" and hostname.endswith(".supabase.co"):
            project_ref = hostname.removesuffix(".supabase.co")
            if project_ref and "." not in project_ref:
                return (
                    f"https://{project_ref}.storage.supabase.co"
                    "/storage/v1/upload/resumable"
                )
        return f"{self.config.supabase_url.rstrip('/')}/storage/v1/upload/resumable"

    def public_derivative_url(self, path: str) -> str:
        public_url = self.storage.storage.from_("astro-derived").get_public_url(path)
        if not isinstance(public_url, str) or not public_url.startswith("https://"):
            raise RuntimeError("storage did not return a public derivative URL")
        return public_url

    def ensure_raw(self, path: str, local_path: Path, content_type: str = "application/fits") -> str:
        checksum = self._path_sha256(local_path)
        try:
            response = self.storage.storage.from_("astro-raw").upload(
                path,
                local_path,
                {"content-type": content_type, "cache-control": "31536000", "upsert": "false"},
            )
            if not response:
                raise RuntimeError("raw archive upload failed")
        except Exception:
            existing = self.storage.storage.from_("astro-raw").download(path)
            if hashlib.sha256(existing).hexdigest() != checksum:
                raise RuntimeError("immutable raw archive checksum conflict")
        self._store_raw_cache(checksum, local_path)
        return checksum

    @staticmethod
    def _path_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        return digest.hexdigest()

    def _raw_cache_path(self, checksum: str) -> Path:
        if len(checksum) != 64 or any(character not in "0123456789abcdef" for character in checksum):
            raise ValueError("invalid SHA-256 cache key")
        return self.config.raw_cache_directory / checksum[:2] / checksum

    def _store_raw_cache(self, checksum: str, source: Path) -> None:
        target = self._raw_cache_path(checksum)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_file() and target.stat().st_size == source.stat().st_size:
            if self._path_sha256(target) == checksum:
                return
        temporary = target.with_name(f"{target.name}.{uuid4().hex}.tmp")
        try:
            shutil.copyfile(source, temporary)
            if self._path_sha256(temporary) != checksum:
                raise RuntimeError("raw cache checksum mismatch")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)

    def ensure_derivative(self, path: str, data: bytes, content_type: str) -> str:
        checksum = hashlib.sha256(data).hexdigest()
        try:
            self.upload_derivative(path, data, content_type)
        except Exception:
            existing = self.storage.storage.from_("astro-derived").download(path)
            if hashlib.sha256(existing).hexdigest() != checksum:
                raise RuntimeError("immutable derivative checksum conflict")
        return checksum

    def ensure_derivative_file(self, path: str, local_path: Path, content_type: str) -> str:
        byte_size = local_path.stat().st_size
        if byte_size <= 0:
            raise ValueError("derivative file is empty")
        if byte_size > self.config.max_derivative_bytes:
            raise ValueError(
                f"derivative exceeds configured storage limit ({byte_size} > "
                f"{self.config.max_derivative_bytes} bytes)"
            )
        checksum = self._path_sha256(local_path)
        try:
            self.upload_derivative_file(path, local_path, content_type)
        except Exception as upload_error:
            try:
                if byte_size <= _RESUMABLE_UPLOAD_THRESHOLD_BYTES:
                    existing = self.storage.storage.from_("astro-derived").download(path)
                    digest = hashlib.sha256(existing)
                else:
                    public_url = self.public_derivative_url(path)
                    request = Request(public_url, headers={"User-Agent": "sky-science-worker/1"})
                    digest = hashlib.sha256()
                    with urlopen(request, timeout=60) as response:
                        while chunk := response.read(1024 * 1024):
                            digest.update(chunk)
            except Exception:
                raise upload_error
            if digest.hexdigest() != checksum:
                raise RuntimeError("immutable derivative checksum conflict")
        return checksum
