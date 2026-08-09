begin;

create table public.archive_sources (
  id text primary key,
  name text not null,
  base_url text not null,
  terms_url text not null,
  acknowledgement text not null,
  rights_class text not null check (rights_class in ('public-with-attribution','public-domain')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.archive_sources(
  id, name, base_url, terms_url, acknowledgement, rights_class
) values (
  'mast-ps1',
  'MAST Pan-STARRS1 Public Archive',
  'https://ps1images.stsci.edu',
  'https://archive.stsci.edu/publishing/mission-acknowledgements',
  'Pan-STARRS1 Surveys (PS1) and the PS1 public science archive; cite Chambers et al. 2016, Magnier et al. 2016 and Waters et al. 2016 as appropriate.',
  'public-with-attribution'
) on conflict (id) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  terms_url = excluded.terms_url,
  acknowledgement = excluded.acknowledgement,
  rights_class = excluded.rights_class,
  updated_at = now();

create table public.archive_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.archive_sources(id),
  object_id text not null references public.astro_objects(id) on delete cascade,
  spectral_band text not null,
  status text not null default 'discovering' check (
    status in ('discovering','downloading','qualifying','building','complete','failed','cancelled')
  ),
  query jsonb not null,
  max_files integer not null check (max_files between 1 and 10000),
  max_bytes bigint not null check (max_bytes between 1 and 1099511627776),
  discovered_files integer not null default 0 check (discovered_files >= 0),
  registered_files integer not null default 0 check (registered_files >= 0),
  rejected_files integer not null default 0 check (rejected_files >= 0),
  downloaded_bytes bigint not null default 0 check (downloaded_bytes >= 0),
  error_detail text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index archive_ingest_runs_status_idx
  on public.archive_ingest_runs(status, started_at desc);

create table public.archive_items (
  id uuid primary key default gen_random_uuid(),
  ingest_run_id uuid not null references public.archive_ingest_runs(id) on delete cascade,
  source_id text not null references public.archive_sources(id),
  object_id text not null references public.astro_objects(id) on delete cascade,
  archive_record_id text not null,
  remote_url text not null,
  remote_filename text not null,
  data_rights text not null check (data_rights = 'public'),
  calibration_level smallint not null check (calibration_level between 0 and 4),
  spectral_band text not null,
  observed_at timestamptz,
  exposure_s double precision check (exposure_s is null or exposure_s >= 0),
  content_sha256 text,
  byte_size bigint check (byte_size is null or byte_size > 0),
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'discovered' check (
    status in ('discovered','downloading','registered','duplicate','rejected','failed')
  ),
  upload_id uuid unique,
  error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingest_run_id, source_id, archive_record_id)
);
create index archive_items_run_status_idx
  on public.archive_items(ingest_run_id, status, created_at);
create index archive_items_object_band_idx
  on public.archive_items(object_id, spectral_band, created_at desc);

alter table public.astro_uploads alter column user_id drop not null;
alter table public.astro_uploads
  add column source_kind text not null default 'community' check (source_kind in ('community','public_archive')),
  add column archive_item_id uuid unique references public.archive_items(id) on delete restrict,
  add column provenance jsonb not null default '{}'::jsonb,
  add column rights_uri text,
  add column attribution_text text;

alter table public.astro_uploads drop constraint if exists astro_uploads_licence_check;
alter table public.astro_uploads add constraint astro_uploads_licence_check check (
  licence_code is null or licence_code in (
    'CC-BY-4.0','CC-BY-SA-4.0','CC0-1.0','PUBLIC-ARCHIVE'
  )
);
alter table public.astro_uploads add constraint astro_uploads_source_owner_check check (
  (source_kind = 'community' and user_id is not null and archive_item_id is null)
  or
  (source_kind = 'public_archive' and user_id is null and archive_item_id is not null)
);

alter table public.archive_items
  add constraint archive_items_upload_id_fkey
  foreign key (upload_id) references public.astro_uploads(id) on delete set null;

alter table public.sky_coverage_cells alter column first_user_id drop not null;
alter table public.sky_coverage_cells
  add column first_archive_item_id uuid references public.archive_items(id) on delete set null,
  add column source_kind text not null default 'community' check (source_kind in ('community','public_archive')),
  add column attribution_text text;
alter table public.sky_coverage_cells add constraint sky_coverage_source_check check (
  (source_kind = 'community' and first_user_id is not null)
  or
  (source_kind = 'public_archive' and first_user_id is null and first_archive_item_id is not null)
);

create or replace function private.refresh_astro_object_stats(p_object_id text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_object_id is null then return; end if;
  update public.astro_objects o
  set total_lights = s.lights,
      total_darks = s.darks,
      total_flats = s.flats,
      total_bias = s.bias,
      total_contributors = s.contributors,
      total_exposure_hours = s.exposure_hours
  from (
    select count(*) filter (where frame_type = 'light')::bigint as lights,
           count(*) filter (where frame_type = 'dark')::bigint as darks,
           count(*) filter (where frame_type = 'flat')::bigint as flats,
           count(*) filter (where frame_type = 'bias')::bigint as bias,
           count(distinct user_id)::integer as contributors,
           coalesce(sum(exposure_s) filter (where frame_type = 'light'), 0)::double precision / 3600.0 as exposure_hours
    from public.astro_uploads
    where object_id = p_object_id and rejected = false and deleted_at is null
      and status in ('approved','calibrating','aligning','stacking','tiling','published','stacked')
  ) s
  where o.id = p_object_id;

  delete from public.astro_contributions where object_id = p_object_id;
  insert into public.astro_contributions(
    user_id, object_id, lights_count, darks_count, flats_count, bias_count,
    total_exposure_hours, quality_avg, first_contribution_at, last_contribution_at
  )
  select user_id, p_object_id,
    count(*) filter (where frame_type = 'light'),
    count(*) filter (where frame_type = 'dark'),
    count(*) filter (where frame_type = 'flat'),
    count(*) filter (where frame_type = 'bias'),
    coalesce(sum(exposure_s) filter (where frame_type = 'light'), 0)::double precision / 3600.0,
    coalesce(avg(quality_score), 0), min(uploaded_at), max(uploaded_at)
  from public.astro_uploads
  where object_id = p_object_id and user_id is not null
    and rejected = false and deleted_at is null
    and status in ('approved','calibrating','aligning','stacking','tiling','published','stacked')
  group by user_id;
end;
$$;

create or replace function private.claim_approved_upload(p_upload_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  item_id uuid;
  upload_source text;
  source_attribution text;
  is_anonymous boolean;
  claimed_count integer;
  awarded integer;
begin
  select u.user_id, u.archive_item_id, u.source_kind, u.attribution_text,
         coalesce(p.mosaic_anonymous, false)
  into owner_id, item_id, upload_source, source_attribution, is_anonymous
  from public.astro_uploads u
  left join public.profiles p on p.id = u.user_id
  where u.id = p_upload_id and u.status in ('approved','tiling','published','stacked')
  for update of u;
  if upload_source is null then raise exception 'upload is not approved'; end if;

  with candidates as (
    select c.healpix_order, c.healpix_index, c.coverage_fraction,
      case c.healpix_order when 6 then 2 when 7 then 5 when 8 then 10 when 9 then 20 end as points,
      case c.healpix_order when 6 then 'discovery' when 7 then 'wide-field'
           when 8 then 'detailed' else 'high-definition' end as resolution_class
    from public.astro_upload_cells c
    where c.upload_id = p_upload_id and c.eligible and c.coverage_fraction >= 0.7
  ), inserted as (
    insert into public.sky_coverage_cells(
      healpix_order, healpix_index, first_upload_id, first_user_id,
      first_archive_item_id, source_kind, attribution_text,
      resolution_class, coverage_fraction, anonymous_attribution
    )
    select healpix_order, healpix_index, p_upload_id, owner_id,
           item_id, upload_source, source_attribution,
           resolution_class, coverage_fraction,
           case when upload_source = 'public_archive' then false else is_anonymous end
    from candidates
    on conflict (healpix_order, healpix_index) do nothing
    returning healpix_order, healpix_index
  ), ranked as (
    select i.healpix_order, i.healpix_index, c.points,
      sum(c.points) over (order by i.healpix_order desc, i.healpix_index) as running_points
    from inserted i
    join candidates c using (healpix_order, healpix_index)
  ), ledger as (
    insert into public.xp_ledger(
      user_id, event_type, upload_id, healpix_order, healpix_index, points, idempotency_key
    )
    select owner_id, 'first_coverage', p_upload_id, healpix_order, healpix_index, points,
           'coverage:' || p_upload_id::text || ':' || healpix_order::text || ':' || healpix_index::text
    from ranked
    where owner_id is not null and upload_source = 'community' and running_points <= 500
    on conflict (idempotency_key) do nothing
    returning points
  )
  select (select count(*) from inserted), coalesce((select sum(points) from ledger), 0)
  into claimed_count, awarded;

  update public.astro_uploads
  set claimed_cells_count = claimed_cells_count + claimed_count,
      xp_awarded = xp_awarded + awarded,
      updated_at = now()
  where id = p_upload_id;

  return jsonb_build_object('claimed_cells', claimed_count, 'xp_awarded', awarded);
end;
$$;

create or replace function public.get_mosaic_cells(p_order smallint, p_indices bigint[])
returns table (
  healpix_order smallint, healpix_index bigint, resolution_class text,
  coverage_fraction double precision, moderation_status text, claimed_at timestamptz,
  pioneer_name text, pioneer_user_id uuid, anonymous_attribution boolean,
  tile_path text
)
language sql stable security definer
set search_path = ''
as $$
  select c.healpix_order, c.healpix_index, c.resolution_class, c.coverage_fraction,
         c.moderation_status, c.claimed_at,
         case when c.source_kind = 'public_archive'
                then coalesce(c.attribution_text, s.name, 'Archive scientifique publique')
              when c.anonymous_attribution then 'Contributeur anonyme'
              else coalesce(p.display_name, 'Contributeur') end,
         case when c.source_kind = 'public_archive' or c.anonymous_attribution
                then null else c.first_user_id end,
         c.anonymous_attribution,
         tile.storage_path
  from public.sky_coverage_cells c
  left join public.profiles p on p.id = c.first_user_id
  left join public.archive_items ai on ai.id = c.first_archive_item_id
  left join public.archive_sources s on s.id = ai.source_id
  left join lateral (
    select t.storage_path
    from public.mosaic_layers l
    join public.mosaic_tiles t on t.generation_id = l.current_generation_id
    where t.healpix_order = c.healpix_order and t.healpix_index = c.healpix_index
    order by case when l.spectral_band = 'broadband' then 0 else 1 end, l.slug
    limit 1
  ) tile on true
  where c.healpix_order = p_order
    and c.healpix_index = any(p_indices)
    and c.moderation_status <> 'withdrawn'
  order by c.healpix_index;
$$;

alter table public.archive_sources enable row level security;
alter table public.archive_ingest_runs enable row level security;
alter table public.archive_items enable row level security;

revoke all on public.archive_sources, public.archive_ingest_runs, public.archive_items
from public, anon, authenticated;
grant select on public.archive_sources to anon, authenticated;
grant all on public.archive_sources, public.archive_ingest_runs, public.archive_items to service_role;

create policy "public_read_archive_sources" on public.archive_sources
  for select to anon, authenticated using (enabled);

revoke all on function public.get_mosaic_cells(smallint, bigint[]) from public;
grant execute on function public.get_mosaic_cells(smallint, bigint[]) to anon, authenticated;
revoke all on function private.claim_approved_upload(uuid) from public, anon, authenticated;
grant execute on function private.claim_approved_upload(uuid) to service_role;

commit;
