from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image


def _sample_for_preview(data: np.ndarray, max_size: int) -> np.ndarray:
    """Bound percentile/stretch memory before converting a large master mosaic."""
    if data.ndim != 2:
        raise ValueError("preview data must be a two-dimensional image")
    step = max(1, int(np.ceil(max(data.shape) / max_size)))
    return data[::step, ::step]


def asinh_stretch(data: np.ndarray) -> np.ndarray:
    finite = data[np.isfinite(data)]
    if finite.size == 0:
        raise ValueError("cannot render an empty image")
    low, high = np.percentile(finite, (0.5, 99.7))
    if high <= low:
        high = low + 1
    normalized = np.clip((data - low) / (high - low), 0, 1)
    stretched = np.arcsinh(normalized * 10) / np.arcsinh(10)
    return np.nan_to_num(stretched * 255).astype(np.uint8)


def webp_preview(data: np.ndarray, max_size: int = 1600, quality: int = 88) -> bytes:
    sampled = _sample_for_preview(data, max_size)
    image = Image.fromarray(asinh_stretch(sampled), mode="L")
    image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    output = BytesIO()
    image.save(output, format="WEBP", quality=quality, method=6)
    return output.getvalue()
