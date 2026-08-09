from __future__ import annotations

from io import BytesIO

from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
from PIL import Image
import pytest

from sky_worker.mosaic import (
    CanvasPlan,
    CoaddResult,
    HealpixCell,
    MosaicFrame,
    MosaicIntegrityError,
    SourceContribution,
    SourceGeometry,
    build_healpix_plan,
    coadd_streaming,
    hash_source_inventory,
    load_authoritative_wcs,
    measure_tile_source_contributions,
    plan_mosaic_canvas,
    render_healpix_tiles,
    write_master_fits,
    write_master_preview,
)


M31_FINE_CELLS = [
    167919,
    167928,
    167930,
    167910,
    167911,
    167916,
    167931,
    173392,
    173385,
    173387,
    173381,
    173383,
    173333,
    173335,
    167923,
    167929,
    173343,
    173365,
    173386,
    167913,
    167915,
    173384,
    173380,
    173394,
    167912,
]


def tangent_wcs(
    center_ra: float,
    center_dec: float,
    shape: tuple[int, int],
    scale_arcsec: float = 1.0,
) -> WCS:
    height, width = shape
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.cunit = ["deg", "deg"]
    wcs.wcs.crval = [center_ra, center_dec]
    wcs.wcs.crpix = [(width + 1) / 2, (height + 1) / 2]
    wcs.wcs.cdelt = [-scale_arcsec / 3600, scale_arcsec / 3600]
    return wcs


def serialized_wcs(wcs: WCS, method: str = "trusted-public-archive-wcs") -> dict[str, str]:
    return {
        "cards": wcs.to_header(relax=True).tostring(sep="\n", endcard=True, padding=False),
        "verification_method": method,
    }


def test_authoritative_wcs_round_trips_and_rejects_raw_divergence():
    shape = (64, 64)
    persisted = tangent_wcs(10.6847, 41.2692, shape, 0.25)
    loaded = load_authoritative_wcs(
        serialized_wcs(persisted),
        shape,
        raw_header=persisted.to_header(relax=True),
    )

    assert loaded.verification_method == "trusted-public-archive-wcs"
    assert loaded.pixel_scale_arcsec == pytest.approx(0.25)
    assert loaded.max_raw_separation_arcsec == pytest.approx(0, abs=1e-6)

    shifted = tangent_wcs(10.7, 41.2692, shape, 0.25)
    with pytest.raises(MosaicIntegrityError, match="disagrees"):
        load_authoritative_wcs(
            serialized_wcs(persisted),
            shape,
            raw_header=shifted.to_header(relax=True),
        )


def test_canvas_adapts_within_explicit_byte_and_scale_bounds():
    shape = (128, 128)
    sources = [
        SourceGeometry("left", shape, tangent_wcs(10.0, 41.0, shape)),
        SourceGeometry("right", shape, tangent_wcs(10.08, 41.0, shape)),
    ]

    native = plan_mosaic_canvas(sources, margin_pixels=0, max_fits_bytes=8 * 1024 * 1024)
    constrained = plan_mosaic_canvas(
        sources,
        margin_pixels=0,
        max_fits_bytes=80_000,
        fits_overhead_bytes=2_880,
        max_scale_factor=8,
    )

    assert native.adapted is False
    assert constrained.adapted is True
    assert constrained.output_pixel_scale_arcsec > constrained.native_pixel_scale_arcsec
    assert constrained.estimated_fits_bytes <= 80_000


def test_streaming_coadd_keeps_both_non_overlapping_sources_and_overlap(tmp_path):
    shape = (48, 48)
    first_wcs = tangent_wcs(10.0, 41.0, shape)
    second_wcs = tangent_wcs(10.008, 41.0, shape)
    geometries = [
        SourceGeometry("first", shape, first_wcs),
        SourceGeometry("second", shape, second_wcs),
    ]
    canvas = plan_mosaic_canvas(
        geometries,
        margin_pixels=2,
        max_fits_bytes=8 * 1024 * 1024,
    )
    result = coadd_streaming(
        [
            MosaicFrame("first", np.full(shape, 10, dtype=np.float32), first_wcs),
            MosaicFrame("second", np.full(shape, 20, dtype=np.float32), second_wcs),
        ],
        canvas,
        tmp_path,
        expected_source_ids={"first", "second"},
        interpolation_order="nearest-neighbor",
        block_size=32,
    )

    assert result.contributing_source_ids == ("first", "second")
    assert all(item.output_finite_pixels > 0 for item in result.contributions)
    assert result.max_depth == 2
    finite = np.asarray(result.data)[np.isfinite(result.data)]
    assert finite.min() == pytest.approx(10)
    assert finite.max() == pytest.approx(20)
    assert np.any(np.isclose(finite, 15))


def test_streaming_coadd_default_interpolation_contains_sparse_nan_pixels(tmp_path):
    shape = (48, 48)
    wcs = tangent_wcs(10.0, 41.0, shape)
    data = np.ones(shape, dtype=np.float32)
    data[0, 0] = np.nan
    canvas = plan_mosaic_canvas(
        [SourceGeometry("nan-sparse", shape, wcs)],
        margin_pixels=2,
        max_fits_bytes=8 * 1024 * 1024,
    )

    result = coadd_streaming(
        [MosaicFrame("nan-sparse", data, wcs)],
        canvas,
        tmp_path,
        expected_source_ids={"nan-sparse"},
        block_size=32,
    )

    assert result.contributing_source_ids == ("nan-sparse",)
    assert result.contributions[0].input_finite_pixels == data.size - 1
    assert result.contributions[0].output_finite_pixels > 0


def test_streaming_coadd_refuses_a_missing_planned_source(tmp_path):
    shape = (32, 32)
    wcs = tangent_wcs(10.0, 41.0, shape)
    canvas = plan_mosaic_canvas(
        [SourceGeometry("one", shape, wcs), SourceGeometry("two", shape, wcs)],
        max_fits_bytes=4 * 1024 * 1024,
    )

    with pytest.raises(MosaicIntegrityError, match="did not contribute"):
        coadd_streaming(
            [MosaicFrame("one", np.ones(shape, dtype=np.float32), wcs)],
            canvas,
            tmp_path,
            expected_source_ids={"one", "two"},
            block_size=32,
        )


def test_master_fits_checksum_and_preview_are_real_artifacts(tmp_path):
    shape = (40, 64)
    wcs = tangent_wcs(10.6847, 41.2692, shape, 0.25)
    canvas = plan_mosaic_canvas(
        [SourceGeometry("source-1", shape, wcs)],
        margin_pixels=0,
        max_fits_bytes=4 * 1024 * 1024,
    )
    data = np.arange(shape[0] * shape[1], dtype=np.float32).reshape(shape)
    data[:5, :5] = np.nan
    result = coadd_streaming(
        [MosaicFrame("source-1", data, wcs)],
        canvas,
        tmp_path / "coadd",
        expected_source_ids={"source-1"},
        interpolation_order="nearest-neighbor",
        block_size=32,
    )
    fits_artifact = write_master_fits(
        result,
        canvas,
        tmp_path / "master.fits",
        object_id="M31",
        spectral_band="r",
        pipeline_version="archive-mosaic-v9",
        partial=True,
        source_inventory_sha256=hash_source_inventory({"source-1"}),
    )
    preview_artifact = write_master_preview(
        result.data,
        tmp_path / "master.webp",
        max_size=32,
    )

    assert fits_artifact.byte_size > data.nbytes
    assert len(fits_artifact.sha256) == 64
    with fits.open(fits_artifact.path, checksum=True) as hdus:
        science = hdus["SCI"]
        assert hdus[0].verify_checksum() == 1
        assert hdus[0].verify_datasum() == 1
        assert hdus[0].header["OBJECT"] == "M31"
        assert hdus[0].header["NCOMBINE"] == 1
        assert hdus[0].header["PARTIAL"]
        assert hdus[0].header["SRCINV"] == hash_source_inventory({"source-1"})
        assert hdus[0].header["FZALGOR"] == "GZIP_2"
        assert hdus[0].header["FZQLEVL"] == 16.0
        assert science._bintable.verify_checksum() == 1
        assert science._bintable.verify_datasum() == 1
        assert science.data.shape == result.data.shape
        assert np.array_equal(np.isfinite(science.data), np.isfinite(result.data))
        assert "source-1" not in repr(hdus[0].header)
    with Image.open(preview_artifact.path) as image:
        assert image.format == "WEBP"
        assert max(image.size) <= 32
        assert image.mode == "RGBA"


def test_master_fits_compresses_background_noise_for_storage(tmp_path):
    shape = (1024, 1024)
    data_path = tmp_path / "master-float32.dat"
    data = np.memmap(data_path, mode="w+", dtype=np.float32, shape=shape)
    rng = np.random.default_rng(42)
    data[:] = 1000 + rng.normal(0, 30, shape)
    data[::31, ::29] = np.nan
    data.flush()
    finite_pixels = int(np.count_nonzero(np.isfinite(data)))
    wcs = tangent_wcs(10.6847, 41.2692, shape, 0.5)
    canvas = CanvasPlan(
        wcs=wcs,
        shape=shape,
        native_pixel_scale_arcsec=0.5,
        output_pixel_scale_arcsec=0.5,
        estimated_fits_bytes=data.nbytes + 1024 * 1024,
        adapted=False,
        source_ids=("source-1",),
        sha256="a" * 64,
    )
    result = CoaddResult(
        data=data,
        data_path=data_path,
        contributions=(
            SourceContribution("source-1", finite_pixels, finite_pixels, float(finite_pixels)),
        ),
        finite_pixels=finite_pixels,
        spatial_coverage_fraction=finite_pixels / data.size,
        mean_depth=1.0,
        max_depth=1,
    )

    artifact = write_master_fits(
        result,
        canvas,
        tmp_path / "compressed-master.fits",
        object_id="M31",
        spectral_band="r",
        pipeline_version="archive-mosaic-v9",
        partial=True,
        source_inventory_sha256=hash_source_inventory({"source-1"}),
    )

    assert artifact.byte_size < data.nbytes * 0.3


def test_live_m31_fine_cells_expand_to_a_valid_42_tile_nested_plan():
    plan = build_healpix_plan(M31_FINE_CELLS, fine_order=9, minimum_order=7)
    reordered = build_healpix_plan(reversed(M31_FINE_CELLS), fine_order=9, minimum_order=7)

    assert plan.counts_by_order == {7: 6, 8: 11, 9: 25}
    assert plan.expected_tiles == 42
    assert plan.sha256 == reordered.sha256
    cells = {(cell.order, cell.index) for cell in plan.cells}
    for index in M31_FINE_CELLS:
        assert (9, index) in cells
        assert (8, index // 4) in cells
        assert (7, index // 16) in cells


def test_healpix_render_uses_true_cell_mask_alpha_and_refuses_empty_plan():
    fine_index = 173385
    fine = HealpixCell(9, fine_index)
    from astropy.coordinates import ICRS
    from astropy_healpix import HEALPix

    hp = HEALPix(nside=1 << fine.order, order="nested", frame=ICRS())
    center = hp.healpix_to_skycoord(fine.index)
    shape = (128, 128)
    wcs = tangent_wcs(center.ra.deg, center.dec.deg, shape, 4.0)
    data = np.ones(shape, dtype=np.float32)
    data[0, 0] = np.nan
    plan = build_healpix_plan([fine.index], fine_order=9, minimum_order=9)
    contributions = measure_tile_source_contributions(
        [
            MosaicFrame("source-1", data, wcs, weight=1),
            MosaicFrame("source-2", data, wcs, weight=3),
        ],
        plan,
        expected_source_ids={"source-1", "source-2"},
        sample_size=64,
        interpolation_order="nearest-neighbor",
    )
    artifacts = render_healpix_tiles(
        data,
        wcs,
        plan,
        source_contributions=contributions,
        expected_source_ids={"source-1", "source-2"},
        size=64,
    )

    assert len(artifacts) == 1
    assert 0 < artifacts[0].coverage_fraction <= 1
    assert artifacts[0].source_upload_ids == ("source-1", "source-2")
    assert artifacts[0].source_weights == {
        "source-1": pytest.approx(0.25),
        "source-2": pytest.approx(0.75),
    }
    with Image.open(BytesIO(artifacts[0].content)) as image:
        assert image.format == "WEBP"
        assert image.mode == "RGBA"
        assert np.asarray(image.getchannel("A")).min() == 0

    far_wcs = tangent_wcs(200, -40, shape, 4.0)
    with pytest.raises(MosaicIntegrityError, match="no master projection"):
        render_healpix_tiles(
            data,
            far_wcs,
            plan,
            source_contributions=contributions,
            expected_source_ids={"source-1", "source-2"},
            size=64,
            interpolation_order="nearest-neighbor",
        )
