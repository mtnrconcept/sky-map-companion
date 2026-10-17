from __future__ import annotations

from hashlib import sha256
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

from astropy.coordinates import ICRS, SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
from astropy_healpix import HEALPix
import astropy.units as u
import numpy as np
from PIL import Image
import pytest

from sky_worker.handlers import Handlers
from sky_worker.models import Job


def sample_wcs() -> WCS:
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [10.6847, 41.2692]
    wcs.wcs.crpix = [48.5, 48.5]
    wcs.wcs.cdelt = [-2 / 3600, 2 / 3600]
    return wcs


class TestGateway:
    """Exercise real FITS stacking against in-memory storage, never production."""

    def __init__(self, directory: Path, *, disjoint: bool = False):
        self.config = SimpleNamespace(
            astrometry_timeout_seconds=5,
            supabase_url="https://example.supabase.co",
        )
        self.stack_id = uuid4()
        self.generation_id = uuid4()
        self.layer_id = uuid4()
        self.derivatives: dict[str, bytes] = {}
        self.queries: list[str] = []
        self.frames: dict[object, Path] = {}
        self.rows: list[dict] = []
        hp = HEALPix(nside=4096, order="nested", frame=ICRS())
        center = SkyCoord(10.6847 * u.deg, 41.2692 * u.deg, frame="icrs")
        self.tile_index = int(hp.skycoord_to_healpix(center))

        for i in range(3):
            uid = uuid4()
            wcs = sample_wcs()
            if disjoint and i == 2:
                wcs.wcs.crval = [11.5, 42.0]
            data = np.full((96, 96), 100, dtype=np.float32)
            data += np.random.default_rng(10 + i).normal(0, 0.5, data.shape)
            data[45:52, 45:52] += 70
            source = directory / f"source-{i}.fits"
            fits.PrimaryHDU(data, header=wcs.to_header()).writeto(source, checksum=True)
            record_sha = "a" * 64
            self.frames[uid] = source
            self.rows.append({
                "id": uid,
                "user_id": uuid4(),
                "object_id": "M31",
                "frame_type": "light",
                "exposure_s": 60,
                "quality_score": 0.9,
                "instrument_group": "verified-scientific-sample",
                "solved_ra_deg": float(wcs.wcs.crval[0]),
                "solved_dec_deg": float(wcs.wcs.crval[1]),
                "solved_scale_arcsec_px": 2,
                "native_width_px": 96,
                "native_height_px": 96,
                "source_kind": "public_archive",
                "archive_item_id": uuid4(),
                "metadata": {"product_type": "stack-cutout", "archive": {
                    "source_id": "mast-ps1", "archive_record_id": record_sha,
                }},
                "provenance": {"source_id": "mast-ps1", "archive_record_id": record_sha},
                "original_filename": source.name,
            })

    def fetch_upload(self, upload_id):
        return next(row for row in self.rows if row["id"] == upload_id)

    def download_upload(self, upload_id, directory):
        source = self.frames[upload_id]
        target = directory / source.name
        target.write_bytes(source.read_bytes())
        return SimpleNamespace(local_path=target)

    def ensure_derivative(self, path, data, content_type):
        assert path not in self.derivatives
        self.derivatives[path] = bytes(data)
        return sha256(data).hexdigest()

    def execute(self, query, params=()):
        normalized = " ".join(query.lower().split())
        self.queries.append(normalized)
        if normalized.startswith("update public.astro_stacking_jobs") and "returning light_ids" in normalized:
            return [{"light_ids": [r["id"] for r in self.rows],
                     "dark_ids": [], "flat_ids": [], "bias_ids": []}]
        if normalized.startswith("select id,frame_type,exposure_s"):
            return self.rows
        if normalized.startswith("select ra_deg, dec_deg"):
            return [{"ra_deg": 10.6847, "dec_deg": 41.2692}]
        if normalized.startswith("with retired as"):
            return []
        if normalized.startswith("select distinct on (healpix_order"):
            return [{"healpix_order": 12, "healpix_index": self.tile_index,
                     "coverage_fraction": 1, "usable_fraction": 1, "eligible": True}]
        if normalized.startswith("insert into public.mosaic_layers"):
            return [{"id": self.layer_id}]
        if normalized.startswith("select id,generation from public.mosaic_generations"):
            return []
        if normalized.startswith("select coalesce(max(generation)"):
            return [{"value": 1}]
        if normalized.startswith("insert into public.mosaic_generations"):
            return [{"id": self.generation_id}]
        if normalized.startswith((
            "insert into public.mosaic_tiles",
            "update public.mosaic_generations",
            "select private.activate_mosaic_generation",
            "update public.astro_stacking_jobs set status='completed'",
        )):
            return []
        raise AssertionError(f"Unexpected database query: {normalized[:120]}")


def run_stack(tmp_path: Path, monkeypatch, *, disjoint: bool = False):
    gateway = TestGateway(tmp_path, disjoint=disjoint)
    job = Job(
        id=uuid4(), job_type="stack_object", status="approved",
        object_id="M31", attempts=1, version=1, pipeline_version="science-v1",
        payload={"stacking_job_id": str(gateway.stack_id)},
    )
    monkeypatch.setattr(
        "sky_worker.astrometry.subprocess.run",
        lambda *_a, **_kw: (_ for _ in ()).throw(
            AssertionError("verified archive WCS must not invoke solve-field")
        ),
    )
    workdir = tmp_path / "work"
    workdir.mkdir()
    return gateway, lambda: Handlers(gateway)._stack_object(job, workdir)


def test_three_real_fits_produce_master_preview_healpix_and_manifest(tmp_path, monkeypatch):
    gateway, execute = run_stack(tmp_path, monkeypatch)
    result = execute()
    assert result.next_status == "published"
    assert result.progress == 100
    assert result.result["lights"] == 3
    assert result.result["tiles"] == 1

    master = next(data for path, data in gateway.derivatives.items() if path.endswith(".fits"))
    with fits.open(BytesIO(master), checksum=True) as hdus:
        assert hdus[0].verify_checksum() == 1
        assert hdus[0].data.shape == (96, 96)
        assert np.isfinite(hdus[0].data).any()
        assert float(np.nanmax(hdus[0].data)) > 110

    preview = next(
        data for path, data in gateway.derivatives.items()
        if path.startswith("masters/") and path.endswith(".webp")
    )
    with Image.open(BytesIO(preview)) as image:
        assert image.format == "WEBP"
        assert image.width > 0 and image.height > 0

    tile = next(
        data for path, data in gateway.derivatives.items()
        if path.startswith("hips/") and path.endswith(".webp")
    )
    with Image.open(BytesIO(tile)) as image:
        assert image.format == "WEBP"
        assert image.mode in {"RGB", "RGBA"}
        if image.mode == "RGBA":
            assert image.getchannel("A").getextrema()[1] > 0

    assert any(path.endswith("/manifest.json") for path in gateway.derivatives)
    assert any("activate_mosaic_generation" in sql for sql in gateway.queries)
    assert any("set status='completed'" in sql for sql in gateway.queries)


def test_disjoint_sky_fields_fail_without_writing_master(tmp_path, monkeypatch):
    gateway, execute = run_stack(tmp_path, monkeypatch, disjoint=True)
    with pytest.raises(ValueError, match="overlapping|insufficient common sky overlap"):
        execute()
    assert gateway.derivatives == {}
