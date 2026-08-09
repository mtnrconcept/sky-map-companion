begin;

-- Version aligned with the migration recorded by the production project.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- Originals are never public. Existing buckets are hardened in place so old
-- object paths remain recoverable while new uploads use astro-raw.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('astro-raw', 'astro-raw', false, 5368709120, array['application/octet-stream','application/fits','image/fits','image/tiff','image/png','image/jpeg']),
  ('astro-derived', 'astro-derived', true, 536870912, array['application/fits','image/fits','image/webp','image/png','application/json']),
  ('cosmos-evidence', 'cosmos-evidence', false, 104857600, array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets set public = false where id = 'astro-frames';

drop policy if exists "astro_raw_owner_insert" on storage.objects;
create policy "astro_raw_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('astro-raw', 'cosmos-evidence')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "astro_raw_owner_select" on storage.objects;
create policy "astro_raw_owner_select"
on storage.objects for select to authenticated
using (
  bucket_id in ('astro-raw', 'cosmos-evidence')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "astro_raw_owner_delete" on storage.objects;
create policy "astro_raw_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id in ('astro-raw', 'cosmos-evidence')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "public_read_astro_derivatives" on storage.objects;
create policy "public_read_astro_derivatives"
on storage.objects for select to anon, authenticated
using (bucket_id = 'astro-derived');

-- The client may upload bytes to its private prefix, but only trusted server
-- code can create or advance an astro_upload row.
revoke insert, update, delete on public.astro_uploads from anon, authenticated;
drop policy if exists "anyone_view_uploads" on public.astro_uploads;
drop policy if exists "users_insert_uploads" on public.astro_uploads;
drop policy if exists "users_update_own_uploads" on public.astro_uploads;
drop policy if exists "users_read_own_uploads" on public.astro_uploads;
create policy "users_read_own_uploads"
on public.astro_uploads for select to authenticated
using ((select auth.uid()) = user_id);

alter table public.astro_uploads
  add column if not exists content_sha256 text,
  add column if not exists perceptual_hash text,
  add column if not exists licence_code text,
  add column if not exists licence_accepted_at timestamptz,
  add column if not exists native_width_px integer,
  add column if not exists native_height_px integer,
  add column if not exists pipeline_version text not null default 'science-v1',
  add column if not exists processing_version integer not null default 0,
  add column if not exists claimed_cells_count integer not null default 0,
  add column if not exists xp_awarded integer not null default 0,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.astro_uploads drop constraint if exists astro_uploads_status_check;
alter table public.astro_uploads add constraint astro_uploads_status_check check (status in (
  'uploaded','extracting','solving','qualifying','awaiting_review','approved',
  'calibrating','aligning','stacking','tiling','published','stacked',
  'rejected','duplicate','cancelled','failed'
));
alter table public.astro_uploads drop constraint if exists astro_uploads_licence_check;
alter table public.astro_uploads add constraint astro_uploads_licence_check check (
  licence_code is null or licence_code in ('CC-BY-4.0','CC-BY-SA-4.0','CC0-1.0')
);
create unique index if not exists astro_uploads_content_sha256_unique
  on public.astro_uploads(content_sha256) where content_sha256 is not null and deleted_at is null;
create unique index if not exists astro_uploads_storage_path_unique
  on public.astro_uploads(storage_path) where deleted_at is null;
create unique index if not exists astro_masters_stacking_job_unique
  on public.astro_masters(stacking_job_id) where stacking_job_id is not null;

create table if not exists public.astrometric_solutions (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.astro_uploads(id) on delete cascade,
  pipeline_version text not null,
  center_ra_deg double precision not null check (center_ra_deg >= 0 and center_ra_deg < 360),
  center_dec_deg double precision not null check (center_dec_deg between -90 and 90),
  rotation_deg double precision not null,
  pixel_scale_arcsec double precision not null check (pixel_scale_arcsec > 0),
  native_pixel_scale_arcsec double precision not null check (native_pixel_scale_arcsec > 0),
  matched_stars integer not null check (matched_stars >= 0),
  rms_px double precision not null check (rms_px >= 0),
  confidence double precision not null check (confidence between 0 and 1),
  footprint jsonb not null,
  wcs_header jsonb not null default '{}'::jsonb,
  solved_at timestamptz not null default now(),
  unique (upload_id, pipeline_version)
);

create table if not exists public.astro_quality_metrics (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.astro_uploads(id) on delete cascade,
  pipeline_version text not null,
  fwhm_arcsec double precision not null check (fwhm_arcsec >= 0),
  eccentricity double precision not null check (eccentricity between 0 and 1),
  signal_to_noise double precision not null check (signal_to_noise >= 0),
  saturated_fraction double precision not null check (saturated_fraction between 0 and 1),
  clipped_black_fraction double precision not null check (clipped_black_fraction between 0 and 1),
  usable_coverage double precision not null check (usable_coverage between 0 and 1),
  score integer not null check (score between 0 and 100),
  breakdown jsonb not null,
  blockers text[] not null default '{}',
  eligible boolean not null,
  resolution_class text check (resolution_class in ('discovery','wide-field','detailed','high-definition')),
  measured_at timestamptz not null default now(),
  unique (upload_id, pipeline_version)
);

create table if not exists public.astro_upload_cells (
  upload_id uuid not null references public.astro_uploads(id) on delete cascade,
  healpix_order smallint not null check (healpix_order between 6 and 9),
  healpix_index bigint not null check (healpix_index >= 0),
  coverage_fraction double precision not null check (coverage_fraction between 0 and 1),
  usable_fraction double precision not null check (usable_fraction between 0 and 1),
  eligible boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (upload_id, healpix_order, healpix_index)
);
create index if not exists astro_upload_cells_viewport_idx
  on public.astro_upload_cells(healpix_order, healpix_index) where eligible;

create table if not exists public.sky_coverage_cells (
  healpix_order smallint not null check (healpix_order between 6 and 9),
  healpix_index bigint not null check (healpix_index >= 0),
  first_upload_id uuid not null references public.astro_uploads(id),
  first_user_id uuid not null references auth.users(id),
  resolution_class text not null check (resolution_class in ('discovery','wide-field','detailed','high-definition')),
  coverage_fraction double precision not null check (coverage_fraction between 0 and 1),
  anonymous_attribution boolean not null default false,
  moderation_status text not null default 'approved' check (moderation_status in ('approved','disputed','withdrawn')),
  claimed_at timestamptz not null default now(),
  primary key (healpix_order, healpix_index)
);
create index if not exists sky_coverage_order_claimed_idx
  on public.sky_coverage_cells(healpix_order, claimed_at desc);
create index if not exists sky_coverage_user_idx
  on public.sky_coverage_cells(first_user_id, claimed_at desc);

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('first_coverage','moderation_adjustment')),
  upload_id uuid references public.astro_uploads(id),
  healpix_order smallint check (healpix_order between 6 and 9),
  healpix_index bigint check (healpix_index >= 0),
  points integer not null check (points <> 0),
  idempotency_key text not null unique,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists xp_ledger_user_idx on public.xp_ledger(user_id, created_at desc);

create table if not exists public.mosaic_layers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  spectral_band text not null,
  current_generation_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.mosaic_generations (
  id uuid primary key default gen_random_uuid(),
  layer_id uuid not null references public.mosaic_layers(id) on delete cascade,
  generation integer not null check (generation > 0),
  status text not null default 'building' check (status in ('building','verifying','complete','failed','retired')),
  pipeline_version text not null,
  recipe jsonb not null,
  expected_tiles integer not null default 0 check (expected_tiles >= 0),
  published_tiles integer not null default 0 check (published_tiles >= 0),
  manifest_path text,
  manifest_sha256 text,
  source_job_id uuid unique,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (layer_id, generation)
);
alter table public.mosaic_layers drop constraint if exists mosaic_layers_current_generation_id_fkey;
alter table public.mosaic_layers add constraint mosaic_layers_current_generation_id_fkey
  foreign key (current_generation_id) references public.mosaic_generations(id) on delete set null;

create table if not exists public.mosaic_tiles (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.mosaic_generations(id) on delete cascade,
  healpix_order smallint not null check (healpix_order between 0 and 12),
  healpix_index bigint not null check (healpix_index >= 0),
  storage_path text not null,
  media_type text not null check (media_type in ('image/fits','image/jpeg','image/webp','image/png')),
  byte_size bigint not null check (byte_size > 0),
  sha256 text not null,
  source_upload_ids uuid[] not null default '{}',
  contribution_weights jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (generation_id, healpix_order, healpix_index, media_type),
  unique (generation_id, storage_path)
);
create index if not exists mosaic_tiles_lookup_idx
  on public.mosaic_tiles(generation_id, healpix_order, healpix_index);

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('qualify_upload','stack_object','publish_mosaic','cluster_cosmos','triangulate_cosmos')),
  upload_id uuid references public.astro_uploads(id) on delete cascade,
  object_id text references public.astro_objects(id) on delete cascade,
  cosmos_observation_id uuid references public.cosmos_observations(id) on delete cascade,
  cosmos_event_id uuid references public.cosmos_events(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'uploaded' check (status in (
    'uploaded','extracting','solving','qualifying','awaiting_review','approved',
    'calibrating','aligning','stacking','tiling','published','rejected',
    'duplicate','cancelled','failed'
  )),
  progress smallint not null default 0 check (progress between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_code text,
  error_detail text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  pipeline_version text not null default 'science-v1',
  idempotency_key text not null unique,
  version integer not null default 0,
  available_at timestamptz not null default now(),
  leased_by text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists processing_jobs_queue_idx
  on public.processing_jobs(status, available_at, created_at)
  where completed_at is null;
create index if not exists processing_jobs_owner_idx
  on public.processing_jobs(owner_user_id, created_at desc);

create table if not exists public.processing_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  from_status text,
  to_status text not null,
  progress smallint not null,
  worker_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists processing_job_events_job_idx
  on public.processing_job_events(job_id, created_at);

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references public.astro_uploads(id) on delete cascade,
  cosmos_observation_id uuid references public.cosmos_observations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('auto_approved','auto_rejected','review_requested','approved','rejected','disputed','corrected','withdrawn')),
  reason_code text,
  notes text,
  previous_state jsonb,
  next_state jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists mosaic_anonymous boolean not null default false;
alter table public.cosmos_events add column if not exists cluster_key text;
create unique index if not exists cosmos_events_cluster_key_unique
  on public.cosmos_events(cluster_key) where cluster_key is not null;
create unique index if not exists cosmos_triangulations_event_unique
  on public.cosmos_triangulations(event_id);

-- Legacy statistics were incremented at upload time, before scientific
-- approval, and could never be decremented reliably. Recalculate from the
-- authoritative approved rows on every relevant transition.
drop trigger if exists trigger_update_object_stats on public.astro_uploads;
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
  where object_id = p_object_id and rejected = false and deleted_at is null
    and status in ('approved','calibrating','aligning','stacking','tiling','published','stacked')
  group by user_id;
end;
$$;

create or replace function private.refresh_astro_stats_trigger()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.refresh_astro_object_stats(coalesce(new.object_id, old.object_id));
  if tg_op = 'UPDATE' and old.object_id is distinct from new.object_id then
    perform private.refresh_astro_object_stats(old.object_id);
  end if;
  return null;
end;
$$;
create trigger refresh_astro_stats_after_change
after insert or update of status, rejected, object_id or delete on public.astro_uploads
for each row execute function private.refresh_astro_stats_trigger();

revoke insert, update, delete on public.astro_contributions from anon, authenticated;
drop policy if exists "users_manage_own_contributions" on public.astro_contributions;

-- All authoritative science tables are RLS protected. Clients can only read
-- explicitly safe projections or their own jobs; worker writes use service_role.
alter table public.astrometric_solutions enable row level security;
alter table public.astro_quality_metrics enable row level security;
alter table public.astro_upload_cells enable row level security;
alter table public.sky_coverage_cells enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.mosaic_layers enable row level security;
alter table public.mosaic_generations enable row level security;
alter table public.mosaic_tiles enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.processing_job_events enable row level security;
alter table public.moderation_events enable row level security;

revoke all on public.astrometric_solutions, public.astro_quality_metrics,
  public.astro_upload_cells, public.sky_coverage_cells, public.xp_ledger,
  public.mosaic_layers, public.mosaic_generations, public.mosaic_tiles,
  public.processing_jobs, public.processing_job_events, public.moderation_events
from public, anon, authenticated;

grant select on public.sky_coverage_cells, public.mosaic_layers,
  public.mosaic_generations, public.mosaic_tiles to anon, authenticated;
grant select on public.processing_jobs, public.processing_job_events,
  public.astrometric_solutions, public.astro_quality_metrics to authenticated;
grant all on public.astrometric_solutions, public.astro_quality_metrics,
  public.astro_upload_cells, public.sky_coverage_cells, public.xp_ledger,
  public.mosaic_layers, public.mosaic_generations, public.mosaic_tiles,
  public.processing_jobs, public.processing_job_events, public.moderation_events to service_role;

create policy "public_read_coverage" on public.sky_coverage_cells
  for select to anon, authenticated using (moderation_status <> 'withdrawn');
create policy "public_read_layers" on public.mosaic_layers
  for select to anon, authenticated using (true);
create policy "public_read_complete_generations" on public.mosaic_generations
  for select to anon, authenticated using (status = 'complete');
create policy "public_read_current_tiles" on public.mosaic_tiles
  for select to anon, authenticated using (
    exists (
      select 1 from public.mosaic_layers l
      where l.current_generation_id = generation_id
    )
  );
create policy "owners_read_jobs" on public.processing_jobs
  for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy "owners_read_job_events" on public.processing_job_events
  for select to authenticated using (
    exists (
      select 1 from public.processing_jobs j
      where j.id = job_id and j.owner_user_id = (select auth.uid())
    )
  );
create policy "owners_read_astrometry" on public.astrometric_solutions
  for select to authenticated using (
    exists (select 1 from public.astro_uploads u where u.id = upload_id and u.user_id = (select auth.uid()))
  );
create policy "owners_read_quality" on public.astro_quality_metrics
  for select to authenticated using (
    exists (select 1 from public.astro_uploads u where u.id = upload_id and u.user_id = (select auth.uid()))
  );

create or replace function private.can_transition(p_from text, p_to text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('uploaded','extracting'),('uploaded','duplicate'),('uploaded','cancelled'),('uploaded','failed'),
    ('extracting','solving'),('extracting','qualifying'),('extracting','rejected'),('extracting','failed'),
    ('solving','qualifying'),('solving','rejected'),('solving','failed'),
    ('qualifying','awaiting_review'),('qualifying','approved'),('qualifying','rejected'),('qualifying','duplicate'),('qualifying','failed'),
    ('awaiting_review','approved'),('awaiting_review','rejected'),('awaiting_review','cancelled'),
    ('approved','calibrating'),('approved','tiling'),('approved','published'),('approved','failed'),
    ('calibrating','aligning'),('calibrating','failed'),('aligning','stacking'),('aligning','failed'),
    ('stacking','tiling'),('stacking','published'),('stacking','failed'),
    ('tiling','published'),('tiling','failed'),('rejected','awaiting_review'),
    ('cancelled','uploaded'),('failed','uploaded'),('failed','extracting'),('failed','solving'),
    ('failed','qualifying'),('failed','awaiting_review'),('failed','approved'),
    ('failed','calibrating'),('failed','aligning'),('failed','stacking'),('failed','tiling')
  );
$$;

create or replace function private.lease_processing_job(p_worker_id text, p_lease_seconds integer default 300)
returns table (
  id uuid, job_type text, status text, upload_id uuid, object_id text,
  cosmos_observation_id uuid, cosmos_event_id uuid, owner_user_id uuid,
  payload jsonb, attempts integer, pipeline_version text, version integer
)
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_worker_id is null or length(trim(p_worker_id)) < 3 or p_lease_seconds not between 30 and 1800 then
    raise exception 'invalid lease request';
  end if;
  return query
  with candidate as (
    select j.id
    from public.processing_jobs j
    where j.completed_at is null
      and j.status not in ('published','rejected','duplicate','cancelled')
      and j.attempts < j.max_attempts
      and j.available_at <= now()
      and (j.lease_expires_at is null or j.lease_expires_at < now())
    order by j.available_at, j.created_at
    for update skip locked
    limit 1
  ), leased as (
    update public.processing_jobs j
    set leased_by = p_worker_id,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        heartbeat_at = now(),
        attempts = j.attempts + 1,
        updated_at = now()
    from candidate c
    where j.id = c.id
    returning j.*
  )
  select l.id, l.job_type, l.status, l.upload_id, l.object_id,
         l.cosmos_observation_id, l.cosmos_event_id, l.owner_user_id,
         l.payload, l.attempts, l.pipeline_version, l.version
  from leased l;
end;
$$;

create or replace function private.heartbeat_processing_job(
  p_job_id uuid, p_worker_id text, p_expected_version integer, p_lease_seconds integer default 300
)
returns boolean
language sql security definer
set search_path = ''
as $$
  update public.processing_jobs
  set heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(30, least(1800, p_lease_seconds))),
      updated_at = now()
  where id = p_job_id and leased_by = p_worker_id and version = p_expected_version
    and lease_expires_at > now()
  returning true;
$$;

create or replace function private.transition_processing_job(
  p_job_id uuid, p_worker_id text, p_expected_version integer, p_to_status text,
  p_progress integer, p_result jsonb default null
)
returns public.processing_jobs
language plpgsql security definer
set search_path = ''
as $$
declare
  current_job public.processing_jobs;
  updated_job public.processing_jobs;
begin
  select * into current_job from public.processing_jobs where id = p_job_id for update;
  if current_job.id is null or current_job.leased_by is distinct from p_worker_id
     or current_job.version <> p_expected_version or current_job.lease_expires_at <= now() then
    raise exception 'stale or invalid job lease';
  end if;
  if not private.can_transition(current_job.status, p_to_status) then
    raise exception 'invalid transition from % to %', current_job.status, p_to_status;
  end if;
  update public.processing_jobs
  set status = p_to_status,
      progress = greatest(progress, greatest(0, least(100, p_progress))),
      result = coalesce(p_result, result),
      version = version + 1,
      leased_by = null,
      lease_expires_at = null,
      heartbeat_at = null,
      completed_at = case when p_to_status in ('published','rejected','duplicate','cancelled') then now() else null end,
      updated_at = now()
  where id = p_job_id
  returning * into updated_job;
  insert into public.processing_job_events(job_id, from_status, to_status, progress, worker_id, detail)
  values (p_job_id, current_job.status, p_to_status, updated_job.progress, p_worker_id, coalesce(p_result, '{}'::jsonb));
  return updated_job;
end;
$$;

create or replace function private.fail_processing_job(
  p_job_id uuid, p_worker_id text, p_expected_version integer,
  p_error_code text, p_error_detail text, p_retry_after_seconds integer default null
)
returns public.processing_jobs
language plpgsql security definer
set search_path = ''
as $$
declare
  current_job public.processing_jobs;
  updated_job public.processing_jobs;
begin
  select * into current_job from public.processing_jobs where id = p_job_id for update;
  if current_job.id is null or current_job.leased_by is distinct from p_worker_id
     or current_job.version <> p_expected_version then
    raise exception 'stale or invalid job lease';
  end if;
  update public.processing_jobs
  set status = 'failed', error_code = left(p_error_code, 100),
      error_detail = left(p_error_detail, 2000), version = version + 1,
      payload = payload || jsonb_build_object('retry_state', current_job.status),
      leased_by = null, lease_expires_at = null, heartbeat_at = null,
      available_at = case when p_retry_after_seconds is null then available_at
                          else now() + make_interval(secs => greatest(1, p_retry_after_seconds)) end,
      completed_at = case when attempts >= max_attempts or p_retry_after_seconds is null then now() else null end,
      updated_at = now()
  where id = p_job_id returning * into updated_job;
  insert into public.processing_job_events(job_id, from_status, to_status, progress, worker_id, detail)
  values (p_job_id, current_job.status, 'failed', current_job.progress, p_worker_id,
          jsonb_build_object('error_code', left(p_error_code, 100)));
  return updated_job;
end;
$$;

create or replace function private.claim_approved_upload(p_upload_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  is_anonymous boolean;
  claimed_count integer;
  awarded integer;
begin
  select u.user_id, coalesce(p.mosaic_anonymous, false)
  into owner_id, is_anonymous
  from public.astro_uploads u
  left join public.profiles p on p.id = u.user_id
  where u.id = p_upload_id and u.status in ('approved','tiling','published','stacked')
  for update of u;
  if owner_id is null then raise exception 'upload is not approved'; end if;

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
      resolution_class, coverage_fraction, anonymous_attribution
    )
    select healpix_order, healpix_index, p_upload_id, owner_id,
           resolution_class, coverage_fraction, is_anonymous
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
    from ranked where running_points <= 500
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

create or replace function private.activate_mosaic_generation(p_generation_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target public.mosaic_generations;
  tile_count integer;
begin
  select * into target from public.mosaic_generations where id = p_generation_id for update;
  if target.id is null or target.status <> 'verifying' or target.manifest_path is null
     or target.manifest_sha256 is null then
    raise exception 'generation is not verifiable';
  end if;
  select count(*) into tile_count from public.mosaic_tiles where generation_id = p_generation_id;
  if tile_count <> target.expected_tiles or tile_count <> target.published_tiles then
    raise exception 'generation tile count mismatch';
  end if;
  update public.mosaic_generations set status = 'retired'
    where layer_id = target.layer_id and status = 'complete' and id <> target.id;
  update public.mosaic_generations
    set status = 'complete', activated_at = now() where id = target.id;
  update public.mosaic_layers set current_generation_id = target.id where id = target.layer_id;
  return target.id;
end;
$$;

create or replace function public.request_stack_job(
  p_object_id text, p_user_id uuid, p_idempotency_key text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  lights uuid[];
  darks uuid[];
  flats uuid[];
  biases uuid[];
  stack_id uuid;
  process_id uuid;
begin
  select array_agg(id order by quality_score desc, uploaded_at)
    filter (where frame_type='light'),
    array_agg(id order by quality_score desc, uploaded_at)
    filter (where frame_type='dark'),
    array_agg(id order by quality_score desc, uploaded_at)
    filter (where frame_type='flat'),
    array_agg(id order by quality_score desc, uploaded_at)
    filter (where frame_type='bias')
  into lights, darks, flats, biases
  from public.astro_uploads
  where object_id=p_object_id and rejected=false and deleted_at is null
    and status in ('approved','published','stacked');
  if coalesce(cardinality(lights),0) < 3 then
    raise exception 'at least three approved light frames are required';
  end if;
  select id into process_id from public.processing_jobs where idempotency_key=p_idempotency_key;
  if process_id is not null then
    return jsonb_build_object('processing_job_id',process_id,'replayed',true);
  end if;
  insert into public.astro_stacking_jobs(
    object_id,light_ids,dark_ids,flat_ids,bias_ids,lights_count,status,started_at
  ) values (
    p_object_id,coalesce(lights,'{}'),coalesce(darks,'{}'),coalesce(flats,'{}'),coalesce(biases,'{}'),
    cardinality(lights),'pending',null
  ) returning id into stack_id;
  insert into public.processing_jobs(
    job_type,object_id,owner_user_id,status,payload,idempotency_key
  ) values (
    'stack_object',p_object_id,p_user_id,'approved',
    jsonb_build_object('stacking_job_id',stack_id),p_idempotency_key
  ) returning id into process_id;
  return jsonb_build_object(
    'processing_job_id',process_id,'stacking_job_id',stack_id,
    'lights_count',cardinality(lights),'replayed',false
  );
end;
$$;

create or replace function public.cancel_processing_job(p_job_id uuid, p_user_id uuid)
returns boolean
language sql security definer
set search_path = ''
as $$
  update public.processing_jobs
  set status='cancelled',completed_at=now(),leased_by=null,lease_expires_at=null,updated_at=now(),version=version+1
  where id=p_job_id and owner_user_id=p_user_id
    and status in ('uploaded','extracting','solving','qualifying','awaiting_review','approved')
  returning true;
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
         case when c.anonymous_attribution then 'Contributeur anonyme'
              else coalesce(p.display_name, 'Contributeur') end,
         case when c.anonymous_attribution then null else c.first_user_id end,
         c.anonymous_attribution,
         tile.storage_path
  from public.sky_coverage_cells c
  left join public.profiles p on p.id = c.first_user_id
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

create or replace function public.get_user_mosaic_stats(p_user_id uuid)
returns table (xp_total bigint, pioneer_cells bigint)
language sql stable security definer
set search_path = ''
as $$
  select
    coalesce((select sum(x.points) from public.xp_ledger x where x.user_id = p_user_id), 0),
    (select count(*) from public.sky_coverage_cells c where c.first_user_id = p_user_id and c.moderation_status <> 'withdrawn');
$$;

-- Exact observer coordinates remain private. This RPC is the only public
-- Cosmos observation feed and rounds locations to roughly 11 km.
revoke select on public.cosmos_observations, public.cosmos_events,
  public.cosmos_triangulations from anon, authenticated;
drop policy if exists "anyone_view_obs" on public.cosmos_observations;
drop policy if exists "anyone_view_events" on public.cosmos_events;
drop policy if exists "anyone_view_triangulations" on public.cosmos_triangulations;
create policy "users_view_own_cosmos_observations" on public.cosmos_observations
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.get_public_cosmos_observations(p_since_minutes integer default 120, p_limit integer default 200)
returns table (
  id uuid, latitude double precision, longitude double precision,
  phenomenon_type text, description text, duration_s double precision,
  magnitude double precision, confidence double precision, status text,
  event_id uuid, observed_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select o.id, round(o.latitude::numeric, 1)::double precision,
         round(o.longitude::numeric, 1)::double precision,
         o.phenomenon_type, left(o.description, 500), o.duration_s, o.magnitude,
         o.ai_confidence, o.status, o.event_id, o.observed_at
  from public.cosmos_observations o
  where o.observed_at >= now() - make_interval(mins => greatest(1, least(1440, p_since_minutes)))
    and o.status <> 'rejected'
  order by o.observed_at desc
  limit greatest(1, least(500, p_limit));
$$;

create or replace function public.get_public_cosmos_events(p_since_hours integer default 24, p_limit integer default 50)
returns table (
  id uuid, phenomenon_type text, title text, description text,
  observation_count integer, confidence_score double precision,
  status text, event_at timestamptz, triangulation jsonb, ai_analysis jsonb
)
language sql stable security definer
set search_path = ''
as $$
  select e.id, e.phenomenon_type, e.title, left(e.description, 1000),
         e.observation_count, e.confidence_score, e.status, e.event_at,
         case when e.status in ('confirmed','transmitted') then e.triangulation else null end,
         case when e.status in ('confirmed','transmitted') then e.ai_analysis else null end
  from public.cosmos_events e
  where e.event_at >= now() - make_interval(hours => greatest(1, least(168, p_since_hours)))
    and e.status <> 'rejected'
  order by e.observation_count desc, e.event_at desc
  limit greatest(1, least(200, p_limit));
$$;

create or replace function private.enqueue_astro_upload()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.processing_jobs(job_type, upload_id, owner_user_id, status, idempotency_key, pipeline_version)
  values ('qualify_upload', new.id, new.user_id, 'uploaded', 'qualify:' || new.id::text || ':' || new.pipeline_version, new.pipeline_version)
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;
drop trigger if exists enqueue_astro_upload_trigger on public.astro_uploads;
create trigger enqueue_astro_upload_trigger after insert on public.astro_uploads
for each row execute function private.enqueue_astro_upload();

create or replace function private.enqueue_cosmos_observation()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.processing_jobs(job_type, cosmos_observation_id, owner_user_id, status, idempotency_key)
  values ('cluster_cosmos', new.id, new.user_id, 'uploaded', 'cosmos-cluster:' || new.id::text)
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;
drop trigger if exists enqueue_cosmos_observation_trigger on public.cosmos_observations;
create trigger enqueue_cosmos_observation_trigger after insert on public.cosmos_observations
for each row execute function private.enqueue_cosmos_observation();

-- Existing privileged functions are no longer public entry points.
revoke all on function public.get_recent_observations(double precision,double precision,double precision,integer,integer)
  from public, anon, authenticated;
revoke all on function public.get_active_events(integer) from public, anon, authenticated;
alter function public.update_event_observation_count() set search_path = '';

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.lease_processing_job(text, integer),
  private.heartbeat_processing_job(uuid, text, integer, integer),
  private.transition_processing_job(uuid, text, integer, text, integer, jsonb),
  private.fail_processing_job(uuid, text, integer, text, text, integer),
  private.claim_approved_upload(uuid),
  private.activate_mosaic_generation(uuid)
to service_role;
revoke all on function public.get_mosaic_cells(smallint, bigint[]),
  public.get_user_mosaic_stats(uuid),
  public.get_public_cosmos_observations(integer, integer),
  public.get_public_cosmos_events(integer, integer)
from public;
revoke all on function public.request_stack_job(text, uuid, text),
  public.cancel_processing_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.request_stack_job(text, uuid, text),
  public.cancel_processing_job(uuid, uuid) to service_role;
grant execute on function public.get_mosaic_cells(smallint, bigint[]),
  public.get_user_mosaic_stats(uuid),
  public.get_public_cosmos_observations(integer, integer),
  public.get_public_cosmos_events(integer, integer)
to anon, authenticated;

commit;
