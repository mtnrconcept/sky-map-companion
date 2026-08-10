begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'archive_catalog_runner') then
    create role archive_catalog_runner nologin;
  end if;
end
$$;

grant connect on database postgres to archive_catalog_runner;
grant usage on schema public, private to archive_catalog_runner;

grant select on table public.archive_sources, public.astro_objects
  to archive_catalog_runner;
grant select, insert, update on table
  public.archive_ingest_runs,
  public.archive_items,
  public.astro_uploads,
  public.astrometric_solutions,
  public.astro_quality_metrics,
  public.processing_jobs,
  public.mosaic_layers,
  public.mosaic_generations,
  public.mosaic_tiles,
  public.astro_masters
  to archive_catalog_runner;
grant select, insert, update, delete on table public.astro_upload_cells
  to archive_catalog_runner;
grant usage, select on all sequences in schema public to archive_catalog_runner;

alter role archive_catalog_runner set extra_float_digits = 3;

grant execute on function private.heartbeat_processing_job(uuid, text, integer, integer)
  to archive_catalog_runner;
grant execute on function private.transition_processing_job(uuid, text, integer, text, integer, jsonb)
  to archive_catalog_runner;
grant execute on function private.fail_processing_job(uuid, text, integer, text, text, integer)
  to archive_catalog_runner;
grant execute on function private.claim_approved_upload(uuid)
  to archive_catalog_runner;
grant execute on function private.reset_archive_master_retry_stage(uuid, text, integer)
  to archive_catalog_runner;
grant execute on function private.activate_archive_master_generation(uuid, uuid)
  to archive_catalog_runner;

drop policy if exists archive_catalog_runner_sources on public.archive_sources;
create policy archive_catalog_runner_sources
on public.archive_sources for select to archive_catalog_runner
using (id = 'mast-ps1');

drop policy if exists archive_catalog_runner_objects on public.astro_objects;
create policy archive_catalog_runner_objects
on public.astro_objects for select to archive_catalog_runner
using (true);

drop policy if exists archive_catalog_runner_runs on public.archive_ingest_runs;
create policy archive_catalog_runner_runs
on public.archive_ingest_runs for all to archive_catalog_runner
using (source_id = 'mast-ps1')
with check (source_id = 'mast-ps1');

drop policy if exists archive_catalog_runner_items on public.archive_items;
create policy archive_catalog_runner_items
on public.archive_items for all to archive_catalog_runner
using (
  source_id = 'mast-ps1'
  and exists (
    select 1 from public.archive_ingest_runs r
    where r.id = archive_items.ingest_run_id
      and r.source_id = 'mast-ps1'
      and r.object_id = archive_items.object_id
  )
)
with check (
  source_id = 'mast-ps1'
  and exists (
    select 1 from public.archive_ingest_runs r
    where r.id = archive_items.ingest_run_id
      and r.source_id = 'mast-ps1'
      and r.object_id = archive_items.object_id
  )
);

drop policy if exists archive_catalog_runner_uploads on public.astro_uploads;
create policy archive_catalog_runner_uploads
on public.astro_uploads for all to archive_catalog_runner
using (
  source_kind = 'public_archive'
  and archive_item_id is not null
  and exists (
    select 1 from public.archive_items i
    where i.id = astro_uploads.archive_item_id
      and i.source_id = 'mast-ps1'
      and i.object_id = astro_uploads.object_id
  )
)
with check (
  source_kind = 'public_archive'
  and user_id is null
  and licence_code = 'PUBLIC-ARCHIVE'
  and archive_item_id is not null
  and exists (
    select 1 from public.archive_items i
    where i.id = astro_uploads.archive_item_id
      and i.source_id = 'mast-ps1'
      and i.object_id = astro_uploads.object_id
  )
);

drop policy if exists archive_catalog_runner_solutions on public.astrometric_solutions;
create policy archive_catalog_runner_solutions
on public.astrometric_solutions for all to archive_catalog_runner
using (
  exists (
    select 1 from public.astro_uploads u
    join public.archive_items i on i.id = u.archive_item_id
    where u.id = astrometric_solutions.upload_id
      and u.source_kind = 'public_archive'
      and i.source_id = 'mast-ps1'
  )
)
with check (
  exists (
    select 1 from public.astro_uploads u
    join public.archive_items i on i.id = u.archive_item_id
    where u.id = astrometric_solutions.upload_id
      and u.source_kind = 'public_archive'
      and i.source_id = 'mast-ps1'
  )
);

drop policy if exists archive_catalog_runner_quality on public.astro_quality_metrics;
create policy archive_catalog_runner_quality
on public.astro_quality_metrics for all to archive_catalog_runner
using (
  exists (
    select 1 from public.astro_uploads u
    join public.archive_items i on i.id = u.archive_item_id
    where u.id = astro_quality_metrics.upload_id
      and u.source_kind = 'public_archive'
      and i.source_id = 'mast-ps1'
  )
)
with check (
  exists (
    select 1 from public.astro_uploads u
    join public.archive_items i on i.id = u.archive_item_id
    where u.id = astro_quality_metrics.upload_id
      and u.source_kind = 'public_archive'
      and i.source_id = 'mast-ps1'
  )
);

drop policy if exists archive_catalog_runner_cells on public.astro_upload_cells;
create policy archive_catalog_runner_cells
on public.astro_upload_cells for all to archive_catalog_runner
using (
  exists (
    select 1 from public.astro_uploads u
    join public.archive_items i on i.id = u.archive_item_id
    where u.id = astro_upload_cells.upload_id
      and u.source_kind = 'public_archive'
      and i.source_id = 'mast-ps1'
  )
)
with check (
  exists (
    select 1 from public.astro_uploads u
    join public.archive_items i on i.id = u.archive_item_id
    where u.id = astro_upload_cells.upload_id
      and u.source_kind = 'public_archive'
      and i.source_id = 'mast-ps1'
  )
);

drop policy if exists archive_catalog_runner_jobs on public.processing_jobs;
create policy archive_catalog_runner_jobs
on public.processing_jobs for all to archive_catalog_runner
using (
  (
    job_type = 'qualify_upload'
    and upload_id is not null
    and exists (
      select 1 from public.astro_uploads u
      join public.archive_items i on i.id = u.archive_item_id
      where u.id = processing_jobs.upload_id
        and u.source_kind = 'public_archive'
        and i.source_id = 'mast-ps1'
    )
  )
  or (
    job_type = 'publish_mosaic'
    and object_id is not null
    and payload->>'mode' = 'build_archive_v9'
    and idempotency_key like 'archive-mosaic-v9:%'
  )
)
with check (
  (
    job_type = 'qualify_upload'
    and upload_id is not null
    and exists (
      select 1 from public.astro_uploads u
      join public.archive_items i on i.id = u.archive_item_id
      where u.id = processing_jobs.upload_id
        and u.source_kind = 'public_archive'
        and i.source_id = 'mast-ps1'
    )
  )
  or (
    job_type = 'publish_mosaic'
    and object_id is not null
    and payload->>'mode' = 'build_archive_v9'
    and idempotency_key like 'archive-mosaic-v9:%'
  )
);

drop policy if exists archive_catalog_runner_layers on public.mosaic_layers;
create policy archive_catalog_runner_layers
on public.mosaic_layers for all to archive_catalog_runner
using (slug like '%-ps1-%')
with check (slug like '%-ps1-%' and spectral_band = any(array['g','r','i','z','y']));

drop policy if exists archive_catalog_runner_generations on public.mosaic_generations;
create policy archive_catalog_runner_generations
on public.mosaic_generations for all to archive_catalog_runner
using (
  exists (
    select 1 from public.mosaic_layers l
    where l.id = mosaic_generations.layer_id
      and l.slug like '%-ps1-%'
  )
)
with check (
  exists (
    select 1 from public.mosaic_layers l
    where l.id = mosaic_generations.layer_id
      and l.slug like '%-ps1-%'
  )
);

drop policy if exists archive_catalog_runner_tiles on public.mosaic_tiles;
create policy archive_catalog_runner_tiles
on public.mosaic_tiles for all to archive_catalog_runner
using (
  exists (
    select 1
    from public.mosaic_generations g
    join public.mosaic_layers l on l.id = g.layer_id
    where g.id = mosaic_tiles.generation_id
      and l.slug like '%-ps1-%'
  )
)
with check (
  exists (
    select 1
    from public.mosaic_generations g
    join public.mosaic_layers l on l.id = g.layer_id
    where g.id = mosaic_tiles.generation_id
      and l.slug like '%-ps1-%'
  )
);

drop policy if exists archive_catalog_runner_masters on public.astro_masters;
create policy archive_catalog_runner_masters
on public.astro_masters for all to archive_catalog_runner
using (
  mosaic_generation_id is not null
  and archive_ingest_run_id is not null
  and exists (
    select 1
    from public.mosaic_generations g
    join public.mosaic_layers l on l.id = g.layer_id
    where g.id = astro_masters.mosaic_generation_id
      and l.slug like lower(astro_masters.object_id) || '-ps1-%'
  )
  and exists (
    select 1 from public.archive_ingest_runs r
    where r.id = astro_masters.archive_ingest_run_id
      and r.object_id = astro_masters.object_id
      and r.source_id = 'mast-ps1'
  )
)
with check (
  mosaic_generation_id is not null
  and archive_ingest_run_id is not null
  and exists (
    select 1
    from public.mosaic_generations g
    join public.mosaic_layers l on l.id = g.layer_id
    where g.id = astro_masters.mosaic_generation_id
      and l.slug like lower(astro_masters.object_id) || '-ps1-%'
  )
  and exists (
    select 1 from public.archive_ingest_runs r
    where r.id = astro_masters.archive_ingest_run_id
      and r.object_id = astro_masters.object_id
      and r.source_id = 'mast-ps1'
  )
);

create or replace function public.issue_archive_catalog_runner_credential()
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
    pg_catalog.hashtextextended('archive_catalog_runner_credential', 0)
  );

  execute format(
    'alter role archive_catalog_runner login password %L valid until %L',
    credential,
    expires_at
  );

  return jsonb_build_object(
    'username', 'archive_catalog_runner.olnkshywagvxzolndtsg',
    'password', credential,
    'expires_at', expires_at
  );
end
$$;

alter function public.issue_archive_catalog_runner_credential() owner to postgres;
revoke all on function public.issue_archive_catalog_runner_credential()
  from public, anon, authenticated;
grant execute on function public.issue_archive_catalog_runner_credential()
  to service_role;

create or replace function public.revoke_archive_catalog_runner_credential()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('archive_catalog_runner_credential', 0)
  );
  execute 'alter role archive_catalog_runner nologin password null valid until ''1970-01-01 00:00:00+00''';
  return true;
end
$$;

alter function public.revoke_archive_catalog_runner_credential() owner to postgres;
revoke all on function public.revoke_archive_catalog_runner_credential()
  from public, anon, authenticated;
grant execute on function public.revoke_archive_catalog_runner_credential()
  to service_role;

comment on function public.issue_archive_catalog_runner_credential() is
  'Issues a rotating four-hour PostgreSQL credential limited to PS1 catalogue ingestion, qualification and immutable mosaic publication.';
comment on function public.revoke_archive_catalog_runner_credential() is
  'Immediately disables the bounded PS1 catalogue mosaic runner credential.';

notify pgrst, 'reload schema';

commit;
