import { describe, expect, it } from "vitest";
import {
  angularDistanceDegrees,
  buildGaiaViewportQueries,
  buildNearestGaiaQuery,
  gaiaMagnitudeLimit,
  mergeGaiaStars,
  parseGaiaTapResponse,
  validateGaiaViewport,
} from "./gaia-stars";

describe("Gaia DR3 stellar pointers", () => {
  it("parses only validated Gaia DR3 source identifiers and finite sky coordinates", () => {
    expect(
      parseGaiaTapResponse({
        data: [
          {
            designation: "Gaia DR3 3699065258268569000",
            ra: 181.7,
            dec: 0.6,
            phot_g_mean_mag: 15.1,
          },
          { designation: "<img src=x onerror=alert(1)>", ra: 181, dec: 0, phot_g_mean_mag: 10 },
          { designation: "Gaia DR3 3699065258268569001", ra: 400, dec: 0.6, phot_g_mean_mag: 10 },
        ],
      }),
    ).toEqual([{ id: "Gaia DR3 3699065258268569000", ra: 181.7, dec: 0.6, mag: 15.1 }]);
  });

  it("constrains sky coordinate and field ranges before interpolating ADQL", () => {
    const valid = new URLSearchParams("ra=180.75&dec=0.681&fov=1.788");
    expect(validateGaiaViewport(valid)).toEqual({ ra: 180.75, dec: 0.681, fov: 1.788 });
    for (const invalid of [
      "ra=NaN&dec=0&fov=1",
      "ra=360&dec=0&fov=1",
      "ra=1&dec=91&fov=1",
      "ra=1&dec=0&fov=99",
      "ra=1&dec=0&fov=0",
    ]) {
      expect(validateGaiaViewport(new URLSearchParams(invalid))).toBeNull();
    }
  });

  it("tiles a viewport into nine balanced spatial queries and wraps right ascension safely", () => {
    const queries = buildGaiaViewportQueries(359.9, 2, 1.8);
    expect(queries).toHaveLength(9);
    expect(queries.every((query) => query.includes("gaiadr3.gaia_source"))).toBe(true);
    expect(queries.every((query) => query.includes("CIRCLE"))).toBe(true);
    const highDecQueries = buildGaiaViewportQueries(5, 88, 1);
    expect(highDecQueries).toHaveLength(9);
    expect(highDecQueries.every((query) => query.includes("phot_g_mean_mag"))).toBe(true);
    expect(gaiaMagnitudeLimit(0.1)).toBe(20);
    expect(gaiaMagnitudeLimit(2)).toBe(17);
  });

  it("uses a bounded nearest-neighbour cone and compares angular distance across RA 0°", () => {
    const adql = buildNearestGaiaQuery(0.0001, 0, 0.01);
    expect(adql).toContain("CIRCLE('ICRS',0.00010,0.00000,0.01000)");
    expect(angularDistanceDegrees({ ra: 359.999, dec: 0 }, { ra: 0.001, dec: 0 })).toBeCloseTo(
      0.002,
      5,
    );
  });

  it("deduplicates overlapping quadrant results and prioritizes bright stars", () => {
    const star = { id: "Gaia DR3 3699065258268569000", ra: 181, dec: 0, mag: 10 };
    expect(
      mergeGaiaStars([[star], [star, { ...star, id: "Gaia DR3 3699065258268569001", mag: 9 }]]),
    ).toEqual([{ ...star, id: "Gaia DR3 3699065258268569001", mag: 9 }, star]);
  });
});
