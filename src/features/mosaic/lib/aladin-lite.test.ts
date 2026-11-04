import { afterEach, describe, expect, it, vi } from "vitest";
import { FEDERATED_BASE_SURVEY_ID, hipsServiceUrlForSurvey } from "../domain/hips-surveys";
import type { AladinApi, AladinInstance } from "./aladin-lite";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Aladin Lite resilient loader", () => {
  it("reuses an already initialized API and normalizes HiPS IDs to service URLs", async () => {
    const baseLayer = vi.fn();
    const aladinInstance = {
      setBaseImageLayer: baseLayer,
    } as unknown as AladinInstance;
    const createViewer = vi.fn(() => aladinInstance);
    const existingApi = {
      init: Promise.resolve(),
      aladin: createViewer,
    } as unknown as AladinApi;

    vi.stubGlobal("window", {
      A: existingApi,
      setTimeout,
      clearTimeout,
    });
    vi.stubGlobal("document", {});

    const { loadAladinLite } = await import("./aladin-lite");
    const [first, second] = await Promise.all([loadAladinLite(), loadAladinLite()]);
    expect(first).toBe(existingApi);
    expect(second).toBe(first);

    const element = {} as HTMLElement;
    const options = {
      survey: FEDERATED_BASE_SURVEY_ID,
      fov: 360,
      projection: "AIT",
      cooFrame: "ICRS",
      showReticle: true,
      showCooGridControl: true,
      showCooGrid: false,
      showSimbadPointerControl: true,
      showContextMenu: true,
      showFullscreenControl: true,
    };
    const viewer = first.aladin(element, options);
    expect(createViewer).toHaveBeenCalledWith(element, {
      ...options,
      survey: hipsServiceUrlForSurvey(FEDERATED_BASE_SURVEY_ID),
    });

    viewer.setBaseImageLayer(FEDERATED_BASE_SURVEY_ID);
    expect(baseLayer).toHaveBeenCalledWith(hipsServiceUrlForSurvey(FEDERATED_BASE_SURVEY_ID));
    // Older Aladin builds may not expose off(); React cleanup must still succeed.
    expect(() => viewer.off("zoomChanged")).not.toThrow();
  });
});
