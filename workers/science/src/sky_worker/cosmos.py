from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import math
from typing import Any

import numpy as np


EARTH_RADIUS_KM = 6371.0088


def great_circle_km(a: dict[str, Any], b: dict[str, Any]) -> float:
    lat1, lat2 = math.radians(a["latitude"]), math.radians(b["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(b["longitude"] - a["longitude"])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1, math.sqrt(value)))


def cluster_observations(
    seed: dict[str, Any], candidates: list[dict[str, Any]], max_minutes: int = 15, max_distance_km: float = 500
) -> list[dict[str, Any]]:
    seed_time = seed["observed_at"]
    if isinstance(seed_time, str):
        seed_time = datetime.fromisoformat(seed_time.replace("Z", "+00:00"))
    cluster = []
    for item in candidates:
        observed = item["observed_at"]
        if isinstance(observed, str):
            observed = datetime.fromisoformat(observed.replace("Z", "+00:00"))
        if item["phenomenon_type"] != seed["phenomenon_type"]:
            continue
        if abs((observed - seed_time).total_seconds()) > max_minutes * 60:
            continue
        if great_circle_km(seed, item) <= max_distance_km:
            cluster.append(item)
    return cluster


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


def triangulate(observations: list[dict[str, Any]]) -> dict[str, float] | None:
    usable = [item for item in observations if item.get("azimuth") is not None and item.get("elevation") is not None]
    if len(usable) < 2:
        return None
    normal = np.zeros((3, 3))
    rhs = np.zeros(3)
    for item in usable:
        origin, direction = _observer_and_ray(item)
        projection = np.eye(3) - np.outer(direction, direction)
        normal += projection
        rhs += projection @ origin
    point, *_ = np.linalg.lstsq(normal, rhs, rcond=None)
    radius = float(np.linalg.norm(point))
    latitude = math.degrees(math.asin(point[2] / radius))
    longitude = math.degrees(math.atan2(point[1], point[0]))
    residuals = []
    for item in usable:
        origin, direction = _observer_and_ray(item)
        residuals.append(float(np.linalg.norm(np.cross(point - origin, direction))))
    return {
        "estimated_latitude": latitude,
        "estimated_longitude": longitude,
        "estimated_altitude_km": radius - EARTH_RADIUS_KM,
        "error_margin_km": float(np.sqrt(np.mean(np.square(residuals)))),
        "confidence": max(0.0, min(1.0, 1 - float(np.mean(residuals)) / 100)),
    }
