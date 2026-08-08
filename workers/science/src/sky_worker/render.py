from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image


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
    image = Image.fromarray(asinh_stretch(data), mode="L")
    image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    output = BytesIO()
    image.save(output, format="WEBP", quality=quality, method=6)
    return output.getvalue()
