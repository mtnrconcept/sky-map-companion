# Federated Aladin HiPS Mosaic Design

Date: 2026-09-05
Status: Approved architecture, implementation not started
Repository: `mtnrconcept/sky-map-companion`

## 1. Goal

Turn Sky Map Companion into a federated scientific sky mosaic where:

1. public HiPS surveys provide immediate baseline sky coverage without bulk-copying the Aladin/CDS ecosystem;
2. Sky Map's own IVOA HiPS remains the authoritative proprietary improvement layer;
3. new public FITS discovered by the existing archive ingesters are qualified, deduplicated, scored, and only promoted when they measurably improve a region or spectral layer;
4. provenance, rights, attribution, and redistribution policy remain attached to every external contribution;
5. incompatible spectral data are kept as distinct scientific layers rather than blended blindly.

The target user experience is one continuous sky map with no artificial red holes when a compatible public reference survey exists, while Sky Map's own data progressively replace or augment the external baseline where quality is better.

## 2. Non-goals

This project will not:

- mirror every Aladin/CDS HiPS tile into Supabase;
- copy rendered JPEG/PNG views from Aladin as scientific input;
- redistribute surveys whose terms do not explicitly permit the intended use;
- merge UV, optical, narrow-band, near-IR, IR, radio, or other incompatible bands into one scientific product without an explicit composite recipe;
- replace source FITS with lossy visualization tiles in the qualification pipeline;
- rebuild the whole sky every time one new source arrives;
- delete or invalidate the currently published Sky Map HiPS generations.

## 3. Current system

The repository already provides most of the required foundation:

- Aladin Lite v3 is loaded by the frontend and currently pinned to version 3.8.2.
- `GlobalMosaicObservatory` renders the current Sky Map IVOA HiPS from `astro-derived` storage.
- `src/features/mosaic/domain/hips-surveys.ts` already lists Pan-STARRS DR1, Euclid Q1, 2MASS, AllWISE, and GALEX as external HiPS references.
- `docs/hips-mosaic-architecture.md` already separates direct HiPS federation from scientific FITS ingestion.
- The science worker already ingests public archives through provider adapters for MAST, IRSA, ESO, and NOIRLab.
- Rights, provenance, checksums, source identifiers, and redistribution eligibility already exist in the public-archive ingestion model.
- The hourly GitHub workflow currently automates MAST and IRSA; ESO and NOIRLab are manual.
- The proprietary HiPS publication path is immutable, versioned, and based on Hipsgen.

At design time, production Supabase contains:

- 833 `public_archive` uploads;
- 14 current masters;
- 265 sources contributing to current masters;
- active archive runs from MAST, IRSA, and the existing Pan-STARRS/MAST path.

These existing assets must be reused rather than re-ingested unnecessarily.

## 4. Core architecture

The system is split into four planes.

### 4.1 Federated reference plane

A local registry stores metadata about approved external HiPS surveys. It does not store their image tiles by default.

Each registry record contains at least:

- `survey_id`
- `label`
- `hips_url`
- `moc_url` or equivalent coverage reference
- `waveband`
- `spectral_role`
- `hips_order`
- `spatial_resolution_arcsec` when known
- `coverage_class`
- `provider`
- `rights_uri`
- `attribution_text`
- `redistribution_policy`
- `federation_allowed`
- `ingestion_allowed`
- `enabled`
- `priority`
- `last_verified_at`

The first enabled registry entries are the already-approved product surveys:

- Pan-STARRS DR1 colour
- Euclid Q1 colour
- 2MASS colour
- AllWISE colour
- GALEX GR6/7 colour

Additional surveys are added only after metadata and rights verification.

The viewer requests these external HiPS datasets directly from their authoritative public endpoints. Supabase stores only the registry metadata and optional cached lightweight metadata such as MOC/properties, not the full survey tile pyramid.

### 4.2 Sky Map improvement plane

Sky Map's current IVOA HiPS remains a separate publication with immutable generations.

It is always identifiable as Sky Map data and keeps:

- source inventory checksum;
- generation checksum;
- Hipsgen version and checksum;
- source count;
- spectral filter/layer;
- provenance chain;
- MOC coverage;
- publication manifest.

The viewer composes this layer above the compatible public reference layer. Transparent/uncovered Sky Map cells expose the federated reference below them.

Sky Map never claims ownership of the external reference survey simply because it is displayed underneath.

### 4.3 Scientific ingestion plane

The existing public-archive pipeline continues to work with source FITS, not visualization tiles.

Provider adapters normalize discoveries to a common ObsCore-like contract. Before a candidate can enter Sky Map storage it must pass:

1. provider allowlist and HTTPS validation;
2. rights and redistribution policy validation;
3. product-type validation;
4. FITS signature validation;
5. celestial WCS validation;
6. spatial match validation;
7. duplicate detection by provider record ID and content SHA-256;
8. scientific qualification;
9. provenance persistence.

Existing providers remain:

- MAST
- IRSA
- ESO
- NOIRLab

The scheduler may automatically discover from all four providers, but ingestion must still be gated by the per-record rights decision.

### 4.4 Selection and promotion plane

A qualified source is not automatically published into the preferred Sky Map layer.

A promotion evaluator compares the new source or coadd against the currently preferred data covering the same region and spectral role.

The evaluator records measurable dimensions such as:

- astrometric validity;
- effective spatial resolution;
- finite-pixel fraction;
- SNR or equivalent quality proxy;
- depth/exposure proxy;
- seeing/FWHM where applicable;
- background quality;
- saturation/clipping indicators;
- coverage gain;
- spectral compatibility;
- calibration level;
- provenance completeness;
- rights compatibility.

A new contribution may be promoted when it provides a measurable benefit in at least one supported dimension without violating hard scientific constraints.

The decision is persisted with both the previous preferred source and the new candidate so the choice is auditable and reversible.

## 5. Viewer behavior

### 5.1 Default visual stack

For a given position and zoom level, the frontend uses this order:

1. best compatible external reference HiPS;
2. Sky Map proprietary HiPS above it;
3. optional catalog/vector overlays above both.

Sky Map uncovered pixels are transparent rather than rendered as a red scientific surface.

The red background remains available only as a diagnostics/debug visualization for truly uncovered regions or explicit developer mode.

### 5.2 Reference selection

The reference selector chooses an enabled survey using:

- waveband requested by the user;
- MOC coverage at the current sky position;
- survey priority;
- usable angular resolution at the current FoV;
- availability/health;
- product policy.

For the default optical view, Pan-STARRS is preferred where covered. A configured all-sky fallback is used outside its footprint.

A user may manually switch the reference survey or spectral view.

### 5.3 Layer identity

The UI must make provenance legible:

- external reference survey name and provider;
- Sky Map overlay state;
- attribution/rights link;
- optional source-count/quality information for Sky Map regions.

The external layer and Sky Map layer must never be presented as one undisclosed source.

## 6. Data model changes

New persistent concepts are required.

### 6.1 `hips_reference_surveys`

Purpose: approved external HiPS registry.

Suggested fields:

- `id` text primary key
- `label` text
- `provider` text
- `hips_url` text
- `moc_url` text nullable
- `waveband` text
- `spectral_role` text
- `hips_order` integer nullable
- `spatial_resolution_arcsec` double precision nullable
- `coverage_class` text
- `rights_uri` text
- `attribution_text` text
- `redistribution_policy` text
- `federation_allowed` boolean
- `ingestion_allowed` boolean
- `priority` integer
- `enabled` boolean
- `metadata` jsonb
- `last_verified_at` timestamptz
- timestamps

Public read access may be allowed for the subset needed by the viewer. Mutations remain service-only/admin-only.

### 6.2 `mosaic_quality_decisions`

Purpose: immutable/auditable record of promotion decisions.

Suggested fields:

- `id` uuid
- `object_id` text nullable
- `spectral_role` text
- `coverage_key` text or region identifier
- `candidate_upload_id` uuid nullable
- `candidate_master_id` uuid nullable
- `previous_master_id` uuid nullable
- `decision` text (`promote`, `retain`, `reject`, `needs_review`)
- `reason_codes` text[]
- `quality_metrics` jsonb
- `policy_version` text
- `created_at` timestamptz

This table records decisions; it must not become a mutable source-of-truth replacement for current master pointers.

### 6.3 Existing tables

Existing `astro_uploads`, `archive_ingest_runs`, `archive_items`, `astro_masters`, `mosaic_generations`, and storage paths remain authoritative for source and product lineage.

No migration should duplicate existing source metadata that already has a stable home.

## 7. External survey registry synchronization

A scheduled registry-sync task refreshes metadata for approved public HiPS surveys.

It must:

- fetch only metadata endpoints required to verify the configured surveys;
- validate HTTPS URLs and expected providers;
- update health, order, coverage metadata, and attribution;
- never auto-enable a newly discovered survey solely because it exists in an external registry;
- never change a rights policy from restrictive to permissive without an explicit code/config policy update;
- retain the last known valid metadata if an external registry is temporarily unavailable.

This keeps external discovery separate from rights approval.

## 8. Archive ingestion strategy

### 8.1 Scheduling

Replace the M31-only automatic emphasis with a coverage-driven queue.

The scheduler identifies regions where:

- Sky Map has no proprietary coverage;
- Sky Map quality is lower than an available public source;
- a new provider release may improve an existing region;
- a target/object has recent user interest or is already part of the active catalog.

The scheduler emits bounded ingestion jobs rather than one unbounded whole-sky crawl.

### 8.2 Provider automation

MAST and IRSA remain automatic.

ESO and NOIRLab become eligible for automatic discovery, but each candidate still requires `redistribution_allowed = true` before source storage.

A provider outage or rights ambiguity results in a skipped/deferred candidate, not a failed global run.

### 8.3 Deduplication

Deduplication uses both:

- stable provider record identity;
- SHA-256 of downloaded content.

The same physical FITS discovered through two routes must not create duplicate scientific uploads.

## 9. Quality policy

The quality policy must be versioned and deterministic.

Hard rejection examples:

- invalid or missing celestial WCS;
- spatial mismatch;
- corrupted FITS;
- incompatible/unknown rights;
- known copyrighted collection blocked by policy;
- scientifically unusable finite-pixel fraction;
- spectral mismatch with the target layer.

Promotion scoring uses only metrics that can be reproduced from persisted source data or metadata.

A higher score must not override a hard rejection.

The initial implementation should reuse existing qualification metrics wherever possible instead of inventing a parallel science pipeline.

## 10. Spectral model

At minimum, maintain distinct roles for:

- optical broadband/reference colour;
- narrow-band H-alpha;
- narrow-band OIII;
- narrow-band SII;
- ultraviolet;
- near infrared;
- infrared.

Additional roles can be added later.

Public colour HiPS datasets are viewer references. Scientific FITS are assigned to a spectral role before they can participate in a Sky Map coadd.

Cross-band composites are presentation recipes, not source-level coadds.

## 11. HiPS publication model

Sky Map publication stays generation-immutable and atomic.

For each scientific layer:

1. prepare a new generation under a unique storage prefix;
2. build/update Hipsgen products;
3. validate `properties`, MOC, tile hierarchy, checksums, source inventory, and visual derivatives;
4. verify generation/source counts;
5. atomically move the current pointer only after all validation succeeds;
6. keep the previous valid generation available for rollback;
7. prune obsolete heavy generations only after the retention policy says they are no longer needed.

Incremental updates should prefer Hipsgen-supported append/update behavior where scientifically safe, while still producing an immutable published generation.

## 12. Failure handling

External dependencies must fail independently.

Examples:

- CDN/HiPS reference unavailable: use next eligible reference survey;
- registry metadata unavailable: use last verified registry metadata;
- one provider ingestion fails: do not block other providers;
- new Sky Map generation fails validation: keep current generation active;
- promotion evaluation fails: retain current preferred product;
- rights state unclear: do not ingest or redistribute;
- duplicate source: record/reuse existing lineage instead of storing again.

No error path should leave a partially activated HiPS generation.

## 13. Security and abuse controls

- External archive download hosts remain allowlisted per provider.
- URL schemes must remain HTTPS.
- Download byte budgets remain enforced.
- FITS validation occurs before persistence as a qualified source.
- Service-role/database credentials stay server-side and short-lived where current workflows already use temporary credentials.
- Reference-survey configuration mutations are not exposed to anonymous clients.
- Any cached external metadata is treated as untrusted input and validated before use.

## 14. Performance and storage

The architecture deliberately avoids bulk replication of public HiPS tile pyramids.

Primary optimizations:

- direct external HiPS federation for baseline rendering;
- local MOC/metadata for fast coverage selection;
- immutable CDN-cacheable Sky Map HiPS URLs;
- bounded archive discovery/ingestion jobs;
- source and content deduplication;
- no full-sky rebuild for every contribution;
- deletion of superseded heavy derived artifacts only after safe retirement.

Supabase should store scientific sources and Sky Map-derived products, not a redundant mirror of all public survey pixels.

## 15. Proposed code boundaries

Expected implementation areas:

Frontend:

- `src/features/mosaic/components/GlobalMosaicObservatory.tsx`
- `src/features/mosaic/domain/hips-surveys.ts`
- `src/features/mosaic/domain/ivoa-hips.ts`
- `src/features/mosaic/lib/aladin-lite.ts`
- new reference-survey selection/service modules under `src/features/mosaic/`

Science worker:

- `workers/science/src/sky_worker/public_archives.py`
- `workers/science/src/sky_worker/public_archive_ingest.py`
- existing mosaic/qualification handlers where quality decisions belong
- focused new modules for reference registry sync and promotion evaluation if needed

Database:

- new migration(s) for reference surveys and quality-decision audit records
- generated Supabase TypeScript types after schema changes

Automation:

- `.github/workflows/ingest-public-archives.yml`
- a dedicated lightweight HiPS registry synchronization workflow if necessary
- existing HiPS build workflow only where publication orchestration must change

Unrelated application areas must not be refactored.

## 16. Test strategy

### Unit tests

- reference selection by band, coverage, and priority;
- registry metadata validation;
- rights-policy fail-closed behavior;
- duplicate detection;
- deterministic quality decisions;
- hard-rejection precedence over scores;
- fallback reference selection;
- spectral compatibility.

### Integration tests

- public archive candidate -> normalization -> rights gate -> registration;
- qualified source -> promotion decision -> generation request;
- failed generation leaves current pointer unchanged;
- valid generation publishes atomically;
- external HiPS outage falls back without breaking Sky Map overlay.

### Frontend tests

- default external reference plus Sky Map overlay;
- layer identity/attribution visible;
- manual survey switch;
- uncovered Sky Map cells expose reference layer;
- diagnostic no-coverage mode remains possible.

### Validation before merge

At minimum:

- lint;
- TypeScript typecheck;
- frontend tests;
- science worker pytest suite;
- targeted provider adapter tests;
- migration/schema validation;
- production build;
- GitHub Actions checks;
- Vercel preview check;
- no production data mutation from PR validation jobs.

## 17. Rollout

### Phase 1 — federated viewer

- introduce approved reference-survey registry;
- render external reference as base layer;
- render Sky Map HiPS as overlay;
- remove red as the normal uncovered-sky presentation;
- expose attribution and layer status.

### Phase 2 — registry and policy automation

- synchronize approved HiPS metadata;
- persist rights/health/coverage metadata;
- add deterministic reference selection and fallback.

### Phase 3 — coverage-driven ingestion

- generalize automatic discovery beyond the M31-only emphasis;
- enable bounded ESO/NOIRLab automatic discovery under fail-closed rights rules;
- prioritize gaps and measurable quality opportunities.

### Phase 4 — quality-based promotion

- add versioned quality decision policy;
- record promotion decisions;
- connect accepted improvements to the HiPS generation pipeline.

### Phase 5 — continuous enrichment

- repeatedly discover, qualify, deduplicate, compare, and publish improvements;
- prune obsolete heavy derived generations after retention conditions are met;
- keep all source lineage and attribution auditable.

## 18. Acceptance criteria

The implementation is complete when all of the following are true:

1. The main sky viewer has useful public reference coverage wherever an approved external survey covers the position.
2. Sky Map proprietary HiPS renders above that reference and remains visually/scientifically identifiable.
3. Existing 833 public-archive uploads remain reusable and are not duplicated by the rollout.
4. New archive FITS continue to enter through rights/provenance/scientific validation.
5. A new source cannot replace existing preferred Sky Map data without a persisted deterministic quality decision.
6. Spectrally incompatible sources are not coadded into the same scientific layer.
7. A failed external provider does not break the entire viewer or ingestion cycle.
8. A failed Sky Map build cannot replace the last valid published generation.
9. Public HiPS surveys are federated by default rather than bulk mirrored.
10. Rights and attribution are visible/auditable for both external references and ingested public sources.
11. All required CI, tests, typechecks, builds, migration checks, and preview checks pass before merge.
12. No direct write is made to `main`; implementation lands through a dedicated branch and PR only.

## 19. Rollback

Rollback is straightforward because the design preserves separation of layers:

- frontend rollback: revert reference-layer composition and continue rendering the existing Sky Map HiPS pointer;
- registry rollback: disable a survey record without deleting scientific data;
- ingestion rollback: stop new scheduled discovery while keeping existing qualified uploads;
- publication rollback: keep/repoint to the last known valid immutable HiPS generation;
- database rollback: schema migrations must be additive initially so feature rollback does not require destructive data removal.

No rollout phase depends on deleting the current production mosaic first.
