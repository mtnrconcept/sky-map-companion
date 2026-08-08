from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from astropy.wcs import WCS
from reproject import reproject_interp


def master_frame(frames: Sequence[np.ndarray]) -> np.ndarray | None:
    if not frames:
        return None
    shapes = {frame.shape for frame in frames}
    if len(shapes) != 1:
        raise ValueError("calibration frames must share dimensions")
    return np.nanmedian(np.stack(frames).astype(np.float32), axis=0).astype(np.float32)


def calibrate_light(
    light: np.ndarray,
    master_bias: np.ndarray | None,
    master_dark: np.ndarray | None,
    master_flat: np.ndarray | None,
    dark_scale: float = 1.0,
) -> np.ndarray:
    result = np.asarray(light, dtype=np.float32).copy()
    if master_bias is not None:
        result -= master_bias
    if master_dark is not None:
        result -= master_dark * dark_scale
    if master_flat is not None:
        normalized = master_flat / np.nanmedian(master_flat)
        safe = np.isfinite(normalized) & (normalized > 0.05)
        result = np.divide(result, normalized, out=np.full_like(result, np.nan), where=safe)
    return result


def align_frame(data: np.ndarray, source_wcs: WCS, target_wcs: WCS, shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    aligned, footprint = reproject_interp(
        (data, source_wcs.celestial), target_wcs.celestial, shape_out=shape, order="bicubic"
    )
    return np.asarray(aligned, dtype=np.float32), np.asarray(footprint > 0.99, dtype=bool)


def weighted_sigma_stack(frames: Sequence[np.ndarray], masks: Sequence[np.ndarray], weights: Sequence[float]) -> np.ndarray:
    if not frames or len(frames) != len(masks) or len(frames) != len(weights):
        raise ValueError("frames, masks and weights must have the same non-zero length")
    cube = np.stack([np.where(mask, frame, np.nan) for frame, mask in zip(frames, masks, strict=True)])
    weight_cube = np.asarray(weights, dtype=np.float32)[:, None, None]
    finite = np.isfinite(cube)
    median = np.nanmedian(cube, axis=0)
    absolute_deviation = np.abs(cube - median)
    mad = np.nanmedian(absolute_deviation, axis=0)
    robust_sigma = 1.4826 * mad
    tolerance = np.finfo(np.float32).eps * np.maximum(1.0, np.abs(median))
    within_clip = np.where(
        robust_sigma > tolerance,
        absolute_deviation <= 3.0 * robust_sigma,
        absolute_deviation <= tolerance,
    )
    valid = finite & within_clip
    numerator = np.nansum(np.where(valid, cube * weight_cube, 0), axis=0)
    denominator = np.sum(np.where(valid, weight_cube, 0), axis=0)
    return np.divide(numerator, denominator, out=np.full(cube.shape[1:], np.nan), where=denominator > 0).astype(np.float32)
