import { describe, expect, it } from "vitest";
import {
  cosmosReportSchema,
  normalizeReport,
  validEvidencePath,
  validObservationTime,
} from "./report";

const report = {
  latitude: 46.2,
  longitude: 6.1,
  phenomenon_type: "meteor",
  description: "  Un trait lumineux  ",
};

describe("Cosmos report trust boundary", () => {
  it("accepts zero coordinates and preserves unknown measurements as null", () => {
    const value = normalizeReport(
      cosmosReportSchema.parse({ ...report, latitude: 0, longitude: 0 }),
    );
    expect(value).toMatchObject({
      latitude: 0,
      longitude: 0,
      altitude_m: null,
      azimuth: null,
      elevation: null,
      description: "Un trait lumineux",
    });
  });
  it.each([null, "", false, "46.2", Number.NaN, Infinity, 91])(
    "rejects invalid latitude %s without coercion",
    (latitude) => {
      expect(cosmosReportSchema.safeParse({ ...report, latitude }).success).toBe(false);
    },
  );
  it("does not accept a client-provided identity or scientific status", () => {
    expect(
      cosmosReportSchema.safeParse({ ...report, user_id: "someone", status: "triangulated" })
        .success,
    ).toBe(false);
  });
  it("normalizes north without manufacturing missing bearings", () => {
    expect(
      normalizeReport(cosmosReportSchema.parse({ ...report, azimuth: 360, elevation: 0 })),
    ).toMatchObject({ azimuth: 0, elevation: 0 });
  });
  it("bounds time to the last day with five-minute clock tolerance", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(validObservationTime("2026-11-05T12:00:00Z", now)).toBe(true);
    expect(validObservationTime("2026-11-05T11:59:59Z", now)).toBe(false);
    expect(validObservationTime("2026-11-06T12:05:01Z", now)).toBe(false);
  });
  it("only accepts an owned, canonical evidence object", () => {
    const owner = "d2e724bf-3e29-4ff9-9d87-867e10e5374d";
    const prefix = `${owner}/94b42b6a-1ff4-4e35-8f14-6dbd947a8d5d/`;
    expect(validEvidencePath(`${prefix}evidence.jpg`, owner)).toBe(true);
    expect(validEvidencePath(`${prefix}evidence.mov`, owner)).toBe(true);
    expect(validEvidencePath(`${prefix}evidence.svg`, owner)).toBe(false);
    expect(validEvidencePath(`${prefix}../evidence.jpg`, owner)).toBe(false);
    expect(validEvidencePath(`${prefix}evidence.jpg`, "another-owner")).toBe(false);
  });
});
