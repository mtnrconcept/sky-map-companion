import { afterEach, describe, expect, it, vi } from "vitest";
import { FEDERATED_BASE_SURVEY_ID, hipsServiceUrlForSurvey } from "../domain/hips-surveys";
import type { AladinInstance } from "./aladin-lite";

const sdkMock = vi.hoisted(() => ({
  aladin: vi.fn(),
}));

vi.mock("aladin-lite", () => ({
  default: {
    init: Promise.resolve(),
    aladin: sdkMock.aladin,
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  sdkMock.aladin.mockReset();
});

describe("Aladin Lite bundled loader", () => {
  it("loads the local SDK once and normalizes all-sky survey HiPS URLs", async () => {
    const baseLayer = vi.fn();
    const aladinInstance = { setBaseImageLayer: baseLayer } as unknown as AladinInstance;
    sdkMock.aladin.mockReturnValue(aladinInstance);
    vi.stubGlobal("document", {});

    const { loadAladinLite } = await import("./aladin-lite");
    const [first, second] = await Promise.all([loadAladinLite(), loadAladinLite()]);
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
    expect(sdkMock.aladin).toHaveBeenCalledWith(element, {
      ...options,
      survey: hipsServiceUrlForSurvey(FEDERATED_BASE_SURVEY_ID),
    });

    viewer.setBaseImageLayer(FEDERATED_BASE_SURVEY_ID);
    expect(baseLayer).toHaveBeenCalledWith(hipsServiceUrlForSurvey(FEDERATED_BASE_SURVEY_ID));
    expect(() => viewer.off("zoomChanged")).not.toThrow();
  });
});
