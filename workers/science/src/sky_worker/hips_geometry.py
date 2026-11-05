"""Astrometrically exact HiPS raster sampling on the NESTED HEALPix grid.

A HiPS Npix tile is *not* a tangent-plane image. Each raster pixel is the
centre of a nested HEALPix descendant of that tile. Published PNG/WebP tiles
have their row direction reversed relative to FITS (upper-left image origin).
Sampling a TAN square then giving it a HiPS Npix name rotates/translates stars
and makes the error appear to grow as the viewer changes zoom/order.
"""

from __future__ import annotations

import math

from astropy_healpix import HEALPix
from astropy.wcs import WCS
import astropy.units as u
import numpy as np
from scipy.ndimage import map_coordinates


# Increment this contract when tile orientation, coordinate sampling or alpha
# semantics change. Previously published TAN tiles cannot be used with it.
HIPS_PIXEL_GEOMETRY_VERSION = "nested-icrs-image-y-flip-v2"
INTERPOLATION_ORDERS = {
    "nearest-neighbor": 0,
    "bilinear": 1,
    "biquadratic": 2,
    "bicubic": 3,
}


def nested_hips_pixel_indices(order: int, index: int, size: int) -> np.ndarray:
    """Map PNG/WebP image pixel (row, col) to its exact HEALPix descendant.

    NESTED children encode the local x and y bits in alternating positions;
    a 512px HiPS tile spans 9 additional HEALPix orders. PNG/WebP row 0 is
    the top of the image, while HEALPix local y grows in the other direction.
    """
    if not 0 <= order <= 20:
        raise ValueError("unsupported HiPS pixel order for 64-bit HEALPix indices")
    if index < 0 or index >= 12 * (4**order):
        raise ValueError("HiPS Npix is outside its HEALPix order")
    if size < 16 or size & (size - 1):
        raise ValueError("HiPS tile size must be a power of two >= 16")
    shift = size.bit_length() - 1
    if order + shift > 29:
        raise ValueError("HiPS pixel order exceeds HEALPix 64-bit safety cap")

    x = np.arange(size, dtype=np.int64)[None, :]
    y = np.arange(size - 1, -1, -1, dtype=np.int64)[:, None]
    indices = np.full((size, size), int(index) << (2 * shift), dtype=np.int64)
    for bit in range(shift):
        indices |= ((x >> bit) & 1) << (2 * bit)
        indices |= ((y >> bit) & 1) << (2 * bit + 1)
    return indices


def hips_pixel_sky_coordinates(order: int, index: int, size: int) -> tuple[np.ndarray, np.ndarray]:
    """ICRS RA/Dec per output pixel, in normal top-to-bottom image order."""
    child_indices = nested_hips_pixel_indices(order, index, size)
    nside = 1 << (order + size.bit_length() - 1)
    grid = HEALPix(nside=nside, order="nested", frame="icrs")
    longitudes, latitudes = grid.healpix_to_lonlat(child_indices.reshape(-1))
    return (
        longitudes.to_value(u.deg).reshape(size, size),
        latitudes.to_value(u.deg).reshape(size, size),
    )


def resample_celestial_image_to_hips(
    data: np.ndarray,
    source_wcs: WCS,
    *,
    order: int,
    index: int,
    size: int = 512,
    interpolation_order: str = "bilinear",
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (sampled float32, alpha-valid mask, fractional source coverage).

    Coordinates are immutable sky positions for each HEALPix cell pixel, so
    zooming and switching neighbouring/parent tiles never move the sources.
    Blank source samples stay transparent rather than turning gray or black.
    """
    method = INTERPOLATION_ORDERS.get(interpolation_order)
    if method is None:
        raise ValueError("unsupported HiPS interpolation method")
    if data.ndim != 2 or not source_wcs.celestial.has_celestial:
        raise ValueError("HiPS reprojection needs a 2-D image and celestial WCS")

    ra, dec = hips_pixel_sky_coordinates(order, index, size)
    pixel_x, pixel_y = source_wcs.celestial.world_to_pixel_values(ra, dec)
    coords = np.stack((np.asarray(pixel_y), np.asarray(pixel_x)), axis=0)
    finite_coords = np.all(np.isfinite(coords), axis=0)
    safe_coords = np.where(finite_coords[None, ...], coords, -1e6)

    finite = np.isfinite(data)
    source_values = np.where(finite, data, 0).astype(np.float32)
    source_mask = finite.astype(np.float32)

    common = {"order": method, "mode": "constant", "cval": 0.0, "prefilter": method > 1}
    accumulated = map_coordinates(source_values, safe_coords, **common)
    footprint = map_coordinates(source_mask, safe_coords, **common)
    footprint = np.clip(np.asarray(footprint, dtype=np.float32), 0, 1)
    valid = finite_coords & (footprint > 0.5)
    output = np.full((size, size), np.nan, dtype=np.float32)
    np.divide(accumulated, np.maximum(footprint, 1e-8), out=output, where=valid)
    return output, valid, footprint
