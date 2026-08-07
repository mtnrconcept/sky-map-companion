# Scientific Pipeline and Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn approved raw astrophotographs into reproducible WCS footprints, explainable quality metrics, immutable HiPS generations, and globally scalable mosaic tiles with moderation and observability.

**Architecture:** A Python science worker performs CPU-intensive FITS/astrometry/image operations outside short-lived Edge Functions. Supabase remains the authoritative job/state/rights store; workers lease idempotent jobs, publish immutable artifacts, and atomically activate only fully verified HiPS generations.

**Tech Stack:** Python 3.12, Astropy 8.0.1, SEP 1.4.1, reproject 0.21.0, NumPy 2.5.1, Pillow 12.3.0, supabase-py 2.31.0, psycopg 3.3.4, pytest 9.1.1, Astrometry.net `solve-field`, Docker, Supabase PostgreSQL/Storage/Realtime, React/TanStack client.

## Global Constraints

- Execute only after stabilization and the collaborative mosaic MVP are green.
- Originals remain private and are accessed through short-lived signed URLs.
- A worker never receives browser credentials and never exposes the service-role secret in logs or responses.
- Every job transition is conditional, leased, idempotent, and replay-safe.
- Tile paths are immutable; activation occurs through a manifest/generation pointer transaction.
- Scientific recipes, thresholds, source upload IDs, and pipeline versions remain traceable.
- Incompatible spectral bands are separate layers unless a versioned recipe explicitly combines them.
- No partial generation may become current.
- Every behavior change follows red-green-refactor.

## File Structure

- `workers/science/pyproject.toml`: pinned worker environment.
- `workers/science/Dockerfile`: reproducible Astrometry.net runtime.
- `workers/science/src/sky_worker/*`: lease loop, extraction, solve, metrics, footprints, HiPS, publication.
- `workers/science/tests/*`: synthetic FITS, golden metrics, retries, and manifests.
- `src/features/mosaic/domain/job-state.ts`: shared TypeScript state contract.
- `src/routes/api/mosaic/jobs.ts`: authenticated status/cancel surface.
- Supabase migration created by `supabase migration new scientific_pipeline_runtime`: private queue, leases, generations, manifests.
- `supabase/tests/database/pipeline.test.sql`: transition and publication invariants.
- `src/features/mosaic/components/PipelineStatus.tsx`: user-visible progress and failures.
- `docs/runbooks/scientific-pipeline.md`: operations and rollback.

---

### Task 1: Define and enforce the processing state machine

**Files:**
- Create: `src/features/mosaic/domain/job-state.ts`
- Test: `src/features/mosaic/domain/job-state.test.ts`
- Create via CLI: the exact timestamped path printed by `supabase migration new scientific_pipeline_runtime`
- Create: `supabase/tests/database/pipeline.test.sql`

**Interfaces:**
- Produces: `PipelineState`, `canTransition(from, to)`, and database transition function `private.transition_processing_job`.

- [ ] **Step 1: Write failing TypeScript transition tests**

```ts
import { describe, expect, test } from "vitest";
import { canTransition } from "./job-state";

describe("pipeline transitions", () => {
  test("follows the approved happy path", () => {
    expect(canTransition("uploaded", "extracting")).toBe(true);
    expect(canTransition("tiling", "published")).toBe(true);
  });
  test("rejects publishing before tiling", () => expect(canTransition("qualifying", "published")).toBe(false));
  test("allows a failed job to retry its failed stage", () => expect(canTransition("failed", "extracting")).toBe(true));
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `pnpm test:unit -- src/features/mosaic/domain/job-state.test.ts`.

- [ ] **Step 3: Implement the pure transition table**

Represent allowed edges explicitly for `uploaded`, `extracting`, `solving`, `qualifying`, `awaiting_review`, `approved`, `tiling`, `published`, `rejected`, `duplicate`, and `failed`.

- [ ] **Step 4: Create the runtime migration through Supabase CLI**

Run: `pnpm dlx supabase@2.95.2 migration new scientific_pipeline_runtime`; use the printed timestamped path.

- [ ] **Step 5: Write failing pgTAP transition/lease tests**

Assert valid transitions, invalid skipped transitions, optimistic version conflicts, one active lease per job, lease expiry recovery, and no public execute privilege.

- [ ] **Step 6: Implement private queue functions**

Create `private.lease_processing_job(worker_id, lease_seconds)`, `private.heartbeat_processing_job`, `private.transition_processing_job`, and `private.fail_processing_job`. Set empty search paths, schema-qualify objects, revoke from `PUBLIC`, and grant only the worker database role/service role.

- [ ] **Step 7: Run tests and commit**

Run: `pnpm test:unit -- src/features/mosaic/domain/job-state.test.ts` and `pnpm test:db`.

Commit: `feat: enforce scientific processing state machine`.

### Task 2: Bootstrap the reproducible science worker

**Files:**
- Create: `workers/science/pyproject.toml`
- Create: `workers/science/Dockerfile`
- Create: `workers/science/src/sky_worker/config.py`
- Create: `workers/science/src/sky_worker/worker.py`
- Test: `workers/science/tests/test_worker.py`

**Interfaces:**
- Consumes: private lease RPC and signed source URL.
- Produces: heartbeat, structured step result, and conditional transition.

- [ ] **Step 1: Write the failing lease-loop test**

```py
def test_worker_heartbeats_and_completes_one_leased_job(fake_gateway):
    fake_gateway.jobs = [{"id": "job-1", "stage": "extracting", "version": 3}]
    worker = Worker(gateway=fake_gateway, worker_id="test-worker")
    worker.run_once()
    assert fake_gateway.heartbeats == ["job-1"]
    assert fake_gateway.transitions[-1] == ("job-1", "extracting", "solving", 3)
```

- [ ] **Step 2: Run pytest and confirm RED**

Run: `python -m pytest workers/science/tests/test_worker.py -q`.

- [ ] **Step 3: Pin the Python environment**

Set Python `>=3.12,<3.13` and exact dependencies: `astropy==8.0.1`, `sep==1.4.1`, `reproject==0.21.0`, `numpy==2.5.1`, `pillow==12.3.0`, `supabase==2.31.0`, `psycopg[binary]==3.3.4`; dev dependency `pytest==9.1.1`.

- [ ] **Step 4: Implement one-job worker loop**

Inject a gateway and stage handler registry. The queue gateway uses a restricted direct PostgreSQL connection to call functions in the non-exposed `private` schema; Storage access uses a server-only Supabase client. Log JSON containing `upload_id`, `job_id`, `stage`, `attempt`, and `pipeline_version`, never URLs, tokens, exact private coordinates, or file headers.

- [ ] **Step 5: Build the Docker image**

Base on a pinned Python 3.12 slim digest, install Astrometry.net and its required catalogue/data packages, copy only worker sources, run as a non-root user, and define a health check based on lease/heartbeat freshness.

- [ ] **Step 6: Run tests/build and commit**

Run: `python -m pytest workers/science/tests -q` and `docker build -t sky-map-science:test workers/science`.

Commit: `feat: bootstrap isolated science worker`.

### Task 3: Extract FITS metadata and solve astrometry

**Files:**
- Create: `workers/science/src/sky_worker/extraction.py`
- Create: `workers/science/src/sky_worker/astrometry.py`
- Create: `workers/science/src/sky_worker/footprint.py`
- Test: `workers/science/tests/test_extraction.py`
- Test: `workers/science/tests/test_astrometry.py`

**Interfaces:**
- Produces normalized metadata, WCS solution, RMS, matched-star count, pixel scale, rotation, centre, and RA-seam-safe footprint.

- [ ] **Step 1: Write synthetic FITS fixtures in tests**

Generate small arrays and headers at runtime with Astropy; do not commit large binaries. Include valid WCS, no WCS, malformed dimensions, and a footprint crossing RA 0°.

- [ ] **Step 2: Write failing extraction and footprint tests**

Assert units, finite values, missing-field reason codes, no trust in user-supplied solved scale, and splitting/wrapping the RA seam without a 360° polygon.

- [ ] **Step 3: Implement safe FITS extraction**

Limit decompressed dimensions and header size, reject unsupported HDUs, normalize timestamps/filters, and return typed reason codes rather than raw exceptions.

- [ ] **Step 4: Implement Astrometry.net adapter**

Invoke `solve-field` through an argument array without a shell, use a bounded timeout and working directory, validate generated WCS, count matched stars, compute RMS, and remove temporary files after resolving their absolute task directory.

- [ ] **Step 5: Implement footprint generation**

Transform all four image corners through WCS, densify long edges, normalize RA, and emit a seam-safe MultiPolygon plus HEALPix candidate bounds.

- [ ] **Step 6: Run tests and commit**

Run: `python -m pytest workers/science/tests/test_extraction.py workers/science/tests/test_astrometry.py -q`.

Commit: `feat: solve and footprint astrophotography frames`.

### Task 4: Compute explainable quality metrics and persist decisions

**Files:**
- Create: `workers/science/src/sky_worker/quality.py`
- Create: `workers/science/src/sky_worker/masks.py`
- Test: `workers/science/tests/test_quality.py`
- Modify: worker stage registry

**Interfaces:**
- Produces the exact `ImageQualityMetrics` contract consumed by TypeScript scoring and a usable-pixel mask.

- [ ] **Step 1: Write failing metric golden tests**

Generate deterministic Gaussian stars, trailed stars, saturation, clipped backgrounds, gradients, and cloud masks. Assert bounded tolerance for FWHM, eccentricity, saturation, clipping, SNR, and usable fraction.

- [ ] **Step 2: Run tests and confirm RED**

Run: `python -m pytest workers/science/tests/test_quality.py -q`.

- [ ] **Step 3: Implement SEP-based source metrics**

Estimate background, detect sources, exclude saturated/edge detections, compute robust medians, and return confidence/sample counts alongside metrics.

- [ ] **Step 4: Share scoring fixtures across Python and TypeScript**

Create JSON fixtures under `tests/fixtures/mosaic-quality/`; both worker and TypeScript tests must produce identical eligibility, blocker codes, score, and class.

- [ ] **Step 5: Persist results idempotently**

Upsert by `(upload_id, pipeline_version)`, write astrometric solution and metrics in one transaction, then transition to `awaiting_review` or `approved` according to deterministic confidence rules.

- [ ] **Step 6: Run cross-language tests and commit**

Run: Python quality tests and `pnpm test:unit -- src/features/mosaic/domain/quality-score.test.ts`.

Commit: `feat: qualify frames with explainable science metrics`.

### Task 5: Generate immutable HiPS tiles and activate complete generations

**Files:**
- Create: `workers/science/src/sky_worker/hips.py`
- Create: `workers/science/src/sky_worker/blend.py`
- Create: `workers/science/src/sky_worker/publish.py`
- Test: `workers/science/tests/test_hips.py`
- Extend: runtime migration and `pipeline.test.sql` through a new CLI migration if already applied

**Interfaces:**
- Produces immutable `Norder<N>/Dir<D>/Npix<P>.<ext>` tiles, checksums, provenance manifest, and atomic current generation pointer.

- [ ] **Step 1: Write failing tile/generation tests**

Assert deterministic paths, exact dimensions, checksum stability, parent fallback tiles, spectral-layer separation, provenance entries, and refusal to activate missing/corrupt tiles.

- [ ] **Step 2: Run tests and confirm RED**

Run: `python -m pytest workers/science/tests/test_hips.py -q`.

- [ ] **Step 3: Implement reprojection and blending**

Reproject only approved masked pixels, weight by quality/PSF/SNR, feather overlaps, never silently mix incompatible filters, and retain contribution weights per output tile.

- [ ] **Step 4: Implement immutable publication**

Write to `hips/<layer>/<generation>/...`, upload with no upsert, verify every object checksum, then call a private transaction that marks the generation complete and swaps the layer’s current generation ID.

- [ ] **Step 5: Add pgTAP activation tests**

Prove incomplete generations cannot become current, one current generation exists per layer, rollback preserves the previous pointer, and clients cannot activate generations.

- [ ] **Step 6: Run tests and commit**

Run: Python HiPS tests and `pnpm test:db`.

Commit: `feat: publish atomic hips mosaic generations`.

### Task 6: Expose pipeline progress, moderation, and operations

**Files:**
- Create: `src/routes/api/mosaic/jobs.ts`
- Create: `src/features/mosaic/components/PipelineStatus.tsx`
- Create: `src/features/mosaic/components/ModerationReview.tsx`
- Test: adjacent route/component tests
- Create: `docs/runbooks/scientific-pipeline.md`

**Interfaces:**
- Produces authenticated own-job status/cancel API, admin review action, realtime progress UI, retry guidance, and rollback runbook.

- [ ] **Step 1: Write failing API authorization tests**

Test unauthenticated rejection, owner read, cross-user denial, allowed cancellation states, admin-only moderation, idempotent retry, and redaction of private worker fields.

- [ ] **Step 2: Implement the minimal API**

Validate methods and auth early, use the user-scoped Supabase client for reads, call privileged moderation only through server-only code, and return typed explicit bodies.

- [ ] **Step 3: Write failing UI tests**

Cover all pipeline states, progress, reconnect, WCS failure, quality blockers, retry, dispute, approved XP, reduced motion, and screen-reader announcements.

- [ ] **Step 4: Implement UI and realtime invalidation**

Display structured reason codes in polished French. Realtime events trigger refetch; they are not treated as authoritative payloads.

- [ ] **Step 5: Write the operations runbook**

Document worker deployment, secret scopes, dead-letter inspection, safe retry, generation rollback, contributor notification, metrics, and incident escalation with exact commands discovered from the deployed runtime.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm test:unit -- src/routes/api/mosaic src/features/mosaic/components`.

Commit: `feat: operate and moderate scientific processing`.

### Task 7: Prove resilience, scale, and release readiness

**Files:**
- Create: `workers/science/tests/test_recovery.py`
- Create: `tests/performance/mosaic-load.test.ts`
- Create: `e2e/mosaic-pipeline.spec.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write crash/replay tests at every state**

Terminate a worker after output write but before transition, after transition but before acknowledgement, and during manifest upload. Restart and assert no duplicate solution, claim, XP, tile, or generation activation.

- [ ] **Step 2: Write deterministic load tests**

Exercise 5,000 visible cells, concurrent viewport requests, 100 simultaneous validations targeting overlapping cells, cache-cold tile fallback, and a large resumable upload fixture without production network calls.

- [ ] **Step 3: Add pipeline E2E journey**

Submit a synthetic FITS frame, observe each status, verify the approved tile and pioneer label, remove the source as moderator, rebuild, and verify the new current generation.

- [ ] **Step 4: Add CI worker jobs**

Run Python unit tests, Docker build, TypeScript contracts, local Supabase tests, and E2E using only local fixtures. Upload failure reports and coverage with immutable action references.

- [ ] **Step 5: Run the full release suite**

Run: `pnpm validate:source`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `python -m pytest workers/science/tests -q`, `pnpm test:db`, `pnpm test:e2e`, `pnpm build`, and the worker Docker build.

- [ ] **Step 6: Verify acceptance metrics**

Record p95 viewport query below 300 ms in the local reference dataset, useful first tile below 2.5 s on the throttled browser profile, no incomplete generation exposure, and no RLS/advisor findings.

- [ ] **Step 7: Commit release readiness**

Commit: `feat: harden scientific mosaic pipeline for scale`.
