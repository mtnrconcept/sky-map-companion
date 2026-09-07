# Cloudflare science worker

## Scope

This runbook covers the Cloudflare Queue + Container execution path for the existing Python science worker and the R2 storage path used by AstroStack contributions. Supabase remains the source of truth for users, jobs, leases, state transitions, moderation, provenance and science metadata.

The Cloudflare path is optional. The Windows/Supabase worker remains the rollback path until the R2 migration and production pilot are explicitly accepted.

## Required Cloudflare resources

Provision these resources before a production deployment:

- Worker: `sky-map-science-orchestrator`.
- Queue: `sky-science-jobs`.
- Dead-letter queue: `sky-science-jobs-dlq`.
- Durable Object / Container class: `ScienceContainer`.
- Container image: `workers/science/Dockerfile`.
- Container instance type: `standard-3`.
- Container maximum instances: `2` for the initial pilot.
- R2 bucket `sky-raw` for immutable private originals.
- R2 bucket `sky-derived` for generated science artifacts.
- R2 bucket `sky-hips` for HiPS output.
- R2 bucket `sky-quarantine` for quarantined objects.

The scheduled recovery trigger is `*/5 * * * *`. Queue delivery remains the normal low-latency path; the cron only re-enqueues currently available jobs that have no live lease and are not marked `lease_scope=inline`.

## Required Worker secrets

Set these as Cloudflare Worker secrets or equivalent protected bindings. Never commit values:

- `DATABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

The R2 S3 credentials should be scoped to the science buckets and only the operations required by the Python worker. Browser clients never receive R2 S3 credentials or the Supabase server secret.

Non-secret configuration is defined in `cloudflare/science-orchestrator/wrangler.jsonc`, including `SUPABASE_URL`, R2 bucket names, pipeline version and resource limits.

## Database migrations

Apply migrations in order before enabling the browser edge URL:

1. `20260907042000_edge_r2_upload_registration.sql`
2. `20260907043000_queue_recovery_rpc.sql`

The registration migration adds storage locator metadata to `astro_uploads`, backfills existing rows as Supabase `astro-raw`, and creates the service-role-only `register_r2_astro_upload_edge` RPC. It does not move or delete legacy blobs.

The recovery migration creates the service-role-only bounded recovery RPC. It returns at most 100 available non-terminal jobs, excludes active leases and excludes `payload.lease_scope = 'inline'`.

## Pre-deployment verification

A production deployment must not be attempted until the PR CI is green for all of these gates:

- repository lint;
- repository TypeScript typecheck;
- frontend unit tests;
- frontend production build;
- full Python science tests;
- science worker Docker build;
- Cloudflare orchestrator TypeScript check;
- Cloudflare orchestrator unit tests;
- Wrangler deploy dry-run.

Also verify that the isolated M31 workflow remains green.

## Deployment order

1. Create the four R2 buckets, Queue, DLQ and Container resources.
2. Configure Cloudflare bindings and protected secrets.
3. Apply the two Supabase migrations.
4. Deploy the Cloudflare orchestrator with browser edge uploads still disabled.
5. Check `GET /health` and verify Queue/Container logs contain no credential values.
6. Submit one controlled science job directly to the Queue and verify exact leasing, state transitions and container shutdown.
7. Set `VITE_SCIENCE_EDGE_URL` only for the pilot environment and deploy the frontend.
8. Upload a small M31 contribution and verify R2 object size, `astro_uploads` storage locator, one `qualify_upload` job and normal qualification polling.
9. Test a multipart upload larger than one 16 MiB part and a browser refresh/resume.
10. Verify the five-minute recovery path by withholding one Queue delivery in a non-production fixture and confirming a later duplicate becomes an exact-lease no-op.

## M31 pilot acceptance

For the first real M31 contribution, capture and compare:

- upload ID and processing job ID;
- R2 raw key and byte size;
- pipeline version;
- extracted SHA-256 once the Python worker computes it;
- astrometry/quality outcome;
- generated derivative keys;
- job events and final status;
- Container start/stop events;
- Queue retry count.

Acceptance requires the science output to remain equivalent to the Supabase path and the database state machine to remain authoritative.

## Rollback

Rollback does not delete data.

1. Remove or unset `VITE_SCIENCE_EDGE_URL` and redeploy the frontend. New browser uploads immediately return to the existing Supabase TUS path.
2. Pause the `sky-science-jobs` Queue consumer and the five-minute scheduled trigger.
3. Set the science worker `STORAGE_PRIMARY=supabase`.
4. Restart the Windows science worker using the existing runbook/script.
5. Confirm new jobs are leased and processed by the Windows worker.
6. Keep all R2 objects and storage locator metadata intact for investigation or a later retry.

Do not delete a Supabase object merely because an R2 copy exists. Legacy object removal belongs to the separate migration/retention plan and requires verified SHA-256 equality plus its safety window.

## Operational invariants

- Supabase is the source of truth for processing state.
- Queue delivery is at-least-once; exact database leasing provides execution idempotency.
- `lease_scope=inline` jobs are never recovered by Cloudflare.
- R2 originals are immutable and private.
- A completed R2 upload is registered only after exact byte-size verification.
- Failed database registration after R2 completion leaves the object in place for safe replay.
- No server credential is exposed to browser code or health responses.
- Containers are destroyed after each one-shot job so idle compute returns to zero.
