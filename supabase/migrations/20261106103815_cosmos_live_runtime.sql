begin;

-- Additive rollout: older application versions may still insert reports without
-- a fingerprint. Only the new, explicitly inline reports leave the worker queue.
alter table public.cosmos_observations add column if not exists submission_fingerprint text;

create or replace function private.enqueue_cosmos_observation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.processing_jobs(
    job_type, cosmos_observation_id, owner_user_id, status, idempotency_key, payload, pipeline_version
  ) values (
    'cluster_cosmos', new.id, new.user_id, 'uploaded', 'cosmos-cluster:' || new.id::text,
    case when new.submission_fingerprint is null then '{}'::jsonb
         else '{"lease_scope":"inline","processor":"cosmos-geometric-v2"}'::jsonb end,
    case when new.submission_fingerprint is null then 'science-v1' else 'cosmos-geometric-v2' end
  ) on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

-- Observations must pass the authenticated server boundary. In particular an
-- account cannot directly publish/confirm itself or change clustering fields.
revoke insert, update on public.cosmos_observations from anon, authenticated;

create or replace function public.submit_cosmos_observation(
  p_user_id uuid, p_submission_id uuid, p_fingerprint text, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  observation public.cosmos_observations;
  job public.processing_jobs;
  observed timestamptz;
begin
  if p_user_id is null or p_submission_id is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'COSMOS_INVALID_REPORT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cosmos-submit:' || p_user_id::text, 0));
  select * into observation from public.cosmos_observations where id = p_submission_id;
  if observation.id is not null then
    if observation.user_id is distinct from p_user_id or
       observation.submission_fingerprint is distinct from p_fingerprint then
      raise exception 'COSMOS_IDEMPOTENCY_CONFLICT';
    end if;
    select * into job from public.processing_jobs where idempotency_key = 'cosmos-cluster:' || observation.id::text;
    return jsonb_build_object('created', false, 'observation', to_jsonb(observation), 'job', to_jsonb(job));
  end if;
  if (select count(*) from public.cosmos_observations where user_id = p_user_id and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'COSMOS_RATE_LIMIT';
  end if;
  observed := coalesce((p_payload->>'observed_at')::timestamptz, now());
  if not ((p_payload->>'latitude')::float8 between -90 and 90)
    or not ((p_payload->>'longitude')::float8 between -180 and 180)
    or p_payload->>'latitude' is null or p_payload->>'longitude' is null
    or coalesce(length(trim(p_payload->>'description')), 0) not between 1 and 2000
    or coalesce(p_payload->>'phenomenon_type', '') not in ('meteor','fireball','comet','supernova','aurora','satellite','atmospheric','unknown')
    or observed < now() - interval '24 hours' or observed > now() + interval '5 minutes'
    or (p_payload->>'evidence_path' is not null and
        not (p_payload->>'evidence_path' like p_user_id::text || '/%')) then
    raise exception 'COSMOS_INVALID_REPORT';
  end if;
  insert into public.cosmos_observations(
    id, user_id, latitude, longitude, altitude_m, azimuth, elevation,
    phenomenon_type, description, image_url, duration_s, magnitude, observed_at,
    submission_fingerprint, ai_confidence
  ) values (
    p_submission_id, p_user_id, (p_payload->>'latitude')::float8, (p_payload->>'longitude')::float8,
    (p_payload->>'altitude_m')::float8, (p_payload->>'azimuth')::float8, (p_payload->>'elevation')::float8,
    p_payload->>'phenomenon_type', trim(p_payload->>'description'),
    case when p_payload->>'evidence_path' is null then null else 'private://cosmos-evidence/' || (p_payload->>'evidence_path') end,
    (p_payload->>'duration_s')::float8, (p_payload->>'magnitude')::float8, observed, p_fingerprint, null
  ) returning * into observation;
  select * into job from public.processing_jobs where idempotency_key = 'cosmos-cluster:' || observation.id::text;
  return jsonb_build_object('created', true, 'observation', to_jsonb(observation), 'job', to_jsonb(job));
end;
$$;

-- Snapshot includes event versions, so a concurrent merge invalidates a stale
-- fit. Exact observer locations are returned only to the trusted server.
create or replace function private.cosmos_analysis_context(p_observation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  seed jsonb;
  candidates jsonb;
begin
  select jsonb_build_object(
    'id', o.id, 'user_id', o.user_id, 'latitude', o.latitude, 'longitude', o.longitude,
    'altitude_m', o.altitude_m, 'azimuth', o.azimuth, 'elevation', o.elevation,
    'phenomenon_type', o.phenomenon_type, 'observed_at', o.observed_at,
    'status', o.status, 'event_id', o.event_id
  ) into seed from public.cosmos_observations o where o.id = p_observation_id;
  if seed is null or seed->>'status' = 'rejected' then raise exception 'COSMOS_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(candidate order by candidate->>'id'), '[]'::jsonb) into candidates
  from (
    select jsonb_build_object(
      'id', o.id, 'user_id', o.user_id, 'latitude', o.latitude, 'longitude', o.longitude,
      'altitude_m', o.altitude_m, 'azimuth', o.azimuth, 'elevation', o.elevation,
      'phenomenon_type', o.phenomenon_type, 'observed_at', o.observed_at,
      'status', o.status, 'event_id', o.event_id, 'event_updated_at', e.updated_at
    ) as candidate
    from public.cosmos_observations o left join public.cosmos_events e on e.id = o.event_id
    where o.phenomenon_type = seed->>'phenomenon_type' and o.status <> 'rejected'
      and o.observed_at between (seed->>'observed_at')::timestamptz - interval '15 minutes'
                            and (seed->>'observed_at')::timestamptz + interval '15 minutes'
      -- Match the 500 km great-circle gate before applying the capacity limit.
      -- Unrelated reports elsewhere in the world cannot block a local analysis.
      and 2 * 6371.0088 * asin(sqrt(least(1::float8, greatest(0::float8,
        power(sin(radians(o.latitude - (seed->>'latitude')::float8) / 2), 2)
        + cos(radians((seed->>'latitude')::float8)) * cos(radians(o.latitude))
          * power(sin(radians(o.longitude - (seed->>'longitude')::float8) / 2), 2)
      )))) <= 500
    order by o.id limit 501
  ) bounded;
  return jsonb_build_object('seed', seed, 'candidates', candidates, 'snapshot', md5(seed::text || candidates::text));
end;
$$;

create or replace function public.get_cosmos_analysis_context(p_observation_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.cosmos_observations where id = p_observation_id and user_id = p_user_id and status <> 'rejected') then
    raise exception 'COSMOS_NOT_FOUND';
  end if;
  return private.cosmos_analysis_context(p_observation_id);
end;
$$;

create or replace function public.complete_cosmos_analysis(
  p_observation_id uuid, p_user_id uuid, p_snapshot text, p_observation_ids uuid[], p_solution jsonb default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  seed public.cosmos_observations;
  context jsonb;
  candidate_ids uuid[];
  existing_ids uuid[];
  v_event_id uuid;
  donor_id uuid;
  witness_count integer;
  v_observation_count integer;
  old_status text;
  v_job_id uuid;
  v_result jsonb;
  previous_result jsonb;
  previous_snapshot text;
  completed_snapshot text;
  solution jsonb;
begin
  select * into seed from public.cosmos_observations where id = p_observation_id and user_id = p_user_id and status <> 'rejected';
  if seed.id is null then raise exception 'COSMOS_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cosmos:' || seed.phenomenon_type, 0));
  context := private.cosmos_analysis_context(p_observation_id);
  if context->>'snapshot' is distinct from p_snapshot then raise exception 'COSMOS_STALE_SNAPSHOT'; end if;
  if jsonb_array_length(context->'candidates') > 500 then raise exception 'COSMOS_CAPACITY'; end if;
  select array_agg((value->>'id')::uuid) into candidate_ids from jsonb_array_elements(context->'candidates');
  if p_observation_ids is null or cardinality(p_observation_ids) < 1 or
     not (p_observation_id = any(p_observation_ids)) or not (p_observation_ids <@ candidate_ids) then
    raise exception 'COSMOS_INVALID_CLUSTER';
  end if;
  select count(distinct user_id), count(*) into witness_count, v_observation_count
    from public.cosmos_observations where id = any(p_observation_ids) and status <> 'rejected';
  select j.id, j.status, j.result, j.payload->>'last_analysis_snapshot'
    into v_job_id, old_status, previous_result, previous_snapshot
    from public.processing_jobs j
    where j.idempotency_key = 'cosmos-cluster:' || p_observation_id::text for update;
  if v_job_id is null then raise exception 'COSMOS_JOB_NOT_FOUND'; end if;
  if exists (select 1 from public.processing_jobs where id = v_job_id and lease_expires_at > now()) then
    raise exception 'COSMOS_JOB_BUSY';
  end if;
  -- Network replays and repeated manual retries must not produce new processing
  -- events or change an event's version when its scientific inputs are unchanged.
  if old_status = 'published' and previous_result is not null
     and previous_snapshot = p_snapshot then
    return previous_result;
  end if;

  if witness_count >= 2 then
    select array_agg(distinct o.event_id) filter (where o.event_id is not null) into existing_ids
      from public.cosmos_observations o where o.id = any(p_observation_ids);
    select e.id into v_event_id from public.cosmos_events e
      where e.id = any(coalesce(existing_ids, '{}'::uuid[])) and e.status <> 'rejected'
      order by e.created_at, e.id limit 1 for update;
    if v_event_id is null then
      insert into public.cosmos_events(phenomenon_type, title, event_at, status, confidence_score, cluster_key)
      values (seed.phenomenon_type, 'Signalements concordants', seed.observed_at, 'unverified', null,
              'cosmos-v2:' || p_observation_id::text)
      on conflict (cluster_key) where cluster_key is not null do update set updated_at = now()
      returning id into v_event_id;
    end if;
    update public.cosmos_observations set event_id = v_event_id, status = 'clustered'
      where id = any(p_observation_ids);
    -- Existing canonical events can retain witnesses outside this seed's bounded
    -- window. Counts describe the whole event; a fit of only a subset must not
    -- silently replace its geometry.
    select count(distinct user_id), count(*) into witness_count, v_observation_count
      from public.cosmos_observations where event_id = v_event_id and status <> 'rejected';
    -- A geometric estimate is not independent scientific confirmation. Only
    -- allowlisted derived values (never rays/origins/evidence) become public.
    if p_solution is not null and jsonb_typeof(p_solution) = 'object'
       and p_solution->>'model' = 'spherical-earth-rays-v2'
       and (p_solution->>'estimated_latitude')::float8 between -90 and 90
       and (p_solution->>'estimated_longitude')::float8 between -180 and 180
       and (p_solution->>'estimated_altitude_km')::float8 between 0 and 50000
       and (p_solution->>'residual_rms_km')::float8 between 0 and 25
       and (p_solution->>'observer_count')::integer >= 2
       and not exists (
         select 1 from public.cosmos_observations o
         where o.event_id = v_event_id and o.status <> 'rejected' and not (o.id = any(p_observation_ids))
       ) then
      solution := jsonb_build_object(
        'estimated_latitude', p_solution->'estimated_latitude', 'estimated_longitude', p_solution->'estimated_longitude',
        'estimated_altitude_km', p_solution->'estimated_altitude_km', 'residual_rms_km', p_solution->'residual_rms_km',
        'max_residual_km', p_solution->'max_residual_km', 'angular_residual_deg', p_solution->'angular_residual_deg',
        'observer_count', p_solution->'observer_count', 'baseline_km', p_solution->'baseline_km',
        'time_span_seconds', p_solution->'time_span_seconds',
        'condition_number', p_solution->'condition_number', 'method', 'geometric',
        'model', 'spherical-earth-rays-v2', 'status', 'estimate', 'confidence', null
      );
    end if;
    update public.cosmos_events e set
      description = 'Corrélation de signalements ; phénomène non confirmé scientifiquement.',
      event_at = (select min(o.observed_at) from public.cosmos_observations o where o.event_id = e.id),
      observation_count = (select count(*) from public.cosmos_observations o where o.event_id = e.id and o.status <> 'rejected'),
      confidence_score = null, status = case when e.status = 'transmitted' then e.status else 'unverified' end,
      triangulation = solution, ai_analysis = null, updated_at = now()
      where e.id = v_event_id;
    if solution is not null then
      insert into public.cosmos_triangulations(event_id, observation_ids, estimated_latitude, estimated_longitude,
        estimated_altitude_km, error_margin_km, method, confidence)
      values (v_event_id, array(select jsonb_array_elements_text(p_solution->'observation_ids')::uuid),
        (solution->>'estimated_latitude')::float8, (solution->>'estimated_longitude')::float8,
        (solution->>'estimated_altitude_km')::float8, null, 'geometric', null)
      on conflict (event_id) do update set observation_ids = excluded.observation_ids,
        estimated_latitude = excluded.estimated_latitude, estimated_longitude = excluded.estimated_longitude,
        estimated_altitude_km = excluded.estimated_altitude_km, error_margin_km = null, confidence = null, computed_at = now();
    else
      update public.cosmos_triangulations t set estimated_latitude = null, estimated_longitude = null,
        estimated_altitude_km = null, error_margin_km = null, confidence = null, computed_at = now() where t.event_id = v_event_id;
    end if;
    foreach donor_id in array coalesce(existing_ids, '{}'::uuid[]) loop
      if donor_id = v_event_id then continue; end if;
      if (select count(distinct user_id) from public.cosmos_observations where cosmos_observations.event_id = donor_id and status <> 'rejected') < 2 then
        update public.cosmos_observations set event_id = null, status = 'published'
          where cosmos_observations.event_id = donor_id and status <> 'rejected';
      end if;
      update public.cosmos_events e set
        observation_count = (select count(*) from public.cosmos_observations o where o.event_id = e.id and o.status <> 'rejected'),
        status = case when exists (select 1 from public.cosmos_observations o where o.event_id = e.id and o.status <> 'rejected') then 'unverified' else 'rejected' end,
        triangulation = null, confidence_score = null, ai_analysis = null, updated_at = now() where e.id = donor_id;
      update public.cosmos_triangulations t set estimated_latitude = null, estimated_longitude = null,
        estimated_altitude_km = null, error_margin_km = null, confidence = null, computed_at = now() where t.event_id = donor_id;
    end loop;
  else
    -- A narrow re-analysis does not detach or deny an already-correlated event.
    -- Preserve its actual state without fitting new geometry from one witness.
    select e.id, e.triangulation into v_event_id, solution
      from public.cosmos_events e where e.id = seed.event_id and e.status <> 'rejected';
    if v_event_id is not null then
      select count(distinct user_id), count(*) into witness_count, v_observation_count
        from public.cosmos_observations where event_id = v_event_id and status <> 'rejected';
    else
      update public.cosmos_observations set status = 'published' where id = p_observation_id and cosmos_observations.event_id is null;
    end if;
  end if;
  v_result := jsonb_build_object('clustered', v_event_id is not null, 'event_id', v_event_id,
    'matching_observations', v_observation_count, 'observer_count', witness_count, 'triangulated', solution is not null);
  -- Snapshot after observer/event updates, before the job-only writes. Future
  -- observations or changes to a correlated event invalidate this cached result.
  completed_snapshot := (private.cosmos_analysis_context(p_observation_id))->>'snapshot';
  update public.processing_jobs set status = 'published', progress = 100, result = v_result,
    attempts = attempts + 1, error_code = null, error_detail = null, version = version + 1,
    leased_by = null, lease_expires_at = null, heartbeat_at = null, completed_at = now(), updated_at = now(),
    payload = payload || jsonb_build_object('lease_scope', 'inline', 'processor', 'cosmos-geometric-v2',
      'last_analysis_snapshot', completed_snapshot)
    where id = v_job_id;
  insert into public.processing_job_events(job_id, from_status, to_status, progress, worker_id, detail)
    values (v_job_id, old_status, 'published', 100, 'cosmos-inline-v2', v_result);
  return v_result;
end;
$$;

create or replace function public.get_cosmos_runtime_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select '{"status":"ready","processor":"cosmos-geometric-v2"}'::jsonb;
$$;

-- Both vetted geometric estimates and confirmed results are visible, explicitly
-- labeled. Empty/superseded events never appear as detections.
create or replace function public.get_public_cosmos_events(p_since_hours integer default 24, p_limit integer default 50)
returns table (
  id uuid, phenomenon_type text, title text, description text, observation_count integer,
  confidence_score double precision, status text, event_at timestamptz, triangulation jsonb, ai_analysis jsonb
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.phenomenon_type, e.title, left(e.description, 1000), e.observation_count,
    case when e.triangulation->>'model' = 'spherical-earth-rays-v2' then null else e.confidence_score end,
    e.status, e.event_at,
    case when e.triangulation->>'model' = 'spherical-earth-rays-v2' then e.triangulation
         when e.status in ('confirmed','transmitted') then e.triangulation else null end,
    case when e.status in ('confirmed','transmitted') then e.ai_analysis else null end
  from public.cosmos_events e
  where e.event_at >= now() - make_interval(hours => greatest(1, least(168, p_since_hours)))
    and e.status <> 'rejected' and e.observation_count >= 2
  order by e.event_at desc, e.observation_count desc
  limit greatest(1, least(200, p_limit));
$$;

revoke all on function private.cosmos_analysis_context(uuid) from public, anon, authenticated;
revoke all on function public.submit_cosmos_observation(uuid,uuid,text,jsonb),
  public.get_cosmos_analysis_context(uuid,uuid), public.complete_cosmos_analysis(uuid,uuid,text,uuid[],jsonb),
  public.get_cosmos_runtime_status() from public, anon, authenticated;
grant execute on function public.submit_cosmos_observation(uuid,uuid,text,jsonb),
  public.get_cosmos_analysis_context(uuid,uuid), public.complete_cosmos_analysis(uuid,uuid,text,uuid[],jsonb),
  public.get_cosmos_runtime_status() to service_role;
grant execute on function public.get_public_cosmos_observations(integer,integer),
  public.get_public_cosmos_events(integer,integer) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
