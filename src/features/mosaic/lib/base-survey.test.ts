import { describe, expect, it, vi } from "vitest";
import type { AladinApi, AladinImageSurvey, AladinInstance } from "./aladin-lite";
import { createBaseSurveyController } from "./base-survey";

function deferredLayer() {
  let resolve!: (value: AladinImageSurvey) => void;
  let reject!: (reason: unknown) => void;
  const layer: AladinImageSurvey = {
    added: false,
    setOpacity: vi.fn(),
    query: new Promise<AladinImageSurvey>((success, failure) => {
      resolve = success;
      reject = failure;
    }),
  };
  return { layer, resolve: () => resolve(layer), reject };
}

function harness(layers: AladinImageSurvey[]) {
  const api = { imageHiPS: vi.fn(() => layers.shift()) } as unknown as AladinApi;
  const aladin = {
    setBaseImageLayer: vi.fn((layer: AladinImageSurvey) => {
      layer.added = true;
      return layer;
    }),
  } as unknown as AladinInstance;
  return { api, aladin, controller: createBaseSurveyController(api, aladin) };
}

describe("base survey selection", () => {
  it("keeps the latest choice when an earlier metadata request resolves late", async () => {
    const first = deferredLayer();
    const second = deferredLayer();
    const { controller, aladin, api } = harness([first.layer, second.layer]);
    const oldSelection = controller.select("https://example.test/old");
    const newSelection = controller.select("https://example.test/new");
    second.resolve();
    expect(await newSelection).toBe(true);
    first.resolve();
    expect(await oldSelection).toBe(false);
    expect(aladin.setBaseImageLayer).toHaveBeenCalledTimes(1);
    expect(aladin.setBaseImageLayer).toHaveBeenCalledWith(second.layer);
    expect(api.imageHiPS).toHaveBeenLastCalledWith(
      expect.not.stringMatching(/^https:/),
      expect.objectContaining({ url: "https://example.test/new", opacity: 1 }),
    );
    controller.dispose();
  });

  it("leaves the existing base intact when replacement metadata fails", async () => {
    const next = deferredLayer();
    const { controller, aladin } = harness([next.layer]);
    const result = controller.select("https://example.test/unavailable");
    next.reject(new Error("Provider unavailable"));
    await expect(result).rejects.toThrow("Provider unavailable");
    expect(aladin.setBaseImageLayer).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("does not attach a pending image after its viewer has been disposed", async () => {
    const next = deferredLayer();
    const { controller, aladin } = harness([next.layer]);
    const result = controller.select("https://example.test/pending");
    controller.dispose();
    next.reject(new Error("Late provider failure"));
    expect(await result).toBe(false);
    expect(aladin.setBaseImageLayer).not.toHaveBeenCalled();
  });
});
