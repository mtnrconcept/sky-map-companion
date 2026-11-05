import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG_CONE_MAX_BYTES } from "../domain/catalog-cones";
import { handleCatalogConeRequest } from "./catalog-cones.server";

const simbadPayload = {
  metadata: ["main_id", "ra", "dec", "otype"].map((name) => ({ name })),
  data: [["M  31", 10.684708333, 41.26875, "AGN"]],
};

function coneRequest(catalog = "simbad", signal?: AbortSignal): Request {
  return new Request(
    `https://sky.example/api/mosaic/catalog?catalog=${catalog}&ra=10.68&dec=41.26&fov=1`,
    {
      ...(signal ? { signal } : {}),
    },
  );
}

describe("public catalogue cone endpoint", () => {
  afterEach(() => vi.useRealTimers());

  it("serves bounded real-source data and labels the cone result as incomplete", async () => {
    const fetchProvider = vi.fn<typeof fetch>().mockResolvedValue(Response.json(simbadPayload));
    const response = await handleCatalogConeRequest(coneRequest(), fetchProvider);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(await response.json()).toMatchObject({
      catalog: "SIMBAD",
      limited: true,
      sources: [{ ra: 10.684708333, dec: 41.26875, data: { Identification: "M  31" } }],
    });
    const url = new URL(String(fetchProvider.mock.calls[0]?.[0]));
    expect(url.origin).toBe("https://simbad.harvard.edu");
    expect(url.searchParams.get("FORMAT")).toBe("json");
    expect(url.searchParams.get("QUERY")).toContain("SELECT TOP 400");
    expect(fetchProvider.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it("uses IRSA TSV for 2MASS without requiring upstream browser CORS", async () => {
    const fetchProvider = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("designation\tra\tdec\tj_m\n04270469+2606163\t66.769575\t26.104530\t8.691\n"),
      );
    const response = await handleCatalogConeRequest(coneRequest("2mass"), fetchProvider);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ catalog: "2MASS", limited: true });
    const url = new URL(String(fetchProvider.mock.calls[0]?.[0]));
    expect(url.origin).toBe("https://irsa.ipac.caltech.edu");
    expect(url.searchParams.get("FORMAT")).toBe("TSV");
  });

  it("rejects malicious coordinates before any request and ignores arbitrary upstream URLs", async () => {
    const fetchProvider = vi.fn<typeof fetch>().mockResolvedValue(Response.json(simbadPayload));
    const invalid = new Request(
      "https://sky.example/api/mosaic/catalog?catalog=simbad&ra=1;DROP&dec=0&fov=1",
    );
    expect((await handleCatalogConeRequest(invalid, fetchProvider)).status).toBe(400);
    expect(fetchProvider).not.toHaveBeenCalled();
    const overridden = new Request(
      coneRequest().url + "&url=http://169.254.169.254/latest/meta-data/",
    );
    expect((await handleCatalogConeRequest(overridden, fetchProvider)).status).toBe(200);
    expect(String(fetchProvider.mock.calls[0]?.[0])).toMatch(/^https:\/\/simbad\.harvard\.edu\//);
  });

  it("reports external and parsing failures without caching errors or exposing their contents", async () => {
    for (const upstream of [
      new Response("private upstream detail", { status: 503 }),
      new Response("<html>unexpected HTML</html>"),
      Response.json({ error: "unsupported query" }),
    ]) {
      const response = await handleCatalogConeRequest(
        coneRequest(),
        vi.fn<typeof fetch>().mockResolvedValue(upstream),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).not.toMatch(
        /private upstream|unsupported query|unexpected HTML/,
      );
    }
  });

  it("enforces the byte limit both with and without a declared Content-Length", async () => {
    for (const headers of [{}, { "Content-Length": String(CATALOG_CONE_MAX_BYTES + 1) }]) {
      const upstream = new Response("x".repeat(CATALOG_CONE_MAX_BYTES + 1), { headers });
      const response = await handleCatalogConeRequest(
        coneRequest(),
        vi.fn<typeof fetch>().mockResolvedValue(upstream),
      );
      expect(response.status).toBe(503);
    }
  });

  it("propagates browser cancellation into the remote fetch and skips already-aborted work", async () => {
    const controller = new AbortController();
    let upstreamSignal: AbortSignal | null | undefined;
    const fetchProvider = vi.fn<typeof fetch>((_url, options) => {
      upstreamSignal = options?.signal;
      return new Promise((_resolve, reject) => {
        upstreamSignal?.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        });
      });
    });
    const pending = handleCatalogConeRequest(
      coneRequest("simbad", controller.signal),
      fetchProvider,
    );
    controller.abort();
    expect((await pending).status).toBe(503);
    expect(upstreamSignal?.aborted).toBe(true);
    const abortedFetch = vi.fn<typeof fetch>();
    await handleCatalogConeRequest(coneRequest("simbad", controller.signal), abortedFetch);
    expect(abortedFetch).not.toHaveBeenCalled();
  });

  it("aborts an unavailable upstream within twelve seconds", async () => {
    vi.useFakeTimers();
    const fetchProvider = vi.fn<typeof fetch>(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new Error("timeout")), {
            once: true,
          });
        }),
    );
    const pending = handleCatalogConeRequest(coneRequest(), fetchProvider);
    await vi.advanceTimersByTimeAsync(12_000);
    expect((await pending).status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
  });
});
