from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class Job:
    id: UUID
    job_type: str
    status: str
    version: int
    attempts: int
    pipeline_version: str
    upload_id: UUID | None = None
    object_id: str | None = None
    cosmos_observation_id: UUID | None = None
    cosmos_event_id: UUID | None = None
    owner_user_id: UUID | None = None
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SourceArtifact:
    upload_id: UUID
    local_path: Path
    storage_path: str
    frame_type: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class StageOutcome:
    next_status: str
    progress: int
    result: dict[str, Any] = field(default_factory=dict)
