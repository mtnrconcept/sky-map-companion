alter table public.astro_uploads
  add column if not exists storage_backend text not null default 'supabase',
  add column if not exists storage_bucket text,
  add column if not exists storage_key text,
  add column if not exists legacy_storage_path text,
  add column if not exists storage_migrated_at timestamptz,
  add column if not exists storage_verified_at timestamptz;

alter table public.astro_uploads
  add constraint astro_uploads_storage_backend_check
  check (storage_backend in ('supabase','r2')) not valid;

update public.astro_uploads
set storage_bucket = coalesce(storage_bucket, 'astro-raw'),
    storage_key = coalesce(storage_key, storage_path)
where storage_key is null or storage_bucket is null;

alter table public.astro_uploads validate constraint astro_uploads_storage_backend_check;

create index if not exists astro_uploads_storage_backend_idx
  on public.astro_uploads(storage_backend, storage_verified_at)
  where deleted_at is null;
