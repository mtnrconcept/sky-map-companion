-- astro_objects and astro_masters already have SELECT policies for PUBLIC.
-- The runner's table grants remain bounded while these duplicate policies are
-- unnecessary and would make PostgreSQL evaluate two permissive predicates.

drop policy if exists archive_m31_runner_objects on public.astro_objects;
drop policy if exists archive_m31_runner_masters on public.astro_masters;
