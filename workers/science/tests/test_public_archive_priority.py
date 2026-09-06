from sky_worker.public_archive_ingest import _rank_candidates
from sky_worker.public_archives import PublicArchiveCandidate


def _candidate(
    record_id: str,
    *,
    resolution: float | None,
    calibration: int | None = 3,
    exposure: float | None = 100.0,
) -> PublicArchiveCandidate:
    return PublicArchiveCandidate(
        provider_id="mast",
        collection_id="HST",
        provider_record_id=record_id,
        access_url=f"https://mast.stsci.edu/{record_id}.fits",
        access_format="image/fits",
        data_rights="public",
        rights_uri="https://archive.stsci.edu/publishing/data-use",
        attribution_text="MAST / Space Telescope Science Institute",
        redistribution_allowed=True,
        dataproduct_type="image",
        calibration_level=calibration,
        ra_deg=10.0,
        dec_deg=20.0,
        spatial_resolution_arcsec=resolution,
        em_min_m=None,
        em_max_m=None,
        observed_mjd=None,
        exposure_s=exposure,
        facility="HST",
        instrument="ACS",
        target_name="target",
        source_filename=f"{record_id}.fits",
        metadata={},
    )


def test_rank_candidates_prefers_science_ready_products_before_resolution() -> None:
    uncalibrated = _candidate("raw", resolution=0.03, calibration=1, exposure=1000)
    calibrated = _candidate("calibrated", resolution=0.08, calibration=3, exposure=100)

    assert _rank_candidates([uncalibrated, calibrated]) == [calibrated, uncalibrated]


def test_rank_candidates_prefers_known_finer_resolution() -> None:
    coarse = _candidate("coarse", resolution=0.7)
    unknown = _candidate("unknown", resolution=None)
    fine = _candidate("fine", resolution=0.05)

    assert _rank_candidates([coarse, unknown, fine]) == [fine, coarse, unknown]


def test_rank_candidates_uses_exposure_as_a_deterministic_tiebreaker() -> None:
    short = _candidate("short", resolution=0.1, exposure=30)
    long = _candidate("long", resolution=0.1, exposure=300)

    assert _rank_candidates([short, long]) == [long, short]
