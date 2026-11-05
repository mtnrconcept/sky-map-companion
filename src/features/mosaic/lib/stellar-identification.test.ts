import { afterEach, describe, expect, it, vi } from "vitest";
import type { AladinInstance } from "./aladin-lite";
import { createStellarIdentifier } from "./stellar-identification";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function viewer(fov = 2) {
  return {
    getFov: () => [fov, fov],
    showPopup: vi.fn(),
  } as unknown as AladinInstance;
}

describe("precise star identification", () => {
  it("keeps a disabled lookup from reopening after the user re-enables stars", async () => {
    let finish!: (value: Response) => void;
    const request = vi.fn<typeof fetch>(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    vi.stubGlobal("fetch", request);
    const aladin = viewer();
    const identifier = createStellarIdentifier(aladin);
    identifier.identify(10, 40);
    const signal = request.mock.calls[0]?.[1]?.signal;
    identifier.setEnabled(false);
    identifier.setEnabled(true);
    finish(Response.json({ star: { id: "Gaia DR3 1234567890", ra: 10, dec: 40, mag: 5 } }));
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(aladin.showPopup).toHaveBeenCalledTimes(1);
    identifier.dispose();
  });

  it("continues precise lookups at very small fields without breaking API validation", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json({ star: { id: "Gaia DR3 1234567890", ra: 10, dec: 40, mag: 12.5 } }),
      );
    vi.stubGlobal("fetch", request);
    const aladin = viewer(0.005);
    const identifier = createStellarIdentifier(aladin);
    identifier.identify(10, 40);
    await vi.waitFor(() => expect(aladin.showPopup).toHaveBeenCalledTimes(2));
    expect(String(request.mock.calls[0]?.[0])).toContain("fov=0.02000");
    expect(aladin.showPopup).toHaveBeenLastCalledWith(
      10,
      40,
      "Gaia DR3 1234567890",
      expect.stringContaining("12.50"),
    );
    identifier.dispose();
  });

  it("does not send invalid coordinates or full-sky click lookups", () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const identifier = createStellarIdentifier(viewer(360));
    identifier.identify(10, 40);
    identifier.identify(Number.NaN, 40);
    identifier.identify(10, 91);
    expect(request).not.toHaveBeenCalled();
    identifier.dispose();
  });

  it("rejects malformed or unsafe provider records before inserting popup HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          star: { id: "<img src=x onerror=alert(1)>", ra: 10, dec: 40, mag: 12 },
        }),
      ),
    );
    const aladin = viewer();
    const identifier = createStellarIdentifier(aladin);
    identifier.identify(10, 40);
    await vi.waitFor(() => expect(aladin.showPopup).toHaveBeenCalledTimes(2));
    expect(aladin.showPopup).toHaveBeenLastCalledWith(
      10,
      40,
      "Position céleste",
      expect.stringContaining("Aucune source Gaia"),
    );
    identifier.dispose();
  });
});
