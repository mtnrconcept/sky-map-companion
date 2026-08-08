from __future__ import annotations

from dataclasses import dataclass
import os
import socket


@dataclass(frozen=True)
class Config:
    database_url: str
    supabase_url: str
    supabase_secret_key: str
    worker_id: str
    pipeline_version: str = "science-v1"
    lease_seconds: int = 300
    poll_seconds: float = 2.0
    signed_url_seconds: int = 300
    max_download_bytes: int = 5 * 1024 * 1024 * 1024
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
            pipeline_version=os.environ.get("PIPELINE_VERSION", "science-v1"),
            lease_seconds=int(os.environ.get("LEASE_SECONDS", "300")),
            poll_seconds=float(os.environ.get("POLL_SECONDS", "2")),
        )
