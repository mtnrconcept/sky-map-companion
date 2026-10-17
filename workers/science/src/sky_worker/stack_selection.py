from __future__ import annotations

import math
from typing import Any

MIN_STACK_LIGHTS = 3
MAX_STACK_LIGHTS = 12
MIN_REFERENCE_OVERLAP = 0.08
MAX_TOTAL_FRAME_PIXELS = 120_000_000


def _geometry(row: dict[str, Any]) -> tuple[float, float, float, float] | None:
    """Approximate an aligned rectangular footprint in angular sky units."""
    keys = ("solved_ra_deg", "solved_dec_deg", "solved_scale_arcsec_px", "native_width_px", "native_height_px")
    if any(row.get(key) is None for key in keys):
        return None
    try:
        ra = float(row["solved_ra_deg"])
        dec = float(row["solved_dec_deg"])
        scale = float(row["solved_scale_arcsec_px"])
        width = float(row["native_width_px"]) * scale / 3600
        height = float(row["native_height_px"]) * scale / 3600
    except (ValueError, TypeError, OverflowError):
        return None
    if not all(math.isfinite(v) for v in (ra, dec, scale, width, height)):
        return None
    if not (0 <= ra < 360 and -90 <= dec <= 90 and 0 < width <= 30 and 0 < height <= 30):
        return None
    return (ra, dec, width, height)


def _estimated_overlap(reference: dict[str, Any], other: dict[str, Any]) -> float:
    a, b = _geometry(reference), _geometry(other)
    if a is None or b is None:
        return 0.0
    ra1, dec1, w1, h1 = a
    ra2, dec2, w2, h2 = b
    dra = ((ra2 - ra1 + 180) % 360 - 180) * math.cos(math.radians((dec1 + dec2) / 2))
    ddec = dec2 - dec1
    overlap_w = max(0.0, min(w1, w2, (w1 + w2) / 2 - abs(dra)))
    overlap_h = max(0.0, min(h1, h2, (h1 + h2) / 2 - abs(ddec)))
    return overlap_w * overlap_h / (w1 * h1)


def choose_stack_lights(
    rows: list[dict[str, Any]],
    *,
    minimum: int = MIN_STACK_LIGHTS,
    maximum: int = MAX_STACK_LIGHTS,
) -> list[dict[str, Any]]:
    """Select a memory-bounded same-instrument stack with shared sky coverage.

    This cheap WCS-independent prefilter is followed by exact WCS mask checking
    in the stack handler. Inputs are already-approved scientific exposures.
    """
    if minimum < 3 or maximum < minimum:
        raise ValueError("invalid scientific stack limits")
    lights = [row for row in rows if row.get("frame_type") == "light"]
    if len(lights) < minimum:
        raise ValueError("at least three approved light frames are required")
    for reference in lights:
        group = reference.get("instrument_group")
        selected: list[dict[str, Any]] = []
        allocated_pixels = 0
        for row in [reference, *(r for r in lights if r is not reference)]:
            if row.get("instrument_group") != group:
                continue
            if _estimated_overlap(reference, row) < MIN_REFERENCE_OVERLAP:
                continue
            pixels = int(row["native_width_px"]) * int(row["native_height_px"])
            if pixels <= 0 or allocated_pixels + pixels > MAX_TOTAL_FRAME_PIXELS:
                continue
            selected.append(row)
            allocated_pixels += pixels
            if len(selected) == maximum:
                break
        if len(selected) >= minimum:
            return selected
    raise ValueError("at least three light frames with overlapping sky footprints are required")
