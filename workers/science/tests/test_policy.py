from sky_worker.policy import qualify


VALID = {
    "matched_stars": 80,
    "wcs_rms_px": 0.5,
    "usable_coverage": 0.9,
    "fwhm_arcsec": 2.1,
    "pixel_scale_arcsec": 1.5,
    "native_pixel_scale_arcsec": 1.5,
    "eccentricity": 0.35,
    "saturated_fraction": 0.002,
    "clipped_black_fraction": 0.001,
    "signal_to_noise": 30,
    "metadata_complete": True,
    "licence_accepted": True,
}


def test_accepts_explainable_frame():
    decision = qualify(VALID)
    assert decision["eligible"] is True
    assert decision["resolution_class"] == "high-definition"
    assert decision["score"] >= 70


def test_upscale_cannot_gain_a_class():
    decision = qualify({**VALID, "native_pixel_scale_arcsec": 6})
    assert decision["resolution_class"] == "wide-field"
    assert "artificial-upscale" in decision["blockers"]
