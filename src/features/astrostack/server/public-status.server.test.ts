import { describe, expect, test } from "vitest";
import {
  AstroStackStatusNotFoundError,
  AstroStackStatusUnavailableError,
  parseRpcArchiveMasterStatusV9,
  projectAstroStackPublicStatus,
  publicDerivativeUrl,
  type RpcArchiveMasterStatusV9,
} from "./public-status.server";

const rpc: RpcArchiveMasterStatusV9 = {
  object: {
    id: "M31",
    common_name: "Andromède",
    type: "galaxy",
    ra_deg: 10.6847,
    dec_deg: 41.2692,
    total_lights: 13,
    total_exposure_hours: 2.46,
    total_contributors: 0,
    master_image_url: null,
    master_updated_at: null,
  },
  run: {
    status: "complete",
    source_id: "mast-ps1",
    source_name: "MAST Pan-STARRS1 Public Archive",
    spectral_band: "r",
    discovered_files: 23,
    registered_files: 23,
    rejected_files: 10,
    downloaded_bytes: 1_000,
    started_at: "2026-08-09T08:00:00.000Z",
    completed_at: "2026-08-09T10:00:00.000Z",
  },
  qualification: { total: 23, accepted: 13, rejected: 10, active: 0, failed: 0 },
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
    created_at: "2026-08-09T09:00:00.000Z",
    activated_at: "2026-08-09T10:00:00.000Z",
  },
  master: {
    generation: 2,
    image_url: null,
    thumbnail_url: null,
    preview_storage_path: `masters/M31/${"b".repeat(64)}.webp`,
    fits_storage_path: `masters/M31/${"c".repeat(64)}.fits`,
    lights_stacked: 13,
    total_exposure_hours: 2.46,
    final_snr: null,
    final_fwhm: 0.82,
    dynamic_range_stops: null,
    source_uploads_count: 13,
    spatial_coverage_fraction: 0.84,
    is_partial: true,
    native_pixel_scale_arcsec: 0.25,
    output_pixel_scale_arcsec: 0.25,
    width_px: 7200,
    height_px: 3600,
    created_at: "2026-08-09T10:00:00.000Z",
  },
};

describe("AstroStack public projection", () => {
  test("exposes only public derivatives and aggregate science values", () => {
    const status = projectAstroStackPublicStatus({
      rpc,
      source: {
        name: "MAST Pan-STARRS1 Public Archive",
        acknowledgement: "PS1 acknowledgement",
        terms_url: "https://archive.stsci.edu/",
      },
      tiles: [
        {
          healpix_order: 9,
          healpix_index: 42,
          storage_path: "hips/m31-ps1-r/2/Norder9/Dir0/Npix42.webp",
          media_type: "image/webp",
        },
      ],
      supabaseUrl: "https://example.supabase.co",
      fetchedAt: "2026-08-09T10:01:00.000Z",
    });

    expect(status.master?.preview_url).toContain("/astro-derived/masters/M31/");
    expect(status.master?.download_url).toMatch(/\.fits$/);
    expect(status.tiles[0]).toEqual({
      order: 9,
      index: 42,
      url: expect.stringContaining("/astro-derived/hips/"),
    });
    expect(JSON.stringify(status)).not.toMatch(
      /sha256|byte_size|source_upload_ids|storage_path|remote_url|error_detail|payload|contribution_weights/,
    );
  });

  test("rejects a path outside the public derivative allowlist", () => {
    expect(() =>
      publicDerivativeUrl(
        "https://example.supabase.co",
        "../astro-raw/private.fits",
        "masters/",
        ".fits",
      ),
    ).toThrow(AstroStackStatusUnavailableError);
  });

  test("uses only a same-origin public preview for a legacy master", () => {
    const status = projectAstroStackPublicStatus({
      rpc: {
        ...rpc,
        run: null,
        qualification: null,
        build: null,
        master: {
          ...rpc.master!,
          image_url:
            "https://example.supabase.co/storage/v1/object/public/astro-derived/legacy/M31.fits",
          thumbnail_url:
            "https://example.supabase.co/storage/v1/object/public/astro-derived/legacy/M31.webp?ignored=1",
          preview_storage_path: null,
          fits_storage_path: null,
          source_uploads_count: 0,
        },
      },
      source: null,
      tiles: [],
      supabaseUrl: "https://example.supabase.co",
      fetchedAt: "2026-08-09T10:01:00.000Z",
    });

    expect(status.master?.preview_url).toBe(
      "https://example.supabase.co/storage/v1/object/public/astro-derived/legacy/M31.webp",
    );
    expect(status.master?.download_url).toBeNull();
    expect(status.master?.source_uploads_count).toBe(13);
  });

  test("does not leak an external legacy preview URL", () => {
    const status = projectAstroStackPublicStatus({
      rpc: {
        ...rpc,
        master: {
          ...rpc.master!,
          image_url: "https://raw.example/private-M31.fits",
          thumbnail_url: "https://raw.example/private-M31.webp",
          preview_storage_path: null,
          fits_storage_path: null,
        },
      },
      source: null,
      tiles: [],
      supabaseUrl: "https://example.supabase.co",
      fetchedAt: "2026-08-09T10:01:00.000Z",
    });

    expect(status.master?.preview_url).toBeNull();
    expect(JSON.stringify(status)).not.toContain("raw.example");
  });

  test("maps a null RPC object to a public 404 condition", () => {
    expect(() =>
      parseRpcArchiveMasterStatusV9({
        object: null,
        run: null,
        qualification: null,
        build: null,
        master: null,
      }),
    ).toThrow(AstroStackStatusNotFoundError);
  });

  test("rejects an RPC payload that adds internal fields", () => {
    expect(() =>
      parseRpcArchiveMasterStatusV9({
        ...rpc,
        build: { ...rpc.build, payload: { source_upload_ids: ["private-upload-id"] } },
      }),
    ).toThrow(AstroStackStatusUnavailableError);
  });
});
