begin;

alter table public.archive_items
  drop constraint if exists archive_items_upload_id_key;

create index if not exists archive_items_upload_id_idx
  on public.archive_items(upload_id)
  where upload_id is not null;

comment on column public.archive_items.upload_id is
  'Canonical astro_upload referenced by this ingest-run inventory item. A qualified public-archive upload may appear in multiple run snapshots; astro_uploads.archive_item_id remains its canonical provenance row.';

commit;
