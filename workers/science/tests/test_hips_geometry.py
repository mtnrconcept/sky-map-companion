from __future__ import annotations

import numpy as np
from astropy_healpix import HEALPix
from astropy.wcs import WCS
import astropy.units as u
import pytest

from sky_worker.hips_geometry import (
    HIPS_PIXEL_GEOMETRY_VERSION,
    hips_pixel_sky_coordinates,
    nested_hips_pixel_indices,
    resample_celestial_image_to_hips,
)


@pytest.mark.parametrize("order,index", [(0, 0), (2, 31), (7, 12345), (9, 173385)])
def test_png_pixels_match_healpix_offsets_instead_of_a_tangent_square(order, index):
    size = 32
    ra, dec = hips_pixel_sky_coordinates(order, index, size)
    hp = HEALPix(nside=1 << order, order="nested", frame="icrs")
    for y, x in [(0, 0), (0, 31), (31, 0), (31, 31), (15, 16)]:
        expected = hp.healpix_to_skycoord(
            index, dx=(y + 0.5) / size, dy=(x + 0.5) / size
        )
        actual = expected.__class__(ra[y, x] * u.deg, dec[y, x] * u.deg, frame="icrs")
        assert actual.separation(expected).to_value(u.arcsec) < 1e-4


def test_png_nest_order_and_parent_child_positions_are_stable():
    order, parent, size = 3, 145, 16
    cells = nested_hips_pixel_indices(order, parent, size)
    shift = size.bit_length() - 1
    # Official JPG/PNG raster orientation verified against two independent
    # Pan-STARRS/DSS2 N9 pairs, to well below one pixel of residual offset.
    expected_quadrants = {(0, 0): 0, (0, 15): 2, (15, 0): 1, (15, 15): 3}
    for (y, x), child in expected_quadrants.items():
        assert int(cells[y, x]) >> (2 * (shift - 1)) == 4 * parent + child
    # Every pixel still belongs to precisely its nominal parent HEALPix cell.
    assert np.all(cells >> (2 * shift) == parent)


def test_sampled_cells_preserve_source_sky_coordinates_and_transparency():
    order, index, size = 9, 173385, 64
    coarse = HEALPix(nside=1 << order, order="nested", frame="icrs")
    center = coarse.healpix_to_skycoord(index)
    source = WCS(naxis=2)
    source.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    source.wcs.crval = [center.ra.deg, center.dec.deg]
    source.wcs.crpix = [64.5, 64.5]
    source.wcs.cdelt = [-0.002, 0.002]
    pixels = np.ones((128, 128), dtype=np.float32)
    pixels[48:80, 48:80] = np.nan

    projected, valid, coverage = resample_celestial_image_to_hips(
        pixels,
        source,
        order=order,
        index=index,
        size=size,
        interpolation_order="nearest-neighbor",
    )
    assert projected.shape == (size, size)
    assert 0 < valid.mean() < 1
    assert np.isnan(projected[~valid]).all()
    assert np.isfinite(projected[valid]).all()
    assert np.all((coverage >= 0) & (coverage <= 1))
    assert HIPS_PIXEL_GEOMETRY_VERSION == "nested-icrs-cds-png-orientation-v3"


def test_rejects_invalid_tile_size_and_wrong_interpolation():
    with pytest.raises(ValueError, match="power of two"):
        nested_hips_pixel_indices(1, 1, 30)
    source = WCS(naxis=2)
    source.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    with pytest.raises(ValueError, match="interpolation"):
        resample_celestial_image_to_hips(
            np.ones((64, 64)), source, order=1, index=0,
            size=32, interpolation_order="unrecognized",
        )
