/**
 * Execute the real Cosmos SQL regression suite in an isolated PostgreSQL WASM
 * database. No production connection, credentials, or package changes are used.
 *
 * Optional test runtime, installed outside the checkout:
 *   npm install --prefix /tmp/cosmos-db @electric-sql/pglite
 *   COSMOS_PGLITE_MODULE=/tmp/cosmos-db/node_modules/@electric-sql/pglite/dist/index.js \
 *     node scripts/verify-cosmos-database.mjs
 *
 * An existing @electric-sql/pglite installation is also resolved normally.
 * Production Supabase runs PostgreSQL 17; report the test engine version so the
 * scope of this verification remains explicit.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const readMigration = (name) => readFile(resolve(repo, "supabase/migrations", name), "utf8");

function excerpt(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  if (first < 0 || last < 0) throw new Error(`Historical schema excerpt missing: ${start}`);
  return source.slice(first, last);
}

async function createDatabase(PGlite) {
  const db = new PGlite();
  // Auth/storage/astro stubs satisfy FKs without reimplementing Cosmos itself.
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema private;
    create schema storage;
    create table auth.users(id uuid primary key default gen_random_uuid());
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant usage on schema private to service_role;
    create table public.astro_uploads(id uuid primary key);
    create table public.astro_objects(id text primary key);
  `);
  await db.exec(await readMigration("20260808000002_cosmos_live.sql"));
  const science = await readMigration("20260808234639_complete_science_platform.sql");
  await db.exec(
    excerpt(
      science,
      "create table if not exists public.processing_jobs (",
      "create table if not exists public.moderation_events (",
    ),
  );
  await db.exec(
    excerpt(
      science,
      "alter table public.cosmos_events add column if not exists cluster_key text;",
      "-- Legacy statistics",
    ),
  );
  await db.exec(
    excerpt(
      science,
      "-- Exact observer coordinates remain private.",
      "create or replace function private.enqueue_astro_upload()",
    ),
  );
  await db.exec(
    excerpt(
      science,
      "create or replace function private.enqueue_cosmos_observation()",
      "-- Existing privileged functions",
    ),
  );
  await db.exec(
    excerpt(
      science,
      "create or replace function private.can_transition(",
      "create or replace function private.claim_approved_upload(",
    ),
  );
  await db.exec(`
    alter function public.update_event_observation_count() set search_path = '';
    revoke all on function public.get_recent_observations(double precision,double precision,double precision,integer,integer) from public, anon, authenticated;
    revoke all on function public.get_active_events(integer) from public, anon, authenticated;
    revoke all on function public.get_public_cosmos_observations(integer,integer), public.get_public_cosmos_events(integer,integer) from public;
    grant execute on function public.get_public_cosmos_observations(integer,integer), public.get_public_cosmos_events(integer,integer) to anon, authenticated, service_role;
    alter table public.processing_jobs enable row level security;
    alter table public.processing_job_events enable row level security;
    grant select on public.processing_jobs,public.processing_job_events to authenticated;
    grant all on public.processing_jobs,public.processing_job_events to service_role;
    grant usage, select on all sequences in schema public to service_role;
    create policy owners_read_jobs on public.processing_jobs for select to authenticated using ((select auth.uid())=owner_user_id);
    create policy owners_read_job_events on public.processing_job_events for select to authenticated using (exists(select 1 from public.processing_jobs j where j.id=job_id and j.owner_user_id=(select auth.uid())));
    revoke all on all functions in schema private from public, anon, authenticated;
    grant execute on all functions in schema private to service_role;
  `);
  for (const name of [
    "20260809173500_isolate_inline_archive_jobs.sql",
    "20260907041000_exact_processing_job_lease.sql",
    "20260907043000_queue_recovery_rpc.sql",
    "20261106103815_cosmos_live_runtime.sql",
  ]) {
    await db.exec(await readMigration(name));
  }
  return db;
}

const modulePath = process.env["COSMOS_PGLITE_MODULE"];
const moduleName = modulePath ? pathToFileURL(resolve(modulePath)).href : "@electric-sql/pglite";
let PGlite;
try {
  ({ PGlite } = await import(moduleName));
} catch {
  throw new Error(
    "PGlite is optional. Install it outside the checkout and set COSMOS_PGLITE_MODULE to its dist/index.js file; see this script's header.",
  );
}

const db = await createDatabase(PGlite);
try {
  const { rows: version } = await db.query("select version() as engine");
  console.log(version[0].engine);
  const suite = await readFile(
    resolve(repo, "supabase/tests/database/cosmos_live_runtime.test.sql"),
    "utf8",
  );
  const results = await db.exec(suite);
  const result = results
    .flatMap((entry) => entry.rows ?? [])
    .find((row) => "passed_assertions" in row);
  if (!result || Number(result.passed_assertions) < 60)
    throw new Error("Cosmos SQL assertions did not run.");
  const { rows } = await db.query(
    "select (select count(*) from auth.users)::int as users, (select count(*) from public.cosmos_observations)::int as observations, (select count(*) from public.processing_jobs)::int as jobs",
  );
  if (Object.values(rows[0]).some((count) => count !== 0))
    throw new Error("Regression fixtures were not rolled back.");
  console.log(
    `Cosmos SQL: ${result.passed_assertions} assertions passed; all fixtures rolled back.`,
  );
} finally {
  await db.close();
}
