begin;

-- Archive master v9
--
-- This migration is deliberately additive.  Historical generation 1 remains
-- readable, but it is not retroactively labelled as verified: only a new
-- generation with a locked preflight plan and a staged master can be activated.

-- ---------------------------------------------------------------------------
-- Provenance: bind every persisted footprint to the WCS solution that created
-- it.  The column stays nullable for legacy/non-v9 writers, while v9 activation
-- rejects an archive inventory containing an unbound eligible footprint.
-- ---------------------------------------------------------------------------

alter table public.astro_upload_cells
  add column if not exists astrometric_solution_id uuid;

update public.astro_upload_cells c
set astrometric_solution_id = (
  select s.id
  from public.astro_uploads u
  join public.astrometric_solutions s
    on s.upload_id = u.id
   and s.pipeline_version = u.pipeline_version
  where u.id = c.upload_id
)
where c.astrometric_solution_id is null
  and exists (
    select 1
    from public.astro_uploads u
    join public.astrometric_solutions s
      on s.upload_id = u.id
     and s.pipeline_version = u.pipeline_version
    where u.id = c.upload_id
  );

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.astro_upload_cells'::regclass
      and conname = 'astro_upload_cells_astrometric_solution_id_fkey'
  ) then
    alter table public.astro_upload_cells
      add constraint astro_upload_cells_astrometric_solution_id_fkey
      foreign key (astrometric_solution_id)
      references public.astrometric_solutions(id)
      on delete restrict
      not valid;
  end if;
end;
$$;

alter table public.astro_upload_cells
  validate constraint astro_upload_cells_astrometric_solution_id_fkey;

create index if not exists astro_upload_cells_solution_idx
  on public.astro_upload_cells(astrometric_solution_id)
  where astrometric_solution_id is not null;

comment on column public.astro_upload_cells.astrometric_solution_id is
  'Authoritative persisted WCS solution used to derive this footprint; required by archive-master v9 activation.';

-- ---------------------------------------------------------------------------
-- Generation preflight and verification contract.
-- planned_tiles is computed from verification.tile_plan by a trigger.  Once
-- preflight_locked_at is set, neither the plan nor its source inventory may be
-- reduced by a renderer that failed to project some inputs.
-- ---------------------------------------------------------------------------

alter table public.mosaic_generations
  add column if not exists archive_ingest_run_id uuid,
  add column if not exists planned_tiles integer not null default 0,
  add column if not exists planned_tiles_sha256 text,
  add column if not exists source_inventory_sha256 text,
  add column if not exists preflight_locked_at timestamptz,
  add column if not exists expected_source_uploads integer not null default 0,
  add column if not exists contributing_source_uploads integer not null default 0,
  add column if not exists failed_tiles integer not null default 0,
  add column if not exists verification jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Restore explicit provenance for the already-published legacy generation.
-- No UUID is hard-coded: the run is resolved from the recipe against the FK
-- target table.
update public.mosaic_generations g
set archive_ingest_run_id = r.id
from public.archive_ingest_runs r
where g.archive_ingest_run_id is null
  and g.recipe->>'archive_run_id' = r.id::text;

with inventory as (
  select g.id as generation_id, count(distinct u.id)::integer as source_count
  from public.mosaic_generations g
  join public.archive_items ai
    on ai.ingest_run_id = g.archive_ingest_run_id
  join public.astro_uploads u
    on u.id = ai.upload_id
  join public.astro_quality_metrics q
    on q.upload_id = u.id
   and q.pipeline_version = g.pipeline_version
  where q.eligible
    and not u.rejected
    and u.deleted_at is null
    and u.status in ('approved','published','stacked')
  group by g.id
), contributors as (
  select t.generation_id, count(distinct source_id)::integer as source_count
  from public.mosaic_tiles t
  cross join lateral unnest(t.source_upload_ids) as source_id
  group by t.generation_id
)
update public.mosaic_generations g
set expected_source_uploads = coalesce(i.source_count, g.expected_source_uploads),
    contributing_source_uploads = coalesce(c.source_count, g.contributing_source_uploads),
    failed_tiles = greatest(g.expected_tiles - g.published_tiles, 0),
    verification = case
      when g.status in ('complete','retired') and g.preflight_locked_at is null
        then g.verification || jsonb_build_object(
          'legacy_generation', true,
          'v9_verified', false,
          'audit_reason', 'generation predates locked archive-master v9 preflight'
        )
      else g.verification
    end
from inventory i
left join contributors c on c.generation_id = i.generation_id
where g.id = i.generation_id;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.mosaic_generations'::regclass
      and conname = 'mosaic_generations_archive_ingest_run_id_fkey'
  ) then
    alter table public.mosaic_generations
      add constraint mosaic_generations_archive_ingest_run_id_fkey
      foreign key (archive_ingest_run_id)
      references public.archive_ingest_runs(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.mosaic_generations'::regclass
      and conname = 'mosaic_generations_source_job_id_fkey'
  ) then
    if exists (
      select 1
      from public.mosaic_generations g
      left join public.processing_jobs j on j.id = g.source_job_id
      where g.source_job_id is not null and j.id is null
    ) then
      raise exception 'cannot add source-job provenance FK: orphan mosaic generation exists';
    end if;
    alter table public.mosaic_generations
      add constraint mosaic_generations_source_job_id_fkey
      foreign key (source_job_id)
      references public.processing_jobs(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.mosaic_generations'::regclass
      and conname = 'mosaic_generations_v9_counts_check'
  ) then
    alter table public.mosaic_generations
      add constraint mosaic_generations_v9_counts_check check (
        planned_tiles >= 0
        and expected_source_uploads >= 0
        and contributing_source_uploads between 0 and expected_source_uploads
        and failed_tiles >= 0
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.mosaic_generations'::regclass
      and conname = 'mosaic_generations_v9_preflight_check'
  ) then
    alter table public.mosaic_generations
      add constraint mosaic_generations_v9_preflight_check check (
        preflight_locked_at is null
        or (
          planned_tiles > 0
          and expected_tiles = planned_tiles
          and planned_tiles_sha256 ~ '^[0-9a-f]{64}$'
          and source_inventory_sha256 ~ '^[0-9a-f]{64}$'
          and expected_source_uploads > 0
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.mosaic_generations'::regclass
      and conname = 'mosaic_generations_verification_object_check'
  ) then
    alter table public.mosaic_generations
      add constraint mosaic_generations_verification_object_check check (
        jsonb_typeof(verification) = 'object'
      ) not valid;
  end if;
end;
$$;

alter table public.mosaic_generations
  validate constraint mosaic_generations_archive_ingest_run_id_fkey;
alter table public.mosaic_generations
  validate constraint mosaic_generations_source_job_id_fkey;
alter table public.mosaic_generations
  validate constraint mosaic_generations_v9_counts_check;
alter table public.mosaic_generations
  validate constraint mosaic_generations_v9_preflight_check;
alter table public.mosaic_generations
  validate constraint mosaic_generations_verification_object_check;

create index if not exists mosaic_generations_archive_run_idx
  on public.mosaic_generations(archive_ingest_run_id, generation desc)
  where archive_ingest_run_id is not null;

comment on column public.mosaic_generations.planned_tiles is
  'Immutable number of unique NESTED HEALPix cells in verification.tile_plan after preflight lock.';
comment on column public.mosaic_generations.planned_tiles_sha256 is
  'Server-computed SHA-256 of the normalized JSONB tile plan.';
comment on column public.mosaic_generations.source_inventory_sha256 is
  'Server-computed SHA-256 of the sorted eligible upload UUID inventory at preflight.';
comment on column public.mosaic_generations.verification is
  'Safe verification envelope; must not contain raw paths, remote URLs, user IDs, or source upload IDs outside the private plan inventory hash.';

-- ---------------------------------------------------------------------------
-- Master artefacts and one-to-one master <-> generation provenance.
-- ---------------------------------------------------------------------------

alter table public.astro_masters
  add column if not exists mosaic_generation_id uuid,
  add column if not exists archive_ingest_run_id uuid,
  add column if not exists fits_storage_path text,
  add column if not exists fits_sha256 text,
  add column if not exists fits_byte_size bigint,
  add column if not exists preview_storage_path text,
  add column if not exists preview_sha256 text,
  add column if not exists preview_byte_size bigint,
  add column if not exists source_uploads_count integer not null default 0,
  add column if not exists spatial_coverage_fraction double precision,
  add column if not exists is_partial boolean not null default true,
  add column if not exists native_pixel_scale_arcsec double precision,
  add column if not exists output_pixel_scale_arcsec double precision,
  add column if not exists width_px integer,
  add column if not exists height_px integer,
  add column if not exists verification jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.astro_masters'::regclass
      and conname = 'astro_masters_mosaic_generation_id_fkey'
  ) then
    alter table public.astro_masters
      add constraint astro_masters_mosaic_generation_id_fkey
      foreign key (mosaic_generation_id)
      references public.mosaic_generations(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.astro_masters'::regclass
      and conname = 'astro_masters_archive_ingest_run_id_fkey'
  ) then
    alter table public.astro_masters
      add constraint astro_masters_archive_ingest_run_id_fkey
      foreign key (archive_ingest_run_id)
      references public.archive_ingest_runs(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.astro_masters'::regclass
      and conname = 'astro_masters_v9_artifacts_check'
  ) then
    alter table public.astro_masters
      add constraint astro_masters_v9_artifacts_check check (
        source_uploads_count >= 0
        and (spatial_coverage_fraction is null or spatial_coverage_fraction between 0 and 1)
        and (fits_byte_size is null or fits_byte_size > 0)
        and (preview_byte_size is null or preview_byte_size > 0)
        and (native_pixel_scale_arcsec is null or native_pixel_scale_arcsec > 0)
        and (output_pixel_scale_arcsec is null or output_pixel_scale_arcsec > 0)
        and (width_px is null or width_px > 0)
        and (height_px is null or height_px > 0)
        and (fits_sha256 is null or fits_sha256 ~ '^[0-9a-f]{64}$')
        and (preview_sha256 is null or preview_sha256 ~ '^[0-9a-f]{64}$')
        and jsonb_typeof(verification) = 'object'
      ) not valid;
  end if;
end;
$$;

alter table public.astro_masters
  validate constraint astro_masters_mosaic_generation_id_fkey;
alter table public.astro_masters
  validate constraint astro_masters_archive_ingest_run_id_fkey;
alter table public.astro_masters
  validate constraint astro_masters_v9_artifacts_check;

-- If legacy data ever contains more than one current master, retain the newest
-- deterministically before installing the invariant.
with ranked as (
  select id,
         row_number() over (
           partition by object_id
           order by created_at desc, id desc
         ) as position
  from public.astro_masters
  where is_current
)
update public.astro_masters m
set is_current = false
from ranked r
where r.id = m.id and r.position > 1;

create unique index if not exists astro_masters_object_generation_unique
  on public.astro_masters(object_id, generation);
create unique index if not exists astro_masters_mosaic_generation_unique
  on public.astro_masters(mosaic_generation_id)
  where mosaic_generation_id is not null;
create unique index if not exists astro_masters_one_current_per_object
  on public.astro_masters(object_id)
  where is_current;
create unique index if not exists astro_masters_fits_storage_path_unique
  on public.astro_masters(fits_storage_path)
  where fits_storage_path is not null;
create unique index if not exists astro_masters_preview_storage_path_unique
  on public.astro_masters(preview_storage_path)
  where preview_storage_path is not null;

comment on column public.astro_masters.mosaic_generation_id is
  'Unique generation that produced this master. A linked master remains non-current until atomic activation.';
comment on column public.astro_masters.spatial_coverage_fraction is
  'Fraction of the declared object footprint represented by finite master pixels; not a claim of full-object coverage.';
comment on column public.astro_masters.output_pixel_scale_arcsec is
  'Actual delivered master scale. It must be recorded when storage preflight chooses a coarser scale than native input.';

-- ---------------------------------------------------------------------------
-- Lock and normalize a preflight plan.  The worker writes
-- verification.tile_plan as [{"order": 7, "index": ...}, ...] before it
-- renders.  PostgreSQL normalizes, counts and hashes it, and freezes the exact
-- eligible source inventory for the archive run.
-- ---------------------------------------------------------------------------

create or replace function private.guard_mosaic_generation_preflight()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_plan jsonb;
  plan_count integer;
  unique_plan_count integer;
  computed_plan_sha text;
  inventory_count integer;
  inventory_sha text;
begin
  if tg_op = 'UPDATE' and old.preflight_locked_at is not null then
    if new.archive_ingest_run_id is distinct from old.archive_ingest_run_id
       or new.planned_tiles is distinct from old.planned_tiles
       or new.expected_tiles is distinct from old.expected_tiles
       or new.planned_tiles_sha256 is distinct from old.planned_tiles_sha256
       or new.expected_source_uploads is distinct from old.expected_source_uploads
       or new.source_inventory_sha256 is distinct from old.source_inventory_sha256
       or new.preflight_locked_at is distinct from old.preflight_locked_at
       or new.verification->'tile_plan' is distinct from old.verification->'tile_plan' then
      raise exception using
        errcode = '23514',
        message = 'mosaic generation preflight is immutable once locked';
    end if;
    return new;
  end if;

  if new.preflight_locked_at is not null
     and not (new.verification ? 'tile_plan') then
    raise exception using
      errcode = '23514',
      message = 'preflight lock requires verification.tile_plan';
  end if;

  if new.verification ? 'tile_plan' then
    if jsonb_typeof(new.verification->'tile_plan') <> 'array'
       or jsonb_array_length(new.verification->'tile_plan') = 0 then
      raise exception using
        errcode = '23514',
        message = 'verification.tile_plan must be a non-empty JSON array';
    end if;

    with raw_plan as (
      select (entry->>'order')::smallint as healpix_order,
             (entry->>'index')::bigint as healpix_index
      from jsonb_array_elements(new.verification->'tile_plan') as entry
    ), checked_plan as (
      select healpix_order, healpix_index
      from raw_plan
      where healpix_order between 0 and 12
        and healpix_index >= 0
        and healpix_index < (12::bigint * (1::bigint << (2 * healpix_order)))
    )
    select jsonb_agg(
             jsonb_build_object('order', healpix_order, 'index', healpix_index)
             order by healpix_order, healpix_index
           ),
           count(*)::integer,
           count(distinct (healpix_order, healpix_index))::integer
    into normalized_plan, plan_count, unique_plan_count
    from checked_plan;

    if normalized_plan is null
       or plan_count <> jsonb_array_length(new.verification->'tile_plan')
       or unique_plan_count <> plan_count then
      raise exception using
        errcode = '23514',
        message = 'tile plan contains an invalid or duplicate NESTED cell';
    end if;

    computed_plan_sha := encode(
      extensions.digest(convert_to(normalized_plan::text, 'UTF8'), 'sha256'),
      'hex'
    );

    if new.archive_ingest_run_id is null then
      raise exception using
        errcode = '23514',
        message = 'archive generation preflight requires archive_ingest_run_id';
    end if;

    select count(*)::integer,
           encode(
             extensions.digest(
               convert_to(
                 string_agg(source.id::text, E'\n' order by source.id::text) || E'\n',
                 'UTF8'
               ),
               'sha256'
             ),
             'hex'
           )
    into inventory_count, inventory_sha
    from (
      select distinct u.id
      from public.archive_items ai
      join public.astro_uploads u on u.id = ai.upload_id
      join public.astro_quality_metrics q
        on q.upload_id = u.id
       and q.pipeline_version = new.pipeline_version
      where ai.ingest_run_id = new.archive_ingest_run_id
        and u.pipeline_version = new.pipeline_version
        and q.eligible
        and not u.rejected
        and u.deleted_at is null
        and u.status in ('approved','published','stacked')
    ) as source;

    if inventory_count <= 0 then
      raise exception using
        errcode = '23514',
        message = 'archive generation preflight has no eligible source';
    end if;

    new.verification := new.verification || jsonb_build_object(
      'tile_plan', normalized_plan,
      'healpix_scheme', 'NESTED',
      'planned_tiles', plan_count,
      'planned_tiles_sha256', computed_plan_sha,
      'expected_source_uploads', inventory_count,
      'source_inventory_sha256', inventory_sha
    );
    new.planned_tiles := plan_count;
    new.expected_tiles := plan_count;
    new.planned_tiles_sha256 := computed_plan_sha;
    new.expected_source_uploads := inventory_count;
    new.source_inventory_sha256 := inventory_sha;
    new.preflight_locked_at := coalesce(new.preflight_locked_at, now());
  end if;

  if new.status = 'verifying'
     and new.archive_ingest_run_id is not null
     and new.preflight_locked_at is null then
    raise exception using
      errcode = '23514',
      message = 'verifying generation requires a locked preflight plan';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_mosaic_generation_preflight on public.mosaic_generations;
create trigger guard_mosaic_generation_preflight
before insert or update on public.mosaic_generations
for each row execute function private.guard_mosaic_generation_preflight();

revoke all on function private.guard_mosaic_generation_preflight()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Secure master trigger.  Linked masters are forced to staging while their
-- generation is not complete.  On activation the preview, never the FITS
-- payload, becomes astro_objects.master_image_url.
-- ---------------------------------------------------------------------------

drop trigger if exists trigger_update_object_master on public.astro_masters;

create or replace function public.update_object_master()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_status text;
  linked_generation integer;
  linked_run uuid;
  linked_object text;
begin
  if new.mosaic_generation_id is not null then
    select g.status, g.generation, g.archive_ingest_run_id, r.object_id
    into linked_status, linked_generation, linked_run, linked_object
    from public.mosaic_generations g
    left join public.archive_ingest_runs r on r.id = g.archive_ingest_run_id
    where g.id = new.mosaic_generation_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'linked mosaic generation does not exist';
    end if;
    if new.generation <> linked_generation then
      raise exception using
        errcode = '23514',
        message = 'master and mosaic generation numbers differ';
    end if;
    if new.archive_ingest_run_id is null then
      new.archive_ingest_run_id := linked_run;
    end if;
    if new.archive_ingest_run_id is distinct from linked_run then
      raise exception using
        errcode = '23514',
        message = 'master and mosaic generation archive runs differ';
    end if;
    if linked_object is not null and new.object_id is distinct from linked_object then
      raise exception using
        errcode = '23514',
        message = 'master object differs from archive run object';
    end if;

    -- A renderer may insert a master with the legacy default is_current=true;
    -- linked v9 masters are nevertheless staged until atomic activation.
    if linked_status <> 'complete' then
      new.is_current := false;
    end if;
  end if;

  if new.is_current then
    update public.astro_masters
    set is_current = false
    where object_id = new.object_id
      and id <> new.id
      and is_current;

    update public.astro_objects
    set master_image_url = coalesce(
          nullif(new.thumbnail_url, ''),
          new.image_url
        ),
        master_updated_at = now()
    where id = new.object_id;
  end if;

  return new;
end;
$$;

create trigger trigger_update_object_master
before insert or update on public.astro_masters
for each row execute function public.update_object_master();

revoke all on function public.update_object_master()
  from public, anon, authenticated;
grant execute on function public.update_object_master() to service_role;

-- ---------------------------------------------------------------------------
-- Atomic archive generation + master activation.  The function validates the
-- immutable plan, its NESTED pyramid, exact source inventory, every derivative
-- row/object and the staged master before changing any current pointer.
-- ---------------------------------------------------------------------------

create or replace function private.activate_archive_master_generation(
  p_generation_id uuid,
  p_master_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.mosaic_generations%rowtype;
  staged_master public.astro_masters%rowtype;
  target_layer_id uuid;
  plan_json jsonb;
  computed_plan_sha text;
  plan_count integer;
  unique_plan_count integer;
  plan_min_order smallint;
  plan_max_order smallint;
  actual_tiles integer;
  actual_cells integer;
  inventory_count integer;
  inventory_sha text;
  inventory_exposure_hours double precision;
  union_source_count integer;
begin
  select g.layer_id
  into target_layer_id
  from public.mosaic_generations g
  where g.id = p_generation_id;
  if target_layer_id is null then
    raise exception using errcode = 'P0002', message = 'mosaic generation not found';
  end if;

  -- Serialize activations for a layer before locking its candidate generation.
  perform 1
  from public.mosaic_layers l
  where l.id = target_layer_id
  for update;

  select *
  into target
  from public.mosaic_generations g
  where g.id = p_generation_id
  for update;

  select *
  into staged_master
  from public.astro_masters m
  where m.id = p_master_id
  for update;

  if staged_master.id is null then
    raise exception using errcode = 'P0002', message = 'staged archive master not found';
  end if;
  if target.status <> 'verifying'
     or target.preflight_locked_at is null
     or target.archive_ingest_run_id is null
     or target.source_job_id is null
     or target.manifest_path is null
     or target.manifest_sha256 !~ '^[0-9a-f]{64}$'
     or target.failed_tiles <> 0
     or not (target.verification @> '{"validated": true}'::jsonb) then
    raise exception using
      errcode = '23514',
      message = 'generation is not ready for archive-master v9 activation';
  end if;

  plan_json := target.verification->'tile_plan';
  if jsonb_typeof(plan_json) <> 'array'
     or target.verification->>'healpix_scheme' <> 'NESTED' then
    raise exception using errcode = '23514', message = 'missing normalized NESTED tile plan';
  end if;

  computed_plan_sha := encode(
    extensions.digest(convert_to(plan_json::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if target.planned_tiles_sha256 is distinct from computed_plan_sha
     or target.verification->>'planned_tiles_sha256' is distinct from target.planned_tiles_sha256
     or (target.verification->>'planned_tiles')::integer is distinct from target.planned_tiles
     or (target.verification->>'expected_source_uploads')::integer is distinct from target.expected_source_uploads
     or target.verification->>'source_inventory_sha256' is distinct from target.source_inventory_sha256
     or target.verification->>'manifest_sha256' is distinct from target.manifest_sha256 then
    raise exception using errcode = '23514', message = 'generation verification envelope mismatch';
  end if;

  with plan as (
    select (entry->>'order')::smallint as healpix_order,
           (entry->>'index')::bigint as healpix_index
    from jsonb_array_elements(plan_json) as entry
  )
  select count(*)::integer,
         count(distinct (healpix_order, healpix_index))::integer,
         min(healpix_order),
         max(healpix_order)
  into plan_count, unique_plan_count, plan_min_order, plan_max_order
  from plan;

  if plan_count <= 0
     or plan_count <> unique_plan_count
     or plan_count <> target.planned_tiles
     or target.expected_tiles <> target.planned_tiles
     or target.published_tiles <> target.expected_tiles then
    raise exception using errcode = '23514', message = 'planned/expected/published tile counts differ';
  end if;

  -- Every non-root cell must have its NESTED parent and every non-leaf cell at
  -- least one child. This rejects the incoherent v8 25+6+2 pseudo-pyramid.
  if exists (
    with plan as (
      select (entry->>'order')::smallint as healpix_order,
             (entry->>'index')::bigint as healpix_index
      from jsonb_array_elements(plan_json) as entry
    )
    select 1
    from plan child
    where child.healpix_order > plan_min_order
      and not exists (
        select 1 from plan parent
        where parent.healpix_order = child.healpix_order - 1
          and parent.healpix_index = child.healpix_index / 4
      )
  ) or exists (
    with plan as (
      select (entry->>'order')::smallint as healpix_order,
             (entry->>'index')::bigint as healpix_index
      from jsonb_array_elements(plan_json) as entry
    )
    select 1
    from plan parent
    where parent.healpix_order < plan_max_order
      and not exists (
        select 1 from plan child
        where child.healpix_order = parent.healpix_order + 1
          and child.healpix_index / 4 = parent.healpix_index
      )
  ) then
    raise exception using errcode = '23514', message = 'tile plan is not a closed NESTED pyramid';
  end if;

  -- Recompute the exact eligible inventory at activation. Any source added,
  -- removed or requalified after preflight invalidates the frozen inventory.
  select count(*)::integer,
         encode(
           extensions.digest(
             convert_to(
               string_agg(source.id::text, E'\n' order by source.id::text) || E'\n',
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         ),
         coalesce(sum(source.exposure_s), 0)::double precision / 3600.0
  into inventory_count, inventory_sha, inventory_exposure_hours
  from (
    select distinct u.id, u.exposure_s
    from public.archive_items ai
    join public.astro_uploads u on u.id = ai.upload_id
    join public.astro_quality_metrics q
      on q.upload_id = u.id
     and q.pipeline_version = target.pipeline_version
    where ai.ingest_run_id = target.archive_ingest_run_id
      and u.pipeline_version = target.pipeline_version
      and q.eligible
      and not u.rejected
      and u.deleted_at is null
      and u.status in ('approved','published','stacked')
  ) as source;

  if inventory_count <> target.expected_source_uploads
     or inventory_sha is distinct from target.source_inventory_sha256 then
    raise exception using errcode = '23514', message = 'eligible source inventory changed after preflight';
  end if;

  -- Eligible footprint rows must be derived from the persisted authoritative
  -- WCS solution, and every source must have at least one eligible cell.
  if exists (
    select 1
    from public.archive_items ai
    join public.astro_uploads u on u.id = ai.upload_id
    join public.astro_quality_metrics q
      on q.upload_id = u.id and q.pipeline_version = target.pipeline_version
    where ai.ingest_run_id = target.archive_ingest_run_id
      and q.eligible and not u.rejected and u.deleted_at is null
      and u.status in ('approved','published','stacked')
      and not exists (
        select 1 from public.astro_upload_cells c
        where c.upload_id = u.id and c.eligible
      )
  ) or exists (
    select 1
    from public.archive_items ai
    join public.astro_uploads u on u.id = ai.upload_id
    join public.astro_quality_metrics q
      on q.upload_id = u.id and q.pipeline_version = target.pipeline_version
    join public.astro_upload_cells c on c.upload_id = u.id and c.eligible
    left join public.astrometric_solutions s on s.id = c.astrometric_solution_id
    where ai.ingest_run_id = target.archive_ingest_run_id
      and q.eligible and not u.rejected and u.deleted_at is null
      and u.status in ('approved','published','stacked')
      and (
        s.id is null
        or s.upload_id <> u.id
        or s.pipeline_version <> target.pipeline_version
      )
  ) then
    raise exception using errcode = '23514', message = 'eligible footprint is missing its authoritative WCS solution';
  end if;

  select count(*)::integer,
         count(distinct (t.healpix_order, t.healpix_index))::integer
  into actual_tiles, actual_cells
  from public.mosaic_tiles t
  where t.generation_id = target.id;

  if actual_tiles <> target.expected_tiles
     or actual_cells <> target.expected_tiles then
    raise exception using errcode = '23514', message = 'actual tile rows differ from the locked plan';
  end if;

  if exists (
    with plan as (
      select (entry->>'order')::smallint as healpix_order,
             (entry->>'index')::bigint as healpix_index
      from jsonb_array_elements(plan_json) as entry
    ), actual as (
      select t.healpix_order, t.healpix_index
      from public.mosaic_tiles t
      where t.generation_id = target.id
    )
    (select * from plan except select * from actual)
    union all
    (select * from actual except select * from plan)
  ) then
    raise exception using errcode = '23514', message = 'actual tile coordinates differ from the locked plan';
  end if;

  if exists (
    select 1
    from public.mosaic_tiles t
    where t.generation_id = target.id
      and (
        t.sha256 !~ '^[0-9a-f]{64}$'
        or cardinality(t.source_upload_ids) = 0
        or jsonb_typeof(t.contribution_weights) <> 'object'
        or not exists (
          select 1 from storage.objects o
          where o.bucket_id = 'astro-derived' and o.name = t.storage_path
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'tile artefact, hash, sources or storage object is invalid';
  end if;

  -- Every advertised contribution must have an explicit weight. Geometry is
  -- intentionally not compared with legacy astro_upload_cells here: v8 used
  -- centre sampling, so those rows are not an authoritative v9 tile plan.
  if exists (
    select 1
    from public.mosaic_tiles t
    cross join lateral unnest(t.source_upload_ids) as source_id
    where t.generation_id = target.id
      and not (t.contribution_weights ? source_id::text)
  ) then
    raise exception using errcode = '23514', message = 'tile contribution is missing an explicit weight';
  end if;

  select count(distinct source_id)::integer
  into union_source_count
  from public.mosaic_tiles t
  cross join lateral unnest(t.source_upload_ids) as source_id
  where t.generation_id = target.id;

  if union_source_count <> target.expected_source_uploads
     or target.contributing_source_uploads <> target.expected_source_uploads then
    raise exception using errcode = '23514', message = 'contributing/expected source counts differ';
  end if;

  if exists (
    with eligible as (
      select distinct u.id
      from public.archive_items ai
      join public.astro_uploads u on u.id = ai.upload_id
      join public.astro_quality_metrics q
        on q.upload_id = u.id and q.pipeline_version = target.pipeline_version
      where ai.ingest_run_id = target.archive_ingest_run_id
        and q.eligible and not u.rejected and u.deleted_at is null
        and u.status in ('approved','published','stacked')
    ), contributing as (
      select distinct source_id as id
      from public.mosaic_tiles t
      cross join lateral unnest(t.source_upload_ids) as source_id
      where t.generation_id = target.id
    )
    (select * from eligible except select * from contributing)
    union all
    (select * from contributing except select * from eligible)
  ) then
    raise exception using errcode = '23514', message = 'contributing source IDs differ from eligible inventory';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'astro-derived' and o.name = target.manifest_path
  ) then
    raise exception using errcode = '23514', message = 'generation manifest storage object is missing';
  end if;

  if staged_master.mosaic_generation_id is distinct from target.id
     or staged_master.archive_ingest_run_id is distinct from target.archive_ingest_run_id
     or staged_master.generation <> target.generation
     or staged_master.is_current
     or staged_master.lights_stacked <> target.expected_source_uploads
     or staged_master.source_uploads_count <> target.expected_source_uploads
     or abs(staged_master.total_exposure_hours - inventory_exposure_hours) > 0.000001
     or staged_master.fits_storage_path is null
     or staged_master.fits_sha256 !~ '^[0-9a-f]{64}$'
     or staged_master.fits_byte_size is null
     or staged_master.preview_storage_path is null
     or staged_master.preview_sha256 !~ '^[0-9a-f]{64}$'
     or staged_master.preview_byte_size is null
     or staged_master.spatial_coverage_fraction is null
     or (staged_master.spatial_coverage_fraction < 1 and not staged_master.is_partial)
     or staged_master.native_pixel_scale_arcsec is null
     or staged_master.output_pixel_scale_arcsec is null
     or staged_master.width_px is null
     or staged_master.height_px is null
     or not (staged_master.verification @> '{"validated": true}'::jsonb)
     or staged_master.verification->>'fits_sha256' is distinct from staged_master.fits_sha256
     or staged_master.verification->>'preview_sha256' is distinct from staged_master.preview_sha256
     or staged_master.verification->>'source_inventory_sha256' is distinct from target.source_inventory_sha256 then
    raise exception using errcode = '23514', message = 'staged master does not satisfy archive-master v9 invariants';
  end if;

  if not exists (
    select 1 from public.archive_ingest_runs r
    where r.id = target.archive_ingest_run_id
      and r.object_id = staged_master.object_id
  ) then
    raise exception using errcode = '23514', message = 'master object differs from archive run object';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'astro-derived' and o.name = staged_master.fits_storage_path
  ) or not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'astro-derived' and o.name = staged_master.preview_storage_path
  ) then
    raise exception using errcode = '23514', message = 'master FITS or preview storage object is missing';
  end if;

  -- All pointer changes are in this transaction. A failure rolls back both
  -- generation and master currentness, leaving the previous pair untouched.
  update public.astro_masters
  set is_current = false
  where object_id = staged_master.object_id
    and id <> staged_master.id
    and is_current;

  update public.mosaic_generations
  set status = 'retired', updated_at = now()
  where layer_id = target.layer_id
    and status = 'complete'
    and id <> target.id;

  update public.mosaic_generations
  set status = 'complete', activated_at = now(), updated_at = now()
  where id = target.id;

  update public.astro_masters
  set is_current = true
  where id = staged_master.id;

  update public.mosaic_layers
  set current_generation_id = target.id
  where id = target.layer_id;

  return target.id;
end;
$$;

-- Backward-compatible name. Archive generations cannot bypass the linked v9
-- master contract; non-archive/community generations retain the historical
-- strict count + manifest activation path.
create or replace function private.activate_mosaic_generation(p_generation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_master_id uuid;
  target public.mosaic_generations%rowtype;
  target_layer_id uuid;
  tile_count integer;
begin
  select g.layer_id
  into target_layer_id
  from public.mosaic_generations g
  where g.id = p_generation_id;

  if target_layer_id is null then
    raise exception using errcode = 'P0002', message = 'mosaic generation not found';
  end if;

  select *
  into target
  from public.mosaic_generations g
  where g.id = p_generation_id;

  if target.archive_ingest_run_id is null then
    perform 1
    from public.mosaic_layers l
    where l.id = target_layer_id
    for update;

    select *
    into target
    from public.mosaic_generations g
    where g.id = p_generation_id
    for update;

    if target.status <> 'verifying'
       or target.manifest_path is null
       or target.manifest_sha256 is null
       or target.expected_tiles <= 0 then
      raise exception using
        errcode = '23514',
        message = 'community generation is not verifiable';
    end if;

    select count(*)::integer
    into tile_count
    from public.mosaic_tiles t
    where t.generation_id = target.id;

    if tile_count <> target.expected_tiles
       or tile_count <> target.published_tiles then
      raise exception using
        errcode = '23514',
        message = 'community generation tile count mismatch';
    end if;

    update public.mosaic_generations
    set status = 'retired', updated_at = now()
    where layer_id = target.layer_id
      and status = 'complete'
      and id <> target.id;

    update public.mosaic_generations
    set status = 'complete', activated_at = now(), updated_at = now()
    where id = target.id;

    update public.mosaic_layers
    set current_generation_id = target.id
    where id = target.layer_id;

    return target.id;
  end if;

  select m.id
  into linked_master_id
  from public.astro_masters m
  where m.mosaic_generation_id = p_generation_id;

  if linked_master_id is null then
    raise exception using
      errcode = '23514',
      message = 'archive-master v9 activation requires a linked staged master';
  end if;

  return private.activate_archive_master_generation(p_generation_id, linked_master_id);
end;
$$;

revoke all on function private.activate_archive_master_generation(uuid, uuid),
  private.activate_mosaic_generation(uuid)
from public, anon, authenticated;
grant execute on function private.activate_archive_master_generation(uuid, uuid),
  private.activate_mosaic_generation(uuid)
to service_role;

comment on function private.activate_archive_master_generation(uuid, uuid) is
  'Atomically activates an exactly verified NESTED archive mosaic and its staged master; service_role only.';

-- ---------------------------------------------------------------------------
-- Server-only status RPC.  It is intentionally an explicit JSON allowlist:
-- no processing payload/result/error detail, raw storage path, remote URL,
-- source upload UUID or contribution weight is returned.
-- ---------------------------------------------------------------------------

create or replace function public.get_archive_master_status_v9(
  p_object_id text default 'M31'
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with object_row as (
    select o.*
    from public.astro_objects o
    where o.id = p_object_id
  ), latest_run as (
    select r.*, s.name as source_name
    from public.archive_ingest_runs r
    join public.archive_sources s on s.id = r.source_id
    where r.object_id = p_object_id
    order by r.started_at desc, r.id desc
    limit 1
  ), qualification as (
    select
      count(*) filter (where ai.upload_id is not null)::integer as total,
      count(*) filter (
        where ai.upload_id is not null
          and q.eligible
          and not u.rejected
          and u.status in ('approved','published','stacked')
      )::integer as accepted,
      count(*) filter (
        where ai.upload_id is not null
          and (not coalesce(q.eligible, false) or u.rejected or u.status = 'rejected')
      )::integer as rejected,
      count(*) filter (
        where ai.upload_id is not null
          and u.status not in ('published','stacked','rejected','duplicate','cancelled','failed')
      )::integer as active,
      count(*) filter (where ai.upload_id is not null and u.status = 'failed')::integer as failed
    from public.archive_items ai
    left join public.astro_uploads u on u.id = ai.upload_id
    left join public.astro_quality_metrics q
      on q.upload_id = u.id and q.pipeline_version = u.pipeline_version
    where ai.ingest_run_id = (select r.id from latest_run r)
  ), latest_generation as (
    select g.*
    from public.mosaic_generations g
    where g.archive_ingest_run_id = (select r.id from latest_run r)
    order by g.generation desc, g.created_at desc, g.id desc
    limit 1
  ), build_row as (
    select g.*,
           j.status as job_status,
           j.progress as job_progress,
           (select count(*)::integer from public.mosaic_tiles t where t.generation_id = g.id) as actual_tiles
    from latest_generation g
    left join public.processing_jobs j on j.id = g.source_job_id
  ), current_master as (
    select m.*
    from public.astro_masters m
    where m.object_id = p_object_id and m.is_current
    order by m.generation desc, m.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'object', (
      select jsonb_build_object(
        'id', o.id,
        'common_name', o.common_name,
        'type', o.type,
        'ra_deg', o.ra_deg,
        'dec_deg', o.dec_deg,
        'total_lights', o.total_lights,
        'total_exposure_hours', o.total_exposure_hours,
        'total_contributors', o.total_contributors,
        'master_image_url', o.master_image_url,
        'master_updated_at', o.master_updated_at
      ) from object_row o
    ),
    'run', (
      select jsonb_build_object(
        'status', r.status,
        'source_id', r.source_id,
        'source_name', r.source_name,
        'spectral_band', r.spectral_band,
        'discovered_files', r.discovered_files,
        'registered_files', r.registered_files,
        'rejected_files', r.rejected_files,
        'downloaded_bytes', r.downloaded_bytes,
        'started_at', r.started_at,
        'completed_at', r.completed_at
      ) from latest_run r
    ),
    'qualification', (
      select jsonb_build_object(
        'total', q.total,
        'accepted', q.accepted,
        'rejected', q.rejected,
        'active', q.active,
        'failed', q.failed
      ) from qualification q
    ),
    'build', (
      select jsonb_build_object(
        'status', b.status,
        'job_status', b.job_status,
        'progress', coalesce(b.job_progress, 0),
        'generation', b.generation,
        'planned_tiles', b.planned_tiles,
        'expected_tiles', b.expected_tiles,
        'published_tiles', b.published_tiles,
        'actual_tiles', b.actual_tiles,
        'failed_tiles', b.failed_tiles,
        'expected_sources', b.expected_source_uploads,
        'contributing_sources', b.contributing_source_uploads,
        'created_at', b.created_at,
        'activated_at', b.activated_at
      ) from build_row b
    ),
    'master', (
      select jsonb_build_object(
        'generation', m.generation,
        'image_url', m.image_url,
        'thumbnail_url', m.thumbnail_url,
        'preview_storage_path', m.preview_storage_path,
        'fits_storage_path', m.fits_storage_path,
        'lights_stacked', m.lights_stacked,
        'total_exposure_hours', m.total_exposure_hours,
        'final_snr', m.final_snr,
        'final_fwhm', m.final_fwhm,
        'dynamic_range_stops', m.dynamic_range_stops,
        'source_uploads_count', m.source_uploads_count,
        'spatial_coverage_fraction', m.spatial_coverage_fraction,
        'is_partial', m.is_partial,
        'native_pixel_scale_arcsec', m.native_pixel_scale_arcsec,
        'output_pixel_scale_arcsec', m.output_pixel_scale_arcsec,
        'width_px', m.width_px,
        'height_px', m.height_px,
        'created_at', m.created_at
      ) from current_master m
    )
  )
  from object_row root_object;
$$;

revoke all on function public.get_archive_master_status_v9(text)
  from public, anon, authenticated;
grant execute on function public.get_archive_master_status_v9(text) to service_role;

comment on function public.get_archive_master_status_v9(text) is
  'Service-only allowlisted archive build/master status used by the server route; never expose the service key to clients.';

-- ---------------------------------------------------------------------------
-- Stack request CPU guard. A transaction-level advisory lock gives callers an
-- idempotent active/cooldown response, while the partial unique index is the
-- database backstop against concurrent stack jobs for the same object.
-- ---------------------------------------------------------------------------

create unique index if not exists processing_jobs_one_active_stack_per_object
  on public.processing_jobs(object_id)
  where job_type = 'stack_object'
    and object_id is not null
    and completed_at is null;

create or replace function public.request_stack_job(
  p_object_id text,
  p_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lights uuid[];
  darks uuid[];
  flats uuid[];
  biases uuid[];
  stack_id uuid;
  existing_status text;
  existing_object_id text;
  existing_job_type text;
  existing_lights integer;
  existing_completed_at timestamptz;
  latest_terminal_at timestamptz;
begin
  if p_object_id is null or btrim(p_object_id) = ''
     or p_user_id is null
     or p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception using errcode = '22023', message = 'invalid stack request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stack-object:' || p_object_id, 0)
  );

  -- An idempotency key always replays its original generic state and never
  -- reveals either the processing UUID or the legacy stacking UUID.
  select j.status, j.object_id, j.job_type, sj.lights_count, j.completed_at
  into existing_status, existing_object_id, existing_job_type, existing_lights,
       existing_completed_at
  from public.processing_jobs j
  left join public.astro_stacking_jobs sj
    on sj.id::text = j.payload->>'stacking_job_id'
  where j.idempotency_key = p_idempotency_key
  for update of j;

  if found then
    if existing_job_type <> 'stack_object'
       or existing_object_id is distinct from p_object_id then
      raise exception using errcode = '23505', message = 'idempotency key belongs to another request';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'lights_count', coalesce(existing_lights, 0),
      'state', case
        when existing_completed_at is null then 'active'
        when existing_status = 'published' then 'completed'
        else 'terminal'
      end
    );
  end if;

  -- Reuse the active job for this object even when a retry arrived with a new
  -- idempotency key (browser refresh, double click, or concurrent API call).
  select j.status, sj.lights_count
  into existing_status, existing_lights
  from public.processing_jobs j
  left join public.astro_stacking_jobs sj
    on sj.id::text = j.payload->>'stacking_job_id'
  where j.job_type = 'stack_object'
    and j.object_id = p_object_id
    and j.completed_at is null
  order by j.created_at desc
  limit 1
  for update of j;

  if found then
    return jsonb_build_object(
      'replayed', true,
      'lights_count', coalesce(existing_lights, 0),
      'state', 'active'
    );
  end if;

  -- Avoid an immediate expensive rebuild after any terminal outcome. The
  -- server can invite the user to retry after the fixed fifteen-minute window.
  select coalesce(j.completed_at, j.updated_at), sj.lights_count
  into latest_terminal_at, existing_lights
  from public.processing_jobs j
  left join public.astro_stacking_jobs sj
    on sj.id::text = j.payload->>'stacking_job_id'
  where j.job_type = 'stack_object'
    and j.object_id = p_object_id
    and j.status in ('published','rejected','duplicate','cancelled','failed')
  order by coalesce(j.completed_at, j.updated_at) desc
  limit 1;

  if latest_terminal_at is not null
     and latest_terminal_at > now() - interval '15 minutes' then
    return jsonb_build_object(
      'replayed', true,
      'lights_count', coalesce(existing_lights, 0),
      'state', 'cooldown'
    );
  end if;

  select array_agg(id order by quality_score desc, uploaded_at)
           filter (where frame_type = 'light'),
         array_agg(id order by quality_score desc, uploaded_at)
           filter (where frame_type = 'dark'),
         array_agg(id order by quality_score desc, uploaded_at)
           filter (where frame_type = 'flat'),
         array_agg(id order by quality_score desc, uploaded_at)
           filter (where frame_type = 'bias')
  into lights, darks, flats, biases
  from public.astro_uploads
  where object_id = p_object_id
    and not rejected
    and deleted_at is null
    and status in ('approved','published','stacked');

  if coalesce(cardinality(lights), 0) < 3 then
    raise exception using
      errcode = '23514',
      message = 'at least three approved light frames are required';
  end if;

  insert into public.astro_stacking_jobs(
    object_id, light_ids, dark_ids, flat_ids, bias_ids,
    lights_count, status, started_at
  ) values (
    p_object_id,
    coalesce(lights, '{}'),
    coalesce(darks, '{}'),
    coalesce(flats, '{}'),
    coalesce(biases, '{}'),
    cardinality(lights),
    'pending',
    null
  )
  returning id into stack_id;

  insert into public.processing_jobs(
    job_type, object_id, owner_user_id, status, payload, idempotency_key
  ) values (
    'stack_object',
    p_object_id,
    p_user_id,
    'approved',
    jsonb_build_object('stacking_job_id', stack_id),
    p_idempotency_key
  );

  return jsonb_build_object(
    'replayed', false,
    'lights_count', cardinality(lights),
    'state', 'queued'
  );
end;
$$;

revoke all on function public.request_stack_job(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.request_stack_job(text, uuid, text) to service_role;

comment on function public.request_stack_job(text, uuid, text) is
  'Service-only, serialized stack request. Returns only replayed, lights_count and a generic state; never internal job identifiers.';

-- ---------------------------------------------------------------------------
-- Close legacy table reads now served by authenticated server routes and the
-- allowlisted status RPC. The current frontend uses createAdminClient for all
-- three tables, so removing anon/authenticated SELECT does not change its
-- application contract. service_role remains the sole worker/server reader.
--
-- This is independent from public Storage delivery: astro-derived stays a
-- public bucket and direct object GET URLs continue to work without a
-- storage.objects SELECT policy.
-- ---------------------------------------------------------------------------

drop policy if exists "anyone_view_jobs" on public.astro_stacking_jobs;
drop policy if exists "public_read_current_tiles" on public.mosaic_tiles;
drop policy if exists "anyone_view_uploads" on public.astro_uploads;
drop policy if exists "users_read_own_uploads" on public.astro_uploads;

revoke select on table public.astro_stacking_jobs
  from public, anon, authenticated;
revoke select on table public.mosaic_tiles
  from public, anon, authenticated;
revoke select on table public.astro_uploads
  from public, anon, authenticated;

grant all on table public.astro_stacking_jobs,
  public.mosaic_tiles,
  public.astro_uploads
to service_role;

-- Fix only rows that still contain the Unicode replacement character. This is
-- idempotent and does not overwrite a later editorial change.
update public.astro_objects o
set common_name = case
      when position(chr(65533) in coalesce(o.common_name, '')) > 0
        then corrected.common_name
      else o.common_name
    end,
    description = case
      when position(chr(65533) in coalesce(o.description, '')) > 0
        then corrected.description
      else o.description
    end
from (values
  ('M31', 'Andromède', 'Grande galaxie spirale de la constellation d''Andromède'),
  ('M42', 'Nébuleuse d''Orion', 'Nébuleuse diffuse géante dans la constellation d''Orion'),
  ('M45', 'Pléiades', 'Amas ouvert brillant dans le Taureau'),
  ('M57', 'Nébuleuse de l''Anneau', 'Nébuleuse planétaire dans la Lyre'),
  ('M13', 'Amas d''Hercule', 'Plus grand amas globulaire de l''hémisphère nord'),
  ('M27', 'Nébuleuse Haltère', 'Nébuleuse planétaire dans le Petit Renard'),
  ('NGC7000', 'Nébuleuse Amérique du Nord', 'Grande nébuleuse en émission en forme de continent'),
  ('IC1805', 'Nébuleuse du Coeur', 'Nébuleuse en émission dans Cassiopée'),
  ('M104', 'Galaxie Sombrero', 'Galaxie spirale avec anneau de poussière proéminent'),
  ('NGC4889', '', 'Galaxie elliptique géante dans la Chevelure de Bérénice')
) as corrected(id, common_name, description)
where o.id = corrected.id
  and (
    position(chr(65533) in coalesce(o.common_name, '')) > 0
    or position(chr(65533) in coalesce(o.description, '')) > 0
  );

-- astro-derived remains a public bucket for stable GET URLs, but public bucket
-- downloads do not require a storage.objects SELECT policy. Removing this
-- policy prevents anonymous/authenticated directory listing while preserving
-- direct public derivative URLs and all private-owner policies.
drop policy if exists "public_read_astro_derivatives" on storage.objects;

commit;
