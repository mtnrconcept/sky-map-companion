import numpy as np
from io import BytesIO
from PIL import Image

from sky_worker.hips import cell_wcs, encode_cell_tile, project_cell, tile_path


def test_tile_paths_are_immutable_and_deterministic():
    assert tile_path("m31-broadband", 3, 8, 12345) == "hips/m31-broadband/3/Norder8/Dir10000/Npix12345.webp"


def test_cell_projection_and_encoding_are_finite():
    source_wcs = cell_wcs(7, 12345, size=64)
    data = np.arange(64 * 64, dtype=np.float32).reshape(64, 64)
    projected, mask = project_cell(data, source_wcs, 7, 12345, size=64)
    assert mask.mean() > 0.95
    assert np.isfinite(projected[mask]).all()
    content = encode_cell_tile(projected)
    assert content.startswith(b"RIFF")
    assert b"WEBP" in content[:16]


def test_cell_encoding_keeps_transparent_uncovered_pixels():
    data = np.ones((16, 16), dtype=np.float32)
    data[:4, :4] = np.nan

    with Image.open(BytesIO(encode_cell_tile(data))) as image:
        alpha = np.asarray(image.convert("RGBA"))[:, :, 3]

    assert alpha[0, 0] == 0
    assert alpha[-1, -1] == 255
