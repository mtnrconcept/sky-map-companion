begin;
select plan(21);

select has_table('public', 'astrometric_solutions', 'astrometric solutions exist');
select has_table('public', 'astro_quality_metrics', 'quality metrics exist');
select has_table('public', 'astro_upload_cells', 'upload cells exist');
select has_table('public', 'sky_coverage_cells', 'coverage cells exist');
select has_table('public', 'xp_ledger', 'xp ledger exists');
select has_table('public', 'mosaic_tiles', 'mosaic tiles exist');
select has_table('public', 'processing_jobs', 'processing jobs exist');
select has_table('public', 'moderation_events', 'moderation audit exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.sky_coverage_cells'::regclass),
  true,
  'coverage has RLS enabled'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.processing_jobs'::regclass),
  true,
  'jobs have RLS enabled'
);
select is(
  (select public from storage.buckets where id = 'astro-raw'),
  false,
  'raw bucket is private'
);
select is(
  (select public from storage.buckets where id = 'astro-derived'),
  true,
  'approved derivative bucket is public'
);

select function_privs_are(
  'private', 'claim_approved_upload', array['uuid'], 'service_role', array['EXECUTE'],
  'only the service role can claim cells'
);
select function_privs_are(
  'private', 'lease_processing_job', array['text','integer'], 'service_role', array['EXECUTE'],
  'only the service role can lease jobs'
);
select is(
  has_function_privilege('anon', 'private.claim_approved_upload(uuid)', 'EXECUTE'),
  false,
  'anonymous users cannot claim cells'
);
select is(
  has_function_privilege('authenticated', 'private.claim_approved_upload(uuid)', 'EXECUTE'),
  false,
  'authenticated users cannot claim cells'
);
select is(
  has_table_privilege('authenticated', 'public.xp_ledger', 'INSERT'),
  false,
  'clients cannot insert XP'
);
select is(
  has_table_privilege('authenticated', 'public.processing_jobs', 'UPDATE'),
  false,
  'clients cannot advance jobs'
);
select ok(private.can_transition('uploaded', 'duplicate'), 'duplicate detection can finish from upload stage');
select ok(private.can_transition('failed', 'uploaded'), 'upload failures can be retried');
select ok(private.can_transition('failed', 'approved'), 'stack and Cosmos failures can be retried');

select * from finish();
rollback;
