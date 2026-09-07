begin;

create or replace function public.list_science_queue_recovery_jobs(p_limit integer default 100)
returns table (
  job_id uuid,
  job_type text,
  idempotency_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.job_type, j.idempotency_key
  from public.processing_jobs j
  where j.completed_at is null
    and j.status not in ('published', 'rejected', 'duplicate', 'cancelled')
    and coalesce(j.payload->>'lease_scope', '') <> 'inline'
    and j.attempts < j.max_attempts
    and j.available_at <= now()
    and (j.lease_expires_at is null or j.lease_expires_at < now())
  order by j.available_at asc, j.created_at asc
  limit greatest(1, least(100, coalesce(p_limit, 100)));
$$;

revoke all on function public.list_science_queue_recovery_jobs(integer)
from public, anon, authenticated;

grant execute on function public.list_science_queue_recovery_jobs(integer)
to service_role;

commit;
