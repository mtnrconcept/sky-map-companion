from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from .cosmos import cluster_observations, triangulate
from .models import StageOutcome


MAX_CANDIDATES = 500


def _clear_triangulation(cursor: Any, event_id: Any) -> None:
    # Keep the historical row, but never leave a stale derived position active.
    cursor.execute(
        """
        update public.cosmos_triangulations set observation_ids='{}'::uuid[],
          estimated_latitude=null,estimated_longitude=null,estimated_altitude_km=null,
          trajectory=null,estimated_speed_km_s=null,error_margin_km=null,
          confidence=null,computed_at=now() where event_id=%s
        """,
        (event_id,),
    )


def process_cosmos_observation(gateway: Any, observation_id: UUID) -> StageOutcome:
    """Commit a legacy worker's correlation atomically and without confirmation.

    The application may process newer reports inline. Its SQL commit function
    uses the same per-phenomenon transaction lock, so both paths serialize event
    assignment. This path deliberately works with the pre-inline schema too.
    """
    with gateway.connection() as connection, connection.cursor() as cursor:
        cursor.execute("select phenomenon_type from public.cosmos_observations where id=%s", (observation_id,))
        initial = cursor.fetchone()
        if not initial:
            raise LookupError("Cosmos observation not found")
        cursor.execute(
            "select pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"cosmos:{initial['phenomenon_type']}",),
        )
        cursor.execute("select * from public.cosmos_observations where id=%s for update", (observation_id,))
        seed = cursor.fetchone()
        if not seed:
            raise LookupError("Cosmos observation not found")
        if seed["phenomenon_type"] != initial["phenomenon_type"]:
            raise RuntimeError("Cosmos observation changed during analysis")
        if seed["status"] == "rejected":
            return StageOutcome("published", 100, {"clustered": False, "reason": "observation-rejected"})
        cursor.execute(
            """
            select * from public.cosmos_observations
            where phenomenon_type=%s and observed_at between %s::timestamptz - interval '15 minutes'
                  and %s::timestamptz + interval '15 minutes' and status <> 'rejected'
            order by id limit %s for update
            """,
            (seed["phenomenon_type"], seed["observed_at"], seed["observed_at"], MAX_CANDIDATES + 1),
        )
        candidates = cursor.fetchall()
        if len(candidates) > MAX_CANDIDATES:
            raise ValueError("Cosmos candidate capacity exceeded")
        cluster = cluster_observations(seed, candidates)
        if not cluster:
            raise ValueError("Cosmos observation has invalid coordinates or timestamp")
        existing_ids = sorted({str(item["event_id"]) for item in cluster if item.get("event_id")})
        cursor.execute(
            """
            select id from public.cosmos_events
            where id=any(%s::uuid[]) and phenomenon_type=%s and status <> 'rejected'
            order by created_at,id limit 1 for update
            """,
            (existing_ids, seed["phenomenon_type"]),
        )
        existing = cursor.fetchone()
        event_id = existing["id"] if existing else None
        if event_id is not None:
            # Preserve the canonical event's members, including those outside
            # this seed's narrow search window; partial retries cannot split it.
            cursor.execute(
                """
                select * from public.cosmos_observations
                where event_id=%s and status <> 'rejected' order by id limit %s for update
                """,
                (event_id, MAX_CANDIDATES + 1),
            )
            members = cursor.fetchall()
            if len(members) > MAX_CANDIDATES:
                raise ValueError("Cosmos event capacity exceeded")
            by_id = {str(item["id"]): item for item in [*members, *cluster]}
            cluster = list(by_id.values())
        ids = sorted(str(item["id"]) for item in cluster)
        distinct_users = {str(item["user_id"]) for item in cluster if item.get("user_id")}
        if len(distinct_users) < 2:
            cursor.execute(
                "update public.cosmos_observations set status='published' where id=%s and event_id is null",
                (observation_id,),
            )
            return StageOutcome("published", 100, {
                "clustered": False, "matching_observations": len(cluster), "observer_count": len(distinct_users),
            })
        if len(cluster) > MAX_CANDIDATES:
            raise ValueError("Cosmos event capacity exceeded")

        if event_id is None:
            cluster_key = hashlib.sha256(":".join(ids).encode()).hexdigest()
            cursor.execute(
                """
                insert into public.cosmos_events(phenomenon_type,title,event_at,status,confidence_score,cluster_key)
                values (%s,%s,%s,'unverified',null,%s)
                on conflict (cluster_key) where cluster_key is not null do update set updated_at=now()
                returning id
                """,
                (
                    seed["phenomenon_type"], "Signalements concordants",
                    min(item["observed_at"] for item in cluster), cluster_key,
                ),
            )
            event_id = cursor.fetchone()["id"]
        solution = triangulate(cluster)
        # Public event JSON contains no observer identities, origins or rays.
        public_solution = (
            {key: value for key, value in solution.items() if key not in {"observation_ids", "error_margin_km"}}
            if solution else None
        )
        cursor.execute(
            "update public.cosmos_observations set event_id=%s,status='clustered' where id=any(%s::uuid[])",
            (event_id, ids),
        )
        cursor.execute(
            """
            update public.cosmos_events e set
              description=%s,event_at=(select min(o.observed_at) from public.cosmos_observations o where o.event_id=e.id),
              observation_count=(select count(*) from public.cosmos_observations o where o.event_id=e.id and o.status <> 'rejected'),
              confidence_score=null,status=case when e.status='transmitted' then e.status else 'unverified' end,
              triangulation=%s::jsonb,ai_analysis=null,updated_at=now() where e.id=%s
            """,
            (
                f"Corrélation de {len(cluster)} signalements issus de {len(distinct_users)} observateurs distincts ; phénomène non confirmé scientifiquement.",
                json.dumps(public_solution) if public_solution else None,
                event_id,
            ),
        )
        if solution:
            cursor.execute(
                """
                insert into public.cosmos_triangulations(
                  event_id,observation_ids,estimated_latitude,estimated_longitude,
                  estimated_altitude_km,error_margin_km,method,confidence
                ) values (%s,%s::uuid[],%s,%s,%s,null,'geometric',null)
                on conflict (event_id) do update set
                  observation_ids=excluded.observation_ids,estimated_latitude=excluded.estimated_latitude,
                  estimated_longitude=excluded.estimated_longitude,estimated_altitude_km=excluded.estimated_altitude_km,
                  trajectory=null,estimated_speed_km_s=null,error_margin_km=null,
                  method='geometric',confidence=null,computed_at=now()
                """,
                (
                    event_id, solution["observation_ids"], solution["estimated_latitude"],
                    solution["estimated_longitude"], solution["estimated_altitude_km"],
                ),
            )
        else:
            _clear_triangulation(cursor, event_id)
        for donor_id in existing_ids:
            if donor_id == str(event_id):
                continue
            cursor.execute(
                "select count(distinct user_id) as witnesses from public.cosmos_observations where event_id=%s and status <> 'rejected'",
                (donor_id,),
            )
            if cursor.fetchone()["witnesses"] < 2:
                cursor.execute(
                    "update public.cosmos_observations set event_id=null,status='published' where event_id=%s and status <> 'rejected'",
                    (donor_id,),
                )
            cursor.execute(
                """
                update public.cosmos_events e set
                  observation_count=(select count(*) from public.cosmos_observations o where o.event_id=e.id and o.status <> 'rejected'),
                  status=case when exists(select 1 from public.cosmos_observations o where o.event_id=e.id and o.status <> 'rejected')
                    then 'unverified' else 'rejected' end,
                  triangulation=null,confidence_score=null,ai_analysis=null,updated_at=now() where e.id=%s
                """,
                (donor_id,),
            )
            _clear_triangulation(cursor, donor_id)
    return StageOutcome("published", 100, {
        "clustered": True, "event_id": str(event_id), "matching_observations": len(cluster),
        "observer_count": len(distinct_users), "triangulated": bool(solution),
    })
