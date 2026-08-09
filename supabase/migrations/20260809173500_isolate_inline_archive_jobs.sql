-- Jobs owned by a bounded inline runner must never be consumed by a generic,
-- potentially older science worker. Targeted runners lease these rows directly
-- by UUID; the shared queue skips them.

create or replace function private.lease_processing_job(
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table(
  id uuid,
  job_type text,
  status text,
  upload_id uuid,
  object_id text,
  cosmos_observation_id uuid,
  cosmos_event_id uuid,
  owner_user_id uuid,
  payload jsonb,
  attempts integer,
  pipeline_version text,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null
     or length(trim(p_worker_id)) < 3
     or p_lease_seconds not between 30 and 1800 then
    raise exception 'invalid lease request';
  end if;

  return query
  with candidate as (
    select j.id
    from public.processing_jobs j
    where j.completed_at is null
      and j.status not in ('published','rejected','duplicate','cancelled')
      and coalesce(j.payload->>'lease_scope', '') <> 'inline'
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

comment on function private.lease_processing_job(text, integer) is
  'Leases one shared-queue job while excluding UUID-targeted inline jobs.';
