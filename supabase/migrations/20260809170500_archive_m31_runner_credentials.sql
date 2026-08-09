-- Allow the production-only M31 workflow to obtain a short-lived, least-privilege
-- PostgreSQL login using the service-role API key already stored in GitHub.
-- The login is disabled after every run and its password expires automatically if
-- a runner disappears before the cleanup step.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'archive_m31_runner') then
    create role archive_m31_runner nologin;
  end if;
end
$$;

grant connect on database postgres to archive_m31_runner;
grant usage on schema public, private to archive_m31_runner;

grant select on table
  public.archive_sources,
  public.archive_items,
  public.astro_objects,
  public.astrometric_solutions,
  public.astro_upload_cells,
  public.astro_uploads
to archive_m31_runner;

grant select, update on table public.archive_ingest_runs
to archive_m31_runner;

grant select, insert, update on table
  public.processing_jobs,
  public.mosaic_layers,
  public.mosaic_generations,
  public.mosaic_tiles,
  public.astro_masters
to archive_m31_runner;

grant usage, select on all sequences in schema public to archive_m31_runner;

grant execute on function private.heartbeat_processing_job(uuid, text, integer, integer)
  to archive_m31_runner;
grant execute on function private.transition_processing_job(uuid, text, integer, text, integer, jsonb)
  to archive_m31_runner;
grant execute on function private.fail_processing_job(uuid, text, integer, text, text, integer)
  to archive_m31_runner;
grant execute on function private.activate_archive_master_generation(uuid, uuid)
  to archive_m31_runner;

drop policy if exists archive_m31_runner_sources on public.archive_sources;
create policy archive_m31_runner_sources
on public.archive_sources for select to archive_m31_runner
using (id = 'mast-ps1');

drop policy if exists archive_m31_runner_objects on public.astro_objects;
create policy archive_m31_runner_objects
on public.astro_objects for select to archive_m31_runner
using (id = 'M31');

drop policy if exists archive_m31_runner_runs on public.archive_ingest_runs;
create policy archive_m31_runner_runs
on public.archive_ingest_runs for all to archive_m31_runner
using (object_id = 'M31' and source_id = 'mast-ps1')
with check (object_id = 'M31' and source_id = 'mast-ps1');

drop policy if exists archive_m31_runner_items on public.archive_items;
create policy archive_m31_runner_items
on public.archive_items for select to archive_m31_runner
using (
  exists (
    select 1
    from public.archive_ingest_runs r
    where r.id = archive_items.ingest_run_id
      and r.object_id = 'M31'
      and r.source_id = 'mast-ps1'
  )
);

drop policy if exists archive_m31_runner_uploads on public.astro_uploads;
create policy archive_m31_runner_uploads
on public.astro_uploads for select to archive_m31_runner
using (object_id = 'M31' and source_kind = 'public_archive');

drop policy if exists archive_m31_runner_solutions on public.astrometric_solutions;
create policy archive_m31_runner_solutions
on public.astrometric_solutions for select to archive_m31_runner
using (
  exists (
    select 1
    from public.astro_uploads u
    where u.id = astrometric_solutions.upload_id
      and u.object_id = 'M31'
      and u.source_kind = 'public_archive'
  )
);

drop policy if exists archive_m31_runner_cells on public.astro_upload_cells;
create policy archive_m31_runner_cells
on public.astro_upload_cells for select to archive_m31_runner
using (
  exists (
    select 1
    from public.astro_uploads u
    where u.id = astro_upload_cells.upload_id
      and u.object_id = 'M31'
      and u.source_kind = 'public_archive'
  )
);

drop policy if exists archive_m31_runner_jobs on public.processing_jobs;
create policy archive_m31_runner_jobs
on public.processing_jobs for all to archive_m31_runner
using (
  object_id = 'M31'
  and job_type = 'publish_mosaic'
  and payload->>'mode' = 'build_archive_v9'
  and idempotency_key like 'archive-mosaic-v9:%'
)
with check (
  object_id = 'M31'
  and job_type = 'publish_mosaic'
  and payload->>'mode' = 'build_archive_v9'
  and idempotency_key like 'archive-mosaic-v9:%'
);

drop policy if exists archive_m31_runner_layers on public.mosaic_layers;
create policy archive_m31_runner_layers
on public.mosaic_layers for all to archive_m31_runner
using (slug like 'm31-ps1-%')
with check (slug like 'm31-ps1-%');

drop policy if exists archive_m31_runner_generations on public.mosaic_generations;
create policy archive_m31_runner_generations
on public.mosaic_generations for all to archive_m31_runner
using (
  exists (
    select 1
    from public.mosaic_layers l
    where l.id = mosaic_generations.layer_id and l.slug like 'm31-ps1-%'
  )
)
with check (
  exists (
    select 1
    from public.mosaic_layers l
    where l.id = mosaic_generations.layer_id and l.slug like 'm31-ps1-%'
  )
);

drop policy if exists archive_m31_runner_tiles on public.mosaic_tiles;
create policy archive_m31_runner_tiles
on public.mosaic_tiles for all to archive_m31_runner
using (
  exists (
    select 1
    from public.mosaic_generations g
    join public.mosaic_layers l on l.id = g.layer_id
    where g.id = mosaic_tiles.generation_id and l.slug like 'm31-ps1-%'
  )
)
with check (
  exists (
    select 1
    from public.mosaic_generations g
    join public.mosaic_layers l on l.id = g.layer_id
    where g.id = mosaic_tiles.generation_id and l.slug like 'm31-ps1-%'
  )
);

drop policy if exists archive_m31_runner_masters on public.astro_masters;
create policy archive_m31_runner_masters
on public.astro_masters for all to archive_m31_runner
using (object_id = 'M31')
with check (object_id = 'M31');

create or replace function public.issue_archive_m31_runner_credential()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  credential text := encode(extensions.gen_random_bytes(32), 'hex');
  expires_at timestamptz := clock_timestamp() + interval '4 hours';
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('archive_m31_runner_credential', 0)
  );

  execute format(
    'alter role archive_m31_runner login password %L valid until %L',
    credential,
    expires_at
  );

  return jsonb_build_object(
    'username', 'archive_m31_runner.olnkshywagvxzolndtsg',
    'password', credential,
    'expires_at', expires_at
  );
end
$$;

alter function public.issue_archive_m31_runner_credential() owner to postgres;
revoke all on function public.issue_archive_m31_runner_credential()
  from public, anon, authenticated;
grant execute on function public.issue_archive_m31_runner_credential()
  to service_role;

create or replace function public.revoke_archive_m31_runner_credential()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('archive_m31_runner_credential', 0)
  );

  execute 'alter role archive_m31_runner nologin password null valid until ''1970-01-01 00:00:00+00''';
  return true;
end
$$;

alter function public.revoke_archive_m31_runner_credential() owner to postgres;
revoke all on function public.revoke_archive_m31_runner_credential()
  from public, anon, authenticated;
grant execute on function public.revoke_archive_m31_runner_credential()
  to service_role;

comment on function public.issue_archive_m31_runner_credential() is
  'Issues a rotating four-hour PostgreSQL credential for the bounded M31 archive runner.';
comment on function public.revoke_archive_m31_runner_credential() is
  'Immediately disables the bounded M31 archive runner credential.';

notify pgrst, 'reload schema';
