from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import socket


@dataclass(frozen=True)
class Config:
    database_url: str
    supabase_url: str
    supabase_secret_key: str
    worker_id: str
    raw_cache_directory: Path = Path("/tmp/sky-science-cache/raw")
    pipeline_version: str = "science-v1"
    lease_seconds: int = 300
    poll_seconds: float = 2.0
    signed_url_seconds: int = 300
    max_download_bytes: int = 5 * 1024 * 1024 * 1024
    max_derivative_bytes: int = 500 * 1024 * 1024
    max_master_pixels: int = 40_000_000
    max_scale_degradation: float = 2.5
    astrometry_timeout_seconds: int = 180
    storage_primary: str = "supabase"
    r2_endpoint: str | None = None
    r2_region: str = "auto"
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_raw_bucket: str | None = None
    r2_derived_bucket: str | None = None
    r2_hips_bucket: str | None = None
    r2_public_base_url: str | None = None

    @classmethod
    def from_environment(cls) -> "Config":
        required = {
            "database_url": os.environ.get("DATABASE_URL"),
            "supabase_url": os.environ.get("SUPABASE_URL"),
            "supabase_secret_key": os.environ.get("SUPABASE_SECRET_KEY"),
        }
        missing = [name.upper() for name, value in required.items() if not value]
        if missing:
            raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")

        storage_primary = os.environ.get("STORAGE_PRIMARY", "supabase").strip().lower()
        if storage_primary not in {"supabase", "r2"}:
            raise RuntimeError("STORAGE_PRIMARY must be supabase or r2")

        r2_endpoint = (os.environ.get("R2_ENDPOINT") or "").strip().rstrip("/") or None
        r2_region = (os.environ.get("R2_REGION") or "auto").strip() or "auto"
        r2_access_key_id = (os.environ.get("R2_ACCESS_KEY_ID") or "").strip() or None
        r2_secret_access_key = (os.environ.get("R2_SECRET_ACCESS_KEY") or "").strip() or None
        r2_raw_bucket = (os.environ.get("R2_RAW_BUCKET") or "").strip() or None
        r2_derived_bucket = (os.environ.get("R2_DERIVED_BUCKET") or "").strip() or None
        r2_hips_bucket = (os.environ.get("R2_HIPS_BUCKET") or "").strip() or None
        r2_public_base_url = (
            (os.environ.get("R2_PUBLIC_BASE_URL") or "").strip().rstrip("/") or None
        )

        if storage_primary == "r2":
            r2_required = {
                "R2_ENDPOINT": r2_endpoint,
                "R2_ACCESS_KEY_ID": r2_access_key_id,
                "R2_SECRET_ACCESS_KEY": r2_secret_access_key,
                "R2_RAW_BUCKET": r2_raw_bucket,
                "R2_DERIVED_BUCKET": r2_derived_bucket,
                "R2_HIPS_BUCKET": r2_hips_bucket,
            }
            missing_r2 = [name for name, value in r2_required.items() if not value]
            if missing_r2:
                raise RuntimeError(
                    "Missing required R2 environment variables: " + ", ".join(missing_r2)
                )

        return cls(
            database_url=str(required["database_url"]),
            supabase_url=str(required["supabase_url"]).rstrip("/"),
            supabase_secret_key=str(required["supabase_secret_key"]),
            worker_id=os.environ.get("WORKER_ID", f"{socket.gethostname()}-{os.getpid()}"),
            raw_cache_directory=Path(
                os.environ.get("XDG_CACHE_HOME", "/tmp/sky-science-cache")
            ).resolve()
            / "raw",
            pipeline_version=os.environ.get("PIPELINE_VERSION", "science-v1"),
            lease_seconds=int(os.environ.get("LEASE_SECONDS", "300")),
            poll_seconds=float(os.environ.get("POLL_SECONDS", "2")),
            max_derivative_bytes=int(
                os.environ.get("MAX_DERIVATIVE_BYTES", str(500 * 1024 * 1024))
            ),
            max_master_pixels=int(os.environ.get("MAX_MASTER_PIXELS", "40000000")),
            max_scale_degradation=float(os.environ.get("MAX_SCALE_DEGRADATION", "2.5")),
            storage_primary=storage_primary,
            r2_endpoint=r2_endpoint,
            r2_region=r2_region,
            r2_access_key_id=r2_access_key_id,
            r2_secret_access_key=r2_secret_access_key,
            r2_raw_bucket=r2_raw_bucket,
            r2_derived_bucket=r2_derived_bucket,
            r2_hips_bucket=r2_hips_bucket,
            r2_public_base_url=r2_public_base_url,
        )
