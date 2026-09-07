# R2 Migration, Retention and Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate existing Supabase Storage RAW/derived/HiPS objects to R2 safely, verify every migrated object, enforce retention from day one, and cut over Cloudflare as the primary storage/compute path without losing rollback capability.

**Architecture:** Use a resumable, auditable migration runner that reads legacy Supabase Storage, copies immutable objects to the S3-compatible backend, verifies byte size + SHA-256, and records per-object state in Supabase before any legacy deletion. Reuse the object-storage abstraction and make HiPS retention backend-agnostic; migrate active/current data first, then historical data, and only delete verified legacy copies after a safety window.

**Tech Stack:** Python 3.12, boto3/S3-compatible R2, Supabase Storage/Postgres, psycopg, pytest, GitHub Actions, Cloudflare R2/Workers, PostgreSQL migrations.

**Spec:** `docs/superpowers/specs/2026-09-07-cloudflare-r2-science-worker-design.md`

## Global Constraints

- No legacy object may be deleted before successful R2 copy, exact byte-size verification, SHA-256 verification and a configured grace period.
- Active + one rollback HiPS generation are protected at all times.
- Migration and deletion must be idempotent and auditable.
- External CDS/Aladin surveys are not copied.
- Existing `storage_path`/legacy provenance remains readable after cutover.
- Supabase stays authoritative for relational state and scientific provenance.
- Rollback must remain possible at every phase.
- Destructive runs default to dry-run and require an explicit apply flag.

---

### Task 1: Add an auditable object-migration ledger

**Files:**
- Create: `supabase/migrations/20260907044000_storage_migration_ledger.sql`

**Interfaces:**
- Produces `public.storage_migration_objects` keyed by `(source_backend, source_bucket, source_key, destination_backend, destination_bucket, destination_key)`.
- Tracks status: `pending`, `copying`, `verified`, `delete_eligible`, `deleted_legacy`, `failed`.
- Tracks byte size, source/destination SHA-256, attempts, error code/detail and timestamps.

- [ ] **Step 1: Create the ledger schema**

Representative shape:

```sql
create table if not exists public.storage_migration_objects (
  id uuid primary key default gen_random_uuid(),
  source_backend text not null check (source_backend in ('supabase','r2')),
  source_bucket text not null,
  source_key text not null,
  destination_backend text not null check (destination_backend in ('r2')),
  destination_bucket text not null,
  destination_key text not null,
  owner_table text,
  owner_id uuid,
  byte_size bigint,
  source_sha256 text,
  destination_sha256 text,
  status text not null default 'pending'
    check (status in ('pending','copying','verified','delete_eligible','deleted_legacy','failed')),
  attempts integer not null default 0,
  error_code text,
  error_detail text,
  verified_at timestamptz,
  delete_eligible_at timestamptz,
  deleted_legacy_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_backend, source_bucket, source_key, destination_backend, destination_bucket, destination_key)
);
```

- [ ] **Step 2: Protect the ledger with RLS/server-only policies**

Client roles must not insert/update migration state. Read access should be server/admin only unless an existing admin UI explicitly needs it.

- [ ] **Step 3: Add indexes for resumable batches**

Index `(status, created_at)` and `delete_eligible_at` for bounded workers.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260907044000_storage_migration_ledger.sql
git commit -m "feat: add storage migration ledger"
```

### Task 2: Build inventory and deterministic destination-key mapping

**Files:**
- Create: `workers/science/src/sky_worker/storage_inventory.py`
- Create: `workers/science/src/sky_worker/storage_migration.py`
- Create: `workers/science/tests/test_storage_inventory.py`
- Create: `workers/science/tests/test_storage_migration_mapping.py`

**Interfaces:**
- `InventoryObject(bucket, key, byte_size, updated_at)`.
- `destination_for_legacy(bucket, key, owner_metadata) -> StorageLocation`.
- CLI: `sky-storage-migrate inventory --source supabase --dry-run`.

- [ ] **Step 1: Write failing mapping tests**

Cover:
- `astro-raw/<user>/<uuid>/<file>` → R2 `sky-raw/raw/...` without key collisions.
- public archive raw → deterministic `archive/{provider}/{archive_item_id}/{sha256}.fits` when authoritative metadata exists.
- `astro-derived/hips-ivoa/...` → `sky-hips/hips/...` while preserving HiPS relative layout.
- unrelated derived artifacts → `sky-derived/legacy/...` with the original relative key preserved.

- [ ] **Step 2: Implement inventory readers through `ObjectStorageBackend`**

Add list/pagination capability to the backend contract only if needed; keep it bounded and streaming rather than loading millions of objects into memory.

- [ ] **Step 3: Implement deterministic mapping**

Do not rename objects based on display names alone. Prefer persisted IDs/SHA-256; preserve original key in ledger for provenance.

- [ ] **Step 4: Add inventory summary output**

Report object count/bytes by logical class (`raw`, `derived`, `hips`, `quarantine`) and never print credentials or signed URLs.

- [ ] **Step 5: Run tests**

```bash
python -m pytest workers/science/tests/test_storage_inventory.py workers/science/tests/test_storage_migration_mapping.py -q
```

- [ ] **Step 6: Commit**

```bash
git add workers/science/src/sky_worker/storage_inventory.py workers/science/src/sky_worker/storage_migration.py workers/science/tests/test_storage_inventory.py workers/science/tests/test_storage_migration_mapping.py workers/science/pyproject.toml
git commit -m "feat: inventory legacy science storage"
```

### Task 3: Implement copy + checksum verification as an idempotent batch

**Files:**
- Modify: `workers/science/src/sky_worker/storage_migration.py`
- Create: `workers/science/tests/test_storage_migration_copy.py`

**Interfaces:**
- CLI: `sky-storage-migrate copy --limit N --max-bytes N --dry-run|--apply`.
- A verified row contains matching source/destination SHA-256 and exact byte size.

- [ ] **Step 1: Write failing tests for copy semantics**

Test cases:
1. destination missing → copy and verify.
2. destination exists with matching size/hash → mark verified without rewriting.
3. destination exists with mismatching hash → fail immutable conflict.
4. source changes between inventory/copy → fail and retain source.
5. interrupted run → second run resumes from ledger.
6. `--dry-run` performs no writes.

- [ ] **Step 2: Implement bounded streaming checksum copy**

Use a local temporary file or bounded stream suitable for the existing storage backends. Compute SHA-256 while reading; after upload, re-read/verify destination SHA-256 unless a trustworthy checksum metadata field created by this application is present and tested.

- [ ] **Step 3: Record state transitions transactionally in Supabase**

`pending -> copying -> verified`; on failure record `failed`, increment attempts and retain both source/destination for inspection.

- [ ] **Step 4: Add strict batch budgets**

Require `--limit` and `--max-bytes`; stop before either budget would be exceeded. Defaults must be conservative.

- [ ] **Step 5: Run tests**

```bash
python -m pytest workers/science/tests/test_storage_migration_copy.py -q
```

- [ ] **Step 6: Commit**

```bash
git add workers/science/src/sky_worker/storage_migration.py workers/science/tests/test_storage_migration_copy.py
git commit -m "feat: copy and verify science blobs in R2"
```

### Task 4: Prioritize active production data before historical bulk migration

**Files:**
- Modify: `workers/science/src/sky_worker/storage_inventory.py`
- Modify: `workers/science/src/sky_worker/storage_migration.py`
- Create: `workers/science/tests/test_storage_migration_priority.py`

**Interfaces:**
- Migration priority classes: `active_hips`, `rollback_hips`, `active_master`, `approved_raw`, `other_derived`, `historical_raw`, `obsolete_hips`.

- [ ] **Step 1: Write priority tests**

Given mixed inventory, active HiPS/current pointers and current masters must appear before obsolete generations regardless of age/key ordering.

- [ ] **Step 2: Query current authoritative references from Supabase**

Use `mosaic_layers.current_generation_id`, HiPS current pointers/registries and current master records. Do not infer activity solely from newest object timestamp.

- [ ] **Step 3: Assign migration priority**

Obsolete HiPS generations that are already retention-eligible should be marked `skip_obsolete` rather than copied, unless explicitly requested for archival purposes.

- [ ] **Step 4: Run tests**

```bash
python -m pytest workers/science/tests/test_storage_migration_priority.py -q
```

- [ ] **Step 5: Commit**

```bash
git add workers/science/src/sky_worker/storage_inventory.py workers/science/src/sky_worker/storage_migration.py workers/science/tests/test_storage_migration_priority.py
git commit -m "feat: prioritize active storage migration"
```

### Task 5: Make HiPS retention backend-agnostic

**Files:**
- Modify: `workers/science/src/sky_worker/storage_retention.py`
- Modify: `workers/science/tests/test_storage_retention_profiles.py`
- Create: `workers/science/tests/test_storage_retention_backend.py`
- Modify: `.github/workflows/prune-ivoa-storage.yml`

**Interfaces:**
- Retention accepts an `ObjectStorageBackend` + bucket instead of assuming Supabase SDK bucket objects.
- Same policy remains: active generation + one rollback, grace window, immutable pointer re-check before deletion.

- [ ] **Step 1: Freeze current retention behavior with regression tests**

Assert active generation and latest complete rollback are retained; incomplete/current generation is never deleted; pointer change during apply aborts.

- [ ] **Step 2: Introduce a small retention adapter around the storage backend**

Do not duplicate the generation-selection algorithm for R2. Only replace storage list/read/delete primitives.

- [ ] **Step 3: Add R2 backend tests**

Run the same retention fixture against fake Supabase and fake S3 implementations and assert identical planned/deleted roots.

- [ ] **Step 4: Update workflow configuration**

Allow `STORAGE_PRIMARY`/R2 secrets for post-cutover runs while keeping Supabase mode available for rollback. Workflow default remains dry-run for manual dispatch.

- [ ] **Step 5: Run retention suite**

```bash
python -m pytest workers/science/tests/test_storage_retention_profiles.py workers/science/tests/test_storage_retention_backend.py -q
```

- [ ] **Step 6: Commit**

```bash
git add workers/science/src/sky_worker/storage_retention.py workers/science/tests/test_storage_retention_profiles.py workers/science/tests/test_storage_retention_backend.py .github/workflows/prune-ivoa-storage.yml
git commit -m "refactor: make HiPS retention storage agnostic"
```

### Task 6: Implement verified legacy deletion with a mandatory safety window

**Files:**
- Modify: `workers/science/src/sky_worker/storage_migration.py`
- Create: `workers/science/tests/test_storage_migration_delete.py`

**Interfaces:**
- CLI: `sky-storage-migrate delete-legacy --verified-before ISO8601 --limit N --dry-run|--apply`.
- Only rows in `verified`/`delete_eligible` with `verified_at <= cutoff` are candidates.

- [ ] **Step 1: Write deletion safety tests**

Reject deletion when:
- destination verification is absent;
- hashes differ;
- grace window has not elapsed;
- object is active current/rollback HiPS;
- owner row still declares Supabase as primary without verified R2 metadata;
- source object changed since verification.

- [ ] **Step 2: Implement pre-delete re-verification**

Immediately before deletion, compare source metadata/size and destination existence/hash again. Abort that object on any discrepancy.

- [ ] **Step 3: Delete via Supabase Storage API only**

Never delete rows from `storage.objects` with SQL. After API deletion succeeds, update ledger to `deleted_legacy` and preserve all audit metadata.

- [ ] **Step 4: Run tests**

```bash
python -m pytest workers/science/tests/test_storage_migration_delete.py -q
```

- [ ] **Step 5: Commit**

```bash
git add workers/science/src/sky_worker/storage_migration.py workers/science/tests/test_storage_migration_delete.py
git commit -m "feat: safely delete verified legacy blobs"
```

### Task 7: Add migration workflow with dry-run as the safe default

**Files:**
- Create: `.github/workflows/migrate-science-storage-to-r2.yml`
- Create: `docs/runbooks/r2-storage-migration.md`

**Interfaces:**
- Manual workflow operations: `inventory`, `copy`, `delete-legacy`.
- Inputs: `dry_run=true`, `max_objects`, `max_gib`, optional class filter.
- No scheduled destructive migration initially.

- [ ] **Step 1: Create workflow with explicit environment validation**

Require R2 endpoint, scoped access credentials, bucket names and Supabase server credentials. Fail before processing if any are absent.

- [ ] **Step 2: Add hard budget validation**

Example initial limits: max 1,000 objects and 20 GiB per copy run; deletion max 1,000 objects per manual run until the pilot is proven.

- [ ] **Step 3: Make dry-run the default**

`--apply` is added only when `inputs.dry_run == false`. Log planned object count/bytes before applying.

- [ ] **Step 4: Document rollout order**

Runbook sequence:
1. inventory;
2. copy active HiPS/master pilot;
3. verify ledger;
4. switch read priority R2-first;
5. copy approved RAW;
6. wait safety window;
7. dry-run deletion;
8. apply bounded deletion;
9. re-inventory Supabase and R2.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/migrate-science-storage-to-r2.yml docs/runbooks/r2-storage-migration.md
git commit -m "ops: add bounded R2 storage migration workflow"
```

### Task 8: Expose storage/queue migration health without leaking secrets

**Files:**
- Create: `workers/science/src/sky_worker/storage_metrics.py`
- Create: `workers/science/tests/test_storage_metrics.py`
- Modify: `cloudflare/science-orchestrator/src/index.ts`
- Modify: `cloudflare/science-orchestrator/src/recovery.ts`
- Create: `docs/runbooks/science-observability.md`

**Interfaces:**
- Metrics: migration pending/verified/deleted objects+bytes, oldest queued job age, available jobs by type, terminal infra failures, active leases, HiPS active/rollback sizes.
- `/health` may expose only coarse non-sensitive health; detailed metrics remain admin/server-side.

- [ ] **Step 1: Write metrics aggregation tests**

Given fixture rows, assert object/byte totals and oldest-job age are correct and no signed URL/key secret is emitted.

- [ ] **Step 2: Implement server-side metric queries**

Use aggregate SQL rather than listing all objects for dashboard totals.

- [ ] **Step 3: Add health thresholds to runbook**

Example actionable conditions: queue oldest age > 10 minutes, repeated Container infra failure, migration checksum mismatch > 0, R2 write failure rate > 1%, no active worker heartbeat while queue has work.

- [ ] **Step 4: Run tests**

```bash
python -m pytest workers/science/tests/test_storage_metrics.py -q
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add workers/science/src/sky_worker/storage_metrics.py workers/science/tests/test_storage_metrics.py cloudflare/science-orchestrator/src/index.ts cloudflare/science-orchestrator/src/recovery.ts docs/runbooks/science-observability.md
git commit -m "feat: add science storage migration health metrics"
```

### Task 9: Perform staged production cutover and prove rollback

**Files:**
- Modify: `docs/runbooks/cloudflare-science-worker.md`
- Modify: `docs/runbooks/r2-storage-migration.md`
- Modify: `workers/science/README.md`

**Interfaces:**
- Production configuration switches: `VITE_SCIENCE_EDGE_URL`, `STORAGE_PRIMARY=r2`, active Queue consumer/scheduled recovery.
- Rollback switches: remove/disable edge URL, pause Queue/cron, `STORAGE_PRIMARY=supabase`, restart Windows worker.

- [ ] **Step 1: Pilot with one real M31 upload while Windows worker is stopped**

Acceptance path:

```text
browser -> R2 -> Supabase upload/job -> Queue -> Cloudflare Container
-> Astrometry.net -> approved/rejected scientific result -> R2 derivative
```

Record job ID, upload ID, source/destination checksums and processing duration.

- [ ] **Step 2: Pilot active HiPS read from R2 without deleting Supabase**

Verify Aladin/public consumers load the current generation successfully and cache headers are immutable/appropriate.

- [ ] **Step 3: Run one bounded historical copy batch**

Start with active/current data and <= 20 GiB. Verify all ledger rows before proceeding.

- [ ] **Step 4: Prove rollback before any legacy deletion**

Disable edge path, set Supabase storage primary, restart Windows worker, and successfully process a small test contribution. Then restore R2 primary.

- [ ] **Step 5: Wait the configured safety window and run deletion dry-run**

Review every protected/current generation and aggregate bytes to be deleted.

- [ ] **Step 6: Apply the first bounded legacy deletion**

Delete only verified, non-active objects within the approved batch limit. Recompute Supabase Storage inventory afterward.

- [ ] **Step 7: Run complete verification suite**

```bash
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
python -m pip install -e 'workers/science[test]'
python -m pytest workers/science/tests
docker build --tag sky-science-worker:ci workers/science
npx wrangler deploy --dry-run --config cloudflare/science-orchestrator/wrangler.jsonc
```

- [ ] **Step 8: Commit finalized runbooks**

```bash
git add docs/runbooks/cloudflare-science-worker.md docs/runbooks/r2-storage-migration.md workers/science/README.md
git commit -m "docs: finalize R2 science cutover runbook"
```

## Plan self-review

- Spec coverage: historical migration, checksum verification, active-first priority, retention, safety-window deletion, auditability, observability, production cutover and rollback are covered.
- Deletion remains API-based; there is no direct SQL deletion from `storage.objects`.
- Obsolete HiPS can be skipped instead of copied, preventing pointless R2 growth.
- Active + rollback protection is rechecked immediately before deletion.
- This plan assumes the storage foundation and Cloudflare orchestrator plans have already landed and passed their own acceptance tests.
