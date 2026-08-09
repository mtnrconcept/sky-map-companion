-- PUBLIC can read released masters, but that SELECT policy does not authorize
-- the bounded archive runner to stage or refresh the M31 master before atomic
-- activation. Keep writes limited to the frozen M31/PS1 run and generation.

drop policy if exists archive_m31_runner_masters_insert
on public.astro_masters;
create policy archive_m31_runner_masters_insert
on public.astro_masters
for insert
to archive_m31_runner
with check (
  object_id = 'M31'
  and mosaic_generation_id is not null
  and archive_ingest_run_id is not null
  and exists (
    select 1
    from public.mosaic_generations g
    join public.mosaic_layers l on l.id = g.layer_id
    where g.id = astro_masters.mosaic_generation_id
      and l.slug like 'm31-ps1-%'
  )
  and exists (
    select 1
    from public.archive_ingest_runs r
    where r.id = astro_masters.archive_ingest_run_id
      and r.object_id = 'M31'
      and r.source_id = 'mast-ps1'
  )
);

drop policy if exists archive_m31_runner_masters_update
on public.astro_masters;
create policy archive_m31_runner_masters_update
on public.astro_masters
for update
to archive_m31_runner
using (
  object_id = 'M31'
  and mosaic_generation_id is not null
  and archive_ingest_run_id is not null
)
with check (
  object_id = 'M31'
  and mosaic_generation_id is not null
  and archive_ingest_run_id is not null
  and exists (
    select 1
    from public.mosaic_generations g
    join public.mosaic_layers l on l.id = g.layer_id
    where g.id = astro_masters.mosaic_generation_id
      and l.slug like 'm31-ps1-%'
  )
  and exists (
    select 1
    from public.archive_ingest_runs r
    where r.id = astro_masters.archive_ingest_run_id
      and r.object_id = 'M31'
      and r.source_id = 'mast-ps1'
  )
);
