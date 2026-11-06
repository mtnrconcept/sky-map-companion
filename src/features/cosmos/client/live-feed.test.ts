import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCosmosJson } from "./live-feed";

describe("Cosmos browser transport", () => {
  afterEach(() => vi.useRealTimers());

  it("returns a JSON feed and prevents browser caching of private status", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ observations: [], events: [] }));
    expect(await requestCosmosJson("/api/cosmos/feed", {}, 15000, fetcher)).toEqual({
      observations: [],
      events: [],
    });
    expect(fetcher.mock.calls[0]?.[1]?.cache).toBe("no-store");
  });

  it("surfaces readable service failures without dumping an HTML error page", async () => {
    await expect(
      requestCosmosJson(
        "/api/cosmos/feed",
        {},
        15000,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(Response.json({ error: "Flux indisponible." }, { status: 503 })),
      ),
    ).rejects.toThrow("Flux indisponible.");
    await expect(
      requestCosmosJson(
        "/api/cosmos/feed",
        {},
        15000,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("<html>secret diagnostics</html>", { status: 500 })),
      ),
    ).rejects.toThrow("Le service ne répond pas");
    await expect(
      requestCosmosJson(
        "/api/cosmos/feed",
        {},
        15000,
        vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")),
      ),
    ).rejects.toThrow("Connexion interrompue");
  });

  it("aborts hung requests within the deadline and clears its timer", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const result = expect(
      requestCosmosJson("/api/cosmos/feed", {}, 15000, fetcher),
    ).rejects.toThrow("trop de temps");
    await vi.advanceTimersByTimeAsync(15000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates filter-change cancellation and skips already-cancelled requests", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const pending = expect(
      requestCosmosJson("/api/cosmos/feed", { signal: controller.signal }, 15000, fetcher),
    ).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await pending;
    const never = vi.fn<typeof fetch>();
    await expect(
      requestCosmosJson("/api/cosmos/feed", { signal: controller.signal }, 15000, never),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(never).not.toHaveBeenCalled();
  });
});
