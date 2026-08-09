begin;

-- Cover the referencing side of the archive-run FK used by activation,
-- status aggregation and run retirement checks.
create index if not exists astro_masters_archive_ingest_run_idx
  on public.astro_masters(archive_ingest_run_id);

commit;
