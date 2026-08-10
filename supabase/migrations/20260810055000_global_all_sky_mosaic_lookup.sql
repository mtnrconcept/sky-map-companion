begin;

create index if not exists mosaic_tiles_global_lookup_idx
  on public.mosaic_tiles(healpix_order, healpix_index, generation_id)
  where media_type = 'image/webp';

create or replace function public.resolve_global_mosaic_tile(
  p_order smallint,
  p_index bigint
)
returns table(
  tile_path text,
  layer_slug text,
  object_id text,
  generation integer,
  coverage_fraction double precision
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
    t.coverage_fraction
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
    case
      when l.spectral_band in ('broadband', 'rgb', 'color') then 0
      when l.spectral_band = 'r' then 1
      else 2
    end,
    m.output_pixel_scale_arcsec asc nulls last,
    t.coverage_fraction desc,
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

comment on function public.resolve_global_mosaic_tile(smallint, bigint) is
  'Resolves one HEALPix cell to the best currently activated Sky Map WebP tile across every object/layer. Server-side service role only.';

notify pgrst, 'reload schema';

commit;
