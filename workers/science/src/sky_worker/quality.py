from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np
import sep


@dataclass(frozen=True)
class QualityMetrics:
    fwhm_arcsec: float
    eccentricity: float
    signal_to_noise: float
    saturated_fraction: float
    clipped_black_fraction: float
    usable_coverage: float
    star_count: int
    has_major_tracking_error: bool
    has_dense_clouds: bool


def measure_quality(data: np.ndarray, pixel_scale_arcsec: float) -> tuple[QualityMetrics, np.ndarray]:
    image = np.ascontiguousarray(data, dtype=np.float32)
    finite = np.isfinite(image)
    if finite.mean() < 0.7:
        raise ValueError("too few finite image pixels")
    fill = float(np.nanmedian(image))
    image = np.where(finite, image, fill).astype(np.float32)
    background = sep.Background(image)
    residual = image - background.back()
    noise = max(float(background.globalrms), np.finfo(np.float32).eps)
    objects = sep.extract(residual, 5.0, err=noise, minarea=5)
    usable = finite.copy()
    if not len(objects):
        raise ValueError("no stellar sources detected")
    a = np.asarray(objects["a"], dtype=float)
    b = np.asarray(objects["b"], dtype=float)
    flux = np.asarray(objects["flux"], dtype=float)
    valid = (a > 0) & (b > 0) & np.isfinite(flux) & (flux > 0)
    a, b, flux = a[valid], b[valid], flux[valid]
    if len(a) < 5:
        raise ValueError("insufficient measurable stellar sources")
    fwhm_px = 2.354820045 * np.sqrt(a * b)
    eccentricity = np.sqrt(np.clip(1 - (b * b) / (a * a), 0, 1))
    upper = float(np.nanmax(image))
    lower = float(np.nanmin(image))
    dynamic_range = max(upper - lower, 1.0)
    endpoint_tolerance = max(
        np.finfo(np.float32).eps * max(abs(lower), abs(upper), 1.0),
        dynamic_range * 1e-7,
    )
    # Clipping produces a plateau at an exact sensor/codec endpoint. Percentile
    # thresholds would classify a fixed fraction of every healthy frame as bad.
    saturated = image >= upper - endpoint_tolerance
    clipped = image <= lower + endpoint_tolerance
    usable &= ~saturated & ~clipped
    snr = float(np.median(flux / (noise * np.sqrt(np.maximum(1, math.pi * a * b)))))
    median_eccentricity = float(np.median(eccentricity))
    return QualityMetrics(
        fwhm_arcsec=float(np.median(fwhm_px) * pixel_scale_arcsec),
        eccentricity=median_eccentricity,
        signal_to_noise=max(0.0, snr),
        saturated_fraction=float(saturated.mean()),
        clipped_black_fraction=float(clipped.mean()),
        usable_coverage=float(usable.mean()),
        star_count=int(len(a)),
        has_major_tracking_error=median_eccentricity >= 0.8,
        has_dense_clouds=len(a) < 20 or float(background.globalrms) > max(abs(fill) * 0.5, 1),
    ), usable
