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
        return cls(
            database_url=str(required["database_url"]),
            supabase_url=str(required["supabase_url"]),
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
        )
