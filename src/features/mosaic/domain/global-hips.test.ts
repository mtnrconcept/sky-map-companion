import { describe, expect, it } from "vitest";
import {
  buildGlobalMosaicProperties,
  GLOBAL_MOSAIC_MAX_ORDER,
  healpixDirectory,
  parseGlobalMosaicTilePath,
} from "./global-hips";

describe("global Sky Map HiPS", () => {
  it("parses a valid nested HEALPix tile path", () => {
    expect(parseGlobalMosaicTilePath("Norder9/Dir210000/Npix211675.webp")).toEqual({
      order: 9,
      directory: 210000,
      index: 211675,
    });
  });

  it("rejects inconsistent directories and out-of-range cells", () => {
    expect(parseGlobalMosaicTilePath("Norder9/Dir200000/Npix211675.webp")).toBeNull();
    expect(
      parseGlobalMosaicTilePath(`Norder${GLOBAL_MOSAIC_MAX_ORDER + 1}/Dir0/Npix0.webp`),
    ).toBeNull();
    expect(parseGlobalMosaicTilePath("Norder1/Dir0/Npix48.webp")).toBeNull();
  });

  it("uses the standard 10,000-cell HiPS directory grouping", () => {
    expect(healpixDirectory(0)).toBe(0);
    expect(healpixDirectory(9_999)).toBe(0);
    expect(healpixDirectory(10_000)).toBe(10_000);
    expect(healpixDirectory(211_675)).toBe(210_000);
  });

  it("advertises an all-sky WebP HiPS contract", () => {
    const properties = buildGlobalMosaicProperties();
    expect(properties).toContain(`hips_order = ${GLOBAL_MOSAIC_MAX_ORDER}`);
    expect(properties).toContain("hips_tile_format = webp");
    expect(properties).toContain("hips_initial_fov = 360");
    expect(properties).toContain("hips_frame = equatorial");
  });
});
