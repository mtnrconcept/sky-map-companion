from __future__ import annotations

from typing import Any


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def resolution_class(pixel_scale: float) -> str | None:
    if pixel_scale <= 0:
        return None
    if pixel_scale <= 1.5:
        return "high-definition"
    if pixel_scale <= 3:
        return "detailed"
    if pixel_scale <= 6:
        return "wide-field"
    if pixel_scale <= 12:
        return "discovery"
    return None


def qualify(metrics: dict[str, Any]) -> dict[str, Any]:
    scale = float(metrics["pixel_scale_arcsec"])
    native_scale = float(metrics.get("native_pixel_scale_arcsec", scale))
    effective_scale = max(scale, native_scale)
    blockers: list[str] = []
    if int(metrics["matched_stars"]) < 20:
        blockers.append("insufficient-reference-stars")
    if float(metrics["wcs_rms_px"]) >= 1.5:
        blockers.append("wcs-error-too-high")
    if float(metrics["usable_coverage"]) < 0.7:
        blockers.append("insufficient-coverage")
    if float(metrics["fwhm_arcsec"]) >= 2.5 * scale:
        blockers.append("poor-fwhm")
    if float(metrics["eccentricity"]) >= 0.65:
        blockers.append("excessive-eccentricity")
    if metrics.get("has_major_tracking_error"):
        blockers.append("major-tracking-error")
    if metrics.get("has_dense_clouds"):
        blockers.append("dense-clouds")
    if float(metrics["saturated_fraction"]) >= 0.02:
        blockers.append("excessive-saturation")
    if float(metrics["clipped_black_fraction"]) >= 0.01:
        blockers.append("black-clipping")
    if float(metrics["signal_to_noise"]) < 5:
        blockers.append("insufficient-signal")
    if scale < native_scale * 0.75:
        blockers.append("artificial-upscale")
    if metrics.get("duplicate_detected"):
        blockers.append("duplicate-upload")
    if not metrics.get("licence_accepted", False):
        blockers.append("missing-licence")
    classification = resolution_class(effective_scale)
    if classification is None:
        blockers.append("unsupported-resolution")

    astrometry = _clamp((float(metrics["matched_stars"]) - 20) / 60, 0, 1) * 10
    astrometry += _clamp((1.5 - float(metrics["wcs_rms_px"])) / 1.5, 0, 1) * 15
    ratio = float(metrics["fwhm_arcsec"]) / scale
    sharpness = _clamp((2.5 - ratio) / 2, 0, 1) * 14
    sharpness += _clamp((0.65 - float(metrics["eccentricity"])) / 0.45, 0, 1) * 11
    snr = _clamp((float(metrics["signal_to_noise"]) - 5) / 20, 0, 1) * 20
    dynamic = _clamp((0.02 - float(metrics["saturated_fraction"])) / 0.02, 0, 1) * 8
    dynamic += _clamp((0.01 - float(metrics["clipped_black_fraction"])) / 0.01, 0, 1) * 7
    coverage = _clamp((float(metrics["usable_coverage"]) - 0.7) / 0.3, 0, 1) * 10
    provenance = (3 if metrics.get("metadata_complete") else 0) + 2
    breakdown = {
        "astrometry": round(astrometry, 2),
        "sharpnessAndTracking": round(sharpness, 2),
        "signalToNoise": round(snr, 2),
        "dynamicRange": round(dynamic, 2),
        "usableCoverage": round(coverage, 2),
        "metadataAndProvenance": provenance,
    }
    score = round(sum(breakdown.values()))
    return {
        "score": score,
        "eligible": score >= 70 and not blockers,
        "resolution_class": classification,
        "blockers": blockers,
        "breakdown": breakdown,
    }
