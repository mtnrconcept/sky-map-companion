from astropy.io import fits
import numpy as np

from sky_worker.extraction import extract_frame


def test_extracts_synthetic_fits_without_trusting_client_metadata(tmp_path):
    path = tmp_path / "light.fits"
    fits.PrimaryHDU(np.arange(100, dtype=np.float32).reshape(10, 10)).writeto(path)
    frame = extract_frame(path)
    assert frame.native_width == 10
    assert frame.native_height == 10
    assert len(frame.content_sha256) == 64
