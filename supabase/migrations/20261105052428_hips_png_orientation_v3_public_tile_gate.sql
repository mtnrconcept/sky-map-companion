-- Block known misregistered TAN-projected and 90°-rotated v2 Npix images from the public
-- sky map. They remain immutable in Storage for audit and rollback; the
-- background uses a real external HiPS until versioned HEALPix images publish.
-- The function's signature, grants and security behavior remain unchanged.
begin;

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
language sql stable security definer
set search_path to ''
as $function$
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
    and g.recipe->>'hips_pixel_geometry_version' = 'nested-icrs-cds-png-orientation-v3'
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
$function$;

comment on function public.resolve_global_mosaic_tile(smallint, bigint)
  is 'Only release pixels sampled at exact HiPS NESTED HEALPix coordinates (v2); legacy TAN and rotated v2 images are excluded.';

commit;
