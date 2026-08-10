from urllib.parse import parse_qs, urlparse

import pytest

from sky_worker.public_archive_ingest import parser
from sky_worker.public_archives import (
    _discover_mast_caom,
    _irsa_ibe_cutout_candidate,
    _normalize_row,
    discovery_url,
    resolved_download_url,
)


def test_mast_legacy_sia_url_remains_bounded_for_diagnostics():
    url = discovery_url("mast", 10.6847, 41.2692, 0.1, 25, "HST")
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "mast.stsci.edu"
    assert query["MAXREC"] == ["25"]
    assert query["COLLECTION"] == ["HST"]
    assert query["POS"] == ["CIRCLE 10.6847000000 41.2692000000 0.1000000000"]


def test_mast_caom_discovery_resolves_public_calibrated_science_products(monkeypatch):
    calls = []

    def fake_invoke(service, params, *, pagesize, timeout_seconds):
        calls.append((service, params, pagesize, timeout_seconds))
        if service == "Mast.Caom.Filtered.Position":
            return [
                {
                    "obsid": "12345",
                    "obs_collection": "HST",
                    "obs_id": "j12345",
                    "dataproduct_type": "image",
                    "calib_level": 3,
                    "dataRights": "PUBLIC",
                    "s_ra": 10.6847,
                    "s_dec": 41.2692,
                    "s_resolution": 0.05,
                    "t_min": 60000.0,
                    "t_exptime": 1200.0,
                    "facility_name": "HST",
                    "instrument_name": "ACS/WFC",
                    "target_name": "M31",
                }
            ]
        assert service == "Mast.Caom.Products"
        assert params == {"obsid": "12345"}
        return [
            {
                "obs_collection": "HST",
                "dataURI": "mast:HST/product/j12345_drc.fits",
                "productFilename": "j12345_drc.fits",
                "productType": "SCIENCE",
                "productSubGroupDescription": "DRC",
                "dataRights": "PUBLIC",
                "calib_level": 3,
            },
            {
                "obs_collection": "HST",
                "dataURI": "mast:HST/product/j12345_jif.fits",
                "productFilename": "j12345_jif.fits",
                "productType": "AUXILIARY",
                "productSubGroupDescription": "JIF",
                "dataRights": "PUBLIC",
                "calib_level": 3,
            },
            {
                "obs_collection": "HST",
                "dataURI": "mast:HST/product/private_drz.fits",
                "productFilename": "private_drz.fits",
                "productType": "SCIENCE",
                "productSubGroupDescription": "DRZ",
                "dataRights": "PROPRIETARY",
                "calib_level": 3,
            },
        ]

    monkeypatch.setattr("sky_worker.public_archives._mast_invoke", fake_invoke)

    candidates = _discover_mast_caom(10.6847, 41.2692, 0.1, 8, "HST", 30)

    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.provider_id == "mast"
    assert candidate.collection_id == "HST"
    assert candidate.provider_record_id == "mast:HST/product/j12345_drc.fits"
    assert candidate.source_filename == "j12345_drc.fits"
    assert candidate.calibration_level == 3
    assert candidate.redistribution_allowed is True
    assert candidate.instrument == "ACS/WFC"
    assert candidate.access_url.startswith("https://mast.stsci.edu/api/v0.1/Download/file?")
    assert parse_qs(urlparse(candidate.access_url).query)["uri"] == [
        "mast:HST/product/j12345_drc.fits"
    ]

    observation_call = calls[0]
    assert observation_call[0] == "Mast.Caom.Filtered.Position"
    assert observation_call[1]["columns"] == "*"
    assert observation_call[1]["position"] == "10.6847000000, 41.2692000000, 0.1000000000"
    filters = observation_call[1]["filters"]
    assert {item["paramName"]: item["values"] for item in filters} == {
        "obs_collection": ["HST"],
        "dataproduct_type": ["image"],
        "dataRights": ["PUBLIC"],
    }
    assert calls[1][0] == "Mast.Caom.Products"


def test_irsa_sia2_query_uses_standard_circle():
    url = discovery_url("irsa", 10.6847, 41.2692, 0.2, 12)
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.netloc == "irsa.ipac.caltech.edu"
    assert query["MAXREC"] == ["12"]
    assert query["POS"] == ["CIRCLE 10.6847000000 41.2692000000 0.2000000000"]


def test_irsa_ibe_product_is_rewritten_to_bounded_uncompressed_cutout():
    candidate = _normalize_row(
        "irsa",
        {
            "obs_collection": "wise_allwise",
            "obs_publisher_did": "ivo://irsa.ipac/wise_allwise?0098p408_ac51/0098p408_ac51_W4",
            "access_url": (
                "https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/00/0098/"
                "0098p408_ac51/0098p408_ac51-w4-int-3.fits"
            ),
            "access_format": "image/fits",
            "s_ra": 10.6847,
            "s_dec": 41.2692,
        },
    )
    assert candidate is not None

    cutout = _irsa_ibe_cutout_candidate(candidate, 10.6847, 41.2692, 0.15)
    parsed = urlparse(cutout.access_url)
    query = parse_qs(parsed.query)

    assert cutout.provider_record_id == candidate.provider_record_id
    assert cutout.source_filename == candidate.source_filename
    assert query == {
        "center": ["10.6847000000,41.2692000000deg"],
        "size": ["0.3000000000deg"],
        "gzip": ["false"],
    }
    assert cutout.metadata["sky_map_cutout"] == {
        "parent_access_url": candidate.access_url,
        "center_ra_deg": 10.6847,
        "center_dec_deg": 41.2692,
        "size_deg": 0.3,
        "service": "irsa-ibe",
    }


def test_irsa_non_ibe_url_is_not_rewritten():
    candidate = _normalize_row(
        "irsa",
        {
            "obs_collection": "other_irsa_collection",
            "obs_publisher_did": "ivo://irsa/product-2",
            "access_url": "https://irsa.ipac.caltech.edu/data/product.fits",
        },
    )
    assert candidate is not None

    assert _irsa_ibe_cutout_candidate(candidate, 10.6847, 41.2692, 0.15) == candidate


def test_eso_tap_query_restricts_to_public_images():
    url = discovery_url("eso", 10.6847, 41.2692, 0.1, 10)
    query = parse_qs(urlparse(url).query)
    adql = query["QUERY"][0]

    assert "FROM ivoa.ObsCore" in adql
    assert "dataproduct_type='image'" in adql
    assert "data_rights='public'" in adql
    assert "CIRCLE('ICRS',10.6847000000,41.2692000000,0.1000000000)" in adql


def test_noirlab_query_is_bounded_to_documented_sia_collection():
    url = discovery_url("noirlab", 10.6847, 41.2692, 0.1, 5, "calibrated_all")
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.path == "/sia/calibrated_all"
    assert query["POS"] == ["10.6847000000,41.2692000000"]
    assert query["SIZE"] == ["0.2000000000"]


def test_mast_public_hst_product_is_redistributable_but_dss_is_not():
    public_hst = _normalize_row(
        "mast",
        {
            "obs_collection": "HST",
            "obs_publisher_did": "ivo://mast/HST/product-1",
            "access_url": "https://mast.stsci.edu/api/v0.1/Download/file?uri=mast:HST/product.fits",
            "access_format": "application/fits",
            "data_rights": "PUBLIC",
            "dataproduct_type": "image",
            "calib_level": 3,
            "s_ra": 10.6847,
            "s_dec": 41.2692,
        },
    )
    dss = _normalize_row(
        "mast",
        {
            "obs_collection": "DSS2",
            "obs_publisher_did": "ivo://mast/DSS2/product-1",
            "access_url": "https://mast.stsci.edu/dss/product.fits",
            "data_rights": "PUBLIC",
        },
    )

    assert public_hst is not None and public_hst.redistribution_allowed is True
    assert dss is not None and dss.redistribution_allowed is False


def test_irsa_public_default_is_allowed_but_noirlab_requires_dataset_policy():
    irsa = _normalize_row(
        "irsa",
        {
            "obs_collection": "wise_allwise",
            "obs_publisher_did": "ivo://irsa/wise/product-1",
            "access_url": "https://irsa.ipac.caltech.edu/data/product.fits",
            "access_format": "application/fits",
        },
    )
    noirlab = _normalize_row(
        "noirlab",
        {
            "collection": "calibrated_all",
            "imageid": "image-1",
            "accessreference": "https://datalab.noirlab.edu/svc/cutout?file=image-1",
        },
    )

    assert irsa is not None and irsa.redistribution_allowed is True
    assert noirlab is not None and noirlab.redistribution_allowed is False
    with pytest.raises(PermissionError):
        resolved_download_url(noirlab)


def test_public_archive_ingest_cli_is_bounded_by_default():
    args = parser().parse_args(["ingest", "--provider", "mast", "--object-id", "M31"])

    assert args.provider == "mast"
    assert args.object_id == "M31"
    assert args.max_files == 2
    assert args.max_bytes == 512 * 1024**2
    assert args.watch is False
