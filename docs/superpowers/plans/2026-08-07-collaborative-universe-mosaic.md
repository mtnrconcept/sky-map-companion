# Collaborative Universe Mosaic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zoomable multi-resolution celestial mosaic where validated astrophotographs cover HEALPix cells, empty cells remain visible, first contributors are attributed atomically, and XP is awarded idempotently.

**Architecture:** Keep astronomy math and quality policy in pure TypeScript modules, persist authoritative coverage and XP in PostgreSQL, and expose read-only map projections to the client. The existing sky canvas becomes an adaptive observatory with procedural empty cells and server-loaded covered cells; uploads remain private until the server qualification transaction approves them.

**Tech Stack:** React 19, TanStack Start/Router, TypeScript, Canvas/WebGL-compatible rendering, `@hscmap/healpix@1.4.12`, `tus-js-client@4.3.1`, Supabase PostgreSQL/RLS/Storage/Realtime, Vitest, Testing Library, pgTAP, Playwright.

## Global Constraints

- Execute only after the repository stabilization plan is green.
- Node.js 22, pnpm 10.28.1, Supabase CLI 2.95.2.
- Use HEALPix NESTED orders 6, 7, 8, and 9.
- Award 2, 5, 10, and 20 XP per newly claimed cell respectively, capped at 500 XP per approved upload.
- Focal length is advisory; measured WCS pixel scale determines the contribution class.
- Original files stay private; only approved derivatives are public.
- Client code cannot approve uploads, claim cells, or mutate XP.
- Every public table has RLS, and privileged functions are not executable by `PUBLIC`.
- French-first user copy, accessible controls, and reduced-motion support.
- Every new behavior follows red-green-refactor.

## File Structure

- `src/features/mosaic/domain/celestial-grid.ts`: HEALPix adapter and coordinate conversion.
- `src/features/mosaic/domain/quality-score.ts`: qualification policy.
- `src/features/mosaic/domain/types.ts`: stable feature interfaces.
- `src/features/mosaic/api/mosaic-repository.ts`: Supabase read model.
- `src/features/mosaic/hooks/useMosaicViewport.ts`: viewport query/cache.
- `src/features/mosaic/components/*`: observatory, layers, cell panel, legend, contribution flow.
- `src/routes/mosaic.tsx`: new feature route.
- Supabase migration created by `supabase migration new collaborative_universe_mosaic`: additive schema/RLS/RPC.
- `supabase/tests/database/mosaic.test.sql`: schema, RLS, idempotence, and concurrency tests.
- `e2e/mosaic.spec.ts`: user journeys.

---

### Task 1: Define the celestial grid contract

**Files:**
- Create: `src/features/mosaic/domain/types.ts`
- Create: `src/features/mosaic/domain/celestial-grid.ts`
- Test: `src/features/mosaic/domain/celestial-grid.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces: `CelestialCell`, `SkyResolutionClass`, `radecToCell`, `cellBoundary`, and `resolutionForPixelScale`.

- [ ] **Step 1: Install the HEALPix adapter dependency**

Run: `pnpm add @hscmap/healpix@1.4.12`.

- [ ] **Step 2: Write failing grid tests**

```ts
import { describe, expect, test } from "vitest";
import { cellBoundary, radecToCell, resolutionForPixelScale } from "./celestial-grid";

describe("celestial grid", () => {
  test("wraps right ascension at 360 degrees", () => {
    expect(radecToCell(8, 0, 10)).toEqual(radecToCell(8, 360, 10));
  });
  test("creates four child cells between adjacent orders", () => {
    const parent = radecToCell(8, 10.6847, 41.2692);
    const children = Array.from({ length: 4 }, (_, offset) => parent.index * 4 + offset);
    expect(new Set(children).size).toBe(4);
  });
  test("classifies measured angular sampling", () => {
    expect(resolutionForPixelScale(12)).toBe("discovery");
    expect(resolutionForPixelScale(3)).toBe("detailed");
    expect(resolutionForPixelScale(1.5)).toBe("high-definition");
  });
  test("returns four finite cell corners", () => {
    expect(cellBoundary(radecToCell(8, 10, 41))).toHaveLength(4);
  });
});
```

- [ ] **Step 3: Run tests and confirm RED**

Run: `pnpm test:unit -- src/features/mosaic/domain/celestial-grid.test.ts`.

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement the minimal HEALPix adapter**

```ts
import * as healpix from "@hscmap/healpix";
import type { CelestialCell, SkyResolutionClass } from "./types";

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function radecToCell(order: 6 | 7 | 8 | 9, raDeg: number, decDeg: number): CelestialCell {
  const nside = healpix.order2nside(order);
  const phi = radians(((raDeg % 360) + 360) % 360);
  const theta = radians(90 - Math.max(-90, Math.min(90, decDeg)));
  return { order, index: healpix.ang2pix_nest(nside, theta, phi) };
}

export function cellBoundary(cell: CelestialCell) {
  return healpix.corners_nest(healpix.order2nside(cell.order), cell.index).map((vector) => {
    const { theta, phi } = healpix.vec2ang(vector);
    return { raDeg: (phi * 180) / Math.PI, decDeg: 90 - (theta * 180) / Math.PI };
  });
}

export function resolutionForPixelScale(value: number): SkyResolutionClass | null {
  if (value <= 1.5) return "high-definition";
  if (value <= 3) return "detailed";
  if (value <= 6) return "wide-field";
  if (value <= 12) return "discovery";
  return null;
}
```

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `pnpm test:unit -- src/features/mosaic/domain/celestial-grid.test.ts`.

- [ ] **Step 6: Commit the grid domain**

Commit: `feat: add hierarchical celestial grid domain`.

### Task 2: Implement deterministic image qualification

**Files:**
- Create: `src/features/mosaic/domain/quality-score.ts`
- Test: `src/features/mosaic/domain/quality-score.test.ts`

**Interfaces:**
- Consumes: `ImageQualityMetrics`.
- Produces: `QualificationResult { score, eligible, resolutionClass, blockers, breakdown }`.

- [ ] **Step 1: Write failing threshold tests**

```ts
import { describe, expect, test } from "vitest";
import { qualifyImage } from "./quality-score";

const valid = { matchedStars: 80, wcsRmsPx: 0.8, usableCoverage: 0.86, fwhmArcsec: 3.2, pixelScaleArcsec: 1.5, eccentricity: 0.48, saturatedFraction: 0.004, clippedBlackFraction: 0.002, signalToNoise: 18, metadataComplete: true };

describe("qualifyImage", () => {
  test("accepts an explainable high-quality frame", () => expect(qualifyImage(valid)).toMatchObject({ eligible: true, resolutionClass: "high-definition" }));
  test("blocks insufficient WCS matches regardless of total score", () => expect(qualifyImage({ ...valid, matchedStars: 12 }).blockers).toContain("insufficient-reference-stars"));
  test("does not reward artificial upscaling", () => expect(qualifyImage({ ...valid, nativePixelScaleArcsec: 6, pixelScaleArcsec: 1.5 }).resolutionClass).toBe("wide-field"));
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `pnpm test:unit -- src/features/mosaic/domain/quality-score.test.ts`.

- [ ] **Step 3: Implement the approved 25/25/20/15/10/5 scoring policy**

Keep blocker evaluation separate from score calculation. Use the worse of native and solved pixel scale for class assignment. Return French-safe reason codes mapped to UI copy outside the domain module.

- [ ] **Step 4: Add boundary/property tests**

Test exact values at 70 points, 70% coverage, 1.5 WCS pixels, 2% saturation, 1% clipping, and invalid NaN/negative metrics.

- [ ] **Step 5: Run coverage and commit**

Run: `pnpm test:coverage -- src/features/mosaic/domain/quality-score.test.ts`.

Expected: at least 95% branch coverage for this module.

Commit: `feat: score astrophotography quality deterministically`.

### Task 3: Add the authoritative mosaic schema and RLS

**Files:**
- Create via CLI: the exact timestamped path printed by `supabase migration new collaborative_universe_mosaic`
- Create: `supabase/tests/database/mosaic.test.sql`
- Regenerate: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces tables `astrometric_solutions`, `astro_upload_cells`, `sky_coverage_cells`, `xp_ledger`, `mosaic_tiles`, `moderation_events`, `processing_jobs` and private claim function.

- [ ] **Step 1: Create the migration through the CLI**

Run: `pnpm dlx supabase@2.95.2 migration new collaborative_universe_mosaic`.

Use the exact timestamped path printed by the command for every subsequent migration edit.

- [ ] **Step 2: Write failing pgTAP schema/RLS tests**

Assert table existence, primary/unique keys, RLS enabled, no `PUBLIC` execute on privileged claim functions, immutable XP rows for authenticated users, and private originals.

- [ ] **Step 3: Run pgTAP and confirm RED**

Run: `pnpm dlx supabase@2.95.2 db reset` then `pnpm test:db`.

- [ ] **Step 4: Implement additive tables and indexes**

Core authoritative keys:

```sql
create table public.sky_coverage_cells (
  healpix_order smallint not null check (healpix_order between 6 and 9),
  healpix_index bigint not null check (healpix_index >= 0),
  first_upload_id uuid not null references public.astro_uploads(id),
  first_user_id uuid not null references auth.users(id),
  claimed_at timestamptz not null default now(),
  primary key (healpix_order, healpix_index)
);

create table public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  event_type text not null check (event_type = 'first_coverage'),
  upload_id uuid not null references public.astro_uploads(id),
  healpix_order smallint not null,
  healpix_index bigint not null,
  points integer not null check (points > 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
```

Create composite indexes for viewport/order queries and user XP aggregation. Enable RLS on every new public table before grants.

- [ ] **Step 5: Implement ownership/read policies**

Drop the legacy public `astro_uploads` read policy in the additive migration. Authenticated users can read only their own raw upload rows, while anonymous users read coverage and published-tile projections that exclude storage paths, source URLs, exact acquisition coordinates, and private metadata. No client role can insert/update/delete coverage, XP, tiles, solutions, moderation events, or processing jobs.

- [ ] **Step 6: Run advisors and tests**

Run: `pnpm test:db`, `pnpm dlx supabase@2.95.2 db lint --local`, and `pnpm dlx supabase@2.95.2 migration list --local`.

- [ ] **Step 7: Regenerate types and commit**

Generate types from the local database, format them, and commit: `feat: add secure collaborative mosaic schema`.

### Task 4: Make cell claims and XP atomic/idempotent

**Files:**
- Modify: the CLI-generated mosaic migration or add a second CLI-generated migration if the first was already committed/applied
- Extend: `supabase/tests/database/mosaic.test.sql`

**Interfaces:**
- Produces private function `private.claim_approved_upload(p_upload_id uuid)` returning claimed cells, XP awarded, and cells already owned.

- [ ] **Step 1: Write failing database behavior tests**

Test one approved upload, a replay of the same upload, two users targeting the same cell, mixed new/existing cells, and the 500 XP cap.

- [ ] **Step 2: Confirm RED**

Run: `pnpm test:db`.

- [ ] **Step 3: Implement the transactional claim**

Use a single `INSERT ... ON CONFLICT DO NOTHING ... RETURNING` CTE for coverage, derive XP only from returned rows, insert ledger events with unique idempotency keys, and cap awarded points using a deterministic ordered window. Set `search_path = ''`, schema-qualify every object, revoke execute from `PUBLIC`, `anon`, and `authenticated`, and grant only to `service_role`.

- [ ] **Step 4: Prove replay and race safety**

Run pgTAP twice and add an integration test that sends concurrent claim requests through two independent database connections; assert one `(order,index)` owner and one ledger event.

- [ ] **Step 5: Commit atomic attribution**

Commit: `feat: claim pioneer cells and xp atomically`.

### Task 5: Add resumable private uploads and contribution state

**Files:**
- Create: `src/features/mosaic/api/resumable-upload.ts`
- Create: `src/features/mosaic/hooks/useContributionUpload.ts`
- Create: `src/features/mosaic/components/ContributionWizard.tsx`
- Test: adjacent `.test.ts`/`.test.tsx` files
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces: `startContributionUpload(file, metadata, callbacks)` and wizard states mission/upload/metadata/qualification/result.

- [ ] **Step 1: Install TUS client**

Run: `pnpm add tus-js-client@4.3.1`.

- [ ] **Step 2: Write failing upload behavior tests**

Test rejected file type/size, session absence, 6 MiB chunk size, direct storage endpoint, retry delays, no upsert, progress updates, and cancellation.

- [ ] **Step 3: Implement the minimal resumable adapter**

Use `${projectId}.storage.supabase.co/storage/v1/upload/resumable`, `chunkSize: 6 * 1024 * 1024`, unique immutable object paths, and the current access token only as a transport credential. Never make authorization decisions from client session claims.

- [ ] **Step 4: Write and implement the wizard component tests**

Assert keyboard navigation, step status, required licence, metadata review, WCS/quality pending copy, retry copy, and final cell/XP summary.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test:unit -- src/features/mosaic`.

Commit: `feat: add resumable mosaic contribution flow`.

### Task 6: Build the viewport read model and adaptive observatory

**Files:**
- Create: `src/features/mosaic/api/mosaic-repository.ts`
- Create: `src/features/mosaic/hooks/useMosaicViewport.ts`
- Create: `src/features/mosaic/components/MosaicObservatory.tsx`
- Create: `src/features/mosaic/components/MosaicLayerControls.tsx`
- Create: `src/features/mosaic/components/MosaicCellPanel.tsx`
- Create: `src/features/mosaic/components/MosaicLegend.tsx`
- Test: adjacent test files

**Interfaces:**
- Consumes: viewport bounds, active HEALPix order, covered-cell projection.
- Produces: procedural empty cells plus attributed/pending/disputed overlays.

- [ ] **Step 1: Write failing viewport repository tests**

Assert RA seam handling, order filtering, aborting stale requests, query-key stability, anonymous attribution, and lower-order fallback.

- [ ] **Step 2: Implement the typed repository/hook**

Query only cells intersecting the current view/order, cache by normalized viewport bucket, retain the previous successful layer while panning, and cancel stale requests.

- [ ] **Step 3: Write failing observatory interaction tests**

Test Discovery/Expert mode, layer toggles, cell selection, empty-cell CTA, pioneer label, keyboard selection, reduced motion, and error fallback.

- [ ] **Step 4: Implement the adaptive observatory**

Extend `SkyCanvas` through a focused overlay adapter rather than placing Supabase access inside rendering code. Use the validated cyan/amber/violet/disputed legend and French panel copy.

- [ ] **Step 5: Run component tests and commit**

Run: `pnpm test:unit -- src/features/mosaic/components src/features/mosaic/hooks`.

Commit: `feat: add adaptive mosaic observatory`.

### Task 7: Add route, navigation, profile XP, and realtime updates

**Files:**
- Create: `src/routes/mosaic.tsx`
- Modify: `src/components/AppNav.tsx`
- Modify: `src/components/UserProfile.tsx`
- Regenerate: `src/routeTree.gen.ts`
- Test: route/profile tests

**Interfaces:**
- Produces route `/mosaic`, navigation entry, contributor XP total, pioneer count, and realtime cache invalidation.

- [ ] **Step 1: Write failing route and profile tests**

Assert the Mosaic link, route heading, auth-required contribution CTA, public pioneer attribution, anonymous fallback, XP total, and no exposure of private acquisition location.

- [ ] **Step 2: Implement route and profile projections**

Keep read access public; redirect only contribution actions to authentication. Subscribe to committed coverage events and invalidate the active viewport query.

- [ ] **Step 3: Regenerate route tree**

Run the TanStack route generator through the project’s supported build/dev command; do not hand-edit `routeTree.gen.ts`.

- [ ] **Step 4: Run route tests and commit**

Run: `pnpm test:unit -- src/routes/mosaic.tsx src/components/UserProfile.test.tsx`.

Commit: `feat: expose mosaic route and contributor progression`.

### Task 8: Verify complete user journeys and security boundaries

**Files:**
- Create: `e2e/mosaic.spec.ts`
- Extend: `supabase/tests/database/mosaic.test.sql`

- [ ] **Step 1: Write failing Playwright journeys**

Cover global-to-order-9 zoom, empty zone, expert mode, auth redirect, resumable upload fixture, metadata/licence, failed qualification, approved contribution, pioneer label, and XP summary.

- [ ] **Step 2: Add RLS adversarial tests**

As `anon` and two distinct authenticated users, attempt to read private originals, change approval state, insert coverage, update XP, and impersonate another owner. Every attempt must fail.

- [ ] **Step 3: Run the complete feature suite**

Run: `pnpm test:coverage`, `pnpm test:db`, `pnpm test:e2e`, `pnpm build`.

Expected: all green; mosaic attribution/XP modules maintain at least 95% branch coverage.

- [ ] **Step 4: Review performance and accessibility evidence**

Render at least 5,000 visible cell outlines using deterministic fixtures, record interaction timing, run automated accessibility checks, and fix any frame stalls or critical violations.

- [ ] **Step 5: Commit verified mosaic MVP**

Commit: `feat: complete collaborative universe mosaic`.
