-- Keep the operational astronomy backup private: no app roles depend on it.
-- Applied to remote Supabase through the validated migration 20261017021941.
revoke all privileges on table public.astro_masters_backup from public, anon, authenticated;
grant select, insert, update, delete on table public.astro_masters_backup to service_role;
alter table public.astro_masters_backup enable row level security;
