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


def test_verified_public_archive_wcs_does_not_invent_catalogue_matches():
    decision = qualify(
        {
            **VALID,
            "matched_stars": 0,
            "wcs_rms_px": 0,
            "trusted_astrometry": True,
        }
    )

    assert decision["eligible"] is True
    assert "insufficient-reference-stars" not in decision["blockers"]
    assert decision["breakdown"]["astrometry"] == 25.0
    assert decision["astrometry_verification"] == "trusted-public-archive-wcs"


def test_calibrated_archive_accepts_a_well_sampled_three_pixel_psf():
    decision = qualify(
        {
            **VALID,
            "pixel_scale_arcsec": 0.25,
            "native_pixel_scale_arcsec": 0.25,
            "fwhm_arcsec": 0.8,
            "matched_stars": 0,
            "wcs_rms_px": 0,
            "trusted_astrometry": True,
            "calibrated_science_product": True,
        }
    )

    assert decision["eligible"] is True
    assert "poor-fwhm" not in decision["blockers"]
