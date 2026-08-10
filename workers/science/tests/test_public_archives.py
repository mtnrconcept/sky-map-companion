from urllib.parse import parse_qs, urlparse

import pytest

from sky_worker.public_archive_ingest import parser
from sky_worker.public_archives import (
    _normalize_row,
    discovery_url,
    resolved_download_url,
)


def test_mast_sia2_query_is_bounded_and_spatial():
    url = discovery_url("mast", 10.6847, 41.2692, 0.1, 25, "HST")
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "mast.stsci.edu"
    assert query["MAXREC"] == ["25"]
    assert query["COLLECTION"] == ["HST"]
    assert query["POS"] == ["CIRCLE 10.6847000000 41.2692000000 0.1000000000"]


def test_irsa_sia2_query_uses_standard_circle():
    url = discovery_url("irsa", 10.6847, 41.2692, 0.2, 12)
    parsed = urlparse(url)
    query = parse_qs(parsed.query)

    assert parsed.netloc == "irsa.ipac.caltech.edu"
    assert query["MAXREC"] == ["12"]
    assert query["POS"] == ["CIRCLE 10.6847000000 41.2692000000 0.2000000000"]


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
