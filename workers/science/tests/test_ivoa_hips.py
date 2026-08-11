from pathlib import Path

import pytest

import sky_worker.ivoa_hips as ivoa_hips
from sky_worker.ivoa_hips import (
    IvoaHipsSource,
    IvoaHipsValidation,
    _ensure_derivative_file_with_retry,
    _generation_storage_root,
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


def _validation(properties_sha256: str) -> IvoaHipsValidation:
    return IvoaHipsValidation(
        hips_order=9,
        fits_tiles=1,
        png_tiles=1,
        properties_sha256=properties_sha256,
        moc_sha256="b" * 64,
        allsky_sha256="c" * 64,
    )


def test_inventory_hash_is_order_independent_and_sensitive() -> None:
    first = _source("00000000-0000-0000-0000-000000000001", "a" * 64)
    second = _source("00000000-0000-0000-0000-000000000002", "b" * 64)

    assert inventory_sha256([first, second]) == inventory_sha256([second, first])
    assert inventory_sha256([first, second]) != inventory_sha256(
        [first, _source(second.upload_id, "c" * 64)]
    )


def test_generation_storage_root_tracks_exact_generated_artifacts() -> None:
    inventory_hash = "a" * 64
    first = _generation_storage_root(inventory_hash, _validation("d" * 64))
    repeated = _generation_storage_root(inventory_hash, _validation("d" * 64))
    changed = _generation_storage_root(inventory_hash, _validation("e" * 64))

    assert first == repeated
    assert first != changed
    assert first.startswith("hips-ivoa/public-optical-r/")
    assert first.endswith("-o9")


def test_derivative_file_publication_retries_transient_failures(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifact = tmp_path / "tile.png"
    artifact.write_bytes(b"png")

    class FakeGateway:
        def __init__(self) -> None:
            self.calls = 0

        def ensure_derivative_file(
            self,
            storage_path: str,
            local_path: Path,
            content_type: str,
        ) -> str:
            assert storage_path == "hips/test/tile.png"
            assert local_path == artifact
            assert content_type == "image/png"
            self.calls += 1
            if self.calls < 3:
                raise RuntimeError("temporary storage failure")
            return "f" * 64

    gateway = FakeGateway()
    monkeypatch.setattr(ivoa_hips, "PUBLISH_RETRY_BASE_DELAY_SECONDS", 0)

    checksum = _ensure_derivative_file_with_retry(
        gateway,  # type: ignore[arg-type]
        "hips/test/tile.png",
        artifact,
        "image/png",
    )

    assert checksum == "f" * 64
    assert gateway.calls == 3


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
