# Cloudflare Science Orchestrator and Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cloudflare R2 + Queue + Containers the execution path for new AstroStack uploads, so a browser upload can be qualified and processed without the Windows PC being online.

**Architecture:** A Cloudflare Worker owns resumable multipart upload orchestration, verifies Supabase sessions, finalizes metadata in Supabase, and publishes job IDs to Cloudflare Queue. Queue messages invoke one-shot science jobs inside the existing Python image running as a Cloudflare Container; Supabase remains the authoritative lease/state machine, so duplicate delivery and coexistence with the Windows worker are safe.

**Tech Stack:** Cloudflare Workers, R2, Queues, Containers, Wrangler JSONC, TypeScript, Python 3.12, Astrometry.net, Supabase Auth/PostgREST/Postgres, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-09-07-cloudflare-r2-science-worker-design.md`

## Global Constraints

- Supabase `processing_jobs` remains the source of truth; Cloudflare Queue is only a delivery accelerator.
- New browser blobs must not transit through Vercel or Supabase Storage once R2 upload is enabled.
- Direct uploads must remain resumable for files up to 5 GiB.
- The existing Windows worker must continue to work unchanged when `WORKER_MODE` is unset.
- Duplicate Queue delivery must not process a job twice.
- Cloudflare Container concurrency is intentionally bounded to protect cost.
- The science Docker image and scientific handlers are reused; no fork of the algorithms is allowed.
- Secrets must stay server-side and must never enter Vite client bundles.

---

### Task 1: Add exact-job leasing for queue-delivered work

**Files:**
- Create: `supabase/migrations/20260907041000_exact_processing_job_lease.sql`
- Modify: `workers/science/src/sky_worker/gateway.py`
- Modify: `workers/science/src/sky_worker/worker.py`
- Create: `workers/science/tests/test_exact_job_lease.py`

**Interfaces:**
- Produces PostgreSQL function `private.lease_processing_job_by_id(uuid,text,integer)`.
- Produces `Gateway.lease_exact(job_id: UUID) -> Job | None`.
- Produces `Worker.run_exact(job_id: UUID) -> bool`.

- [ ] **Step 1: Add a regression test proving an exact lease cannot steal another job**

Use a fake Gateway with two jobs. Assert `run_exact(job_a)` never calls generic `lease()` and only invokes `lease_exact(job_a)`.

- [ ] **Step 2: Add the SQL exact-lease function**

The function must use `FOR UPDATE SKIP LOCKED`, require `completed_at is null`, `attempts < max_attempts`, `available_at <= now()`, an expired/absent lease, reject terminal statuses, and explicitly exclude `payload->>'lease_scope'='inline'` so Cloudflare cannot steal the special GitHub M31 inline job.

Representative predicate:

```sql
where j.id = p_job_id
  and j.completed_at is null
  and j.attempts < j.max_attempts
  and j.available_at <= now()
  and (j.lease_expires_at is null or j.lease_expires_at < now())
  and j.status not in ('published','rejected','duplicate','cancelled')
  and coalesce(j.payload->>'lease_scope','') <> 'inline'
```

- [ ] **Step 3: Implement `Gateway.lease_exact` separately from the existing archive-inline lease path**

Do not broaden or repurpose the current `lease(job_id)` special case for `build_archive_v9`; preserve it for the GitHub workflow.

- [ ] **Step 4: Add `Worker.run_exact`**

```python
def run_exact(self, job_id: UUID) -> bool:
    job = self.gateway.lease_exact(job_id)
    if job is None:
        return False
    return self._process_leased_job(job)
```

Refactor common leased-job processing into a private helper without changing failure/retry semantics.

- [ ] **Step 5: Run exact-lease and worker regression tests**

```bash
python -m pytest workers/science/tests/test_exact_job_lease.py workers/science/tests/test_worker.py -q
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260907041000_exact_processing_job_lease.sql workers/science/src/sky_worker/gateway.py workers/science/src/sky_worker/worker.py workers/science/tests/test_exact_job_lease.py
git commit -m "feat: add exact science job leasing"
```

### Task 2: Add a one-shot container job command while preserving daemon mode

**Files:**
- Create: `workers/science/src/sky_worker/single_job.py`
- Create: `workers/science/src/sky_worker/entrypoint.py`
- Modify: `workers/science/pyproject.toml`
- Modify: `workers/science/Dockerfile`
- Create: `workers/science/tests/test_single_job.py`
- Create: `workers/science/tests/test_entrypoint_mode.py`

**Interfaces:**
- New console command: `sky-science-job --job-id UUID`.
- New container entrypoint: `sky-science-entrypoint`.
- `WORKER_MODE=daemon` or unset runs the existing forever worker.
- `WORKER_MODE=container-host` keeps a lightweight host process alive so Cloudflare can call `exec()` for one-shot jobs.

- [ ] **Step 1: Write failing entrypoint-mode tests**

Assert unset/`daemon` delegates to existing `main()`, while `container-host` does not start generic job polling.

- [ ] **Step 2: Implement `single_job.main()`**

Parse `--job-id`, load `Config`, instantiate `Gateway` and `Worker`, call `run_exact(job_id)`, and exit `0` both for successful processing and lease-unavailable no-op. Invalid input/config must exit non-zero.

- [ ] **Step 3: Implement the container-host loop**

Use an `Event` with SIGINT/SIGTERM handlers and no network listener. The host process should only keep the container alive for `exec()`; it must not lease jobs itself.

- [ ] **Step 4: Change Docker entrypoint without changing default behavior**

```dockerfile
ENTRYPOINT ["sky-science-entrypoint"]
```

`WORKER_MODE` remains unset in `compose.windows.yml`, so Windows still runs daemon mode.

- [ ] **Step 5: Run tests and build the image**

```bash
python -m pytest workers/science/tests/test_single_job.py workers/science/tests/test_entrypoint_mode.py -q
docker build --tag sky-science-worker:cloudflare workers/science
```

- [ ] **Step 6: Smoke-test both modes locally**

```bash
docker run --rm --entrypoint sky-science-entrypoint -e WORKER_MODE=container-host sky-science-worker:cloudflare
```

Terminate it with SIGTERM and verify a clean exit; existing Windows compose test remains part of final verification.

- [ ] **Step 7: Commit**

```bash
git add workers/science/src/sky_worker/single_job.py workers/science/src/sky_worker/entrypoint.py workers/science/pyproject.toml workers/science/Dockerfile workers/science/tests/test_single_job.py workers/science/tests/test_entrypoint_mode.py
git commit -m "feat: add queue driven science job mode"
```

### Task 3: Create the Cloudflare Worker/Queue/Container project

**Files:**
- Create: `cloudflare/science-orchestrator/wrangler.jsonc`
- Create: `cloudflare/science-orchestrator/tsconfig.json`
- Create: `cloudflare/science-orchestrator/src/env.ts`
- Create: `cloudflare/science-orchestrator/src/queue-message.ts`
- Create: `cloudflare/science-orchestrator/src/science-container.ts`
- Create: `cloudflare/science-orchestrator/src/index.ts`
- Create: `cloudflare/science-orchestrator/src/queue-message.test.ts`
- Modify: `package.json`

**Interfaces:**
- Worker binding `SCIENCE_QUEUE` producer + consumer.
- Durable Object binding `SCIENCE_CONTAINER` backed by class `ScienceContainer`.
- R2 bindings `RAW_BUCKET`, `DERIVED_BUCKET`, `HIPS_BUCKET`, `QUARANTINE_BUCKET`.
- Container image is the existing `workers/science/Dockerfile`.
- Container budget starts at `standard-3`, `max_instances: 2`.

- [ ] **Step 1: Add Cloudflare dependencies**

Add pinned/current-compatible versions of `wrangler`, `@cloudflare/workers-types`, and `@cloudflare/containers` to root dev/runtime dependencies according to package role; regenerate the repository lockfile used by CI (`package-lock.json`).

- [ ] **Step 2: Define queue-message schema**

```ts
export interface ScienceQueueMessage {
  schema_version: 1;
  job_id: string;
  job_type: string;
  idempotency_key: string;
}
```

Use runtime validation before processing and reject malformed messages without starting a container.

- [ ] **Step 3: Configure Wrangler**

The config must include queue producer/consumer, four R2 bindings, one Durable Object binding/migration, and the Container declaration. Start conservatively:

```jsonc
"containers": [{
  "class_name": "ScienceContainer",
  "image": "../../workers/science/Dockerfile",
  "instance_type": "standard-3",
  "max_instances": 2
}]
```

Also configure `WORKER_MODE=container-host` as non-secret runtime configuration.

- [ ] **Step 4: Implement `ScienceContainer.runJob(jobId)` using Container exec**

The method starts the host container if needed, then executes:

```text
sky-science-job --job-id <uuid>
```

Pass database/Supabase/R2 credentials to the executed process as runtime environment variables, never as command-line arguments. Return structured `{ exitCode, stdoutTail, stderrTail }` with bounded log tails.

- [ ] **Step 5: Implement queue consumer acknowledgement semantics**

For each message:
1. Validate schema.
2. Route to a deterministic container instance keyed by job ID.
3. Await `runJob`.
4. `ack()` on exit code 0, including lease-unavailable no-op.
5. `retry()` with bounded backoff only for container/orchestration failure.

Do not let Queue retry replace the database retry policy for scientific failures already recorded by the Python worker.

- [ ] **Step 6: Add `/health` endpoint**

Return build/version and binding availability only; never return secrets or credential-derived data.

- [ ] **Step 7: Run Cloudflare unit/type checks**

```bash
npx tsc -p cloudflare/science-orchestrator/tsconfig.json --noEmit
npm run test:unit -- cloudflare/science-orchestrator/src/queue-message.test.ts
npx wrangler deploy --dry-run --config cloudflare/science-orchestrator/wrangler.jsonc
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json cloudflare/science-orchestrator
git commit -m "feat: add Cloudflare science orchestrator"
```

### Task 4: Add reliable Supabase registration and queue handoff for R2 uploads

**Files:**
- Create: `supabase/migrations/20260907042000_edge_r2_upload_registration.sql`
- Create: `cloudflare/science-orchestrator/src/supabase.ts`
- Create: `cloudflare/science-orchestrator/src/auth.ts`
- Create: `cloudflare/science-orchestrator/src/upload-finalize.ts`
- Create: `cloudflare/science-orchestrator/src/upload-finalize.test.ts`

**Interfaces:**
- Public RPC callable only by service role: `public.register_r2_astro_upload_edge(...)`.
- RPC returns `{ upload_id, job_id, replayed }`.
- Worker verifies user bearer token against Supabase Auth before invoking service-role RPC.

- [ ] **Step 1: Create a service-role-only registration RPC**

The function must validate object ID existence, storage key ownership prefix, allowed frame/licence values, positive size <= 5 GiB, and idempotency by `(storage_backend, storage_bucket, storage_key)`.

Revoke from `public`, `anon`, and `authenticated`; grant only to `service_role`.

- [ ] **Step 2: Verify how `qualify_upload` jobs are created today and preserve that mechanism**

If an existing trigger creates `processing_jobs`, return the resulting job ID. If no trigger exists, the function must insert the job transactionally in the same database transaction as the upload record.

- [ ] **Step 3: Implement Supabase bearer verification in Cloudflare Worker**

Call `${SUPABASE_URL}/auth/v1/user` with the user bearer token and publishable/anon API key. Reject 401 before any R2 finalization.

- [ ] **Step 4: Implement finalization helper**

After R2 confirms the exact object size, call the RPC with `storage_backend='r2'`, bucket/key, original filename and science metadata. Then enqueue the returned job ID.

- [ ] **Step 5: Add replay/idempotency tests**

Calling finalization twice for the same R2 key must return the same upload/job and enqueue at most one fresh delivery attempt per request without creating duplicate DB jobs.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260907042000_edge_r2_upload_registration.sql cloudflare/science-orchestrator/src/auth.ts cloudflare/science-orchestrator/src/supabase.ts cloudflare/science-orchestrator/src/upload-finalize.ts cloudflare/science-orchestrator/src/upload-finalize.test.ts
git commit -m "feat: register R2 AstroStack uploads at edge"
```

### Task 5: Add resumable R2 multipart upload endpoints

**Files:**
- Create: `cloudflare/science-orchestrator/src/uploads.ts`
- Create: `cloudflare/science-orchestrator/src/uploads.test.ts`
- Modify: `cloudflare/science-orchestrator/src/index.ts`

**Interfaces:**
- `POST /v1/uploads` → start multipart upload and return `uploadId`, `key`, `partSize`.
- `PUT /v1/uploads/:uploadId/parts/:partNumber` → upload one R2 multipart part and return ETag.
- `POST /v1/uploads/:uploadId/complete` → complete upload, verify size, register in Supabase, enqueue job.
- `DELETE /v1/uploads/:uploadId` → abort multipart upload.

- [ ] **Step 1: Write endpoint tests before implementation**

Cover authentication, allowed extension/MIME, 5 GiB max, user-owned deterministic prefix, part-number bounds, size mismatch, abort, completion, and immutable key collision.

- [ ] **Step 2: Choose a fixed multipart part size compatible with R2 and 5 GiB files**

Use a value that keeps part count comfortably below R2 limits (for example 16 MiB). Return it from start so the browser uses exactly the server-selected size.

- [ ] **Step 3: Implement start endpoint**

Generate keys under `raw/{user_id}/{upload_session_uuid}/{safe_filename}`. The client cannot supply an arbitrary bucket or top-level key.

- [ ] **Step 4: Implement part upload as a streaming request**

Do not buffer a 16 MiB part more than necessary; pass request body to R2 multipart API and return only the resulting part number/ETag.

- [ ] **Step 5: Implement complete and abort**

Complete only after all supplied parts are valid, `head()` returns the declared total size, and registration succeeds. If registration fails after R2 completion, leave the immutable object for retry rather than deleting it automatically.

- [ ] **Step 6: Run Worker tests**

```bash
npm run test:unit -- cloudflare/science-orchestrator/src/uploads.test.ts cloudflare/science-orchestrator/src/upload-finalize.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add cloudflare/science-orchestrator/src/uploads.ts cloudflare/science-orchestrator/src/uploads.test.ts cloudflare/science-orchestrator/src/index.ts
git commit -m "feat: add resumable R2 multipart uploads"
```

### Task 6: Switch AstroStack browser uploads to the edge with fallback

**Files:**
- Create: `src/features/astrostack/api/r2-multipart-upload.ts`
- Create: `src/features/astrostack/api/r2-multipart-upload.test.ts`
- Create: `src/features/astrostack/api/contribution-upload.ts`
- Modify: `src/hooks/useAstroStack.ts`
- Keep: `src/features/mosaic/api/resumable-upload.ts` as temporary fallback

**Interfaces:**
- `startAstroContributionUpload(file, session, metadata, callbacks)` chooses R2 when `VITE_SCIENCE_EDGE_URL` is configured; otherwise it uses current Supabase TUS.
- R2 completion returns the registered `upload_id` so the hook can begin existing qualification polling immediately.

- [ ] **Step 1: Write failing browser upload tests**

Test chunk ordering, progress, retry of a failed part, resume state persistence key, abort, completion payload, and fallback to Supabase when the edge URL is absent.

- [ ] **Step 2: Implement multipart client**

Upload parts sequentially initially to control memory/network usage. Persist `{uploadId,key,completedParts}` using a fingerprint derived from file name/size/lastModified/user ID so a page refresh can resume.

- [ ] **Step 3: Refactor `useAstroStack.uploadFrames`**

For R2 mode, do not POST the legacy `/api/astrostack/upload`; completion already registered the upload in Supabase. Continue polling `/api/astrostack/qualify` using the returned `upload_id`.

- [ ] **Step 4: Preserve legacy Supabase path**

When edge URL is not configured, the existing TUS upload + `/api/astrostack/upload` registration remains unchanged.

- [ ] **Step 5: Run frontend checks**

```bash
npm run test:unit -- src/features/astrostack/api/r2-multipart-upload.test.ts src/features/mosaic/api/resumable-upload.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add src/features/astrostack/api/r2-multipart-upload.ts src/features/astrostack/api/r2-multipart-upload.test.ts src/features/astrostack/api/contribution-upload.ts src/hooks/useAstroStack.ts
git commit -m "feat: upload AstroStack contributions to R2"
```

### Task 7: Add lost-message recovery without reintroducing a permanent poller

**Files:**
- Create: `supabase/migrations/20260907043000_queue_recovery_rpc.sql`
- Create: `cloudflare/science-orchestrator/src/recovery.ts`
- Create: `cloudflare/science-orchestrator/src/recovery.test.ts`
- Modify: `cloudflare/science-orchestrator/wrangler.jsonc`
- Modify: `cloudflare/science-orchestrator/src/index.ts`

**Interfaces:**
- Service-role-only RPC returns a bounded list of currently available, non-inline, non-terminal job IDs.
- Cloudflare scheduled handler runs periodically and re-enqueues only those IDs.

- [ ] **Step 1: Add bounded recovery RPC**

Maximum result count must be hard capped (for example 100). Sort by `available_at`, oldest first. Exclude live leases and `lease_scope='inline'`.

- [ ] **Step 2: Add Wrangler cron**

Start with every 5 minutes; queue events remain the low-latency path.

- [ ] **Step 3: Implement scheduled re-enqueue**

Enqueue stable messages generated from the DB row IDs. Duplicate deliveries are safe because exact leasing is authoritative.

- [ ] **Step 4: Test a simulated lost Queue message**

Create an available job fixture, run scheduled recovery, verify it is enqueued once and later duplicate queue delivery becomes lease-unavailable no-op.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260907043000_queue_recovery_rpc.sql cloudflare/science-orchestrator/src/recovery.ts cloudflare/science-orchestrator/src/recovery.test.ts cloudflare/science-orchestrator/src/index.ts cloudflare/science-orchestrator/wrangler.jsonc
git commit -m "feat: recover missed science queue deliveries"
```

### Task 8: CI, deployment runbook and end-to-end M31 pilot

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `docs/runbooks/cloudflare-science-worker.md`
- Modify: `workers/science/README.md`

**Interfaces:**
- PR CI performs Wrangler dry-run/typecheck without Cloudflare production credentials.
- Production deployment remains a separate explicit step after Cloudflare bindings/secrets exist.

- [ ] **Step 1: Add Cloudflare validation to CI**

Run orchestrator TypeScript checks, Vitest tests and `wrangler deploy --dry-run`; do not call production APIs in PR CI.

- [ ] **Step 2: Document required Cloudflare resources and secrets**

Resources: four R2 buckets, one Queue, Container/DO class. Secrets: Supabase server credentials and scoped R2 S3 credentials for the Python job process. Do not commit actual values.

- [ ] **Step 3: Document rollback**

Disable `VITE_SCIENCE_EDGE_URL`, pause Queue consumer/scheduled trigger, set science worker `STORAGE_PRIMARY=supabase`, and restart Windows worker. No data deletion is part of rollback.

- [ ] **Step 4: Run repository verification**

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

- [ ] **Step 5: After Cloudflare account resources are connected, deploy only to a pilot environment**

Verify `/health`, R2 multipart start/part/abort with a small fixture, and a queue-driven one-shot synthetic job before using a real user upload.

- [ ] **Step 6: Run the real M31 end-to-end acceptance test**

Browser → R2 → register Supabase row/job → Queue → Container → `sky-science-job` → Astrometry.net → Supabase job transitions → R2 derivative. Confirm the Windows worker is stopped during this test.

- [ ] **Step 7: Commit runbook/CI changes**

```bash
git add .github/workflows/ci.yml docs/runbooks/cloudflare-science-worker.md workers/science/README.md
git commit -m "docs: add Cloudflare science worker rollout"
```

## Plan self-review

- Spec coverage: direct R2 upload, Queue delivery, Container execution, exact/idempotent leasing, Windows coexistence, recovery, security, bounded compute and M31 E2E are covered.
- The plan deliberately does not delete historical Supabase objects; that is handled by the migration/cutover plan.
- The science algorithms are not changed.
- The container host cannot accidentally poll generic jobs because `WORKER_MODE=container-host` explicitly disables daemon mode.
- Queue retries are separated from scientific retry state in Supabase.
