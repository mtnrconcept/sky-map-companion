from pathlib import Path

import pytest

from sky_worker.ivoa_hips import (
    IvoaHipsSource,
    inventory_sha256,
    parse_properties,
    validate_hips_output,
)


def _source(upload_id: str, checksum: str) -> IvoaHipsSource:
    return IvoaHipsSource(
        upload_id=upload_id,
        storage_path=f"archives/{upload_id}.fits",
        content_sha256=checksum,
        file_size_bytes=1234,
        object_id=None,
        attribution_text="Public archive",
        rights_uri="https://example.test/rights",
    )


def test_inventory_hash_is_order_independent_and_sensitive() -> None:
    first = _source("00000000-0000-0000-0000-000000000001", "a" * 64)
    second = _source("00000000-0000-0000-0000-000000000002", "b" * 64)

    assert inventory_sha256([first, second]) == inventory_sha256([second, first])
    assert inventory_sha256([first, second]) != inventory_sha256(
        [first, _source(second.upload_id, "c" * 64)]
    )


def test_parse_properties_ignores_comments_and_unknown_lines() -> None:
    parsed = parse_properties(
        """
        # comment
        hips_order = 9
        hips_frame=equatorial
        ignored line
        hips_tile_format = fits png
        """
    )
    assert parsed == {
        "hips_order": "9",
        "hips_frame": "equatorial",
        "hips_tile_format": "fits png",
    }


def test_validate_hips_output_accepts_required_contract(tmp_path: Path) -> None:
    (tmp_path / "properties").write_text(
        "hips_order = 9\nhips_frame = equatorial\nhips_tile_format = fits png\n",
        encoding="utf-8",
    )
    (tmp_path / "Moc.fits").write_bytes(b"moc")
    allsky = tmp_path / "Norder3" / "Allsky.png"
    allsky.parent.mkdir(parents=True)
    allsky.write_bytes(b"allsky")
    directory = tmp_path / "Norder9" / "Dir0"
    directory.mkdir(parents=True)
    (directory / "Npix1.fits").write_bytes(b"fits")
    (directory / "Npix1.png").write_bytes(b"png")

    validation = validate_hips_output(tmp_path, expected_order=9)

    assert validation.hips_order == 9
    assert validation.fits_tiles == 1
    assert validation.png_tiles == 1
    assert len(validation.properties_sha256) == 64
    assert len(validation.moc_sha256) == 64
    assert validation.allsky_sha256 is not None


def test_validate_hips_output_rejects_mismatched_tile_inventories(tmp_path: Path) -> None:
    (tmp_path / "properties").write_text(
        "hips_order = 9\nhips_frame = equatorial\nhips_tile_format = fits png\n",
        encoding="utf-8",
    )
    (tmp_path / "Moc.fits").write_bytes(b"moc")
    allsky = tmp_path / "Norder3" / "Allsky.png"
    allsky.parent.mkdir(parents=True)
    allsky.write_bytes(b"allsky")
    directory = tmp_path / "Norder9" / "Dir0"
    directory.mkdir(parents=True)
    (directory / "Npix1.fits").write_bytes(b"fits")
    (directory / "Npix2.fits").write_bytes(b"fits-2")
    (directory / "Npix1.png").write_bytes(b"png")

    with pytest.raises(RuntimeError, match="inventories differ"):
        validate_hips_output(tmp_path, expected_order=9)
