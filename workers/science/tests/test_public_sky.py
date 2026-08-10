from __future__ import annotations

from io import BytesIO

from PIL import Image
import pytest

from sky_worker.public_sky import (
    GLOBAL_ALLSKY_BACKGROUND,
    GLOBAL_ALLSKY_ORDER,
    GLOBAL_ALLSKY_TILE_SIZE,
    allsky_grid_shape,
    build_allsky_webp,
    composite_transparent_webp,
    global_low_order_layer_slug,
    healpix_directory,
    iter_seed_targets,
    next_unattempted_seed,
    parent_layer_slug,
    seed_layer_slug,
    tile_storage_path,
)


def _solid_webp(color: tuple[int, int, int, int], size: int = 32) -> bytes:
    output = BytesIO()
    Image.new("RGBA", (size, size), color).save(output, format="WEBP", lossless=True)
    return output.getvalue()


def test_healpix_paths_are_stable_and_grouped() -> None:
    assert healpix_directory(0) == 0
    assert healpix_directory(9_999) == 0
    assert healpix_directory(10_000) == 10_000
    assert (
        tile_storage_path("sky-ps1-r-o4-42", 3, 9, 211_675)
        == "hips/sky-ps1-r-o4-42/3/Norder9/Dir210000/Npix211675.webp"
    )
    assert seed_layer_slug("r", 4, 42) == "sky-ps1-r-o4-42"
    assert parent_layer_slug("IC 1805", "r") == "sky-ps1-r-parent-ic1805"
    assert global_low_order_layer_slug("r") == "sky-ps1-r-global-loworder"


@pytest.mark.parametrize("order", [-1, 13])
def test_seed_order_is_bounded(order: int) -> None:
    with pytest.raises(ValueError):
        iter_seed_targets(order)


def test_seed_targets_are_deterministic_unique_and_inside_ps1_declinations() -> None:
    first = iter_seed_targets(2, min_dec_deg=-29, max_dec_deg=85)
    second = iter_seed_targets(2, min_dec_deg=-29, max_dec_deg=85)
    assert first == second
    assert first
    assert len({target.index for target in first}) == len(first)
    assert all(-29 <= target.dec_deg <= 85 for target in first)
    assert all(0 <= target.ra_deg < 360 for target in first)

    selected = next_unattempted_seed(2, {first[0].index}, min_dec_deg=-29, max_dec_deg=85)
    assert selected == first[1]


def test_transparent_cell_composite_preserves_non_overlapping_coverage() -> None:
    first = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    for x in range(0, 24):
        for y in range(0, 64):
            first.putpixel((x, y), (220, 40, 40, 255))
    first_output = BytesIO()
    first.save(first_output, format="WEBP", lossless=True)

    second = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    for x in range(40, 64):
        for y in range(0, 64):
            second.putpixel((x, y), (30, 180, 220, 255))
    second_output = BytesIO()
    second.save(second_output, format="WEBP", lossless=True)

    content = composite_transparent_webp(
        [first_output.getvalue(), second_output.getvalue()],
        size=64,
    )
    with Image.open(BytesIO(content)) as image:
        rgba = image.convert("RGBA")
        left = rgba.getpixel((10, 32))
        middle = rgba.getpixel((32, 32))
        right = rgba.getpixel((54, 32))

    assert left[0] > left[2]
    assert middle[3] < 20
    assert right[2] > right[0]


def test_order3_allsky_keeps_covered_photo_over_red_background() -> None:
    columns, rows = allsky_grid_shape(GLOBAL_ALLSKY_ORDER)
    assert (columns, rows) == (27, 29)

    photo = _solid_webp((20, 180, 220, 255))
    content = build_allsky_webp({0: photo})
    with Image.open(BytesIO(content)) as image:
        rgba = image.convert("RGBA")
        assert rgba.size == (
            27 * GLOBAL_ALLSKY_TILE_SIZE,
            29 * GLOBAL_ALLSKY_TILE_SIZE,
        )
        covered = rgba.getpixel((GLOBAL_ALLSKY_TILE_SIZE // 2, GLOBAL_ALLSKY_TILE_SIZE // 2))
        uncovered = rgba.getpixel((GLOBAL_ALLSKY_TILE_SIZE * 5, GLOBAL_ALLSKY_TILE_SIZE * 5))

    assert covered[2] > covered[0]
    assert abs(uncovered[0] - GLOBAL_ALLSKY_BACKGROUND[0]) <= 5
    assert abs(uncovered[1] - GLOBAL_ALLSKY_BACKGROUND[1]) <= 5
    assert abs(uncovered[2] - GLOBAL_ALLSKY_BACKGROUND[2]) <= 5
