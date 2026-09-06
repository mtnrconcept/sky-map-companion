-- Federated public HiPS references and auditable Sky Map quality promotion decisions.
-- External HiPS tiles remain hosted by their authoritative providers; this table stores metadata only.

create table if not exists public.hips_reference_surveys (
  id text primary key,
  label text not null,
  provider text not null,
  hips_url text not null,
  moc_url text,
  waveband text not null,
  spectral_role text not null,
  hips_order integer,
  spatial_resolution_arcsec double precision,
  coverage_class text not null check (coverage_class in ('all-sky', 'wide', 'targeted')),
  rights_uri text,
  attribution_text text not null,
  redistribution_policy text not null default 'federate-only',
  federation_allowed boolean not null default false,
  ingestion_allowed boolean not null default false,
  priority integer not null default 100,
  enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hips_reference_surveys enable row level security;
revoke all on table public.hips_reference_surveys from anon, authenticated;
grant select on table public.hips_reference_surveys to anon, authenticated;

drop policy if exists "Public can read enabled federated HiPS references"
  on public.hips_reference_surveys;
create policy "Public can read enabled federated HiPS references"
  on public.hips_reference_surveys
  for select
  to anon, authenticated
  using (enabled and federation_allowed);

insert into public.hips_reference_surveys (
  id, label, provider, hips_url, waveband, spectral_role, hips_order,
  coverage_class, attribution_text, redistribution_policy,
  federation_allowed, ingestion_allowed, priority, enabled, metadata
) values
  (
    'CDS/P/2MASS/color',
    '2MASS couleur',
    'CDS / 2MASS',
    'https://alasky.cds.unistra.fr/2MASS/Color/',
    'near-infrared',
    'reference-color',
    9,
    'all-sky',
    '2MASS / CDS Aladin HiPS',
    'federate-only',
    true,
    false,
    10,
    true,
    '{"reference_role":"base"}'::jsonb
  ),
  (
    'CDS/P/DESI-Legacy-Surveys/DR10/color',
    'DESI Legacy Surveys DR10',
    'CDS / DESI Legacy Surveys',
    'https://alasky.cds.unistra.fr/DESI-legacy-surveys/DR10/CDS_P_DESI-Legacy-Surveys_DR10_color/',
    'optical',
    'reference-color',
    11,
    'wide',
    'DESI Legacy Surveys / CDS Aladin HiPS',
    'federate-only',
    true,
    false,
    20,
    true,
    '{"reference_role":"wide"}'::jsonb
  ),
  (
    'CDS/P/PanSTARRS/DR1/color-i-r-g',
    'Pan-STARRS DR1 couleur',
    'CDS / Pan-STARRS',
    'https://alasky.cds.unistra.fr/Pan-STARRS/DR1/color-i-r-g/',
    'optical',
    'reference-color',
    11,
    'wide',
    'Pan-STARRS1 / CDS Aladin HiPS',
    'federate-only',
    true,
    false,
    30,
    true,
    '{"reference_role":"wide"}'::jsonb
  ),
  (
    'CDS/P/Euclid/Q1/color',
    'Euclid Q1 couleur',
    'CDS / Euclid',
    'https://alasky.cds.unistra.fr/Euclid/Q1/CDS_P_Euclid_Q1_color/',
    'optical-near-infrared',
    'reference-color',
    13,
    'targeted',
    'ESA Euclid Q1 / CDS Aladin HiPS',
    'federate-only',
    true,
    false,
    40,
    true,
    '{"reference_role":"deep"}'::jsonb
  ),
  (
    'CDS/P/HST/color',
    'HST couleur',
    'CDS / HST',
    'https://alasky.cds.unistra.fr/HST-hips/color/',
    'optical-near-infrared',
    'reference-color',
    13,
    'targeted',
    'HST / STScI / CDS Aladin HiPS',
    'federate-only',
    true,
    false,
    50,
    true,
    '{"reference_role":"deep"}'::jsonb
  ),
  (
    'CDS/P/HST/PHAT/color',
    'HST PHAT couleur',
    'CDS / HST PHAT',
    'https://alasky.cds.unistra.fr/PHAT/color/',
    'uv-optical-near-infrared',
    'reference-color',
    14,
    'targeted',
    'HST PHAT / STScI / CDS Aladin HiPS',
    'federate-only',
    true,
    false,
    60,
    true,
    '{"reference_role":"deep"}'::jsonb
  )
on conflict (id) do update set
  label = excluded.label,
  provider = excluded.provider,
  hips_url = excluded.hips_url,
  waveband = excluded.waveband,
  spectral_role = excluded.spectral_role,
  hips_order = excluded.hips_order,
  coverage_class = excluded.coverage_class,
  attribution_text = excluded.attribution_text,
  redistribution_policy = excluded.redistribution_policy,
  federation_allowed = excluded.federation_allowed,
  ingestion_allowed = excluded.ingestion_allowed,
  priority = excluded.priority,
  enabled = excluded.enabled,
  metadata = excluded.metadata,
  updated_at = now();

create index if not exists hips_reference_surveys_enabled_priority_idx
  on public.hips_reference_surveys (enabled, priority)
  where federation_allowed;

create table if not exists public.mosaic_quality_decisions (
  id uuid primary key default gen_random_uuid(),
  object_id text references public.astro_objects(id) on delete set null,
  spectral_role text not null,
  coverage_key text not null,
  candidate_upload_id uuid references public.astro_uploads(id) on delete set null,
  candidate_master_id uuid references public.astro_masters(id) on delete set null,
  previous_master_id uuid references public.astro_masters(id) on delete set null,
  decision text not null check (decision in ('promote', 'retain', 'reject', 'needs_review')),
  reason_codes text[] not null default '{}'::text[],
  quality_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(quality_metrics) = 'object'),
  policy_version text not null,
  created_at timestamptz not null default now(),
  check (candidate_upload_id is not null or candidate_master_id is not null)
);

alter table public.mosaic_quality_decisions enable row level security;
revoke all on table public.mosaic_quality_decisions from anon, authenticated;

create index if not exists mosaic_quality_decisions_region_idx
  on public.mosaic_quality_decisions (spectral_role, coverage_key, created_at desc);
create index if not exists mosaic_quality_decisions_candidate_upload_idx
  on public.mosaic_quality_decisions (candidate_upload_id)
  where candidate_upload_id is not null;
create index if not exists mosaic_quality_decisions_candidate_master_idx
  on public.mosaic_quality_decisions (candidate_master_id)
  where candidate_master_id is not null;
create index if not exists mosaic_quality_decisions_previous_master_idx
  on public.mosaic_quality_decisions (previous_master_id)
  where previous_master_id is not null;

-- Advisor remediation relevant to atomic generation switches.
create index if not exists mosaic_layers_current_generation_id_idx
  on public.mosaic_layers (current_generation_id)
  where current_generation_id is not null;
