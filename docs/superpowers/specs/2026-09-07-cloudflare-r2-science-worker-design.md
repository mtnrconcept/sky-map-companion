# Cloudflare R2 Science Worker Architecture

Date: 2026-09-07
Status: proposed

## Goal

Move Sky Map's heavy astronomical file storage and scientific processing away from a Windows-only worker and Supabase Storage, while preserving Supabase as the source of truth for relational metadata, authentication, job state, provenance and scientific decisions.

The target system must support large RAW/FITS uploads, astronomical plate solving, qualification, reprojection, stacking and HiPS generation without requiring the local Windows PC to stay online. It must also reduce storage and egress cost, preserve rollback, and allow a gradual migration with no big-bang cutover.

## Architecture

The target architecture has five responsibilities:

1. **Supabase** remains responsible for Postgres, Auth, RLS, `processing_jobs`, upload metadata, provenance, mosaic generations and quality decisions.
2. **Cloudflare R2** becomes the primary object store for RAW/FITS files, derived products, published HiPS trees, previews and durable scientific artifacts.
3. **Cloudflare Worker** provides lightweight orchestration: upload/session creation, signed object access, job enqueueing, queue status endpoints and health checks.
4. **Cloudflare Queue** decouples web requests from scientific processing and provides retry/backpressure semantics.
5. **Cloudflare Container** runs the existing Python science worker with Astrometry.net and the current scientific pipeline. The Windows Docker worker remains a temporary fallback during migration.

External public HiPS surveys used by Aladin remain federated from their authoritative providers and are never copied into R2.

## Data flow

### New upload

1. The application requests an upload session from the Cloudflare Worker.
2. The Worker validates user/session metadata and returns a short-lived R2 upload target.
3. The client uploads directly to R2. Large files do not transit through Vercel or Supabase Storage.
4. The Worker records or finalizes the corresponding `astro_uploads` row in Supabase with an immutable object key, byte size, checksum state and storage backend.
5. A `processing_jobs` row is created in Supabase.
6. The Worker enqueues a small message containing the job id, upload id and idempotency key.
7. A Queue consumer starts or addresses the Cloudflare Container.
8. The Python science worker leases the Supabase job, fetches the source from R2, processes it, writes derivatives to R2 and transitions the Supabase job normally.
9. Published HiPS products are exposed through Cloudflare with long immutable cache headers.

### Existing Supabase object

During migration, reads use this policy:

1. Try R2 first.
2. If absent, fall back to Supabase Storage.
3. Optionally copy the object to R2 in the background.
4. Verify byte size and SHA-256 before marking the object migrated.
5. Delete the Supabase copy only after verification and after the configured safety window.

This ensures the application stays available throughout migration.

## Storage abstraction

The Python worker must not contain R2-specific business logic. Introduce a narrow object storage interface used by the current Gateway layer.

Required operations:

- open/download immutable source objects;
- upload file streams and byte buffers;
- test object existence and metadata;
- return public or signed URLs where appropriate;
- delete objects through explicit retention workflows;
- copy/migrate objects while preserving checksums;
- support multipart uploads for large FITS files.

The initial implementations are:

- `SupabaseStorageBackend` for compatibility and fallback;
- `S3StorageBackend` for Cloudflare R2.

The S3 implementation must rely only on standard S3-compatible settings: endpoint, region, bucket, access key and secret. This keeps Backblaze B2, Hetzner Object Storage or another S3-compatible provider viable later without rewriting the scientific pipeline.

## R2 layout

Use separate buckets or clearly separated prefixes for different retention classes. Recommended logical classes:

- `sky-raw`: accepted or pending RAW/FITS and community source images;
- `sky-derived`: calibrated derivatives, previews and intermediate products that must persist beyond one container execution;
- `sky-hips`: immutable published HiPS generations;
- `sky-quarantine`: failed, unverified or moderation-held objects with short retention.

Object keys must remain deterministic and immutable. Replacing an existing object under the same key is forbidden for scientific artifacts.

Suggested patterns:

- `raw/{upload_id}/{sha256}/{filename}`
- `archive/{provider}/{archive_item_id}/{sha256}.fits`
- `derived/{object_id}/{pipeline_version}/{artifact_sha256}.{ext}`
- `hips/{layer_id}/{generation_id}/...`
- `quarantine/{upload_id}/{object_name}`

## Database compatibility

Supabase remains authoritative. Add only the metadata necessary to locate and verify objects across backends.

Recommended fields or equivalent normalized records:

- `storage_backend`: `supabase` or `r2`;
- `storage_bucket`;
- `storage_key`;
- `content_sha256`;
- `storage_migrated_at`;
- `storage_verified_at`;
- optional legacy Supabase path during migration.

Existing `storage_path` fields should remain readable during the transition. The migration must not invalidate old jobs or historical provenance.

## Queue semantics

Supabase `processing_jobs` remains the source of truth. Cloudflare Queue is an accelerator/notification mechanism, not the authoritative job database.

A queue message should contain only stable identifiers, for example:

```json
{
  "job_id": "uuid",
  "job_type": "qualify_upload",
  "idempotency_key": "string",
  "schema_version": 1
}
```

Before processing, the Container must still lease the job through the existing Supabase lease function. Duplicate Queue delivery therefore remains safe: a message that cannot acquire the lease becomes a no-op.

The Windows worker can coexist temporarily because it uses the same lease mechanism. Only one worker should process a given job.

## Cloudflare Container

The existing science Docker image is the starting point. It already contains the Python worker and Astrometry.net dependencies. The Cloudflare Container should run the same package rather than a forked implementation.

Container requirements:

- writable temporary space for Astrometry.net;
- bounded CPU and memory;
- local ephemeral cache for current processing;
- durable artifacts written to R2, not container disk;
- secrets injected by Cloudflare, never baked into the image;
- graceful shutdown and lease heartbeat handling;
- job timeout longer than expected astrometry/stacking duration;
- explicit maximum source and derivative sizes.

The Container must scale to zero when idle if supported by the chosen Cloudflare configuration. The goal is queue-driven compute, not a permanently running expensive process.

## Worker and API responsibilities

The Cloudflare Worker must remain lightweight and must not perform astronomical computation.

Responsibilities:

- authenticate application requests;
- validate upload metadata and allowed sizes/types;
- issue direct R2 upload targets or multipart upload sessions;
- finalize upload records and checksum metadata;
- enqueue jobs;
- expose health/status endpoints;
- create controlled signed download URLs for private RAW data;
- serve or route public immutable HiPS content with appropriate cache policy.

The Worker must reject attempts to overwrite immutable published artifacts.

## Scientific integrity

Moving storage must not change scientific admission rules.

The existing pipeline remains authoritative for:

- FITS/header validation;
- astrometric solving and WCS verification;
- duplicate detection;
- licence/provenance checks;
- quality scoring;
- band/filter compatibility;
- mosaic promotion/retain/reject decisions;
- HiPS generation rules.

A migrated object is scientifically identical only if its SHA-256 and byte size match the source record.

## Retention

Retention is required from day one to prevent R2 from reproducing the current Supabase accumulation problem.

Policies:

- published HiPS: active generation + one rollback generation by default;
- old immutable HiPS generations: deletion after verification/grace window;
- rejected/quarantined uploads: short retention unless legally/audit required;
- intermediate derivatives: delete after final artifact verification unless needed for reproducibility;
- archive RAW: retain only where reconstruction or provenance policy requires it;
- temporary container files: deleted with the container lifecycle.

All destructive deletion must operate through the object storage API and must be auditable.

## Migration strategy

### Phase 1 — abstraction, no production cutover

- Add object storage interface and S3-compatible backend.
- Keep Supabase Storage as default.
- Add unit/integration tests for immutable object writes, checksums and fallback reads.

### Phase 2 — R2 dual-read

- Provision R2 buckets and credentials.
- New code can read R2 first and fall back to Supabase.
- No deletion from Supabase.
- Validate performance and signed URL behavior.

### Phase 3 — new writes to R2

- New RAW uploads go directly to R2.
- New derivatives and HiPS go to R2.
- Supabase continues to store metadata and jobs.
- Windows worker and Cloudflare Container may both consume jobs using the lease contract.

### Phase 4 — historical migration

- Migrate existing `astro-raw` and `astro-derived` objects in batches.
- Verify SHA-256 and size for every object.
- Record migration state in Supabase.
- Prioritize current/active objects before obsolete generations.

### Phase 5 — Supabase Storage cleanup

- Keep a safety period after successful verification.
- Delete migrated Supabase copies through Storage API.
- Never delete active files based only on path assumptions.
- Recompute storage inventory after every batch.

### Phase 6 — cloud worker primary

- Cloudflare Queue/Container becomes the default science executor.
- Windows worker remains an optional disaster-recovery/manual worker.
- Monitor queue age, job failure rate, container start latency and R2 operation costs.

## Rollback

Every phase must be independently reversible.

- Phase 1: disable S3 backend configuration.
- Phase 2: switch read priority back to Supabase.
- Phase 3: route new writes back to Supabase while retaining R2 objects.
- Phase 4: stop migration jobs; no source object is deleted during copying.
- Phase 5: only verified objects are deleted after a safety window; R2 remains canonical for deleted legacy copies.
- Cloud compute: disable Queue consumer and restart Windows worker; Supabase job leases prevent duplicate processing.

No database migration should remove legacy storage columns until the complete migration has been stable for an extended period.

## Security

- R2 RAW buckets are private by default.
- Public access is limited to deliberately published HiPS/preview products.
- Upload URLs are short lived and scoped to one object key.
- Cloudflare Worker validates MIME type, declared size and user ownership before upload finalization.
- Supabase service-role/database credentials are available only to server-side Worker/Container code.
- R2 credentials are scoped to the minimum required buckets and operations.
- Cloudflare secrets and GitHub secrets must never be exposed to Vite/client bundles.
- All migration/deletion operations must be idempotent and logged.

## Cost controls

- Containers should be queue driven and idle at zero or the lowest practical footprint.
- Prefer direct client-to-R2 uploads so Vercel/Supabase do not proxy large payloads.
- Use immutable long-lived CDN caching for published HiPS.
- Do not copy external CDS/Aladin surveys.
- Apply generation retention automatically.
- Keep intermediate artifacts only when scientifically necessary.
- Use batching for R2 migration/list/delete operations to avoid excessive Class A/B requests.

## Observability

Expose and monitor:

- oldest queued job age;
- queue depth by job type;
- processing duration by stage;
- job retries and terminal failures;
- Container cold-start duration;
- bytes read/written to R2;
- R2 operation counts;
- migration objects/bytes pending, verified and deleted from legacy storage;
- HiPS active/rollback generation sizes;
- worker heartbeats and active leases.

Operational alerts should distinguish queue backlog, scientific rejection and infrastructure failure.

## Testing

Required automated coverage:

- S3/R2 backend contract tests;
- Supabase fallback-read tests;
- SHA-256 migration verification tests;
- immutable write conflict tests;
- direct upload finalization tests;
- duplicate Queue message/idempotency tests;
- worker lease competition tests (Windows vs Cloud Container);
- retention tests protecting active + rollback HiPS;
- migration dry-run tests;
- end-to-end small FITS qualification test using R2-compatible local object storage in CI where practical.

Before production cutover, validate a real M31 community upload from browser → R2 → Queue → Container → Astrometry.net → Supabase status → derivative/HiPS output.

## Files and components expected to change during implementation

Exact paths must be confirmed against the repository at implementation time. Expected areas include:

- Python Gateway/storage adapter under `workers/science/src/sky_worker/`;
- science worker configuration and tests;
- Cloudflare Worker/Queue/Container configuration;
- frontend AstroStack upload transport;
- Supabase migrations for backend/location/migration metadata;
- retention and migration scripts/workflows;
- deployment documentation and runbooks;
- CI for worker image and storage backend tests.

No unrelated frontend redesign or scientific algorithm rewrite is part of this migration.

## Success criteria

The migration is successful when:

1. A user can upload a large JPEG/FITS without Supabase Storage receiving the blob.
2. The upload is stored in R2 with verified size/checksum metadata.
3. Cloudflare Queue triggers the existing science worker in a Cloudflare Container.
4. Astrometry and qualification complete without the Windows PC running.
5. Derived products and HiPS are stored in R2 and published correctly.
6. Supabase still reflects all job states and scientific provenance.
7. Duplicate queue delivery cannot process a job twice.
8. Historical Supabase blobs can be migrated and checksum-verified before deletion.
9. Active + rollback HiPS remain protected by retention.
10. The Windows worker can still be used as a documented fallback during the transition.
