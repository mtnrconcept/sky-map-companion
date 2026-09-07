# R2 Storage Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce an S3-compatible storage abstraction so the science worker can read/write Cloudflare R2 while preserving Supabase Storage fallback and existing scientific/job semantics.

**Architecture:** Keep Supabase as the authoritative database/job system. Refactor `Gateway` so object access goes through a narrow storage interface with `SupabaseStorageBackend` and `S3StorageBackend`; choose backends from environment, read R2 first when enabled, and fall back to Supabase until historical migration is complete.

**Tech Stack:** Python 3.12, boto3/botocore, Supabase Python client, psycopg, pytest, PostgreSQL/Supabase migrations.

**Spec:** `docs/superpowers/specs/2026-09-07-cloudflare-r2-science-worker-design.md`

## Global Constraints

- Supabase remains authoritative for Postgres, Auth, RLS, `processing_jobs`, provenance and scientific decisions.
- Scientific admission rules must not change.
- Existing `storage_path` remains readable during migration.
- R2 writes are immutable; overwrite of scientific artifacts is forbidden.
- Migrated objects are equivalent only when byte size and SHA-256 match.
- Windows worker must continue to function during rollout.
- No deletion from Supabase Storage in this plan.

---

### Task 1: Add storage-location metadata without breaking legacy rows

**Files:**
- Create: `supabase/migrations/20260907040000_object_storage_backends.sql`
- Test: migration validation through existing Supabase migration checks / SQL review

**Interfaces:**
- Produces columns on `public.astro_uploads`: `storage_backend`, `storage_bucket`, `storage_key`, `legacy_storage_path`, `storage_migrated_at`, `storage_verified_at`.
- Existing `storage_path` stays populated and valid.

- [ ] **Step 1: Write the migration with backward-compatible defaults**

```sql
alter table public.astro_uploads
  add column if not exists storage_backend text not null default 'supabase',
  add column if not exists storage_bucket text,
  add column if not exists storage_key text,
  add column if not exists legacy_storage_path text,
  add column if not exists storage_migrated_at timestamptz,
  add column if not exists storage_verified_at timestamptz;

alter table public.astro_uploads
  add constraint astro_uploads_storage_backend_check
  check (storage_backend in ('supabase','r2')) not valid;

update public.astro_uploads
set storage_bucket = coalesce(storage_bucket, 'astro-raw'),
    storage_key = coalesce(storage_key, storage_path)
where storage_key is null or storage_bucket is null;

alter table public.astro_uploads validate constraint astro_uploads_storage_backend_check;

create index if not exists astro_uploads_storage_backend_idx
  on public.astro_uploads(storage_backend, storage_verified_at)
  where deleted_at is null;
```

- [ ] **Step 2: Verify the migration is non-destructive**

Run a schema diff / migration review and confirm no existing column is dropped or renamed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260907040000_object_storage_backends.sql
git commit -m "feat: add object storage backend metadata"
```

### Task 2: Define a narrow object-storage interface

**Files:**
- Create: `workers/science/src/sky_worker/object_storage.py`
- Create: `workers/science/tests/test_object_storage_contract.py`

**Interfaces:**
- Produces `ObjectMetadata`, `ObjectStorageBackend`, `ObjectAlreadyExists`.
- Required methods: `download_file`, `upload_file`, `upload_bytes`, `head`, `delete_many`, `public_url`.

- [ ] **Step 1: Write failing contract tests**

```python
from pathlib import Path
from sky_worker.object_storage import ObjectAlreadyExists


def assert_backend_contract(backend, tmp_path: Path):
    source = tmp_path / "source.bin"
    source.write_bytes(b"abc123")
    backend.upload_file("bucket", "a/b.bin", source, "application/octet-stream")
    meta = backend.head("bucket", "a/b.bin")
    assert meta.byte_size == 6
    target = tmp_path / "download.bin"
    backend.download_file("bucket", "a/b.bin", target, max_bytes=100)
    assert target.read_bytes() == b"abc123"
    try:
        backend.upload_file("bucket", "a/b.bin", source, "application/octet-stream")
    except ObjectAlreadyExists:
        pass
    else:
        raise AssertionError("immutable overwrite must fail")
```

- [ ] **Step 2: Run the test and verify it fails because the module does not exist**

```bash
python -m pytest workers/science/tests/test_object_storage_contract.py -q
```

- [ ] **Step 3: Implement the protocol and value types**

```python
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

@dataclass(frozen=True)
class ObjectMetadata:
    byte_size: int
    etag: str | None = None
    content_type: str | None = None

class ObjectAlreadyExists(RuntimeError):
    pass

class ObjectStorageBackend(Protocol):
    def download_file(self, bucket: str, key: str, target: Path, *, max_bytes: int) -> ObjectMetadata: ...
    def upload_file(self, bucket: str, key: str, source: Path, content_type: str) -> ObjectMetadata: ...
    def upload_bytes(self, bucket: str, key: str, data: bytes, content_type: str) -> ObjectMetadata: ...
    def head(self, bucket: str, key: str) -> ObjectMetadata | None: ...
    def delete_many(self, bucket: str, keys: list[str]) -> None: ...
    def public_url(self, bucket: str, key: str) -> str: ...
```

- [ ] **Step 4: Re-run the contract test**

```bash
python -m pytest workers/science/tests/test_object_storage_contract.py -q
```

- [ ] **Step 5: Commit**

```bash
git add workers/science/src/sky_worker/object_storage.py workers/science/tests/test_object_storage_contract.py
git commit -m "feat: define science object storage contract"
```

### Task 3: Implement Supabase and S3-compatible backends

**Files:**
- Modify: `workers/science/pyproject.toml`
- Create: `workers/science/src/sky_worker/supabase_storage.py`
- Create: `workers/science/src/sky_worker/s3_storage.py`
- Create: `workers/science/tests/test_supabase_storage_backend.py`
- Create: `workers/science/tests/test_s3_storage_backend.py`

**Interfaces:**
- `SupabaseStorageBackend(client, signed_url_seconds)` implements `ObjectStorageBackend`.
- `S3StorageBackend(endpoint_url, region_name, access_key_id, secret_access_key, public_base_url=None)` implements the same interface.

- [ ] **Step 1: Add the pinned S3 dependency**

```toml
"boto3==1.40.6",
```

- [ ] **Step 2: Write tests for immutable S3 writes and bounded downloads**

Use botocore `Stubber` to assert `head_object`, `put_object`/multipart behavior, `get_object`, and that a pre-existing key raises `ObjectAlreadyExists`.

- [ ] **Step 3: Implement `SupabaseStorageBackend` by moving current Storage-specific logic out of `Gateway`**

Preserve direct-storage TUS behavior for files above 6 MiB and existing signed URL behavior.

- [ ] **Step 4: Implement `S3StorageBackend`**

Use path-style key semantics, `head_object` before writes, multipart uploads through `upload_file`, and stream downloads in 1 MiB chunks while enforcing `max_bytes`.

- [ ] **Step 5: Run backend tests**

```bash
python -m pytest workers/science/tests/test_supabase_storage_backend.py workers/science/tests/test_s3_storage_backend.py -q
```

- [ ] **Step 6: Commit**

```bash
git add workers/science/pyproject.toml workers/science/src/sky_worker/supabase_storage.py workers/science/src/sky_worker/s3_storage.py workers/science/tests/test_supabase_storage_backend.py workers/science/tests/test_s3_storage_backend.py
git commit -m "feat: add Supabase and S3 storage backends"
```

### Task 4: Configure primary/fallback storage without changing current defaults

**Files:**
- Modify: `workers/science/src/sky_worker/config.py`
- Modify: `workers/science/.env.worker.example`
- Create: `workers/science/tests/test_storage_config.py`

**Interfaces:**
- New config fields: `storage_primary`, `r2_endpoint`, `r2_region`, `r2_access_key_id`, `r2_secret_access_key`, `r2_raw_bucket`, `r2_derived_bucket`, `r2_hips_bucket`, `r2_public_base_url`.
- Default `storage_primary='supabase'` keeps current production behavior.

- [ ] **Step 1: Write failing environment parsing tests**

Cover: legacy environment requires no R2 secrets; `STORAGE_PRIMARY=r2` requires endpoint/access key/secret/bucket names.

- [ ] **Step 2: Implement config parsing and validation**

```python
storage_primary = os.environ.get("STORAGE_PRIMARY", "supabase").strip().lower()
if storage_primary not in {"supabase", "r2"}:
    raise RuntimeError("STORAGE_PRIMARY must be supabase or r2")
```

- [ ] **Step 3: Document environment variables in `.env.worker.example`**

Do not place real credentials in the file.

- [ ] **Step 4: Run tests**

```bash
python -m pytest workers/science/tests/test_storage_config.py -q
```

- [ ] **Step 5: Commit**

```bash
git add workers/science/src/sky_worker/config.py workers/science/.env.worker.example workers/science/tests/test_storage_config.py
git commit -m "feat: configure R2 storage backend"
```

### Task 5: Refactor Gateway to use dual-read storage

**Files:**
- Modify: `workers/science/src/sky_worker/gateway.py`
- Modify: `workers/science/src/sky_worker/main.py`
- Modify: `workers/science/src/sky_worker/models.py`
- Modify: `workers/science/tests/test_gateway.py`
- Modify: `workers/science/tests/test_gateway_raw_upload.py`
- Create: `workers/science/tests/test_gateway_storage_fallback.py`

**Interfaces:**
- `Gateway(config, primary_storage=None, legacy_storage=None)`.
- Reads: R2 first for rows with `storage_backend='r2'`; for legacy/migration rows, try configured primary then Supabase fallback.
- Writes: go only to configured primary backend.

- [ ] **Step 1: Write failing fallback tests**

Test cases:
1. R2 object exists → Supabase is not called.
2. R2 missing + `legacy_storage_path` exists → Supabase fallback succeeds.
3. downloaded byte size mismatches DB → fail.
4. checksum mismatch → fail.
5. R2 write collision with different checksum → fail immutable conflict.

- [ ] **Step 2: Extend upload query to select storage metadata**

Include `storage_backend, storage_bucket, storage_key, legacy_storage_path, storage_verified_at` in `fetch_upload`.

- [ ] **Step 3: Replace direct `self.storage.storage.from_...` usage with backend calls**

Keep database methods in `Gateway`; only blob logic moves behind storage backends.

- [ ] **Step 4: Preserve raw SHA-256 local cache semantics**

The cache key remains SHA-256 regardless of storage backend.

- [ ] **Step 5: Run Gateway regression suite**

```bash
python -m pytest workers/science/tests/test_gateway.py workers/science/tests/test_gateway_raw_upload.py workers/science/tests/test_gateway_storage_fallback.py -q
```

- [ ] **Step 6: Run full science suite and image build**

```bash
python -m pytest workers/science/tests
docker build --tag sky-science-worker:r2-foundation workers/science
```

- [ ] **Step 7: Commit**

```bash
git add workers/science/src/sky_worker/gateway.py workers/science/src/sky_worker/main.py workers/science/src/sky_worker/models.py workers/science/tests
git commit -m "refactor: route science blobs through storage backends"
```

### Task 6: CI and runbook for foundation-only rollout

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `workers/science/README.md`
- Modify: `docs/runbooks/scientific-platform.md`

**Interfaces:**
- CI must validate Python tests and Docker image with Supabase-default config.
- Runbook must state that setting `STORAGE_PRIMARY=r2` is a separate cutover step and requires provisioned credentials.

- [ ] **Step 1: Add explicit backend-contract test invocation to CI**

Keep existing full `pytest` and Docker build; do not require production R2 credentials in PR CI.

- [ ] **Step 2: Document rollback**

Rollback command/config is `STORAGE_PRIMARY=supabase`; no DB rollback is required because legacy columns remain.

- [ ] **Step 3: Run all repository checks**

```bash
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
python -m pip install -e 'workers/science[test]'
python -m pytest workers/science/tests
docker build --tag sky-science-worker:ci workers/science
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml workers/science/README.md docs/runbooks/scientific-platform.md
git commit -m "docs: add R2 storage foundation rollout"
```

## Plan self-review

- Spec coverage: storage abstraction, S3 compatibility, Supabase fallback, immutable writes, checksums, backward-compatible metadata, Windows compatibility and rollback are covered.
- Explicitly excluded from this plan: browser direct-to-R2 upload, Queue/Container deployment, historical deletion/migration.
- No legacy storage column is removed.
