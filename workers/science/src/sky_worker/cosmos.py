from __future__ import annotations

from datetime import datetime, timezone
import math
from numbers import Real
from typing import Any

import numpy as np


EARTH_RADIUS_KM = 6371.0088
MIN_STATION_BASELINE_KM = 1.0
MIN_CROSSING_ANGLE_DEG = 3.0
MAX_TIME_SPAN_SECONDS = 30.0
MAX_CONDITION_NUMBER = 10_000.0
MAX_RESIDUAL_KM = 25.0
MAX_ANGULAR_RESIDUAL_DEG = 5.0
MAX_ALTITUDE_KM = 50_000.0
POINT_PHENOMENA = {"meteor", "fireball", "satellite", "atmospheric", "unknown"}


def _finite(value: Any, minimum: float, maximum: float) -> bool:
    return (
        isinstance(value, Real)
        and not isinstance(value, bool)
        and math.isfinite(value)
        and minimum <= value <= maximum
    )


def _valid_location(observation: dict[str, Any]) -> bool:
    return _finite(observation.get("latitude"), -90, 90) and _finite(observation.get("longitude"), -180, 180)


def _observed_at(observation: dict[str, Any]) -> datetime | None:
    value = observation.get("observed_at")
    try:
        observed = datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else value
    except ValueError:
        return None
    if not isinstance(observed, datetime) or observed.tzinfo is None:
        return None
    return observed.astimezone(timezone.utc)


def great_circle_km(a: dict[str, Any], b: dict[str, Any]) -> float:
    """Spherical surface distance, including pairs straddling the date line."""
    if not _valid_location(a) or not _valid_location(b):
        return math.inf
    lat1, lat2 = math.radians(a["latitude"]), math.radians(b["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(b["longitude"] - a["longitude"])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(max(0, min(1, value))))


def cluster_observations(
    seed: dict[str, Any], candidates: list[dict[str, Any]], max_minutes: int = 15, max_distance_km: float = 500
) -> list[dict[str, Any]]:
    """Return possible correlations, not evidence that reports describe one object.

    Sorting and ID de-duplication make a retry independent of database row order.
    User identity is intentionally not used here: independent witnesses are
    counted separately, and triangulation accepts only one ray per witness.
    """
    seed_time = _observed_at(seed)
    if seed_time is None or not _valid_location(seed) or seed.get("status") == "rejected":
        return []
    cluster = []
    seen_ids = set()
    for item in candidates:
        observed = _observed_at(item)
        if observed is None or item.get("status") == "rejected":
            continue
        if item.get("phenomenon_type") != seed.get("phenomenon_type"):
            continue
        if abs((observed - seed_time).total_seconds()) > max_minutes * 60:
            continue
        if great_circle_km(seed, item) > max_distance_km:
            continue
        item_id = item.get("id")
        if item_id is not None:
            if str(item_id) in seen_ids:
                continue
            seen_ids.add(str(item_id))
        cluster.append(item)
    return sorted(cluster, key=lambda item: (_observed_at(item), str(item.get("id", ""))))


def _observer_and_ray(observation: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    lat = math.radians(observation["latitude"])
    lon = math.radians(observation["longitude"])
    radius = EARTH_RADIUS_KM + float(observation.get("altitude_m") or 0) / 1000
    origin = radius * np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    az = math.radians(float(observation["azimuth"]))
    el = math.radians(float(observation["elevation"]))
    east = np.array([-math.sin(lon), math.cos(lon), 0])
    north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    up = origin / np.linalg.norm(origin)
    direction = math.cos(el) * math.sin(az) * east + math.cos(el) * math.cos(az) * north + math.sin(el) * up
    return origin, direction / np.linalg.norm(direction)


def triangulate(observations: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Fit a provisional point to independent forward sight lines.

    This is a spherical-Earth, static-point approximation, not a meteor
    trajectory, object identification, or a validated detection. The quality
    gates below are engineering filters, not calibrated confidence bounds.
    A residual is a fit discrepancy; without angular measurement errors it
    cannot be reported as positional uncertainty or a probability.

    Kept in parity with src/features/cosmos/domain/science.ts. For the
    distinction between geometric fitting and measurement uncertainty see
    Vida et al., https://arxiv.org/abs/1911.02979.
    """
    valid = []
    for item in observations:
        if not item.get("user_id") or not item.get("id") or item.get("status") == "rejected":
            continue
        if _observed_at(item) is None or not _valid_location(item):
            continue
        altitude = item.get("altitude_m")
        if altitude is not None and not _finite(altitude, -500, 10_000):
            continue
        if not _finite(item.get("azimuth"), 0, 360) or not _finite(item.get("elevation"), 0, 90):
            continue
        if item.get("phenomenon_type") not in POINT_PHENOMENA:
            continue
        valid.append(item)
    valid.sort(key=lambda item: (_observed_at(item), str(item["id"])))

    usable = []
    users = set()
    for item in valid:
        user_id = str(item["user_id"])
        if user_id in users:
            continue
        if any(great_circle_km(item, station) < MIN_STATION_BASELINE_KM for station in usable):
            continue
        users.add(user_id)
        usable.append(item)
    if len(usable) < 2 or len({item["phenomenon_type"] for item in usable}) != 1:
        return None
    time_span = (_observed_at(usable[-1]) - _observed_at(usable[0])).total_seconds()
    if time_span > MAX_TIME_SPAN_SECONDS:
        return None

    rays = [_observer_and_ray(item) for item in usable]
    max_crossing_angle = max(
        math.degrees(math.acos(float(np.clip(abs(np.dot(a[1], b[1])), 0, 1))))
        for i, a in enumerate(rays) for b in rays[i + 1:]
    )
    if max_crossing_angle < MIN_CROSSING_ANGLE_DEG:
        return None

    # Solve relative to the station centroid to reduce cancellation in ECEF.
    reference = np.mean([origin for origin, _ in rays], axis=0)
    normal = np.zeros((3, 3))
    rhs = np.zeros(3)
    for origin, direction in rays:
        projection = np.eye(3) - np.outer(direction, direction)
        normal += projection
        rhs += projection @ (origin - reference)
    try:
        condition = float(np.linalg.cond(normal, p=np.inf))
        if not math.isfinite(condition) or condition > MAX_CONDITION_NUMBER:
            return None
        point = reference + np.linalg.solve(normal, rhs)
    except np.linalg.LinAlgError:
        return None
    radius = float(np.linalg.norm(point))
    altitude = radius - EARTH_RADIUS_KM
    if not math.isfinite(radius) or not 0 <= altitude <= MAX_ALTITUDE_KM:
        return None

    residuals = []
    angular_residuals = []
    for origin, direction in rays:
        delta = point - origin
        distance = float(np.linalg.norm(delta))
        if distance <= 0 or float(np.dot(delta, direction)) <= 0:
            return None
        residual = float(np.linalg.norm(np.cross(delta, direction)))
        angle = math.degrees(math.asin(min(1, residual / distance)))
        if angle > MAX_ANGULAR_RESIDUAL_DEG:
            return None
        residuals.append(residual)
        angular_residuals.append(angle)
    rms = float(np.sqrt(np.mean(np.square(residuals))))
    if not math.isfinite(rms) or rms > MAX_RESIDUAL_KM:
        return None

    return {
        "estimated_latitude": math.degrees(math.asin(float(np.clip(point[2] / radius, -1, 1)))),
        "estimated_longitude": math.degrees(math.atan2(point[1], point[0])),
        "estimated_altitude_km": altitude,
        # Compatibility only: this field is a residual, not a +/- error bar.
        "error_margin_km": rms,
        "residual_rms_km": rms,
        "max_residual_km": max(residuals),
        "angular_residual_deg": max(angular_residuals),
        "observation_ids": [str(item["id"]) for item in usable],
        "observer_count": len(usable),
        "baseline_km": max(great_circle_km(a, b) for i, a in enumerate(usable) for b in usable[i + 1:]),
        "condition_number": condition,
        "time_span_seconds": time_span,
        "method": "geometric",
        "model": "spherical-earth-rays-v2",
        "status": "estimate",
        "confidence": None,
    }
