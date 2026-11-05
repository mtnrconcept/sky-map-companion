import { afterEach, describe, expect, it, vi } from "vitest";
import { HIPS_SURVEYS } from "../domain/hips-surveys";
import {
  createSkyOverlaySnapshot,
  sanitizeSkyOverlayPreferences,
  SKY_OVERLAYS,
  type SkyOverlayPreferences,
} from "../domain/sky-overlays";
import type {
  AladinApi,
  AladinCatalogOptions,
  AladinImageOptions,
  AladinImageSurvey,
  AladinInstance,
  AladinStarSource,
} from "./aladin-lite";
import { celestialPlanePoints, createSkyOverlays } from "./sky-overlays";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fakeCatalog(options: AladinCatalogOptions) {
  let sources: AladinStarSource[] = [];
  return {
    options,
    show: vi.fn(),
    hide: vi.fn(),
    getSources: () => sources,
    addSources: vi.fn((next: AladinStarSource[]) => {
      sources.push(...next);
    }),
    removeAll: vi.fn(() => {
      sources = [];
    }),
  };
}

function setup() {
  const catalog = vi.fn(fakeCatalog);
  const progressive = vi.fn((url: string, options: AladinCatalogOptions) => {
    const layer = fakeCatalog(options);
    layer.addSources([{ ra: 10, dec: 20, data: { ID: "test" } }]);
    return Object.assign(layer, { url, isReady: false, keyRa: "ra", keyDec: "dec" });
  });
  const images: Array<{
    layer: AladinImageSurvey;
    options: AladinImageOptions;
    metadata: ReturnType<typeof deferred<AladinImageSurvey>>;
    opacity: number;
  }> = [];
  const imageHiPS = vi.fn((_url: string, options: AladinImageOptions = {}) => {
    const metadata = deferred<AladinImageSurvey>();
    const item = {
      metadata,
      options,
      opacity: options.opacity ?? 1,
      layer: {} as AladinImageSurvey,
    };
    item.layer = {
      query: metadata.promise,
      added: false,
      setOpacity: vi.fn((value) => {
        item.opacity = value;
      }),
    };
    images.push(item);
    return item.layer;
  });
  const graphic = vi.fn(() => ({
    add: vi.fn(),
    addFootprints: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
  }));
  const api = {
    catalog,
    catalogHiPS: progressive,
    imageHiPS,
    source: (ra: number, dec: number, data: Record<string, unknown>) => ({ ra, dec, data }),
    graphicOverlay: graphic,
    polyline: (points: number[][]) => ({ points }),
  } as unknown as AladinApi;
  const imageLayers = new Map<string, AladinImageSurvey>();
  const aladin = {
    addCatalog: vi.fn(),
    addOverlay: vi.fn(),
    removeOverlay: vi.fn(),
    getGridOptions: () => ({ enabled: false }),
    getStackLayers: () => [...imageLayers.keys()],
    setCooGrid: vi.fn(),
    getRaDec: vi.fn(() => [10, 20]),
    getFov: vi.fn(() => [2, 2]),
    showPopup: vi.fn(),
    setOverlayImageLayer: vi.fn((layer: AladinImageSurvey, name: string) => {
      imageLayers.set(name, layer);
      return layer;
    }),
    removeImageLayer: vi.fn((name: string) => {
      const layer = imageLayers.get(name);
      if (layer) layer.added = false;
      imageLayers.delete(name);
    }),
  } as unknown as AladinInstance;
  const preferences: SkyOverlayPreferences = {
    enabled: Object.fromEntries(SKY_OVERLAYS.map(({ id }) => [id, false])),
  };
  return {
    api,
    aladin,
    catalog,
    progressive,
    images,
    imageHiPS,
    imageLayers,
    preferences,
    graphic,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("astronomical overlays", () => {
  it("restores only known settings, rejecting a stored arbitrary image URL", () => {
    const prefs = sanitizeSkyOverlayPreferences({
      enabled: { gaia: false, simbad: "yes", injected: true },
      imageSurveyId: "https://attacker.invalid/hips",
      imageOpacity: 4,
    });
    const snapshot = createSkyOverlaySnapshot(prefs);
    expect(snapshot.layers.gaia.enabled).toBe(false);
    expect(snapshot.layers["bright-stars"].enabled).toBe(true);
    expect(snapshot.layers.simbad.enabled).toBe(false);
    expect(snapshot.image).toEqual({ surveyId: null, opacity: 1, state: "disabled" });
    expect(Object.keys(snapshot.layers)).toHaveLength(SKY_OVERLAYS.length);
  });

  it("shows local bright stars across the all-sky view without an external catalogue", async () => {
    const env = setup();
    vi.mocked(env.aladin.getFov).mockReturnValue([360, 180]);
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setEnabled("bright-stars", true);
    await vi.waitFor(() =>
      expect(controller.getSnapshot().layers["bright-stars"].state).toBe("ready"),
    );
    expect(controller.getSnapshot().layers["bright-stars"].count).toBeGreaterThan(3_000);
    expect(env.progressive).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("keeps toggles independent, reuses a loaded catalogue and removes only its own layer", async () => {
    const env = setup();
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setEnabled("galaxies", true);
    await vi.waitFor(() => expect(controller.getSnapshot().layers.galaxies.state).toBe("ready"));
    const galaxies = env.catalog.mock.results[0]!.value;
    controller.setEnabled("galaxies", false);
    expect(galaxies.hide).toHaveBeenCalledOnce();
    controller.setEnabled("galaxies", true);
    expect(galaxies.show).toHaveBeenCalledOnce();
    expect(env.catalog).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(env.aladin.removeOverlay).toHaveBeenCalledWith(galaxies);
  });

  it("waits for progressive catalogue data and cannot re-enable a disabled pending layer", async () => {
    vi.useFakeTimers();
    const env = setup();
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setEnabled("simbad", true);
    const catalog = env.progressive.mock.results[0]!.value;
    expect(controller.getSnapshot().layers.simbad.state).toBe("loading");
    controller.setEnabled("simbad", false);
    catalog.isReady = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.getSnapshot().layers.simbad).toEqual({ enabled: false, state: "disabled" });
    expect(catalog.hide).toHaveBeenCalled();
    controller.setEnabled("simbad", true);
    await vi.advanceTimersByTimeAsync(1);
    expect(env.progressive).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().layers.simbad.state).toBe("ready");
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to real SIMBAD field data when progressive metadata is invalid", async () => {
    vi.useFakeTimers();
    const env = setup();
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        catalog: "SIMBAD",
        limited: true,
        sources: [{ ra: 10.2, dec: 20.1, data: { Identification: "M 31" } }],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setEnabled("simbad", true);
    const catalog = env.progressive.mock.results[0]!.value;
    catalog.keyRa = "";
    catalog.isReady = true;
    await vi.advanceTimersByTimeAsync(900);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![0]).toContain("/api/mosaic/catalog?catalog=simbad");
    expect(controller.getSnapshot().layers.simbad).toMatchObject({
      enabled: true,
      state: "ready",
      count: 1,
      message: expect.stringContaining("secours"),
    });
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts the field fallback on movement and ignores late responses after disabling", async () => {
    vi.useFakeTimers();
    const env = setup();
    const response = deferred<Response>();
    const fetcher = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", fetcher);
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setEnabled("2mass", true);
    await vi.advanceTimersByTimeAsync(12_700);
    expect(fetcher).toHaveBeenCalledOnce();
    const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
    controller.refreshViewport();
    expect(signal.aborted).toBe(true);
    controller.setEnabled("2mass", false);
    response.resolve(
      Response.json({ sources: [{ ra: 10, dec: 20, data: { Identification: "late" } }] }),
    );
    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.getSnapshot().layers["2mass"]).toEqual({ enabled: false, state: "disabled" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("does not request all-sky cone data when a remote catalogue is unavailable", async () => {
    vi.useFakeTimers();
    const env = setup();
    vi.mocked(env.aladin.getFov).mockReturnValue([360, 180]);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setEnabled("2mass", true);
    await vi.advanceTimersByTimeAsync(12_700);
    expect(fetcher).not.toHaveBeenCalled();
    expect(controller.getSnapshot().layers["2mass"].message).toContain("zoomez");
    controller.dispose();
  });

  it.each(["gaia", "simbad", "2mass"] as const)(
    "keeps %s fallback available below the server's minimum query field",
    async (id) => {
      vi.useFakeTimers();
      const env = setup();
      vi.mocked(env.aladin.getFov).mockReturnValue([0.001, 0.001]);
      const fetcher = vi.fn().mockResolvedValue(
        Response.json(
          id === "gaia"
            ? {
                catalog: "Gaia DR3",
                partial: false,
                stars: [{ id: "Gaia DR3 123456789", ra: 10, dec: 20, mag: 12 }],
              }
            : {
                limited: true,
                sources: [{ ra: 10, dec: 20, data: { Identification: "Source" } }],
              },
        ),
      );
      vi.stubGlobal("fetch", fetcher);
      const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
      controller.setEnabled(id, true);
      const progressive = env.progressive.mock.results[0]!.value;
      progressive.keyRa = "";
      progressive.isReady = true;
      await vi.advanceTimersByTimeAsync(900);
      expect(fetcher).toHaveBeenCalledOnce();
      const url = new URL(fetcher.mock.calls[0]![0], "https://sky.example");
      expect(Number(url.searchParams.get("fov"))).toBe(0.02);
      expect(controller.getSnapshot().layers[id]).toMatchObject({
        enabled: true,
        state: "ready",
        count: 1,
      });
      controller.dispose();
    },
  );

  it("escapes external catalogue identifiers instead of inserting source HTML", async () => {
    vi.useFakeTimers();
    const env = setup();
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setEnabled("simbad", true);
    const onClick = env.progressive.mock.calls[0]![1].onClick;
    expect(typeof onClick).toBe("function");
    if (typeof onClick === "function")
      onClick({ ra: 10, dec: 20, data: { "<img>": "<script>alert(1)</script>" } });
    const html = vi.mocked(env.aladin.showPopup).mock.calls[0]![3];
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img>");
    expect(html).toContain("&lt;script&gt;");
    controller.dispose();
  });

  it("waits for image attachment, preserves opacity, and never changes a base layer", async () => {
    vi.useFakeTimers();
    const env = setup();
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setImageSurvey(HIPS_SURVEYS[0]!.id);
    const image = env.images[0]!;
    expect(env.imageHiPS.mock.calls[0]![0]).not.toBe(HIPS_SURVEYS[0]!.serviceUrl);
    expect(image.options.url).toBe(HIPS_SURVEYS[0]!.serviceUrl);
    expect(env.aladin.setOverlayImageLayer).not.toHaveBeenCalled();
    image.metadata.resolve(image.layer);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.getSnapshot().image.state).toBe("loading");
    controller.setImageOpacity(0.3);
    image.layer.added = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.getSnapshot().image).toMatchObject({ state: "ready", opacity: 0.3 });
    expect(image.opacity).toBe(0.3);
    controller.setImageSurvey(null);
    expect(env.imageLayers.size).toBe(0);
    expect(controller.getSnapshot().image.state).toBe("disabled");
    controller.dispose();
  });

  it("does not attach stale metadata after a newer image selection", async () => {
    vi.useFakeTimers();
    const env = setup();
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setImageSurvey(HIPS_SURVEYS[0]!.id);
    const first = env.images[0]!;
    controller.setImageSurvey(HIPS_SURVEYS[1]!.id);
    const second = env.images[1]!;
    first.metadata.resolve(first.layer);
    second.metadata.resolve(second.layer);
    await vi.advanceTimersByTimeAsync(1);
    expect(env.aladin.setOverlayImageLayer).toHaveBeenCalledTimes(1);
    expect(vi.mocked(env.aladin.setOverlayImageLayer).mock.calls[0]![0]).toBe(second.layer);
    controller.dispose();
  });

  it("keeps a comparison above a late published image without duplicating or replacing the base", async () => {
    vi.useFakeTimers();
    const env = setup();
    const base = { added: true, setOpacity: vi.fn() };
    const published = { added: true, setOpacity: vi.fn() };
    env.imageLayers.set("base", base);
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setImageSurvey(HIPS_SURVEYS[0]!.id);
    const image = env.images[0]!;
    image.metadata.resolve(image.layer);
    await vi.advanceTimersByTimeAsync(1);
    image.layer.added = true;
    await vi.advanceTimersByTimeAsync(100);
    controller.setImageOpacity(0.35);
    const comparisonName = env.aladin.getStackLayers().at(-1)!;
    env.imageLayers.set("published-standard", published);
    controller.ensureImageOnTop();
    controller.ensureImageOnTop();
    expect(env.aladin.getStackLayers()).toEqual(["base", "published-standard", comparisonName]);
    expect(env.imageLayers.get("base")).toBe(base);
    expect(env.imageLayers.get("published-standard")).toBe(published);
    expect(env.imageLayers.get(comparisonName)).toBe(image.layer);
    expect(env.imageHiPS).toHaveBeenCalledTimes(1);
    expect(image.opacity).toBe(0.35);
    image.layer.added = true;
    await vi.advanceTimersByTimeAsync(100);
    controller.ensureImageOnTop();
    expect(env.aladin.setOverlayImageLayer).toHaveBeenCalledTimes(2);
    controller.dispose();
    expect([...env.imageLayers.keys()]).toEqual(["base", "published-standard"]);
  });

  it("removes a delayed SDK image that finishes after the user disabled it", async () => {
    vi.useFakeTimers();
    const env = setup();
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setImageSurvey(HIPS_SURVEYS[0]!.id);
    const image = env.images[0]!;
    image.metadata.resolve(image.layer);
    await vi.advanceTimersByTimeAsync(1);
    const name = vi.mocked(env.aladin.setOverlayImageLayer).mock.calls[0]![1];
    controller.setImageSurvey(null);
    // Match 3.8.2 ordering: success callback precedes registry insertion.
    image.layer.added = true;
    image.options.successCallback?.(image.layer);
    env.imageLayers.set(name, image.layer);
    await vi.advanceTimersByTimeAsync(1);
    expect(image.opacity).toBe(0);
    expect(env.imageLayers.size).toBe(0);
    expect(controller.getSnapshot().image.surveyId).toBeNull();
    controller.dispose();
  });

  it("lets a failed image be retried without removing unrelated overlays", async () => {
    vi.useFakeTimers();
    const env = setup();
    const controller = createSkyOverlays(env.api, env.aladin, vi.fn(), env.preferences);
    controller.setImageSurvey(HIPS_SURVEYS[0]!.id);
    env.images[0]!.metadata.reject(new Error("offline"));
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.getSnapshot().image.state).toBe("error");
    controller.setImageSurvey(HIPS_SURVEYS[0]!.id);
    expect(env.images).toHaveLength(2);
    expect(env.aladin.removeOverlay).not.toHaveBeenCalled();
    controller.dispose();
    env.images[1]!.metadata.reject(new Error("late cancellation"));
    await Promise.resolve();
  });

  it("positions galactic and ecliptic planes using astronomical coordinates", () => {
    const galactic = celestialPlanePoints("galactic-plane");
    expect(galactic[0]![0]).toBeCloseTo(266.405, 2);
    expect(galactic[0]![1]).toBeCloseTo(-28.936, 2);
    const ecliptic = celestialPlanePoints("ecliptic");
    expect(ecliptic[45]![0]).toBeCloseTo(90, 5);
    expect(ecliptic[45]![1]).toBeCloseTo(23.439291, 5);
    for (const [ra, dec] of [...galactic, ...ecliptic]) {
      expect(ra).toBeGreaterThanOrEqual(0);
      expect(ra).toBeLessThan(360);
      expect(Math.abs(dec!)).toBeLessThanOrEqual(90);
    }
  });
});
