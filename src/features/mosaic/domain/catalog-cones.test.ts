import { describe, expect, it } from "vitest";
import {
  buildCatalogConeQuery,
  CATALOG_CONE_LIMIT,
  parseSimbadConeResponse,
  parseTwoMassConeTsv,
  validateCatalogConeViewport,
  type CatalogConeViewport,
} from "./catalog-cones";

const simbadMetadata = ["main_id", "ra", "dec", "otype"].map((name) => ({ name }));

describe("bounded astronomical catalogue cones", () => {
  it("accepts only the two fixed catalogues and finite, single-valued sky coordinates", () => {
    expect(
      validateCatalogConeViewport(
        new URLSearchParams("catalog=simbad&ra=10.6847&dec=41.2692&fov=1"),
      ),
    ).toEqual({ catalog: "simbad", ra: 10.6847, dec: 41.2692, fov: 1 });
    expect(
      validateCatalogConeViewport(new URLSearchParams("catalog=2mass&ra=0&dec=-90&fov=0.02")),
    ).toEqual({ catalog: "2mass", ra: 0, dec: -90, fov: 0.02 });
    for (const input of [
      "catalog=simbad&dec=0&fov=1",
      "catalog=simbad&ra=&dec=0&fov=1",
      "catalog=simbad&ra=1&ra=2&dec=0&fov=1",
      "catalog=simbad&ra=NaN&dec=0&fov=1",
      "catalog=simbad&ra=Infinity&dec=0&fov=1",
      "catalog=simbad&ra=360&dec=0&fov=1",
      "catalog=simbad&ra=-1&dec=0&fov=1",
      "catalog=simbad&ra=1&dec=91&fov=1",
      "catalog=simbad&ra=1&dec=-91&fov=1",
      "catalog=simbad&ra=1&dec=0&fov=0.019",
      "catalog=simbad&ra=1&dec=0&fov=8.01",
      "catalog=gaia&ra=1&dec=0&fov=1",
      "catalog=https://example.com&ra=1&dec=0&fov=1",
    ]) {
      expect(validateCatalogConeViewport(new URLSearchParams(input)), input).toBeNull();
    }
  });

  it("rejects query fragments before ADQL interpolation and revalidates builder inputs", () => {
    const input = new URLSearchParams({
      catalog: "simbad",
      ra: "1)); DROP TABLE basic; --",
      dec: "0",
      fov: "1",
    });
    expect(validateCatalogConeViewport(input)).toBeNull();
    expect(() =>
      buildCatalogConeQuery({
        catalog: "simbad",
        ra: "1 OR 1=1",
        dec: 0,
        fov: 1,
      } as unknown as CatalogConeViewport),
    ).toThrow("invalide");
  });

  it("limits both row count and angular radius using each provider's geometry syntax", () => {
    const simbad = buildCatalogConeQuery({ catalog: "simbad", ra: 1, dec: 2, fov: 8 });
    expect(simbad).toContain("SELECT TOP 400 main_id,ra,dec,otype FROM basic");
    expect(simbad).toContain("CIRCLE('ICRS',1.0000000,2.0000000,2.0000000)");
    const twoMass = buildCatalogConeQuery({ catalog: "2mass", ra: 1, dec: -2, fov: 0.02 });
    expect(twoMass).toContain("SELECT TOP 400 designation,ra,dec,j_m FROM fp_psc");
    expect(twoMass).toContain("CIRCLE(1.0000000,-2.0000000,0.0150000)");
  });

  it("maps SIMBAD metadata order instead of assuming a fixed row layout", () => {
    expect(
      parseSimbadConeResponse({
        metadata: ["otype", "dec", "main_id", "ra"].map((name) => ({ name })),
        data: [["AGN", 41.26875, "M  31", 10.684708333]],
      }),
    ).toEqual([
      {
        ra: 10.684708333,
        dec: 41.26875,
        data: { Identification: "M  31", Type: "AGN", Catalogue: "SIMBAD" },
      },
    ]);
  });

  it("does not turn missing SIMBAD coordinates into zeros or return duplicate objects", () => {
    const sources = parseSimbadConeResponse({
      metadata: simbadMetadata,
      data: [
        ["valid", "0", "-90", "*"],
        ["valid", 0, -90, "*"],
        ["null RA", null, 0, "*"],
        ["empty RA", "", 0, "*"],
        ["null Dec", 0, null, "*"],
        ["boolean RA", true, 0, "*"],
        ["bad RA", 360, 0, "*"],
        ["bad Dec", 1, 91, "*"],
        ["", 1, 2, "*"],
      ],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.ra).toBe(0);
    expect(sources[0]?.dec).toBe(-90);
  });

  it("distinguishes an empty SIMBAD result from a malformed remote response", () => {
    expect(parseSimbadConeResponse({ metadata: simbadMetadata, data: [] })).toEqual([]);
    expect(() => parseSimbadConeResponse({ error: "upstream failed" })).toThrow();
    expect(() => parseSimbadConeResponse({ metadata: [{ name: "ra" }], data: [] })).toThrow();
    expect(() =>
      parseSimbadConeResponse({ metadata: [...simbadMetadata, { name: "RA" }], data: [] }),
    ).toThrow();
  });

  it("caps unexpected oversized catalogue row sets", () => {
    const data = Array.from({ length: CATALOG_CONE_LIMIT + 25 }, (_, index) => [
      `source ${index}`,
      1,
      2,
      "*",
    ]);
    expect(parseSimbadConeResponse({ metadata: simbadMetadata, data })).toHaveLength(400);
  });

  it("parses the verified 2MASS TSV shape, reordered columns, quotes, BOM and CRLF", () => {
    expect(
      parseTwoMassConeTsv(
        '\uFEFF"j_m"\t"designation"\t"dec"\t"ra"\r\n8.691\t"04270469+2606163"\t26.104530\t66.769575\r\n',
      ),
    ).toEqual([
      {
        ra: 66.769575,
        dec: 26.10453,
        data: {
          Identification: "2MASS J04270469+2606163",
          "Magnitude J": 8.691,
          Catalogue: "2MASS",
        },
      },
    ]);
  });

  it("preserves positions with missing photometry without inventing magnitude zero", () => {
    const sources = parseTwoMassConeTsv(
      "designation\tra\tdec\tj_m\n" +
        "04270469+2606163\t66.7\t26.1\t\n" +
        "04270469+2606164\t66.8\t26.2\tnull\n" +
        "04270469+2606165\t66.9\t26.3\t0\n",
    );
    expect(sources).toHaveLength(3);
    expect(sources[0]?.data).not.toHaveProperty("Magnitude J");
    expect(sources[1]?.data).not.toHaveProperty("Magnitude J");
    expect(sources[2]?.data["Magnitude J"]).toBe(0);
  });

  it("rejects invalid 2MASS identifiers, coordinates and nonphysical magnitude values", () => {
    const sources = parseTwoMassConeTsv(
      "designation\tra\tdec\tj_m\n" +
        "<script>\t66.7\t26.1\t10\n" +
        "04270469+2606163\tnull\t26.1\t10\n" +
        "04270469+2606164\t360\t26.2\t10\n" +
        "04270469+2606165\t66.9\t-91\t10\n" +
        "04270469+2606166\t66.9\t26.3\t999\n" +
        "04270469+2606167\t66.9\t26.3\tInfinity\n",
    );
    expect(sources).toEqual([]);
  });

  it("rejects malformed TSV and distinguishes valid zero-result catalogues", () => {
    expect(parseTwoMassConeTsv("designation\tra\tdec\tj_m\n")).toEqual([]);
    expect(() => parseTwoMassConeTsv("<html>Gateway error</html>")).toThrow();
    expect(() => parseTwoMassConeTsv('designation\tra\tdec\tj_m\n"unfinished')).toThrow();
  });
});
