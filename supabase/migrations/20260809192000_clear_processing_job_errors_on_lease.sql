-- A retry must expose only the error produced by its current attempt.
-- Both shared-queue and UUID-targeted workers increment attempts when leasing,
-- so enforce this invariant centrally for every processing-job lease path.

create or replace function private.clear_processing_job_error_on_new_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.attempts > old.attempts and new.leased_by is not null then
    new.error_code := null;
    new.error_detail := null;
  end if;
  return new;
end;
$$;

revoke all on function private.clear_processing_job_error_on_new_attempt() from public;

DROP TRIGGER IF EXISTS clear_processing_job_error_on_new_attempt
ON public.processing_jobs;

create trigger clear_processing_job_error_on_new_attempt
before update of attempts, leased_by on public.processing_jobs
for each row
when (new.attempts > old.attempts and new.leased_by is not null)
execute function private.clear_processing_job_error_on_new_attempt();

comment on function private.clear_processing_job_error_on_new_attempt() is
  'Clears stale error_code/error_detail whenever a processing job starts a new leased attempt.';
