begin;

alter table public.archive_ingest_runs
  alter column object_id drop not null;

alter table public.archive_items
  alter column object_id drop not null;

alter table public.archive_ingest_runs
  drop constraint if exists archive_ingest_runs_target_scope_check;
alter table public.archive_ingest_runs
  add constraint archive_ingest_runs_target_scope_check
  check (
    object_id is not null
    or (
      source_id = 'mast-ps1'
      and query->>'target_mode' = 'sky_seed'
      and query ? 'target_ra_deg'
      and query ? 'target_dec_deg'
      and query ? 'seed_healpix_order'
      and query ? 'seed_healpix_index'
    )
  ) not valid;
alter table public.archive_ingest_runs
  validate constraint archive_ingest_runs_target_scope_check;

drop policy if exists archive_catalog_runner_items on public.archive_items;
create policy archive_catalog_runner_items
on public.archive_items for all to archive_catalog_runner
using (
  source_id = 'mast-ps1'
  and exists (
    select 1 from public.archive_ingest_runs r
    where r.id = archive_items.ingest_run_id
      and r.source_id = 'mast-ps1'
      and r.object_id is not distinct from archive_items.object_id
  )
)
with check (
  source_id = 'mast-ps1'
  and exists (
    select 1 from public.archive_ingest_runs r
    where r.id = archive_items.ingest_run_id
      and r.source_id = 'mast-ps1'
      and r.object_id is not distinct from archive_items.object_id
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
      and i.object_id is not distinct from astro_uploads.object_id
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
      and i.object_id is not distinct from astro_uploads.object_id
  )
);

grant execute on function private.activate_mosaic_generation(uuid)
  to archive_catalog_runner;

create or replace function public.resolve_global_mosaic_tile(
  p_order smallint,
  p_index bigint
)
returns table(
  tile_path text,
  layer_slug text,
  object_id text,
  generation integer,
  contributing_sources integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.storage_path,
    l.slug,
    m.object_id,
    g.generation,
    cardinality(t.source_upload_ids)::integer
  from public.mosaic_layers l
  join public.mosaic_generations g
    on g.id = l.current_generation_id
   and g.status = 'complete'
   and g.activated_at is not null
  join public.mosaic_tiles t
    on t.generation_id = g.id
  left join public.astro_masters m
    on m.mosaic_generation_id = g.id
   and m.is_current
  where t.healpix_order = p_order
    and t.healpix_index = p_index
    and t.media_type = 'image/webp'
    and t.storage_path like 'hips/%'
  order by
    case when l.slug ~ '^sky-ps1-[grizy]-global-loworder$' then 0 else 1 end,
    case
      when l.spectral_band in ('broadband', 'rgb', 'color') then 0
      when l.spectral_band = 'r' then 1
      else 2
    end,
    m.output_pixel_scale_arcsec asc nulls last,
    cardinality(t.source_upload_ids) desc,
    m.source_uploads_count desc nulls last,
    g.activated_at desc,
    l.slug
  limit 1;
$$;

alter function public.resolve_global_mosaic_tile(smallint, bigint) owner to postgres;
revoke all on function public.resolve_global_mosaic_tile(smallint, bigint)
  from public, anon, authenticated;
grant execute on function public.resolve_global_mosaic_tile(smallint, bigint)
  to service_role;

comment on constraint archive_ingest_runs_target_scope_check on public.archive_ingest_runs is
  'Archive ingestion either targets a catalogued object or a bounded catalogue-independent PS1 sky seed with explicit ICRS coordinates and HEALPix identity.';

comment on function private.activate_mosaic_generation(uuid) is
  'Atomically activates a verified generic mosaic generation or delegates archive-master v9 activation when an archive ingest run is linked.';

comment on function public.resolve_global_mosaic_tile(smallint, bigint) is
  'Resolves a HEALPix cell globally, preferring the derived low-order aggregate that preserves every activated public field when several fields share one parent cell.';

notify pgrst, 'reload schema';

commit;
