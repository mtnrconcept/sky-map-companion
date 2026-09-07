from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import hashlib
import shutil
import tempfile
from typing import Any, Iterator
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from supabase import Client, create_client

from .config import Config
from .models import Job, SourceArtifact
from .object_storage import ObjectAlreadyExists, ObjectStorageBackend
from .s3_storage import S3StorageBackend
from .supabase_storage import SupabaseStorageBackend


class Gateway:
    def __init__(
        self,
        config: Config,
        primary_storage: ObjectStorageBackend | None = None,
        legacy_storage: ObjectStorageBackend | None = None,
    ) -> None:
        self.config = config

        # Kept during the migration because a few legacy HiPS/public-sky helpers
        # still use the raw Supabase client directly. New Gateway blob access is
        # routed exclusively through ObjectStorageBackend implementations.
        self.storage: Client = create_client(config.supabase_url, config.supabase_secret_key)
        self.legacy_storage: ObjectStorageBackend = legacy_storage or SupabaseStorageBackend(
            self.storage,
            config.signed_url_seconds,
            supabase_url=config.supabase_url,
            supabase_key=config.supabase_secret_key,
        )

        configured_r2 = self._build_r2_storage()
        if primary_storage is not None:
            self.primary_storage = primary_storage
            self.r2_storage: ObjectStorageBackend | None = (
                primary_storage if config.storage_primary == "r2" else configured_r2
            )
        elif config.storage_primary == "r2":
            if configured_r2 is None:
                raise RuntimeError("R2 primary storage is configured without complete R2 credentials")
            self.primary_storage = configured_r2
            self.r2_storage = configured_r2
        else:
            self.primary_storage = self.legacy_storage
            self.r2_storage = configured_r2

        if config.storage_primary == "r2":
            if not config.r2_raw_bucket or not config.r2_derived_bucket or not config.r2_hips_bucket:
                raise RuntimeError("R2 primary storage requires raw, derived and HiPS bucket names")
            self.primary_raw_bucket = config.r2_raw_bucket
            self.primary_derived_bucket = config.r2_derived_bucket
            self.primary_hips_bucket = config.r2_hips_bucket
        else:
            self.primary_raw_bucket = "astro-raw"
            self.primary_derived_bucket = "astro-derived"
            self.primary_hips_bucket = "astro-derived"

    def _build_r2_storage(self) -> ObjectStorageBackend | None:
        values = (
            self.config.r2_endpoint,
            self.config.r2_access_key_id,
            self.config.r2_secret_access_key,
        )
        if not all(values):
            return None
        return S3StorageBackend(
            endpoint_url=str(self.config.r2_endpoint),
            region_name=self.config.r2_region,
            access_key_id=str(self.config.r2_access_key_id),
            secret_access_key=str(self.config.r2_secret_access_key),
            public_base_url=self.config.r2_public_base_url,
        )

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection[dict[str, Any]]]:
        with psycopg.connect(
            self.config.database_url,
            row_factory=dict_row,
            options="-c extra_float_digits=3",
        ) as connection:
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

    def reset_staged_archive_master_retry(self, job: Job) -> int:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                "select private.reset_archive_master_retry_stage(%s::uuid, %s::text, %s::integer) as reset_count",
                (job.id, self.config.worker_id, job.version),
            )
            row = cursor.fetchone()
        return int(row["reset_count"] if row and row.get("reset_count") is not None else 0)

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
            if job.job_type == "qualify_upload" and job.upload_id is not None and terminal:
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
                          jsonb_build_object('failure_code',%s::text,'failed_at',now()),
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
                       licence_code, pipeline_version, source_kind, provenance, archive_item_id,
                       storage_backend, storage_bucket, storage_key, legacy_storage_path,
                       storage_verified_at
                from public.astro_uploads where id = %s and deleted_at is null
                """,
                (upload_id,),
            )
            row = cursor.fetchone()
        if not row:
            raise LookupError("upload not found")
        return row

    def _download_upload_blob(
        self,
        row: dict[str, Any],
        target: Path,
    ) -> tuple[str, str, str]:
        storage_backend = str(row.get("storage_backend") or "supabase")
        storage_key = str(row.get("storage_key") or row["storage_path"])

        candidates: list[tuple[str, ObjectStorageBackend, str, str]] = []
        if storage_backend == "r2":
            r2_bucket = str(row.get("storage_bucket") or self.config.r2_raw_bucket or "")
            if self.r2_storage is not None and r2_bucket:
                candidates.append(("r2", self.r2_storage, r2_bucket, storage_key))
            legacy_path = row.get("legacy_storage_path")
            if isinstance(legacy_path, str) and legacy_path:
                candidates.append(("supabase", self.legacy_storage, "astro-raw", legacy_path))
        else:
            if self.config.storage_primary == "r2" and self.primary_storage is not self.legacy_storage:
                candidates.append(
                    ("r2", self.primary_storage, self.primary_raw_bucket, storage_key)
                )
            candidates.append(
                (
                    "supabase",
                    self.legacy_storage,
                    "astro-raw",
                    str(row["storage_path"]),
                )
            )

        if not candidates:
            raise RuntimeError("upload has no readable storage location")

        missing: FileNotFoundError | None = None
        for backend_name, backend, bucket, key in candidates:
            try:
                backend.download_file(
                    bucket,
                    key,
                    target,
                    max_bytes=self.config.max_download_bytes,
                )
                return backend_name, bucket, key
            except FileNotFoundError as error:
                missing = error
                continue
        if missing is not None:
            raise missing
        raise RuntimeError("upload has no readable storage location")

    def download_upload(self, upload_id: UUID, directory: Path) -> SourceArtifact:
        row = self.fetch_upload(upload_id)
        target = directory / Path(row["original_filename"]).name
        expected_checksum = row.get("content_sha256")
        logical_backend = str(row.get("storage_backend") or "supabase")
        logical_bucket = str(
            row.get("storage_bucket")
            or (self.config.r2_raw_bucket if logical_backend == "r2" else "astro-raw")
            or "astro-raw"
        )
        logical_key = str(row.get("storage_key") or row["storage_path"])

        if expected_checksum:
            cached = self._raw_cache_path(expected_checksum)
            if cached.is_file() and cached.stat().st_size == row["file_size_bytes"]:
                if self._path_sha256(cached) == expected_checksum:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(cached, target)
                    return SourceArtifact(
                        upload_id=upload_id,
                        local_path=target,
                        storage_path=row["storage_path"],
                        frame_type=row["frame_type"],
                        metadata=row["metadata"] or {},
                        storage_backend=logical_backend,
                        storage_bucket=logical_bucket,
                        storage_key=logical_key,
                    )

        backend_name, bucket, key = self._download_upload_blob(row, target)
        total = target.stat().st_size
        if total != row["file_size_bytes"]:
            target.unlink(missing_ok=True)
            raise ValueError("source size differs from registered upload")
        actual_checksum = self._path_sha256(target)
        if expected_checksum and actual_checksum != expected_checksum:
            target.unlink(missing_ok=True)
            raise ValueError("source checksum differs from registered upload")
        self._store_raw_cache(expected_checksum or actual_checksum, target)
        return SourceArtifact(
            upload_id=upload_id,
            local_path=target,
            storage_path=row["storage_path"],
            frame_type=row["frame_type"],
            metadata=row["metadata"] or {},
            storage_backend=backend_name,
            storage_bucket=bucket,
            storage_key=key,
        )

    def execute(self, query: str, parameters: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.connection() as connection, connection.cursor() as cursor:
            cursor.execute(query, parameters)
            return cursor.fetchall() if cursor.description else []

    def upload_derivative(self, path: str, data: bytes, content_type: str) -> None:
        self.primary_storage.upload_bytes(
            self.primary_derived_bucket,
            path,
            data,
            content_type,
        )

    def upload_derivative_file(self, path: str, local_path: Path, content_type: str) -> None:
        self.primary_storage.upload_file(
            self.primary_derived_bucket,
            path,
            local_path,
            content_type,
        )

    def upload_raw_file(self, path: str, local_path: Path, content_type: str) -> None:
        self.primary_storage.upload_file(
            self.primary_raw_bucket,
            path,
            local_path,
            content_type,
        )

    def public_derivative_url(self, path: str) -> str:
        return self.primary_storage.public_url(self.primary_derived_bucket, path)

    @staticmethod
    def _path_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        return digest.hexdigest()

    def _existing_object_checksum(
        self,
        backend: ObjectStorageBackend,
        bucket: str,
        key: str,
        *,
        max_bytes: int,
    ) -> str:
        with tempfile.TemporaryDirectory(prefix="sky-existing-object-") as temp:
            local_path = Path(temp) / "existing.bin"
            backend.download_file(bucket, key, local_path, max_bytes=max_bytes)
            return self._path_sha256(local_path)

    def ensure_raw(
        self,
        path: str,
        local_path: Path,
        content_type: str = "application/fits",
    ) -> str:
        checksum = self._path_sha256(local_path)
        try:
            self.upload_raw_file(path, local_path, content_type)
        except ObjectAlreadyExists:
            existing_checksum = self._existing_object_checksum(
                self.primary_storage,
                self.primary_raw_bucket,
                path,
                max_bytes=self.config.max_download_bytes,
            )
            if existing_checksum != checksum:
                raise RuntimeError("immutable raw archive checksum conflict")
        self._store_raw_cache(checksum, local_path)
        return checksum

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
        except ObjectAlreadyExists:
            existing_checksum = self._existing_object_checksum(
                self.primary_storage,
                self.primary_derived_bucket,
                path,
                max_bytes=self.config.max_derivative_bytes,
            )
            if existing_checksum != checksum:
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
        except ObjectAlreadyExists:
            existing_checksum = self._existing_object_checksum(
                self.primary_storage,
                self.primary_derived_bucket,
                path,
                max_bytes=self.config.max_derivative_bytes,
            )
            if existing_checksum != checksum:
                raise RuntimeError("immutable derivative checksum conflict")
        return checksum
