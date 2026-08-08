import numpy as np

from sky_worker.calibration import calibrate_light, weighted_sigma_stack


def test_bias_dark_and_flat_are_applied():
    light = np.full((4, 4), 110, dtype=np.float32)
    bias = np.full((4, 4), 10, dtype=np.float32)
    dark = np.full((4, 4), 5, dtype=np.float32)
    flat = np.full((4, 4), 2, dtype=np.float32)
    assert np.allclose(calibrate_light(light, bias, dark, flat), 95)


def test_sigma_stack_rejects_single_outlier():
    frames = [np.full((8, 8), 10, dtype=np.float32) for _ in range(5)]
    frames.append(np.full((8, 8), 10_000, dtype=np.float32))
    masks = [np.ones((8, 8), dtype=bool) for _ in frames]
    result = weighted_sigma_stack(frames, masks, [1] * len(frames))
    assert float(np.nanmedian(result)) < 20
