from datetime import datetime, timedelta, timezone
import math

import pytest

from sky_worker.cosmos import cluster_observations, great_circle_km, triangulate


NOW = datetime(2026, 11, 6, 20, tzinfo=timezone.utc)


def report(identifier="a", **changes):
    return {
        "id": identifier,
        "user_id": f"observer-{identifier}",
        "latitude": 46.0,
        "longitude": 6.0,
        "altitude_m": 400,
        "phenomenon_type": "meteor",
        "observed_at": NOW,
        "status": "pending",
        **changes,
    }


def sight_lines():
    # Synthetic forward observations of the known point (46.2, 6.5, 85 km).
    # Fixed angles are also used by the TypeScript parity tests.
    return [
        report("a", azimuth=59.840841892510944, elevation=61.89406483036314),
        report("b", longitude=7.0, azimuth=300.1591581074891, elevation=61.894064830363156),
        report("c", latitude=46.5, longitude=6.2, azimuth=145.27594578867829, elevation=64.06818363048849),
    ]


def test_clusters_matching_reports_only():
    seed = report()
    near = report("b", latitude=46.3)
    other = report("c", phenomenon_type="aurora")
    distant = report("d", latitude=-30)
    old = report("e", observed_at=NOW - timedelta(minutes=16))
    rejected = report("f", status="rejected")
    assert cluster_observations(seed, [near, other, distant, old, rejected]) == [near]


def test_correlation_deduplicates_and_orders_ids_consistently():
    seed, second = report(), report("b")
    assert cluster_observations(seed, [second, seed, second]) == [seed, second]
    assert cluster_observations(seed, [seed, second]) == [seed, second]


def test_correlation_includes_time_boundary_and_handles_explicit_timezones():
    seed = report(observed_at="2026-11-06T21:00:00+01:00")
    boundary = report("b", observed_at="2026-11-06T19:45:00Z")
    assert cluster_observations(seed, [boundary]) == [boundary]
    assert cluster_observations(seed, [report("c", observed_at="2026-11-06T20:00:00")]) == []


def test_correlation_crosses_the_date_line_and_handles_antipodes():
    seed = report(latitude=0, longitude=179.5)
    across = report("b", latitude=0, longitude=-179.5)
    assert great_circle_km(seed, across) == pytest.approx(111.1950802335329)
    assert cluster_observations(seed, [across]) == [across]
    assert math.isfinite(great_circle_km(report(latitude=0, longitude=0), report(latitude=0, longitude=180)))


@pytest.mark.parametrize("changes", [
    {"latitude": float("nan")}, {"longitude": float("inf")}, {"latitude": 91},
    {"longitude": "6"}, {"observed_at": "garbage"}, {"status": "rejected"},
])
def test_invalid_seed_and_candidates_do_not_correlate(changes):
    valid, invalid = report(), report("b", **changes)
    assert cluster_observations(valid, [invalid]) == []
    assert cluster_observations(invalid, [valid]) == []


def test_known_synthetic_point_is_recovered_without_inventing_confidence():
    result = triangulate(sight_lines())
    assert result is not None
    assert result["estimated_latitude"] == pytest.approx(46.2, abs=1e-8)
    assert result["estimated_longitude"] == pytest.approx(6.5, abs=1e-8)
    assert result["estimated_altitude_km"] == pytest.approx(85.0, abs=1e-6)
    assert result["residual_rms_km"] < 1e-8
    assert result["error_margin_km"] == result["residual_rms_km"]
    assert result["condition_number"] == pytest.approx(6.147396076652111)
    assert result["confidence"] is None
    assert result["status"] == "estimate"
    assert result["observer_count"] == 3
    assert result["observation_ids"] == ["a", "b", "c"]
    assert "estimated_speed_km_s" not in result


def test_two_independent_observers_are_sufficient_for_a_provisional_point():
    result = triangulate(sight_lines()[:2])
    assert result is not None
    assert result["observer_count"] == 2
    assert result["estimated_altitude_km"] == pytest.approx(85.0, abs=1e-6)


def test_equator_prime_meridian_and_zero_altitude_stations_are_supported():
    result = triangulate([
        report("a", latitude=0, longitude=-0.5, altitude_m=0, azimuth=90, elevation=60.486246472913656),
        report("b", latitude=0, longitude=0.5, altitude_m=0, azimuth=270, elevation=60.486246472913656),
    ])
    assert result is not None
    assert result["estimated_latitude"] == pytest.approx(0, abs=1e-8)
    assert result["estimated_longitude"] == pytest.approx(0, abs=1e-8)
    assert result["estimated_altitude_km"] == pytest.approx(100, abs=1e-6)


def test_triangulation_can_cross_the_date_line():
    result = triangulate([
        report("a", latitude=0, longitude=179.5, altitude_m=0, azimuth=90, elevation=60.48624647291393),
        report("b", latitude=0, longitude=-179.5, altitude_m=0, azimuth=270, elevation=60.486246472913244),
    ])
    assert result is not None
    assert abs(result["estimated_longitude"]) == pytest.approx(180)
    assert result["estimated_altitude_km"] == pytest.approx(100, abs=1e-6)


def test_repeated_reports_by_one_user_are_not_independent_measurements():
    first, second, _ = sight_lines()
    assert triangulate([first, {**second, "user_id": first["user_id"]}]) is None
    duplicate = {**first, "id": "z", "azimuth": 0}
    result = triangulate([duplicate, second, first])
    assert result is not None
    assert result["observation_ids"] == ["a", "b"]
    assert result["estimated_altitude_km"] == pytest.approx(85, abs=1e-6)


def test_colocated_users_are_not_independent_stations():
    first = sight_lines()[0]
    assert triangulate([first, {**first, "id": "b", "user_id": "observer-b", "azimuth": 90}]) is None


@pytest.mark.parametrize("changes", [
    {"user_id": None}, {"id": None}, {"status": "rejected"}, {"azimuth": None},
    {"elevation": None}, {"azimuth": "90"}, {"azimuth": float("nan")}, {"elevation": -1},
    {"azimuth": 361}, {"altitude_m": float("inf")}, {"altitude_m": -501}, {"latitude": True},
    {"observed_at": "invalid"}, {"phenomenon_type": "aurora"},
])
def test_invalid_or_unusable_second_ray_is_not_treated_as_a_measurement(changes):
    first, second, _ = sight_lines()
    assert triangulate([first, {**second, **changes}]) is None


@pytest.mark.parametrize("phenomenon", ["aurora", "comet", "supernova"])
def test_extended_or_astronomically_distant_sources_are_not_point_triangulated(phenomenon):
    assert triangulate([{**item, "phenomenon_type": phenomenon} for item in sight_lines()]) is None


def test_reports_far_apart_in_time_are_not_a_simultaneous_point_measurement():
    first, second, _ = sight_lines()
    assert triangulate([first, {**second, "observed_at": NOW + timedelta(seconds=31)}]) is None


def test_parallel_lines_do_not_generate_an_artificial_solution():
    assert triangulate([
        report("a", latitude=0, longitude=-0.5, altitude_m=0, azimuth=90, elevation=89.5),
        report("b", latitude=0, longitude=0.5, altitude_m=0, azimuth=270, elevation=89.5),
    ]) is None


def test_diverging_lines_do_not_generate_a_behind_observer_or_subterranean_solution():
    assert triangulate([
        report("a", latitude=0, longitude=-0.5, altitude_m=0, azimuth=270, elevation=60.486246472913656),
        report("b", latitude=0, longitude=0.5, altitude_m=0, azimuth=90, elevation=60.486246472913656),
    ]) is None


def test_inconsistent_third_observer_does_not_get_a_confident_average():
    first, second, third = sight_lines()
    assert triangulate([first, second, {**third, "azimuth": 0, "elevation": 10}]) is None


def test_reordering_observations_does_not_change_solution_or_selected_ids():
    observations = sight_lines()
    assert triangulate(list(reversed(observations))) == triangulate(observations)
