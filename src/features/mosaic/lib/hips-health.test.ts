import { afterEach, describe, expect, it, vi } from "vitest";
import { DSS2_HIPS_MIRRORS, resolveHealthyDss2Mirror } from "./hips-health";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("all-sky HiPS mirror selection", () => {
  it("chooses an independent mirror only after checking properties and a tile", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/properties")) {
        return new Response(
          "creator_did = ivo://CDS/P/DSS2/color\nhips_order = 9\nhips_tile_format = jpeg",
          { status: 200 },
        );
      }
      return new Response("jpeg bytes", {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const selected = await resolveHealthyDss2Mirror();
    expect(selected).toEqual({ url: DSS2_HIPS_MIRRORS[0], verified: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("Norder0/Dir0/Npix0.jpg");
  });

  it("switches away from a broken primary CDN rather than showing an empty panorama", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith(DSS2_HIPS_MIRRORS[0])) return new Response("offline", { status: 502 });
      if (url.endsWith("/properties")) {
        return new Response(
          "creator_did = ivo://CDS/P/DSS2/color\nhips_tile_format = jpeg",
          { status: 200 },
        );
      }
      return new Response("jpeg", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveHealthyDss2Mirror()).toEqual({
      url: DSS2_HIPS_MIRRORS[1],
      verified: true,
    });
  });
});
