import { afterEach, describe, expect, it, vi } from "vitest";
import type { AladinImageSurvey } from "./aladin-lite";
import { awaitHipsMetadata, awaitImageLayerReady } from "./hips-layer-ready";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(() => vi.useRealTimers());

describe("HiPS load acknowledgement", () => {
  it("does not report an image ready merely because its properties were fetched", async () => {
    vi.useFakeTimers();
    const layer: AladinImageSurvey = { added: false, setOpacity: vi.fn() };
    layer.query = Promise.resolve(layer);
    await expect(awaitHipsMetadata(layer)).resolves.toBe(layer);
    const ready = vi.fn();
    const waiting = awaitImageLayerReady(layer).then(ready);
    await vi.advanceTimersByTimeAsync(500);
    expect(ready).not.toHaveBeenCalled();
    layer.added = true;
    await vi.advanceTimersByTimeAsync(100);
    await waiting;
    expect(ready).toHaveBeenCalledWith(layer);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports metadata errors before the timeout", async () => {
    vi.useFakeTimers();
    const query = deferred<AladinImageSurvey>();
    const layer = { setOpacity: vi.fn(), query: query.promise };
    const metadata = expect(awaitHipsMetadata(layer)).rejects.toThrow("HTTP 503");
    const image = expect(awaitImageLayerReady(layer)).rejects.toThrow("HTTP 503");
    query.reject(new Error("HTTP 503"));
    await Promise.all([metadata, image]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds an image that never attaches and cancels all polling", async () => {
    vi.useFakeTimers();
    const layer = { setOpacity: vi.fn(), added: false };
    const waiting = expect(awaitImageLayerReady(layer)).rejects.toThrow("affichée");
    await vi.advanceTimersByTimeAsync(15_000);
    await waiting;
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([awaitHipsMetadata, awaitImageLayerReady])(
    "consumes a late metadata rejection even when already cancelled",
    async (wait) => {
      vi.useFakeTimers();
      const query = deferred<AladinImageSurvey>();
      const aborter = new AbortController();
      aborter.abort();
      await expect(
        wait({ setOpacity: vi.fn(), query: query.promise }, aborter.signal),
      ).rejects.toMatchObject({ name: "AbortError" });
      query.reject(new Error("Late network failure"));
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(0);
      // Vitest also fails this test on any unhandled rejection from query.
    },
  );

  it("aborts pending metadata and releases its deadline immediately", async () => {
    vi.useFakeTimers();
    const query = deferred<AladinImageSurvey>();
    const aborter = new AbortController();
    const waiting = expect(
      awaitHipsMetadata({ setOpacity: vi.fn(), query: query.promise }, aborter.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    aborter.abort();
    await waiting;
    expect(vi.getTimerCount()).toBe(0);
    query.reject(new Error("Late network failure"));
    await Promise.resolve();
  });
});
