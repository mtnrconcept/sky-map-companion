import { resolutionForPixelScale } from "./celestial-grid";
import type {
  ImageQualityMetrics,
  QualificationResult,
  QualityBlocker,
  QualityBreakdown,
} from "./types";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const finiteMetricKeys: Array<keyof ImageQualityMetrics> = [
  "matchedStars",
  "wcsRmsPx",
  "usableCoverage",
  "fwhmArcsec",
  "pixelScaleArcsec",
  "eccentricity",
  "saturatedFraction",
  "clippedBlackFraction",
  "signalToNoise",
];

function metricsAreValid(metrics: ImageQualityMetrics) {
  return (
    finiteMetricKeys.every((key) => Number.isFinite(metrics[key] as number)) &&
    metrics.matchedStars >= 0 &&
    metrics.wcsRmsPx >= 0 &&
    metrics.usableCoverage >= 0 &&
    metrics.usableCoverage <= 1 &&
    metrics.fwhmArcsec >= 0 &&
    metrics.pixelScaleArcsec > 0 &&
    metrics.eccentricity >= 0 &&
    metrics.eccentricity <= 1 &&
    metrics.saturatedFraction >= 0 &&
    metrics.saturatedFraction <= 1 &&
    metrics.clippedBlackFraction >= 0 &&
    metrics.clippedBlackFraction <= 1 &&
    metrics.signalToNoise >= 0 &&
    (metrics.nativePixelScaleArcsec === undefined ||
      (Number.isFinite(metrics.nativePixelScaleArcsec) && metrics.nativePixelScaleArcsec > 0))
  );
}

export function qualifyImage(metrics: ImageQualityMetrics): QualificationResult {
  const blockers: QualityBlocker[] = [];
  const effectiveScale = Math.max(
    metrics.pixelScaleArcsec,
    metrics.nativePixelScaleArcsec ?? metrics.pixelScaleArcsec,
  );
  const resolutionClass = resolutionForPixelScale(effectiveScale);

  if (!metricsAreValid(metrics)) blockers.push("invalid-metrics");
  if (metrics.matchedStars < 20) blockers.push("insufficient-reference-stars");
  if (metrics.wcsRmsPx >= 1.5) blockers.push("wcs-error-too-high");
  if (metrics.usableCoverage < 0.7) blockers.push("insufficient-coverage");
  if (metrics.fwhmArcsec >= 2.5 * metrics.pixelScaleArcsec) blockers.push("poor-fwhm");
  if (metrics.eccentricity >= 0.65) blockers.push("excessive-eccentricity");
  if (metrics.hasMajorTrackingError) blockers.push("major-tracking-error");
  if (metrics.hasDenseClouds) blockers.push("dense-clouds");
  if (metrics.saturatedFraction >= 0.02) blockers.push("excessive-saturation");
  if (metrics.clippedBlackFraction >= 0.01) blockers.push("black-clipping");
  if (metrics.signalToNoise < 5) blockers.push("insufficient-signal");
  if (
    metrics.nativePixelScaleArcsec !== undefined &&
    metrics.pixelScaleArcsec < metrics.nativePixelScaleArcsec * 0.75
  ) {
    blockers.push("artificial-upscale");
  }
  if (metrics.duplicateDetected) blockers.push("duplicate-upload");
  if (metrics.licenceAccepted === false) blockers.push("missing-licence");
  if (!resolutionClass) blockers.push("unsupported-resolution");

  const astrometry =
    clamp((metrics.matchedStars - 20) / 60, 0, 1) * 10 +
    clamp((1.5 - metrics.wcsRmsPx) / 1.5, 0, 1) * 15;
  const fwhmRatio = metrics.fwhmArcsec / metrics.pixelScaleArcsec;
  const sharpnessAndTracking =
    clamp((2.5 - fwhmRatio) / 2, 0, 1) * 14 +
    clamp((0.65 - metrics.eccentricity) / 0.45, 0, 1) * 11;
  const signalToNoise = clamp((metrics.signalToNoise - 5) / 20, 0, 1) * 20;
  const dynamicRange =
    clamp((0.02 - metrics.saturatedFraction) / 0.02, 0, 1) * 8 +
    clamp((0.01 - metrics.clippedBlackFraction) / 0.01, 0, 1) * 7;
  const usableCoverage = clamp((metrics.usableCoverage - 0.7) / 0.3, 0, 1) * 10;
  const metadataAndProvenance =
    (metrics.metadataComplete ? 3 : 0) + (metrics.licenceAccepted === false ? 0 : 2);

  const breakdown: QualityBreakdown = {
    astrometry: Math.round(astrometry * 100) / 100,
    sharpnessAndTracking: Math.round(sharpnessAndTracking * 100) / 100,
    signalToNoise: Math.round(signalToNoise * 100) / 100,
    dynamicRange: Math.round(dynamicRange * 100) / 100,
    usableCoverage: Math.round(usableCoverage * 100) / 100,
    metadataAndProvenance,
  };
  const score = Math.round(Object.values(breakdown).reduce((sum, value) => sum + value, 0));

  return {
    score,
    eligible: score >= 70 && blockers.length === 0,
    resolutionClass,
    blockers,
    breakdown,
  };
}
