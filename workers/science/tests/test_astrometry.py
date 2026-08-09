from pathlib import Path
import subprocess

from astropy.io import fits

from sky_worker.astrometry import solve_astrometry


def celestial_header() -> fits.Header:
    header = fits.Header()
    header["NAXIS"] = 2
    header["NAXIS1"] = 2400
    header["NAXIS2"] = 2400
    header["CTYPE1"] = "RA---TAN"
    header["CTYPE2"] = "DEC--TAN"
    header["CRVAL1"] = 10.6847
    header["CRVAL2"] = 41.2692
    header["CRPIX1"] = 1200.5
    header["CRPIX2"] = 1200.5
    header["CD1_1"] = -0.25 / 3600
    header["CD1_2"] = 0.0
    header["CD2_1"] = 0.0
    header["CD2_2"] = 0.25 / 3600
    return header


def test_trusted_archive_uses_existing_wcs_without_fabricated_matches(monkeypatch):
    def unexpected_run(*_args, **_kwargs):
        raise AssertionError("solve-field must not run for a verified archive WCS")

    monkeypatch.setattr(subprocess, "run", unexpected_run)
    solution = solve_astrometry(
        Path("archive.fits"),
        celestial_header(),
        2400,
        2400,
        trust_existing_wcs=True,
    )

    assert solution.verification_method == "trusted-public-archive-wcs"
    assert solution.matched_stars == 0
    assert solution.rms_px == 0
    assert solution.confidence == 1
    assert abs(solution.pixel_scale_arcsec - 0.25) < 1e-6


def test_solver_failure_preserves_diagnostic_output(monkeypatch):
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess(
            args=["solve-field"],
            returncode=255,
            stdout=b"",
            stderr=b"index configuration is unavailable",
        ),
    )

    try:
        solve_astrometry(Path("community.fits"), fits.Header(), 100, 100)
    except RuntimeError as error:
        assert "exited 255" in str(error)
        assert "index configuration is unavailable" in str(error)
    else:
        raise AssertionError("solver failure was not reported")
