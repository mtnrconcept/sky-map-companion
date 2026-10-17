from __future__ import annotations

import pytest
from sky_worker.stack_selection import choose_stack_lights


def frame(identifier, ra, dec, group="g", width=2400):
    return {
        "id": identifier,
        "frame_type": "light",
        "instrument_group": group,
        "solved_ra_deg": ra,
        "solved_dec_deg": dec,
        "solved_scale_arcsec_px": 0.25,
        "native_width_px": width,
        "native_height_px": 2400,
    }


def test_adjacent_fields_share_a_reference_footprint():
    data = [
        frame(1, 10.77894, 41.33998),
        frame(2, 10.77900, 41.48169),
        frame(3, 10.96743, 41.34000),
        frame(4, 10.77894, 40.91500),
        frame(5, 10.40, 41.05),
    ]
    assert [row["id"] for row in choose_stack_lights(data)] == [1, 2, 3]


def test_disjoint_fields_are_not_stackable():
    with pytest.raises(ValueError, match="overlapping"):
        choose_stack_lights([frame(1, 10, 41), frame(2, 15, 41), frame(3, 30, 41)])


def test_missing_astrometry_is_not_trusted():
    data = [frame(i, 10, 41) for i in range(3)]
    data[0]["solved_ra_deg"] = None
    with pytest.raises(ValueError, match="overlapping"):
        choose_stack_lights(data)


def test_instrument_groups_and_memory_cap():
    data = [frame(i, 10, 41) for i in range(30)]
    data[-1]["instrument_group"] = "other"
    result = choose_stack_lights(data)
    assert len(result) == 12
    assert all(row["instrument_group"] == "g" for row in result)


def test_ra_wrap_across_zero_degrees():
    result = choose_stack_lights(
        [frame(1, 359.98, 0), frame(2, 0.01, 0), frame(3, 359.99, 0)]
    )
    assert len(result) == 3

def test_pixel_budget_prevents_oversized_stacks():
    frames = [frame(i, 10, 41, width=20000) for i in range(3)]
    with pytest.raises(ValueError, match="overlapping"):
        choose_stack_lights(frames)
