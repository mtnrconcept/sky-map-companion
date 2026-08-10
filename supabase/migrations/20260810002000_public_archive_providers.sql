begin;

alter table public.archive_sources
  drop constraint if exists archive_sources_rights_class_check;

alter table public.archive_sources
  add constraint archive_sources_rights_class_check
  check (rights_class in ('public-with-attribution','public-domain','dataset-specific'));

insert into public.archive_sources(
  id,name,base_url,terms_url,acknowledgement,rights_class,enabled
) values
  (
    'eso',
    'ESO Science Archive',
    'https://archive.eso.org',
    'https://archive.eso.org/cms/eso-data-access-policy.html',
    'ESO Science Archive; preserve archive provenance, FITS headers and required attribution.',
    'public-with-attribution',
    true
  ),
  (
    'mast',
    'MAST',
    'https://mast.stsci.edu',
    'https://archive.stsci.edu/publishing/data-use',
    'MAST / Space Telescope Science Institute; mission-specific acknowledgements remain attached to each product.',
    'public-domain',
    true
  ),
  (
    'irsa',
    'NASA/IPAC IRSA',
    'https://irsa.ipac.caltech.edu',
    'https://irsa.ipac.caltech.edu/data_use_terms.html',
    'NASA/IPAC Infrared Science Archive; dataset-specific acknowledgements and DOI metadata remain attached.',
    'dataset-specific',
    true
  ),
  (
    'noirlab',
    'NSF NOIRLab Astro Data Lab',
    'https://datalab.noirlab.edu',
    'https://datalab.noirlab.edu/docs/',
    'NSF NOIRLab Astro Data Lab; redistribution requires a dataset-specific rights decision.',
    'dataset-specific',
    true
  )
on conflict (id) do update set
  name=excluded.name,
  base_url=excluded.base_url,
  terms_url=excluded.terms_url,
  acknowledgement=excluded.acknowledgement,
  rights_class=excluded.rights_class,
  enabled=excluded.enabled,
  updated_at=now();

commit;
