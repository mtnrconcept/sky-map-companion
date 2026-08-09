from datetime import datetime, timezone

from sky_worker.cosmos import cluster_observations, triangulate


def test_clusters_matching_reports_only():
    now = datetime.now(timezone.utc)
    seed = {"latitude": 46.2, "longitude": 6.1, "phenomenon_type": "meteor", "observed_at": now}
    near = {**seed, "latitude": 46.3}
    other = {**seed, "phenomenon_type": "aurora"}
    assert cluster_observations(seed, [near, other]) == [near]


def test_two_intersecting_sight_lines_are_triangulated():
    observations = [
        {"latitude": 46.0, "longitude": 6.0, "altitude_m": 400, "azimuth": 90, "elevation": 45},
        {"latitude": 46.0, "longitude": 7.0, "altitude_m": 400, "azimuth": 270, "elevation": 45},
    ]
    result = triangulate(observations)
    assert result is not None
    assert result["estimated_altitude_km"] > 0
    assert result["error_margin_km"] >= 0
