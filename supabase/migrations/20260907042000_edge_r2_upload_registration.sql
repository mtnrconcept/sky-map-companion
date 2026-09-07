begin;

alter table public.astro_uploads
  add column if not exists storage_backend text,
  add column if not exists storage_bucket text,
  add column if not exists storage_key text;

update public.astro_uploads
set storage_backend = coalesce(storage_backend, 'supabase'),
    storage_bucket = coalesce(storage_bucket, 'astro-frames'),
    storage_key = coalesce(storage_key, storage_path)
where storage_backend is null
   or storage_bucket is null
   or storage_key is null;

create unique index if not exists astro_uploads_storage_locator_unique
  on public.astro_uploads(storage_backend, storage_bucket, storage_key)
  where deleted_at is null
    and storage_backend is not null
    and storage_bucket is not null
    and storage_key is not null;

create or replace function public.register_r2_astro_upload(
  p_user_id uuid,
  p_storage_bucket text,
  p_storage_key text,
  p_file_size_bytes bigint,
  p_original_filename text,
  p_object_id text,
  p_frame_type text,
  p_licence_code text,
  p_metadata jsonb default '{}'::jsonb,
  p_pipeline_version text default 'science-v1'
)
returns table (
  upload_id uuid,
  job_id uuid,
  idempotency_key text,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload public.astro_uploads;
  v_job public.processing_jobs;
  v_existing boolean := false;
  v_expected_prefix text;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;
  if p_storage_bucket is distinct from 'astro-raw' then
    raise exception 'invalid R2 bucket';
  end if;

  v_expected_prefix := 'raw/' || p_user_id::text || '/';
  if p_storage_key is null
     or length(p_storage_key) < length(v_expected_prefix) + 1
     or left(p_storage_key, length(v_expected_prefix)) <> v_expected_prefix
     or p_storage_key like '%..%'
     or p_storage_key like '%\\%' then
    raise exception 'invalid storage key ownership';
  end if;

  if p_file_size_bytes is null
     or p_file_size_bytes <= 0
     or p_file_size_bytes > 5368709120 then
    raise exception 'invalid file size';
  end if;
  if p_original_filename is null or length(trim(p_original_filename)) = 0 then
    raise exception 'original filename is required';
  end if;
  if p_frame_type not in ('light', 'dark', 'flat', 'bias') then
    raise exception 'invalid frame type';
  end if;
  if p_licence_code not in ('CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0') then
    raise exception 'invalid licence code';
  end if;
  if p_pipeline_version is null or length(trim(p_pipeline_version)) = 0 then
    raise exception 'pipeline version is required';
  end if;
  if not exists (
    select 1
    from public.astro_objects o
    where o.id = p_object_id
  ) then
    raise exception 'unknown astro object';
  end if;

  select * into v_upload
  from public.astro_uploads u
  where u.storage_backend = 'r2'
    and u.storage_bucket = p_storage_bucket
    and u.storage_key = p_storage_key
    and u.deleted_at is null
  for update;

  if v_upload.id is not null then
    if v_upload.user_id is distinct from p_user_id
       or v_upload.file_size_bytes <> p_file_size_bytes
       or v_upload.object_id is distinct from p_object_id
       or v_upload.frame_type is distinct from p_frame_type then
      raise exception 'R2 object already registered with different metadata';
    end if;
    v_existing := true;
  else
    insert into public.astro_uploads (
      user_id,
      object_id,
      frame_type,
      storage_path,
      file_url,
      file_size_bytes,
      original_filename,
      metadata,
      licence_code,
      licence_accepted_at,
      pipeline_version,
      source_kind,
      storage_backend,
      storage_bucket,
      storage_key
    ) values (
      p_user_id,
      p_object_id,
      p_frame_type,
      p_storage_key,
      'r2://' || p_storage_bucket || '/' || p_storage_key,
      p_file_size_bytes,
      p_original_filename,
      coalesce(p_metadata, '{}'::jsonb),
      p_licence_code,
      now(),
      p_pipeline_version,
      'community',
      'r2',
      p_storage_bucket,
      p_storage_key
    )
    returning * into v_upload;
  end if;

  select * into v_job
  from public.processing_jobs j
  where j.upload_id = v_upload.id
    and j.job_type = 'qualify_upload'
    and j.idempotency_key = 'qualify:' || v_upload.id::text || ':' || v_upload.pipeline_version
  order by j.created_at asc
  limit 1;

  if v_job.id is null then
    raise exception 'qualify_upload job was not created';
  end if;

  return query select
    v_upload.id,
    v_job.id,
    v_job.idempotency_key,
    v_existing;
end;
$$;

revoke all on function public.register_r2_astro_upload(
  uuid, text, text, bigint, text, text, text, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.register_r2_astro_upload(
  uuid, text, text, bigint, text, text, text, text, jsonb, text
) to service_role;

commit;
