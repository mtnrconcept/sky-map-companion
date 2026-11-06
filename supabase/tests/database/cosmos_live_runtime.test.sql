-- Run only against an isolated/local database after applying project migrations:
-- psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/database/cosmos_live_runtime.test.sql
-- No pgTAP dependency. Fixtures and helper functions are rolled back together.
begin;

create temporary table cosmos_runtime_assertions (message text not null);
create function pg_temp.cosmos_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'Cosmos regression: %', message; end if;
  insert into cosmos_runtime_assertions values (message);
end;
$$;

create function pg_temp.cosmos_report_payload(phenomenon text default 'meteor')
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'latitude', 46.204391, 'longitude', 6.143158, 'altitude_m', 500,
    'azimuth', 45, 'elevation', 40, 'phenomenon_type', phenomenon,
    'description', 'Isolated Cosmos regression fixture', 'observed_at', now()
  );
$$;

create function pg_temp.cosmos_expect_error(statement text, expected_message text)
returns void language plpgsql as $$
declare failed boolean := false;
begin
  begin
    execute statement;
  exception when others then
    if position(expected_message in sqlerrm) = 0 then raise; end if;
    failed := true;
  end;
  perform pg_temp.cosmos_assert(failed, 'Rejected ' || expected_message);
end;
$$;

do $$
declare
  user_a uuid := gen_random_uuid(); user_b uuid := gen_random_uuid();
  user_c uuid := gen_random_uuid(); user_d uuid := gen_random_uuid();
  rate_user uuid := gen_random_uuid(); capacity_user uuid := gen_random_uuid();
  obs_a uuid := gen_random_uuid(); obs_b uuid := gen_random_uuid(); obs_c uuid := gen_random_uuid();
  obs_d uuid; obs_e uuid; obs_f uuid; obs_g uuid;
  request_id uuid; replay_id uuid;
  event_a uuid; event_b uuid;
  result_a jsonb; result_b jsonb; result_c jsonb;
  context_before jsonb; context_after jsonb; public_row jsonb;
  old_job jsonb; new_job jsonb;
  evidence_path text;
  signature text;
  role_name text;
  error_sql text;
  fixture_count integer;
  audit_count bigint;
  idx integer;
begin
  -- Minimal auth fixtures have no login credentials or real contact details.
  insert into auth.users(id) values(user_a),(user_b),(user_c),(user_d),(rate_user),(capacity_user);

  foreach role_name in array array['anon','authenticated'] loop
    foreach signature in array array[
      'public.submit_cosmos_observation(uuid,uuid,text,jsonb)',
      'public.get_cosmos_analysis_context(uuid,uuid)',
      'public.complete_cosmos_analysis(uuid,uuid,text,uuid[],jsonb)',
      'public.get_cosmos_runtime_status()',
      'private.cosmos_analysis_context(uuid)'
    ] loop
      perform pg_temp.cosmos_assert(not has_function_privilege(role_name,signature,'EXECUTE'), role_name || ' cannot execute ' || signature);
    end loop;
    perform pg_temp.cosmos_assert(not has_table_privilege(role_name,'public.cosmos_observations','INSERT'), role_name || ' cannot bypass submit validation');
    perform pg_temp.cosmos_assert(not has_table_privilege(role_name,'public.cosmos_observations','UPDATE'), role_name || ' cannot self-confirm observations');
    perform pg_temp.cosmos_assert(not has_table_privilege(role_name,'public.cosmos_observations','SELECT'), role_name || ' cannot read exact observer locations');
    perform pg_temp.cosmos_assert(has_function_privilege(role_name,'public.get_public_cosmos_observations(integer,integer)','EXECUTE'), role_name || ' can read coarse public feed');
  end loop;

  evidence_path := user_a::text || '/' || gen_random_uuid()::text || '/evidence.png';
  result_a := public.submit_cosmos_observation(user_a,obs_a,repeat('a',64),
    pg_temp.cosmos_report_payload() || jsonb_build_object('evidence_path',evidence_path));
  perform pg_temp.cosmos_assert((result_a->>'created')::boolean, 'New report created');
  perform pg_temp.cosmos_assert(result_a#>>'{job,payload,lease_scope}'='inline', 'Trigger assigns inline lease scope');
  perform pg_temp.cosmos_assert(result_a#>>'{job,pipeline_version}'='cosmos-geometric-v2', 'Trigger chooses deployed processor');
  perform pg_temp.cosmos_assert(result_a#>'{observation,ai_confidence}'='null'::jsonb, 'No invented observation confidence');
  result_b := public.submit_cosmos_observation(user_a,obs_a,repeat('a',64),
    pg_temp.cosmos_report_payload() || jsonb_build_object('evidence_path',evidence_path));
  perform pg_temp.cosmos_assert(not (result_b->>'created')::boolean, 'Replay returns existing receipt');
  perform pg_temp.cosmos_assert(result_a#>>'{job,id}'=result_b#>>'{job,id}', 'Replay returns original job');
  perform pg_temp.cosmos_assert((select count(*)=1 from public.processing_jobs where cosmos_observation_id=obs_a), 'Replay does not duplicate jobs');
  perform pg_temp.cosmos_expect_error(format('select public.submit_cosmos_observation(%L,%L,%L,%L::jsonb)',user_a,obs_a,repeat('b',64),pg_temp.cosmos_report_payload()),'COSMOS_IDEMPOTENCY_CONFLICT');
  perform pg_temp.cosmos_expect_error(format('select public.submit_cosmos_observation(%L,%L,%L,%L::jsonb)',user_b,obs_a,repeat('a',64),pg_temp.cosmos_report_payload()),'COSMOS_IDEMPOTENCY_CONFLICT');
  perform pg_temp.cosmos_expect_error(format('select public.submit_cosmos_observation(%L,%L,null,%L::jsonb)',user_a,gen_random_uuid(),pg_temp.cosmos_report_payload()),'COSMOS_INVALID_REPORT');
  perform pg_temp.cosmos_expect_error(format('select public.get_cosmos_analysis_context(%L,%L)',obs_a,user_b),'COSMOS_NOT_FOUND');

  context_before := public.get_cosmos_analysis_context(obs_a,user_a);
  perform public.submit_cosmos_observation(user_b,obs_b,repeat('b',64),pg_temp.cosmos_report_payload());
  perform pg_temp.cosmos_expect_error(format('select public.complete_cosmos_analysis(%L,%L,%L,%L::uuid[])',obs_a,user_a,context_before->>'snapshot',array[obs_a]),'COSMOS_STALE_SNAPSHOT');
  context_before := public.get_cosmos_analysis_context(obs_a,user_a);
  perform pg_temp.cosmos_expect_error(format('select public.complete_cosmos_analysis(%L,%L,%L,%L::uuid[])',obs_a,user_a,context_before->>'snapshot',array[obs_b]),'COSMOS_INVALID_CLUSTER');
  perform pg_temp.cosmos_expect_error(format('select public.complete_cosmos_analysis(%L,%L,%L,%L::uuid[])',obs_a,user_a,context_before->>'snapshot',array[obs_a,gen_random_uuid()]),'COSMOS_INVALID_CLUSTER');
  result_a := public.complete_cosmos_analysis(obs_a,user_a,context_before->>'snapshot',array[obs_a,obs_b]);
  event_a := (result_a->>'event_id')::uuid;
  perform pg_temp.cosmos_assert((result_a->>'clustered')::boolean and (result_a->>'observer_count')::int=2, 'Independent reports correlate');
  perform pg_temp.cosmos_assert((select status='unverified' and observation_count=2 and confidence_score is null from public.cosmos_events where id=event_a), 'Correlation is provisional, not scientific confirmation');

  -- Repeated explicit analysis with unchanged scientific inputs is a no-op.
  context_after := public.get_cosmos_analysis_context(obs_a,user_a);
  select to_jsonb(j) into old_job from public.processing_jobs j where cosmos_observation_id=obs_a;
  select count(*) into audit_count from public.processing_job_events where job_id=(old_job->>'id')::uuid;
  result_b := public.complete_cosmos_analysis(obs_a,user_a,context_after->>'snapshot',array[obs_a,obs_b]);
  select to_jsonb(j) into new_job from public.processing_jobs j where cosmos_observation_id=obs_a;
  perform pg_temp.cosmos_assert(result_a=result_b, 'Cached analysis returns existing result');
  perform pg_temp.cosmos_assert(new_job=old_job, 'Cached analysis does not increment attempts/version or alter timestamps');
  perform pg_temp.cosmos_assert((select count(*)=audit_count from public.processing_job_events where job_id=(old_job->>'id')::uuid), 'Cached analysis does not append audit events');

  -- New witness invalidates cache, grows the existing event, and permits an estimate.
  perform public.submit_cosmos_observation(user_c,obs_c,repeat('c',64),pg_temp.cosmos_report_payload());
  context_after := public.get_cosmos_analysis_context(obs_c,user_c);
  result_c := public.complete_cosmos_analysis(obs_c,user_c,context_after->>'snapshot',array[obs_a,obs_b,obs_c],
    jsonb_build_object('model','spherical-earth-rays-v2','estimated_latitude',0,'estimated_longitude',0,
      'estimated_altitude_km',100,'residual_rms_km',0.2,'observer_count',3,'baseline_km',30,
      'time_span_seconds',2,'observation_ids',array[obs_a,obs_b,obs_c],
      'evidence_path',evidence_path,'rays',jsonb_build_array(46.204391,6.143158),'confidence',1));
  perform pg_temp.cosmos_assert((result_c->>'event_id')::uuid=event_a, 'Third witness reuses canonical event');
  perform pg_temp.cosmos_assert((result_c->>'triangulated')::boolean, 'Vetted provisional geometry is saved');
  select to_jsonb(e) into public_row from public.get_public_cosmos_events() e where id=event_a;
  perform pg_temp.cosmos_assert((public_row->>'observation_count')::int=3, 'Public count reflects all three reports');
  perform pg_temp.cosmos_assert(public_row#>>'{triangulation,status}'='estimate' and public_row->>'status'='unverified', 'Estimate remains explicitly provisional');
  perform pg_temp.cosmos_assert((public_row#>>'{triangulation,estimated_latitude}')::float8=0 and (public_row#>>'{triangulation,estimated_longitude}')::float8=0, 'Equator/prime-meridian coordinates survive');
  perform pg_temp.cosmos_assert(public_row#>'{triangulation,confidence}'='null'::jsonb, 'Geometric residual is not a confidence probability');
  perform pg_temp.cosmos_assert(not ((public_row->'triangulation') ?| array['evidence_path','rays','observation_ids']), 'Public triangulation excludes private extras');
  perform pg_temp.cosmos_assert((public_row#>>'{triangulation,time_span_seconds}')::float8=2, 'Scientific time span remains available');
  select to_jsonb(o) into public_row from public.get_public_cosmos_observations() o where id=obs_a;
  perform pg_temp.cosmos_assert((public_row->>'latitude')::float8=46.2 and (public_row->>'longitude')::float8=6.1, 'Public observer coordinates are coarsened');
  perform pg_temp.cosmos_assert(not (public_row ?| array['user_id','image_url','altitude_m','azimuth','elevation','submission_fingerprint']), 'Public observer feed excludes private data');

  -- A subset cannot replace geometry for the full retained canonical group.
  context_before:=public.get_cosmos_analysis_context(obs_b,user_b);
  result_b:=public.complete_cosmos_analysis(obs_b,user_b,context_before->>'snapshot',array[obs_a,obs_b],
    jsonb_build_object('model','spherical-earth-rays-v2','estimated_latitude',0,'estimated_longitude',0,
      'estimated_altitude_km',100,'residual_rms_km',0.2,'observer_count',2,
      'observation_ids',array[obs_a,obs_b]));
  perform pg_temp.cosmos_assert((result_b->>'matching_observations')::int=3 and (result_b->>'observer_count')::int=3, 'Subset analysis reports full canonical membership');
  perform pg_temp.cosmos_assert(not (result_b->>'triangulated')::boolean, 'Subset geometry cannot represent omitted event witnesses');
  perform pg_temp.cosmos_assert((select triangulation is null from public.cosmos_events where id=event_a), 'Unjustified canonical geometry is cleared');
  context_before:=public.get_cosmos_analysis_context(obs_a,user_a);
  result_a:=public.complete_cosmos_analysis(obs_a,user_a,context_before->>'snapshot',array[obs_a]);
  perform pg_temp.cosmos_assert((result_a->>'event_id')::uuid=event_a and (result_a->>'clustered')::boolean, 'Single-witness reanalysis preserves actual event linkage');
  perform pg_temp.cosmos_assert((result_a->>'matching_observations')::int=3 and (result_a->>'observer_count')::int=3, 'Single-witness reanalysis preserves canonical counts');

  -- Two reports from the same account cannot corroborate each other.
  obs_d:=gen_random_uuid(); obs_e:=gen_random_uuid();
  perform public.submit_cosmos_observation(user_d,obs_d,repeat('d',64),pg_temp.cosmos_report_payload('aurora'));
  perform public.submit_cosmos_observation(user_d,obs_e,repeat('e',64),pg_temp.cosmos_report_payload('aurora'));
  context_before:=public.get_cosmos_analysis_context(obs_d,user_d);
  result_a:=public.complete_cosmos_analysis(obs_d,user_d,context_before->>'snapshot',array[obs_d,obs_e]);
  perform pg_temp.cosmos_assert(not (result_a->>'clustered')::boolean and result_a->>'event_id' is null, 'Same-account reports create no corroborated event');
  perform pg_temp.cosmos_assert((select status='published' from public.cosmos_observations where id=obs_d), 'Single witness still receives completed analysis');

  -- Event merge retires the donor without deleting historical evidence.
  obs_d:=gen_random_uuid(); obs_e:=gen_random_uuid(); obs_f:=gen_random_uuid(); obs_g:=gen_random_uuid();
  perform public.submit_cosmos_observation(user_a,obs_d,repeat('d',64),pg_temp.cosmos_report_payload('fireball'));
  perform public.submit_cosmos_observation(user_b,obs_e,repeat('e',64),pg_temp.cosmos_report_payload('fireball'));
  context_before:=public.get_cosmos_analysis_context(obs_d,user_a);
  result_a:=public.complete_cosmos_analysis(obs_d,user_a,context_before->>'snapshot',array[obs_d,obs_e]);
  event_a:=(result_a->>'event_id')::uuid;
  perform public.submit_cosmos_observation(user_c,obs_f,repeat('f',64),pg_temp.cosmos_report_payload('fireball'));
  perform public.submit_cosmos_observation(user_d,obs_g,repeat('0',64),pg_temp.cosmos_report_payload('fireball'));
  context_before:=public.get_cosmos_analysis_context(obs_f,user_c);
  result_b:=public.complete_cosmos_analysis(obs_f,user_c,context_before->>'snapshot',array[obs_f,obs_g]);
  event_b:=(result_b->>'event_id')::uuid;
  -- created_at is transaction-stable; give the first event a deterministic age.
  update public.cosmos_events set created_at=now()-interval '1 minute' where id=event_a;
  context_before:=public.get_cosmos_analysis_context(obs_d,user_a);
  result_c:=public.complete_cosmos_analysis(obs_d,user_a,context_before->>'snapshot',array[obs_d,obs_e,obs_f,obs_g]);
  perform pg_temp.cosmos_assert((result_c->>'event_id')::uuid=event_a, 'Merge keeps deterministic oldest event');
  perform pg_temp.cosmos_assert((select observation_count=4 from public.cosmos_events where id=event_a), 'Merged count is exact');
  perform pg_temp.cosmos_assert((select observation_count=0 and status='rejected' and triangulation is null from public.cosmos_events where id=event_b), 'Empty donor retired safely');
  perform pg_temp.cosmos_assert(not exists(select 1 from public.get_public_cosmos_events() where id=event_b), 'No public ghost event');

  request_id:=gen_random_uuid();
  result_a:=public.submit_cosmos_observation(user_a,request_id,repeat('b',64),pg_temp.cosmos_report_payload('satellite'));
  update public.processing_jobs set leased_by='isolated-fixture',lease_expires_at=now()+interval '5 minutes' where cosmos_observation_id=request_id;
  context_before:=public.get_cosmos_analysis_context(request_id,user_a);
  perform pg_temp.cosmos_expect_error(format('select public.complete_cosmos_analysis(%L,%L,%L,%L::uuid[])',request_id,user_a,context_before->>'snapshot',array[request_id]),'COSMOS_JOB_BUSY');
  update public.processing_jobs set leased_by=null,lease_expires_at=null where cosmos_observation_id=request_id;
  perform pg_temp.cosmos_assert(not exists(select 1 from public.list_science_queue_recovery_jobs(100) where job_id=(result_a#>>'{job,id}')::uuid), 'Inline job excluded from recovery queue');
  perform pg_temp.cosmos_assert(not exists(select 1 from private.lease_processing_job_by_id((result_a#>>'{job,id}')::uuid,'isolated-fixture',300)), 'Inline job excluded from exact legacy lease');

  for idx in 1..20 loop
    request_id:=gen_random_uuid();
    if idx=1 then replay_id:=request_id; end if;
    perform public.submit_cosmos_observation(rate_user,request_id,repeat('1',64),pg_temp.cosmos_report_payload('unknown'));
  end loop;
  perform pg_temp.cosmos_expect_error(format('select public.submit_cosmos_observation(%L,%L,%L,%L::jsonb)',rate_user,gen_random_uuid(),repeat('1',64),pg_temp.cosmos_report_payload('unknown')),'COSMOS_RATE_LIMIT');
  result_a:=public.submit_cosmos_observation(rate_user,replay_id,repeat('1',64),pg_temp.cosmos_report_payload('unknown'));
  perform pg_temp.cosmos_assert(not (result_a->>'created')::boolean, 'Rate limit preserves legitimate replay');
  perform pg_temp.cosmos_assert((select count(*)=20 from public.cosmos_observations where user_id=rate_user), 'Rejected rate-limit request created no report');

  foreach public_row in array array[
    jsonb_build_object('latitude',null), jsonb_build_object('longitude',181),
    jsonb_build_object('description',' '), jsonb_build_object('phenomenon_type','invented'),
    jsonb_build_object('observed_at',now()-interval '25 hours'),
    jsonb_build_object('observed_at',now()+interval '10 minutes')
  ] loop
    error_sql:=format('select public.submit_cosmos_observation(%L,%L,%L,%L::jsonb)',user_a,gen_random_uuid(),repeat('2',64),pg_temp.cosmos_report_payload() || public_row);
    perform pg_temp.cosmos_expect_error(error_sql,'COSMOS_INVALID_REPORT');
  end loop;

  -- The limit is checked before producing a partial result. Direct fixture
  -- inserts deliberately avoid the public submission rate limiter.
  request_id:=gen_random_uuid();
  perform public.submit_cosmos_observation(capacity_user,request_id,repeat('3',64),pg_temp.cosmos_report_payload('atmospheric'));
  insert into public.cosmos_observations(user_id,latitude,longitude,phenomenon_type,description,observed_at,submission_fingerprint)
    select capacity_user,-33.9,151.2,'atmospheric','Isolated distant fixture',now(),repeat('3',64) from generate_series(1,501);
  context_before:=public.get_cosmos_analysis_context(request_id,capacity_user);
  perform pg_temp.cosmos_assert(jsonb_array_length(context_before->'candidates')=1, 'Distant observations cannot exhaust local analysis capacity');
  insert into public.cosmos_observations(user_id,latitude,longitude,phenomenon_type,description,observed_at,submission_fingerprint)
    select capacity_user,46.2,6.1,'atmospheric','Isolated capacity fixture',now(),repeat('3',64) from generate_series(1,501);
  context_before:=public.get_cosmos_analysis_context(request_id,capacity_user);
  perform pg_temp.cosmos_assert(jsonb_array_length(context_before->'candidates')=501, 'Analysis context is bounded at 501');
  perform pg_temp.cosmos_expect_error(format('select public.complete_cosmos_analysis(%L,%L,%L,%L::uuid[])',request_id,capacity_user,context_before->>'snapshot',array[request_id]),'COSMOS_CAPACITY');

  select count(*) into fixture_count from public.cosmos_observations where user_id=any(array[user_a,user_b,user_c,user_d,rate_user,capacity_user]);
  perform pg_temp.cosmos_assert(fixture_count>500, 'Capacity fixture exercised real insert triggers');
end;
$$;

select count(*) as passed_assertions from cosmos_runtime_assertions;
rollback;
