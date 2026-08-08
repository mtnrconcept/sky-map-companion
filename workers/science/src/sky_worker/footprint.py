from __future__ import annotations

from typing import Iterable

from astropy.coordinates import SkyCoord
from astropy.wcs import WCS
import astropy.units as u
import numpy as np
from reproject import reproject_to_healpix


def seam_safe_footprint(wcs: WCS, width: int, height: int, edge_samples: int = 16) -> dict:
    top_x = np.linspace(0, width - 1, edge_samples)
    side_y = np.linspace(0, height - 1, edge_samples)
    x = np.concatenate([top_x, np.full(edge_samples, width - 1), top_x[::-1], np.zeros(edge_samples)])
    y = np.concatenate([np.zeros(edge_samples), side_y, np.full(edge_samples, height - 1), side_y[::-1]])
    ra, dec = wcs.pixel_to_world_values(x, y)
    ra = np.mod(ra, 360)
    points = [[float(a), float(d)] for a, d in zip(ra, dec, strict=True)]
    points.append(points[0])
    # GeoJSON coordinates are allowed to unwrap around the anti-meridian. The
    # worker stores both normalized points and a continuous ring for robust consumers.
    unwrapped = np.rad2deg(np.unwrap(np.deg2rad(ra)))
    continuous = [[float(a), float(d)] for a, d in zip(unwrapped, dec, strict=True)]
    continuous.append(continuous[0])
    return {"type": "MultiPolygon", "coordinates": [[[point for point in points]]], "continuous_ring": continuous}


def covered_healpix_cells(mask: np.ndarray, wcs: WCS, orders: Iterable[int] = (6, 7, 8, 9)) -> list[dict]:
    source = np.asarray(mask, dtype=np.float32)
    cells: list[dict] = []
    for order in orders:
        nside = 1 << order
        projected, footprint = reproject_to_healpix(
            (source, wcs.celestial),
            "icrs",
            nside=nside,
            nested=True,
            order="bilinear",
        )
        coverage = np.nan_to_num(projected) * np.nan_to_num(footprint)
        for index in np.flatnonzero(coverage > 0.01):
            value = float(np.clip(coverage[index], 0, 1))
            cells.append(
                {
                    "healpix_order": order,
                    "healpix_index": int(index),
                    "coverage_fraction": value,
                    "usable_fraction": value,
                    "eligible": value >= 0.7,
                }
            )
    return cells
