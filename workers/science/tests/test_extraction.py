from astropy.io import fits
import numpy as np

from sky_worker.extraction import extract_frame
from sky_worker.quality import measure_quality


def test_extracts_synthetic_fits_without_trusting_client_metadata(tmp_path):
    path = tmp_path / "light.fits"
    fits.PrimaryHDU(np.arange(100, dtype=np.float32).reshape(10, 10)).writeto(path)
    frame = extract_frame(path)
    assert frame.native_width == 10
    assert frame.native_height == 10
    assert len(frame.content_sha256) == 64


def test_quality_masks_partial_nan_archive_cutout_instead_of_crashing():
    rng = np.random.default_rng(42)
    data = rng.normal(100, 2, (200, 200)).astype(np.float32)
    data[:80, :] = np.nan
    for y, x in ((100, 40), (110, 80), (120, 120), (130, 160), (150, 60), (170, 140)):
        data[y - 2 : y + 3, x - 2 : x + 3] += 80

    metrics, mask = measure_quality(data, 0.25, calibrated_science_product=True)

    assert 0.55 < metrics.usable_coverage < 0.61
    assert metrics.has_dense_clouds is False
    assert mask.shape == data.shape
