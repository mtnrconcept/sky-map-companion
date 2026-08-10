import { describe, expect, test } from "vitest";
import {
  astroStackPollDelay,
  astroStackPublicStatusSchema,
  astroStackStatusIsActive,
  buildProgress,
  qualificationProgress,
  type AstroStackPublicStatus,
} from "./public-status";

const completeStatus: AstroStackPublicStatus = {
  schema_version: 1,
  object: {
    id: "M31",
    total_lights: 13,
    total_exposure_hours: 2.46,
    total_contributors: 0,
  },
  source: {
    kind: "public_archive",
    name: "MAST Pan-STARRS1 Public Archive",
    spectral_band: "r",
    acknowledgement: "Pan-STARRS1 public science archive.",
    terms_url: "https://archive.stsci.edu/",
  },
  qualification: {
    status: "complete",
    total: 23,
    published: 13,
    rejected: 10,
    active: 0,
    failed: 0,
  },
  build: {
    status: "complete",
    job_status: "published",
    progress: 100,
    generation: 2,
    planned_tiles: 42,
    expected_tiles: 42,
    published_tiles: 42,
    actual_tiles: 42,
    failed_tiles: 0,
    expected_sources: 13,
    contributing_sources: 13,
  },
  master: {
    generation: 2,
    preview_url:
      "https://example.supabase.co/storage/v1/object/public/astro-derived/masters/M31/hash.webp",
    download_url:
      "https://example.supabase.co/storage/v1/object/public/astro-derived/masters/M31/hash.fits",
    lights_stacked: 13,
    source_uploads_count: 13,
    total_exposure_hours: 2.46,
    final_snr: null,
    final_fwhm: 0.8,
    dynamic_range_stops: null,
    spatial_coverage_fraction: 0.84,
    native_pixel_scale_arcsec: 0.25,
    output_pixel_scale_arcsec: 0.25,
    width_px: 7200,
    height_px: 3600,
    partial: true,
    created_at: "2026-08-09T10:00:00.000Z",
  },
  tiles: [],
  fetched_at: "2026-08-09T10:01:00.000Z",
};

describe("AstroStack public status", () => {
  test("computes the observed 13 published and 10 rejected run as complete", () => {
    expect(qualificationProgress(completeStatus.qualification)).toBe(100);
    expect(buildProgress(completeStatus.build)).toBe(100);
    expect(astroStackStatusIsActive(completeStatus)).toBe(false);
  });

  test("reports partial tile generation without claiming completion", () => {
    const build = {
      ...completeStatus.build!,
      status: "building" as const,
      published_tiles: 3,
    };
    const status = { ...completeStatus, build };

    expect(buildProgress(build)).toBe(7);
    expect(astroStackStatusIsActive(status)).toBe(true);
    expect(astroStackPollDelay(status, 0)).toBe(5_000);
  });

  test("bounds retry backoff and slows terminal polling", () => {
    expect(astroStackPollDelay(completeStatus, 0)).toBe(30_000);
    expect(astroStackPollDelay(null, 9)).toBe(60_000);
  });

  test("accepts PostgreSQL timestamps with explicit UTC offsets", () => {
    const status = {
      ...completeStatus,
      master: {
        ...completeStatus.master!,
        created_at: "2026-08-09T23:14:34.242797+00:00",
      },
      fetched_at: "2026-08-10T01:27:35.000+00:00",
    };

    expect(astroStackPublicStatusSchema.safeParse(status).success).toBe(true);
  });

  test("strictly rejects internal source identifiers in the public contract", () => {
    const unsafe = {
      ...completeStatus,
      tiles: [
        {
          order: 9,
          index: 42,
          url: "https://example.supabase.co/storage/v1/object/public/astro-derived/hips/m31/2/tile.webp",
          source_upload_ids: ["private-upload-id"],
        },
      ],
    };

    expect(astroStackPublicStatusSchema.safeParse(unsafe).success).toBe(false);
  });

  test("rejects non-HTTP links in the public contract", () => {
    expect(
      astroStackPublicStatusSchema.safeParse({
        ...completeStatus,
        source: { ...completeStatus.source!, terms_url: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
  });

  test("does not invent progress for an empty run", () => {
    expect(
      qualificationProgress({
        status: "discovering",
        total: 0,
        published: 0,
        rejected: 0,
        active: 0,
        failed: 0,
      }),
    ).toBe(0);
  });
});
