create index archive_ingest_runs_source_idx
  on public.archive_ingest_runs(source_id);
create index archive_ingest_runs_object_idx
  on public.archive_ingest_runs(object_id);
create index archive_items_source_idx
  on public.archive_items(source_id);
create index sky_coverage_archive_item_idx
  on public.sky_coverage_cells(first_archive_item_id)
  where first_archive_item_id is not null;
