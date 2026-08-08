import { describe, expect, test } from "vitest";
import { qualifyImage } from "./quality-score";

const valid = {
  matchedStars: 80,
  wcsRmsPx: 0.5,
  usableCoverage: 0.9,
  fwhmArcsec: 2.1,
  pixelScaleArcsec: 1.5,
  eccentricity: 0.35,
  saturatedFraction: 0.002,
  clippedBlackFraction: 0.001,
  signalToNoise: 30,
  metadataComplete: true,
  licenceAccepted: true,
};

describe("qualifyImage", () => {
  test("accepts an explainable high-quality frame", () => {
    expect(qualifyImage(valid)).toMatchObject({
      eligible: true,
      resolutionClass: "high-definition",
    });
  });

  test("blocks insufficient WCS matches regardless of total score", () => {
    expect(qualifyImage({ ...valid, matchedStars: 12 }).blockers).toContain(
      "insufficient-reference-stars",
    );
  });

  test("does not reward artificial upscaling", () => {
    expect(
      qualifyImage({ ...valid, nativePixelScaleArcsec: 6, pixelScaleArcsec: 1.5 }),
    ).toMatchObject({ resolutionClass: "wide-field", eligible: false });
  });

  test("treats elimination thresholds as inclusive", () => {
    expect(qualifyImage({ ...valid, wcsRmsPx: 1.5 }).blockers).toContain("wcs-error-too-high");
    expect(qualifyImage({ ...valid, saturatedFraction: 0.02 }).blockers).toContain(
      "excessive-saturation",
    );
    expect(qualifyImage({ ...valid, clippedBlackFraction: 0.01 }).blockers).toContain(
      "black-clipping",
    );
  });
});
