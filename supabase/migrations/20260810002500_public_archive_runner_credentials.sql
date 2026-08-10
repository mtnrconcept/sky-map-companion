begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'archive_public_runner') then
    create role archive_public_runner nologin;
  end if;
end
$$;

grant connect on database postgres to archive_public_runner;
grant usage on schema public to archive_public_runner;

grant select on table public.archive_sources, public.astro_objects
  to archive_public_runner;
grant select, insert, update on table
  public.archive_ingest_runs,
  public.archive_items,
  public.astro_uploads
  to archive_public_runner;
grant usage, select on all sequences in schema public to archive_public_runner;

alter role archive_public_runner set extra_float_digits = 3;

drop policy if exists archive_public_runner_sources on public.archive_sources;
create policy archive_public_runner_sources
on public.archive_sources for select to archive_public_runner
using (id in ('eso','mast','irsa','noirlab'));

drop policy if exists archive_public_runner_objects on public.astro_objects;
create policy archive_public_runner_objects
on public.astro_objects for select to archive_public_runner
using (true);

drop policy if exists archive_public_runner_runs on public.archive_ingest_runs;
create policy archive_public_runner_runs
on public.archive_ingest_runs for all to archive_public_runner
using (source_id in ('eso','mast','irsa','noirlab'))
with check (source_id in ('eso','mast','irsa','noirlab'));

drop policy if exists archive_public_runner_items on public.archive_items;
create policy archive_public_runner_items
on public.archive_items for all to archive_public_runner
using (
  source_id in ('eso','mast','irsa','noirlab')
  and exists (
    select 1
    from public.archive_ingest_runs r
    where r.id = archive_items.ingest_run_id
      and r.source_id = archive_items.source_id
      and r.source_id in ('eso','mast','irsa','noirlab')
  )
)
with check (
  source_id in ('eso','mast','irsa','noirlab')
  and exists (
    select 1
    from public.archive_ingest_runs r
    where r.id = archive_items.ingest_run_id
      and r.source_id = archive_items.source_id
      and r.source_id in ('eso','mast','irsa','noirlab')
  )
);

drop policy if exists archive_public_runner_uploads on public.astro_uploads;
create policy archive_public_runner_uploads
on public.astro_uploads for all to archive_public_runner
using (
  source_kind = 'public_archive'
  and archive_item_id is not null
  and exists (
    select 1
    from public.archive_items i
    where i.id = astro_uploads.archive_item_id
      and i.source_id in ('eso','mast','irsa','noirlab')
  )
)
with check (
  source_kind = 'public_archive'
  and user_id is null
  and licence_code = 'PUBLIC-ARCHIVE'
  and archive_item_id is not null
  and exists (
    select 1
    from public.archive_items i
    where i.id = astro_uploads.archive_item_id
      and i.source_id in ('eso','mast','irsa','noirlab')
  )
);

create or replace function public.issue_archive_public_runner_credential()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions
as $$
declare
  credential text := encode(extensions.gen_random_bytes(32), 'hex');
  expires_at timestamptz := clock_timestamp() + interval '2 hours';
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('archive_public_runner_credential', 0)
  );

  execute format(
    'alter role archive_public_runner login password %L valid until %L',
    credential,
    expires_at
  );

  return jsonb_build_object(
    'username', 'archive_public_runner.olnkshywagvxzolndtsg',
    'password', credential,
    'expires_at', expires_at
  );
end
$$;

alter function public.issue_archive_public_runner_credential() owner to postgres;
revoke all on function public.issue_archive_public_runner_credential()
  from public, anon, authenticated;
grant execute on function public.issue_archive_public_runner_credential()
  to service_role;

create or replace function public.revoke_archive_public_runner_credential()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('archive_public_runner_credential', 0)
  );
  execute 'alter role archive_public_runner nologin password null valid until ''1970-01-01 00:00:00+00''';
  return true;
end
$$;

alter function public.revoke_archive_public_runner_credential() owner to postgres;
revoke all on function public.revoke_archive_public_runner_credential()
  from public, anon, authenticated;
grant execute on function public.revoke_archive_public_runner_credential()
  to service_role;

comment on function public.issue_archive_public_runner_credential() is
  'Issues a rotating two-hour PostgreSQL credential limited to public astronomical archive ingestion.';
comment on function public.revoke_archive_public_runner_credential() is
  'Immediately disables the public astronomical archive ingestion credential.';

notify pgrst, 'reload schema';

commit;
