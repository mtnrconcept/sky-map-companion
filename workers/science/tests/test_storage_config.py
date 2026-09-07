from __future__ import annotations

import os

import pytest

from sky_worker.config import Config


BASE_ENV = {
    "DATABASE_URL": "postgresql://postgres.project:secret@pooler.example:5432/postgres?sslmode=require",
    "SUPABASE_URL": "https://project.supabase.co",
    "SUPABASE_SECRET_KEY": "sb_secret_test_server_key",
    "WORKER_ID": "test-worker-01",
}


def set_base_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(os.environ):
        if key.startswith("R2_") or key == "STORAGE_PRIMARY":
            monkeypatch.delenv(key, raising=False)
    for key, value in BASE_ENV.items():
        monkeypatch.setenv(key, value)


def test_legacy_environment_keeps_supabase_as_default(monkeypatch: pytest.MonkeyPatch) -> None:
    set_base_environment(monkeypatch)

    config = Config.from_environment()

    assert config.storage_primary == "supabase"
    assert config.r2_endpoint is None
    assert config.r2_access_key_id is None
    assert config.r2_secret_access_key is None
    assert config.r2_raw_bucket is None
    assert config.r2_derived_bucket is None
    assert config.r2_hips_bucket is None


def test_invalid_primary_backend_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    set_base_environment(monkeypatch)
    monkeypatch.setenv("STORAGE_PRIMARY", "filesystem")

    with pytest.raises(RuntimeError, match="STORAGE_PRIMARY must be supabase or r2"):
        Config.from_environment()


def test_r2_primary_requires_credentials_and_bucket_names(monkeypatch: pytest.MonkeyPatch) -> None:
    set_base_environment(monkeypatch)
    monkeypatch.setenv("STORAGE_PRIMARY", "r2")
    monkeypatch.setenv("R2_ENDPOINT", "https://account.r2.cloudflarestorage.com")

    with pytest.raises(RuntimeError) as error:
        Config.from_environment()

    message = str(error.value)
    assert "R2_ACCESS_KEY_ID" in message
    assert "R2_SECRET_ACCESS_KEY" in message
    assert "R2_RAW_BUCKET" in message
    assert "R2_DERIVED_BUCKET" in message
    assert "R2_HIPS_BUCKET" in message


def test_complete_r2_environment_is_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    set_base_environment(monkeypatch)
    values = {
        "STORAGE_PRIMARY": "R2",
        "R2_ENDPOINT": "https://account.r2.cloudflarestorage.com/",
        "R2_REGION": "auto",
        "R2_ACCESS_KEY_ID": "access-id",
        "R2_SECRET_ACCESS_KEY": "secret-key",
        "R2_RAW_BUCKET": "sky-raw",
        "R2_DERIVED_BUCKET": "sky-derived",
        "R2_HIPS_BUCKET": "sky-hips",
        "R2_PUBLIC_BASE_URL": "https://objects.example.test/",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)

    config = Config.from_environment()

    assert config.storage_primary == "r2"
    assert config.r2_endpoint == "https://account.r2.cloudflarestorage.com"
    assert config.r2_region == "auto"
    assert config.r2_access_key_id == "access-id"
    assert config.r2_secret_access_key == "secret-key"
    assert config.r2_raw_bucket == "sky-raw"
    assert config.r2_derived_bucket == "sky-derived"
    assert config.r2_hips_bucket == "sky-hips"
    assert config.r2_public_base_url == "https://objects.example.test"
