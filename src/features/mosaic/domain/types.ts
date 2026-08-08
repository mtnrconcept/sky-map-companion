export const SKY_ORDERS = [6, 7, 8, 9] as const;

export type SkyOrder = (typeof SKY_ORDERS)[number];

export type SkyResolutionClass = "discovery" | "wide-field" | "detailed" | "high-definition";

export interface CelestialCell {
  order: SkyOrder;
  index: number;
}

export interface EquatorialCoordinate {
  raDeg: number;
  decDeg: number;
}

export interface ImageQualityMetrics {
  matchedStars: number;
  wcsRmsPx: number;
  usableCoverage: number;
  fwhmArcsec: number;
  pixelScaleArcsec: number;
  nativePixelScaleArcsec?: number;
  eccentricity: number;
  saturatedFraction: number;
  clippedBlackFraction: number;
  signalToNoise: number;
  metadataComplete: boolean;
  hasMajorTrackingError?: boolean;
  hasDenseClouds?: boolean;
  duplicateDetected?: boolean;
  licenceAccepted?: boolean;
}

export type QualityBlocker =
  | "invalid-metrics"
  | "insufficient-reference-stars"
  | "wcs-error-too-high"
  | "insufficient-coverage"
  | "poor-fwhm"
  | "excessive-eccentricity"
  | "major-tracking-error"
  | "dense-clouds"
  | "excessive-saturation"
  | "black-clipping"
  | "insufficient-signal"
  | "artificial-upscale"
  | "duplicate-upload"
  | "missing-licence"
  | "unsupported-resolution";

export interface QualityBreakdown {
  astrometry: number;
  sharpnessAndTracking: number;
  signalToNoise: number;
  dynamicRange: number;
  usableCoverage: number;
  metadataAndProvenance: number;
}

export interface QualificationResult {
  score: number;
  eligible: boolean;
  resolutionClass: SkyResolutionClass | null;
  blockers: QualityBlocker[];
  breakdown: QualityBreakdown;
}

export const XP_PER_ORDER: Record<SkyOrder, number> = {
  6: 2,
  7: 5,
  8: 10,
  9: 20,
};
