begin;

-- Hipsgen publishes standards metadata as extensionless text (`properties`)
-- and an optional static `index.html`. The astro-derived bucket is public-read
-- but has no authenticated insert policy; only trusted service-role pipelines
-- publish derivatives. Keep the existing allowlist and add only the two
-- Hipsgen metadata MIME types required by the immutable IVOA HiPS tree.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime order by mime)
  from unnest(
    coalesce(storage.buckets.allowed_mime_types, '{}'::text[])
    || array['text/plain', 'text/html']::text[]
  ) as allowed(mime)
)
where id = 'astro-derived';

commit;
