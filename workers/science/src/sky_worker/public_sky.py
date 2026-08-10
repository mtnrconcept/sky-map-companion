from __future__ import annotations

from dataclasses import dataclass
import hashlib
from io import BytesIO
import math
from typing import Iterable, Mapping

from astropy_healpix import HEALPix
import astropy.units as u
from PIL import Image


GLOBAL_ALLSKY_STORAGE_PATH = "hips/global/Norder3/Allsky.webp"
GLOBAL_ALLSKY_ORDER = 3
GLOBAL_ALLSKY_TILE_SIZE = 64
GLOBAL_ALLSKY_BACKGROUND = (104, 18, 28, 255)


@dataclass(frozen=True)
class SkySeedTarget:
    order: int
    index: int
    ra_deg: float
    dec_deg: float


def healpix_directory(index: int) -> int:
    if index < 0:
        raise ValueError("HEALPix index cannot be negative")
    return (index // 10_000) * 10_000


def tile_storage_path(layer_slug: str, generation: int, order: int, index: int) -> str:
    if not layer_slug or "/" in layer_slug or ".." in layer_slug:
        raise ValueError("invalid mosaic layer slug")
    if generation < 1 or order < 0 or index < 0:
        raise ValueError("invalid tile coordinates")
    return (
        f"hips/{layer_slug}/{generation}/Norder{order}/"
        f"Dir{healpix_directory(index)}/Npix{index}.webp"
    )


def seed_layer_slug(spectral_band: str, seed_order: int, seed_index: int) -> str:
    if spectral_band not in "grizy":
        raise ValueError("PS1 filter must be one of grizy")
    if seed_order < 0 or seed_index < 0:
        raise ValueError("invalid sky seed cell")
    return f"sky-ps1-{spectral_band}-o{seed_order}-{seed_index}"


def parent_layer_slug(object_id: str, spectral_band: str) -> str:
    normalized = "".join(character.lower() for character in object_id if character.isalnum())
    if not normalized:
        raise ValueError("object identifier cannot be empty")
    if spectral_band not in "grizy":
        raise ValueError("PS1 filter must be one of grizy")
    return f"sky-ps1-{spectral_band}-parent-{normalized}"


def iter_seed_targets(
    order: int,
    *,
    min_dec_deg: float = -29.0,
    max_dec_deg: float = 85.0,
) -> tuple[SkySeedTarget, ...]:
    """Return a deterministic, spatially dispersed PS1 seed order.

    Pan-STARRS1 does not cover the full southern sky, so this iterator only
    emits centers inside the configured declination range. Hash ordering keeps
    the first scheduled passes spread over the accessible sky rather than
    exhausting neighboring NESTED cells first.
    """

    if not 0 <= order <= 12:
        raise ValueError("seed HEALPix order must be between 0 and 12")
    if not -90 <= min_dec_deg < max_dec_deg <= 90:
        raise ValueError("invalid seed declination range")

    hp = HEALPix(nside=1 << order, order="nested", frame="icrs")
    targets: list[tuple[bytes, SkySeedTarget]] = []
    for index in range(hp.npix):
        center = hp.healpix_to_skycoord(index)
        dec_deg = float(center.dec.to_value(u.deg))
        if not min_dec_deg <= dec_deg <= max_dec_deg:
            continue
        ra_deg = float(center.ra.to_value(u.deg)) % 360
        target = SkySeedTarget(order=order, index=index, ra_deg=ra_deg, dec_deg=dec_deg)
        spread_key = hashlib.sha256(f"sky-seed-v1:{order}:{index}".encode()).digest()
        targets.append((spread_key, target))
    targets.sort(key=lambda item: item[0])
    return tuple(target for _key, target in targets)


def next_unattempted_seed(
    order: int,
    attempted_indices: Iterable[int],
    *,
    min_dec_deg: float = -29.0,
    max_dec_deg: float = 85.0,
) -> SkySeedTarget:
    attempted = {int(index) for index in attempted_indices}
    for target in iter_seed_targets(
        order,
        min_dec_deg=min_dec_deg,
        max_dec_deg=max_dec_deg,
    ):
        if target.index not in attempted:
            return target
    raise RuntimeError("all configured public-sky seed cells have already been attempted")


def allsky_grid_shape(order: int = GLOBAL_ALLSKY_ORDER) -> tuple[int, int]:
    if not 0 <= order <= 3:
        raise ValueError("Allsky is only defined here for low HiPS orders 0 to 3")
    tile_count = 12 * 4**order
    columns = max(1, int(math.sqrt(tile_count)))
    rows = math.ceil(tile_count / columns)
    return columns, rows


def build_allsky_webp(
    tiles: Mapping[int, bytes],
    *,
    order: int = GLOBAL_ALLSKY_ORDER,
    tile_size: int = GLOBAL_ALLSKY_TILE_SIZE,
    background: tuple[int, int, int, int] = GLOBAL_ALLSKY_BACKGROUND,
) -> bytes:
    """Package low-order HiPS tiles left-to-right into one Allsky preview.

    Missing cells are deliberately filled with the Sky Map uncovered red. A
    covered tile keeps its alpha channel so only scientifically populated
    pixels replace that red background.
    """

    if tile_size < 16 or tile_size & (tile_size - 1):
        raise ValueError("Allsky tile size must be a power of two of at least 16 pixels")
    tile_count = 12 * 4**order
    if any(index < 0 or index >= tile_count for index in tiles):
        raise ValueError("Allsky input contains a HEALPix index outside its order")

    columns, rows = allsky_grid_shape(order)
    canvas = Image.new("RGBA", (columns * tile_size, rows * tile_size), background)
    for index, content in tiles.items():
        with Image.open(BytesIO(content)) as image:
            source = image.convert("RGBA").resize(
                (tile_size, tile_size),
                resample=Image.Resampling.LANCZOS,
            )
        cell = Image.new("RGBA", (tile_size, tile_size), background)
        cell.alpha_composite(source)
        x = (index % columns) * tile_size
        y = (index // columns) * tile_size
        canvas.paste(cell, (x, y))

    output = BytesIO()
    canvas.save(output, format="WEBP", quality=90, method=6)
    return output.getvalue()
