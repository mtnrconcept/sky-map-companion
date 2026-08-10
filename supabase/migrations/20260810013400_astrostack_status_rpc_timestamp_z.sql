begin;

-- Compatibility hotfix for the public AstroStack status endpoint.
-- PostgreSQL jsonb serializes timestamptz values with an explicit +00:00 offset,
-- while the currently deployed public contract expects master.created_at in a
-- UTC-Z datetime form. Keep the RPC allowlist unchanged and normalize only the
-- master timestamp exposed by this RPC.
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
        'created_at', to_char(
          m.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      ) from current_master m
    )
  )
  from object_row root_object;
$$;

commit;
