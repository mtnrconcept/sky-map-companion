from __future__ import annotations

from dataclasses import dataclass
import hashlib
from io import BytesIO

from astropy.coordinates import ICRS
from astropy_healpix import HEALPix
from astropy.wcs import WCS
import astropy.units as u
import numpy as np
from PIL import Image
from reproject import reproject_interp

from .render import asinh_stretch


@dataclass(frozen=True)
class TileArtifact:
    order: int
    index: int
    path: str
    content: bytes
    sha256: str
    media_type: str = "image/webp"


def tile_path(layer: str, generation: int, order: int, index: int) -> str:
    directory = (index // 10_000) * 10_000
    return f"hips/{layer}/{generation}/Norder{order}/Dir{directory}/Npix{index}.webp"


def cell_wcs(order: int, index: int, size: int = 512) -> WCS:
    hp = HEALPix(nside=1 << order, order="nested", frame=ICRS())
    center = hp.healpix_to_skycoord(index)
    area_deg2 = hp.pixel_area.to_value(u.deg**2)
    angular_size_deg = float(np.sqrt(area_deg2))
    target = WCS(naxis=2)
    target.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    target.wcs.crval = [center.ra.deg, center.dec.deg]
    target.wcs.crpix = [(size + 1) / 2, (size + 1) / 2]
    target.wcs.cdelt = [-angular_size_deg / size, angular_size_deg / size]
    return target


def project_cell(
    data: np.ndarray,
    source_wcs: WCS,
    order: int,
    index: int,
    size: int = 512,
) -> tuple[np.ndarray, np.ndarray]:
    target = cell_wcs(order, index, size)
    projected, footprint = reproject_interp(
        (data, source_wcs.celestial), target, shape_out=(size, size), order="bicubic"
    )
    mask = np.asarray((footprint > 0.01) & np.isfinite(projected), dtype=bool)
    return np.where(mask, projected, np.nan).astype(np.float32), mask


def encode_cell_tile(data: np.ndarray) -> bytes:
    valid = np.isfinite(data)
    luminance = Image.fromarray(asinh_stretch(data), mode="L")
    alpha = Image.fromarray(np.where(valid, 255, 0).astype(np.uint8), mode="L")
    image = Image.merge("RGBA", (luminance, luminance, luminance, alpha))
    output = BytesIO()
    image.save(output, format="WEBP", quality=90, method=6)
    return output.getvalue()


def render_cell_tile(data: np.ndarray, source_wcs: WCS, order: int, index: int, size: int = 512) -> bytes:
    projected, _mask = project_cell(data, source_wcs, order, index, size)
    return encode_cell_tile(projected)


def build_tiles(
    data: np.ndarray,
    source_wcs: WCS,
    cells: list[dict],
    layer: str,
    generation: int,
) -> list[TileArtifact]:
    artifacts: list[TileArtifact] = []
    for cell in cells:
        if not cell.get("eligible"):
            continue
        content = render_cell_tile(data, source_wcs, int(cell["healpix_order"]), int(cell["healpix_index"]))
        path = tile_path(layer, generation, int(cell["healpix_order"]), int(cell["healpix_index"]))
        artifacts.append(
            TileArtifact(
                order=int(cell["healpix_order"]),
                index=int(cell["healpix_index"]),
                path=path,
                content=content,
                sha256=hashlib.sha256(content).hexdigest(),
            )
        )
    return artifacts
