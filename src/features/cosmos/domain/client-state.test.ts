import { describe, expect, it } from "vitest";
import {
  distanceKm,
  formatCoordinate,
  observationProgress,
  parseCosmosFeed,
  parseManualPosition,
  readAnalysisReceipt,
  readSubmissionReceipt,
  readTriangulation,
  relativeTime,
  validateEvidenceFile,
} from "./client-state";

const observation = {
  id: "observation-1",
  latitude: 0,
  longitude: 0,
  phenomenon_type: "meteor",
  description: "Trait lumineux",
  duration_s: 0,
  magnitude: 0,
  status: "pending",
  event_id: null,
  observed_at: "2026-11-06T12:00:00Z",
};
const own = { ...observation, job: null };
const job = {
  id: "job-1",
  status: "uploaded",
  progress: 0,
  error_code: "COSMOS_ANALYSIS_RETRY",
  attempts: 1,
  updated_at: "2026-11-06T12:00:00Z",
  completed_at: null,
};

describe("Cosmos Live client contracts", () => {
  it("does not mistake a server error or malformed coordinate for an empty feed", () => {
    for (const payload of [
      null,
      {},
      { error: "unavailable" },
      { observations: [], events: null },
    ]) {
      expect(() => parseCosmosFeed(payload)).toThrow("incomplet");
    }
    for (const latitude of [null, "", false, 91, Number.NaN]) {
      expect(() =>
        parseCosmosFeed({ observations: [{ ...observation, latitude }], events: [] }),
      ).toThrow();
    }
    expect(parseCosmosFeed({ observations: [], events: [] }).observations).toEqual([]);
  });

  it("keeps real zero values while stripping identity and private evidence from the client feed model", () => {
    const result = parseCosmosFeed({
      observations: [
        { ...observation, user_id: "private-user", image_url: "private://evidence", azimuth: 120 },
      ],
      events: [],
      own_observations: [],
      own_observations_error: null,
    });
    expect(result.observations[0]).toMatchObject({
      latitude: 0,
      longitude: 0,
      duration_s: 0,
      magnitude: 0,
    });
    expect(result.observations[0]).not.toHaveProperty("user_id");
    expect(result.observations[0]).not.toHaveProperty("image_url");
    expect(result.observations[0]).not.toHaveProperty("azimuth");
  });

  it("reports private-feed problems without invalidating the public observations", () => {
    const result = parseCosmosFeed({
      observations: [observation],
      events: [],
      own_observations_error: "Session expirée.",
    });
    expect(result.observations).toHaveLength(1);
    expect(result.own_observations_error).toBe("Session expirée.");
  });

  it("accepts a durable submission with degraded analysis and surfaces its retry status", () => {
    const receipt = readSubmissionReceipt({
      success: true,
      observation: own,
      job,
      processing: { status: "degraded", message: "Analyse à relancer." },
    });
    expect(receipt.processing.status).toBe("degraded");
    expect(observationProgress(receipt.observation)).toContain("analyse à relancer");
    expect(
      readAnalysisReceipt({ observation: own, job, processing: { status: "degraded" } }).processing
        .status,
    ).toBe("degraded");
    expect(() => readSubmissionReceipt({ success: true, observation: {} })).toThrow();
  });

  it("distinguishes analysed solitary reports from reports waiting for analysis", () => {
    const receipt = readSubmissionReceipt({
      success: true,
      observation: own,
      job: { ...job, status: "published", progress: 100, error_code: null },
    });
    expect(observationProgress(receipt.observation)).toContain("en attente d’autres témoins");
    expect(observationProgress({ ...receipt.observation, event_id: "event-1" })).toContain(
      "Rapproché",
    );
  });

  it("keeps zero-position geometry and zero residual without inventing probability or uncertainty", () => {
    const result = readTriangulation({
      estimated_latitude: 0,
      estimated_longitude: 0,
      estimated_altitude_km: 0,
      residual_rms_km: 0,
      observer_count: 2,
      baseline_km: 10,
      time_span_seconds: 0,
      confidence: 0.95,
      scientific_significance: "exceptional",
    });
    expect(result).toMatchObject({
      estimated_latitude: 0,
      estimated_longitude: 0,
      estimated_altitude_km: 0,
      residual_rms_km: 0,
    });
    expect(result).not.toHaveProperty("confidence");
    expect(result).not.toHaveProperty("scientific_significance");
    expect(
      readTriangulation({
        estimated_latitude: "0",
        estimated_longitude: 0,
        estimated_altitude_km: 1,
      }),
    ).toBeNull();
    expect(
      readTriangulation({
        estimated_latitude: 0,
        estimated_longitude: 0,
        estimated_altitude_km: -100,
      }),
    ).toBeNull();
  });

  it("validates manual locations without treating blanks as the Gulf of Guinea", () => {
    expect(() => parseManualPosition("", "", "")).toThrow();
    expect(() => parseManualPosition("91", "0", "")).toThrow();
    expect(() => parseManualPosition("0", "181", "")).toThrow();
    expect(() => parseManualPosition("0", "0", "10001")).toThrow();
    expect(parseManualPosition("46,2", "6,14", "")).toMatchObject({
      latitude: 46.2,
      longitude: 6.14,
      altitude: null,
      source: "manual",
    });
    expect(parseManualPosition("0", "0", "0")).toMatchObject({
      latitude: 0,
      longitude: 0,
      altitude: 0,
    });
  });

  it("shows southern and western coordinates correctly and bounds distances", () => {
    expect(formatCoordinate(-33.9, "latitude")).toBe("33.9° S");
    expect(formatCoordinate(-70.7, "longitude")).toBe("70.7° O");
    expect(formatCoordinate(0, "latitude")).toBe("0.0°");
    expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toBeCloseTo(
      20015.114,
      2,
    );
    expect(relativeTime("2026-11-06T12:00:00Z", Date.parse("2026-11-06T11:59:59Z"))).toBe(
      "À l’instant",
    );
  });

  it("validates private evidence size and MIME, including a MOV with no browser MIME", () => {
    expect(validateEvidenceFile({ name: "capture.MOV", type: "", size: 1024 })).toEqual({
      mime: "video/quicktime",
      extension: "mov",
    });
    expect(
      validateEvidenceFile({ name: "picture.jpeg", type: "image/jpeg", size: 100 * 1024 * 1024 })
        .extension,
    ).toBe("jpg");
    expect(() => validateEvidenceFile({ name: "a.png", type: "image/png", size: 0 })).toThrow(
      "vide",
    );
    expect(() =>
      validateEvidenceFile({ name: "a.png", type: "image/png", size: 100 * 1024 * 1024 + 1 }),
    ).toThrow("100 Mio");
    expect(() =>
      validateEvidenceFile({ name: "script.png", type: "text/html", size: 100 }),
    ).toThrow("Choisissez");
    expect(() => validateEvidenceFile({ name: "a.heic", type: "image/heic", size: 100 })).toThrow();
  });
});
