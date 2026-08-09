begin;

create or replace function private.reset_archive_master_retry_stage(
  p_job_id uuid,
  p_worker_id text,
  p_expected_version integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_job public.processing_jobs;
  deleted_count integer := 0;
begin
  select * into current_job
  from public.processing_jobs
  where id = p_job_id
  for update;

  if current_job.id is null
     or current_job.job_type is distinct from 'publish_mosaic'
     or (current_job.payload->>'mode') is distinct from 'build_archive_v9'
     or current_job.object_id is distinct from 'M31'
     or current_job.leased_by is distinct from p_worker_id
     or current_job.version is distinct from p_expected_version
     or current_job.completed_at is not null then
    raise exception 'stale or invalid archive retry lease';
  end if;

  with deleted as (
    delete from public.astro_masters m
    using public.mosaic_generations g
    where g.id = m.mosaic_generation_id
      and g.source_job_id = current_job.id
      and g.archive_ingest_run_id = m.archive_ingest_run_id
      and g.status in ('building', 'verifying', 'failed')
      and g.activated_at is null
      and m.object_id = 'M31'
      and m.is_current = false
    returning m.id
  )
  select count(*)::integer into deleted_count from deleted;

  return deleted_count;
end;
$$;

alter function private.reset_archive_master_retry_stage(uuid, text, integer) owner to postgres;
revoke all on function private.reset_archive_master_retry_stage(uuid, text, integer) from public;
grant execute on function private.reset_archive_master_retry_stage(uuid, text, integer) to archive_m31_runner;
grant execute on function private.reset_archive_master_retry_stage(uuid, text, integer) to service_role;

commit;
