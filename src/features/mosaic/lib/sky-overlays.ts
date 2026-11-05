import { HIPS_SURVEYS } from "../domain/hips-surveys";
import {
  createSkyOverlaySnapshot,
  SKY_OVERLAYS,
  type SkyOverlayId,
  type SkyOverlayLayerState,
  type SkyOverlayPreferences,
  type SkyOverlaySnapshot,
} from "../domain/sky-overlays";
import type {
  AladinApi,
  AladinCatalogLayer,
  AladinCatalogOptions,
  AladinGraphicOverlay,
  AladinImageSurvey,
  AladinInstance,
  AladinProgressiveCatalog,
  AladinStarCatalog,
  AladinStarSource,
} from "./aladin-lite";
import { awaitHipsMetadata, awaitImageLayerReady } from "./hips-layer-ready";
import { createStellarPointers, type StellarPointerController } from "./stellar-pointers";

const CATALOG_READY_TIMEOUT_MS = 12_000;
const CATALOG_POLL_MS = 200;
const PROGRESSIVE_CATALOG_URLS = {
  gaia: "https://hipscat.cds.unistra.fr/HiPSCatService/I/355/gaiadr3",
  simbad: "https://hipscat.cds.unistra.fr/HiPSCatService/Simbad",
  "2mass": "https://hipscat.cds.unistra.fr/HiPSCatService/II/246/out",
} as const;

type RenderedLayer = AladinCatalogLayer | AladinGraphicOverlay;
interface LayerEntry {
  layer: RenderedLayer;
  ready: boolean;
  count?: number;
}
interface ImageRequest {
  surveyId: string;
  name: string;
  aborter: AbortController;
  layer?: AladinImageSurvey;
}

interface ViewportFallback {
  schedule(): void;
  dispose(): void;
}

export interface SkyOverlayController {
  setEnabled(id: SkyOverlayId, enabled: boolean): void;
  retry(id: SkyOverlayId): void;
  setImageSurvey(surveyId: string | null): void;
  setImageOpacity(opacity: number): void;
  /** Keep the user's comparison above asynchronous first-party image layers. */
  ensureImageOnTop(): void;
  /** Called by the viewer's existing pan/zoom handlers; no callback is replaced. */
  refreshViewport(): void;
  getSnapshot(): SkyOverlaySnapshot;
  dispose(): void;
}

let nextControllerId = 0;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .slice(0, 500)
    .replace(/[&<>"']/g, (character) => {
      const escaped: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return escaped[character]!;
    });
}

function safeSourcePopup(aladin: AladinInstance, title: string, source: AladinStarSource): void {
  if (
    !Number.isFinite(source.ra) ||
    !Number.isFinite(source.dec) ||
    source.dec < -90 ||
    source.dec > 90
  )
    return;
  const fields = Object.entries(source.data ?? {})
    .filter(([, value]) => typeof value === "string" || typeof value === "number")
    .slice(0, 16)
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");
  aladin.showPopup(
    source.ra,
    source.dec,
    escapeHtml(title),
    `<p>RA ${source.ra.toFixed(6)}° · Dec ${source.dec.toFixed(6)}°</p><table>${fields}</table>`,
  );
}

function catalogOptions(aladin: AladinInstance, id: SkyOverlayId): AladinCatalogOptions {
  const definition = SKY_OVERLAYS.find((entry) => entry.id === id)!;
  return {
    name: definition.label,
    color: definition.color,
    shape: id === "galaxies" ? "rhomb" : id === "clusters" ? "square" : "circle",
    sourceSize: id === "bright-stars" ? 4 : 7,
    onClick: (source) => safeSourcePopup(aladin, definition.label, source),
  };
}

function abortError(): Error {
  return new DOMException("Chargement du catalogue annulé", "AbortError");
}

/** The pinned ProgressiveCat has no load/error callbacks; isReady alone is insufficient. */
function awaitCatalogReady(
  catalog: AladinProgressiveCatalog,
  signal: AbortSignal,
): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    let settled = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, count = 0) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (poll !== undefined) clearTimeout(poll);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(count);
    };
    const abort = () => finish(abortError());
    const deadline = setTimeout(
      () => finish(new Error("Le catalogue distant ne répond pas. Vous pouvez réessayer.")),
      CATALOG_READY_TIMEOUT_MS,
    );
    const inspect = () => {
      if (settled) return;
      if (catalog.isReady) {
        const count = catalog.getSources().length;
        // 3.8.2 can mark a 404 HTML Metadata.xml response ready with zero sources.
        if (!catalog.keyRa || !catalog.keyDec || count === 0) {
          finish(new Error("Le catalogue n’a pas fourni de positions célestes valides."));
        } else finish(undefined, count);
      } else poll = setTimeout(inspect, CATALOG_POLL_MS);
    };
    signal.addEventListener("abort", abort, { once: true });
    inspect();
  });
}

/** Sample the astronomical planes in ICRS/J2000, never in screen coordinates. */
export function celestialPlanePoints(kind: "galactic-plane" | "ecliptic"): number[][] {
  const points: number[][] = [];
  const obliquity = (23.439291111 * Math.PI) / 180;
  for (let degrees = 0; degrees <= 360; degrees += 2) {
    const longitude = (degrees * Math.PI) / 180;
    const c = Math.cos(longitude);
    const s = Math.sin(longitude);
    // Transpose of the standard ICRS -> Galactic rotation matrix (b = 0).
    const [x, y, z] =
      kind === "galactic-plane"
        ? [
            -0.0548755604162154 * c + 0.4941094278755837 * s,
            -0.873437090234885 * c - 0.4448296299600112 * s,
            -0.4838350155487132 * c + 0.746982244497219 * s,
          ]
        : [c, s * Math.cos(obliquity), s * Math.sin(obliquity)];
    points.push([
      ((Math.atan2(y!, x!) * 180) / Math.PI + 360) % 360,
      (Math.asin(Math.max(-1, Math.min(1, z!))) * 180) / Math.PI,
    ]);
  }
  return points;
}

/** Each controller owns only its own catalogues, graphics and comparison image. */
export function createSkyOverlays(
  api: AladinApi,
  aladin: AladinInstance,
  onChange: (snapshot: SkyOverlaySnapshot) => void,
  preferences: SkyOverlayPreferences = {},
): SkyOverlayController {
  const controllerId = ++nextControllerId;
  let disposed = false;
  const snapshot = createSkyOverlaySnapshot(preferences);
  const rendered = new Map<SkyOverlayId, LayerEntry>();
  const pending = new Map<SkyOverlayId, AbortController>();
  let imageSequence = 0;
  let pendingImage: ImageRequest | null = null;
  let activeImage: ImageRequest | null = null;
  let restackingImage: ImageRequest | null = null;
  let viewportTimer: ReturnType<typeof setTimeout> | undefined;
  let gaiaFallback: StellarPointerController | null = null;
  let gaiaFallbackCatalog: AladinStarCatalog | null = null;
  const viewportFallbacks = new Map<"simbad" | "2mass", ViewportFallback>();
  const initialGridEnabled = aladin.getGridOptions().enabled;

  const getSnapshot = (): SkyOverlaySnapshot => ({
    layers: Object.fromEntries(
      Object.entries(snapshot.layers).map(([id, state]) => [id, { ...state }]),
    ) as SkyOverlaySnapshot["layers"],
    image: { ...snapshot.image },
  });
  const publish = () => {
    if (!disposed) onChange(getSnapshot());
  };
  const updateLayer = (id: SkyOverlayId, state: SkyOverlayLayerState) => {
    snapshot.layers[id] = state;
    publish();
  };
  const removeRendered = (id: SkyOverlayId) => {
    const entry = rendered.get(id);
    if (!entry) return;
    entry.layer.hide();
    aladin.removeOverlay(entry.layer);
    rendered.delete(id);
  };
  const stopGaiaFallback = () => {
    gaiaFallback?.dispose();
    gaiaFallback = null;
    if (gaiaFallbackCatalog) aladin.removeOverlay(gaiaFallbackCatalog);
    gaiaFallbackCatalog = null;
  };
  const startGaiaFallback = () => {
    if (disposed || !snapshot.layers.gaia.enabled) return;
    stopGaiaFallback();
    const catalog = api.catalog({
      ...catalogOptions(aladin, "gaia"),
      name: "Gaia DR3 · secours par champ",
      limit: 650,
    });
    gaiaFallbackCatalog = catalog;
    gaiaFallback = createStellarPointers(
      api,
      aladin,
      (status) => {
        if (disposed || !snapshot.layers.gaia.enabled) return;
        const message =
          status.state === "zoom"
            ? "Gaia HiPS indisponible : zoomez sous 8° pour le catalogue de secours."
            : status.state === "loading"
              ? "Gaia HiPS indisponible : recherche des étoiles du champ via le service de secours…"
              : status.state === "fallback"
                ? "Services Gaia indisponibles : seuls des repères d’étoiles brillantes sont disponibles."
                : status.state === "error"
                  ? "Les services Gaia ne répondent pas. Les étoiles brillantes restent accessibles."
                  : `Gaia par champ (secours) : sélection limitée à 650 repères${status.state === "partial" ? ", réponse partielle" : ""}.`;
        updateLayer("gaia", {
          enabled: true,
          state:
            status.state === "loading" ? "loading" : status.state === "error" ? "error" : "ready",
          count: status.count,
          message,
        });
      },
      catalog,
    );
    gaiaFallback.setEnabled(true);
  };

  const stopViewportFallback = (id: SkyOverlayId) => {
    if (id !== "simbad" && id !== "2mass") return;
    viewportFallbacks.get(id)?.dispose();
    viewportFallbacks.delete(id);
  };
  const startViewportFallback = (id: "simbad" | "2mass") => {
    stopViewportFallback(id);
    const definition = SKY_OVERLAYS.find((entry) => entry.id === id)!;
    const catalog = api.catalog({
      ...catalogOptions(aladin, id),
      name: `${definition.label} · secours par champ`,
      limit: 400,
    });
    aladin.addCatalog(catalog);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | null = null;
    let revision = 0;
    const load = async () => {
      if (stopped || disposed || !snapshot.layers[id].enabled) return;
      const [ra, dec] = aladin.getRaDec();
      const [fov] = aladin.getFov();
      const epoch = ++revision;
      if (!Number.isFinite(fov) || fov <= 0 || fov > 8) {
        catalog.removeAll();
        updateLayer(id, {
          enabled: true,
          state: "ready",
          count: 0,
          message: "Catalogue HiPS indisponible : zoomez sous 8° pour les repères de secours.",
        });
        return;
      }
      if (!Number.isFinite(ra) || !Number.isFinite(dec)) return;
      const aborter = new AbortController();
      request = aborter;
      const deadline = setTimeout(() => aborter.abort(), 14_000);
      updateLayer(id, {
        enabled: true,
        state: "loading",
        message:
          "Catalogue HiPS indisponible : chargement des repères du champ via le service de secours…",
      });
      try {
        const query = new URLSearchParams({
          catalog: id,
          ra: (((ra % 360) + 360) % 360).toFixed(6),
          dec: dec.toFixed(6),
          fov: Math.max(0.02, fov).toFixed(6),
        });
        const response = await fetch(`/api/mosaic/catalog?${query}`, { signal: aborter.signal });
        if (!response.ok) throw new Error("Catalogue indisponible");
        const payload = (await response.json()) as { sources?: unknown };
        if (!Array.isArray(payload.sources)) throw new Error("Catalogue mal formé");
        if (stopped || disposed || epoch !== revision || !snapshot.layers[id].enabled) return;
        const sources: AladinStarSource[] = [];
        for (const raw of payload.sources.slice(0, 400)) {
          if (!raw || typeof raw !== "object") continue;
          const { ra: sourceRa, dec: sourceDec, data } = raw as Record<string, unknown>;
          if (
            typeof sourceRa !== "number" ||
            !Number.isFinite(sourceRa) ||
            sourceRa < 0 ||
            sourceRa >= 360 ||
            typeof sourceDec !== "number" ||
            !Number.isFinite(sourceDec) ||
            sourceDec < -90 ||
            sourceDec > 90 ||
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
          )
            continue;
          sources.push(api.source(sourceRa, sourceDec, data as Record<string, unknown>));
        }
        catalog.removeAll();
        catalog.addSources(sources);
        updateLayer(id, {
          enabled: true,
          state: "ready",
          count: sources.length,
          message:
            "Mode secours : sélection du champ, limitée à 400 repères. Zoomez pour explorer davantage.",
        });
      } catch {
        if (stopped || disposed || epoch !== revision || !snapshot.layers[id].enabled) return;
        catalog.removeAll();
        updateLayer(id, {
          enabled: true,
          state: "error",
          message:
            "Le catalogue et son service de secours sont indisponibles. Réessayez cette couche.",
        });
      } finally {
        clearTimeout(deadline);
        if (request === aborter) request = null;
      }
    };
    const schedule = () => {
      if (stopped || disposed) return;
      revision += 1;
      request?.abort();
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void load();
      }, 650);
    };
    viewportFallbacks.set(id, {
      schedule,
      dispose() {
        stopped = true;
        revision += 1;
        request?.abort();
        if (timer !== undefined) clearTimeout(timer);
        catalog.hide();
        aladin.removeOverlay(catalog);
      },
    });
    schedule();
  };

  const attachLocal = async (id: SkyOverlayId, signal: AbortSignal): Promise<LayerEntry | null> => {
    const stillWanted = () => !disposed && !signal.aborted && snapshot.layers[id].enabled;
    if (id === "constellations" || id === "galactic-plane" || id === "ecliptic") {
      const lines =
        id === "constellations"
          ? (await import("@/data/constellations.json")).default.flatMap((entry) => entry.l)
          : [celestialPlanePoints(id)];
      if (!stillWanted()) return null;
      const definition = SKY_OVERLAYS.find((entry) => entry.id === id)!;
      const layer = api.graphicOverlay({
        name: definition.label,
        color: definition.color,
        lineWidth: id === "constellations" ? 1 : 1.5,
      });
      // add() requires a view in Aladin 3.8.2; attach before populating graphics.
      aladin.addOverlay(layer);
      layer.addFootprints(
        lines.filter((points) => points.length > 1).map((points) => api.polyline(points)),
      );
      return { layer, ready: true, count: id === "constellations" ? lines.length : 1 };
    }

    let data: Array<{ ra: number; dec: number; data: Record<string, unknown> }>;
    if (id === "bright-stars") {
      const stars = (await import("@/data/stars.json")).default;
      data = stars.map((star) => ({
        ra: star.r,
        dec: star.d,
        data: {
          Nom: star.n || [star.b, star.c].filter(Boolean).join(" ") || "Étoile brillante",
          Magnitude: star.m,
          Constellation: star.c,
          Catalogue: "Étoiles brillantes Sky Map",
        },
      }));
    } else if (id === "constellation-labels") {
      data = (await import("@/data/constellations.json")).default.map((entry) => ({
        ra: entry.r,
        dec: entry.d,
        data: { Nom: entry.n, Abréviation: entry.id },
      }));
    } else {
      const objects = (await import("@/data/dso.json")).default;
      const families: Record<string, SkyOverlayId> = {
        s: "galaxies",
        e: "galaxies",
        i: "galaxies",
        g: "galaxies",
        gc: "clusters",
        oc: "clusters",
        pos: "clusters",
        pn: "nebulae",
        snr: "nebulae",
        sfr: "nebulae",
        rn: "nebulae",
        dn: "nebulae",
      };
      data = objects
        .filter((object) => families[object.type] === id)
        .map((object) => ({
          ra: object.ra,
          dec: object.dec,
          data: {
            Objet: object.id,
            Nom: object.name,
            Désignation: object.designation,
            Magnitude: object.mag ?? "Non renseignée",
            Description: object.description,
            Catalogue: object.catalog,
          },
        }));
    }
    if (!stillWanted()) return null;
    const options = catalogOptions(aladin, id);
    if (id === "constellation-labels") {
      Object.assign(options, {
        displayLabel: true,
        labelColumn: "Nom",
        labelColor: options.color,
        labelFont: "12px sans-serif",
        sourceSize: 1,
      });
    }
    const layer = api.catalog(options);
    const sources = data.filter((entry) => Number.isFinite(entry.ra) && Number.isFinite(entry.dec));
    layer.addSources(sources.map((entry) => api.source(entry.ra, entry.dec, entry.data)));
    aladin.addCatalog(layer);
    return { layer, ready: true, count: sources.length };
  };

  const loadLayer = async (id: SkyOverlayId) => {
    const aborter = new AbortController();
    pending.get(id)?.abort();
    pending.set(id, aborter);
    const active = () =>
      !disposed &&
      !aborter.signal.aborted &&
      pending.get(id) === aborter &&
      snapshot.layers[id].enabled;
    try {
      let entry = rendered.get(id);
      if (id in PROGRESSIVE_CATALOG_URLS) {
        if (!entry) {
          const url = PROGRESSIVE_CATALOG_URLS[id as keyof typeof PROGRESSIVE_CATALOG_URLS];
          const catalog = api.catalogHiPS(url, catalogOptions(aladin, id));
          entry = { layer: catalog, ready: false };
          rendered.set(id, entry);
          aladin.addCatalog(catalog);
        }
        entry.layer.show();
        const count = await awaitCatalogReady(
          entry.layer as AladinProgressiveCatalog,
          aborter.signal,
        );
        if (!active()) return;
        entry.ready = true;
        entry.count = count;
      } else {
        const local = await attachLocal(id, aborter.signal);
        if (!local) return;
        if (!active()) {
          local.layer.hide();
          aladin.removeOverlay(local.layer);
          return;
        }
        entry = local;
        rendered.set(id, entry);
      }
      if (active() && entry) {
        updateLayer(id, {
          enabled: true,
          state: "ready",
          ...(entry.count !== undefined ? { count: entry.count } : {}),
        });
      }
    } catch {
      if (!active()) return;
      removeRendered(id);
      if (id === "gaia") startGaiaFallback();
      else if (id === "simbad" || id === "2mass") startViewportFallback(id);
      else
        updateLayer(id, {
          enabled: true,
          state: "error",
          message:
            "Cette couche est momentanément indisponible. Réessayez ; les autres couches restent actives.",
        });
    } finally {
      if (pending.get(id) === aborter) pending.delete(id);
    }
  };

  const setEnabled = (id: SkyOverlayId, enabled: boolean) => {
    if (disposed || !SKY_OVERLAYS.some((entry) => entry.id === id)) return;
    pending.get(id)?.abort();
    pending.delete(id);
    if (id === "equatorial-grid") {
      aladin.setCooGrid({ enabled, color: "#94a3b8", opacity: 0.65, showLabels: true });
      updateLayer(id, { enabled, state: enabled ? "ready" : "disabled" });
      return;
    }
    if (!enabled) {
      rendered.get(id)?.layer.hide();
      if (id === "gaia") stopGaiaFallback();
      stopViewportFallback(id);
      updateLayer(id, { enabled: false, state: "disabled" });
      return;
    }
    const entry = rendered.get(id);
    if (entry?.ready) {
      entry.layer.show();
      updateLayer(id, {
        enabled: true,
        state: "ready",
        ...(entry.count !== undefined ? { count: entry.count } : {}),
      });
      return;
    }
    updateLayer(id, { enabled: true, state: "loading" });
    void loadLayer(id);
  };

  const removeImage = (request: ImageRequest | null) => {
    if (!request) return;
    request.aborter.abort();
    request.layer?.setOpacity(0);
    aladin.removeImageLayer(request.name);
  };

  const setImageSurvey = (surveyId: string | null) => {
    if (disposed) return;
    if (surveyId !== null && !HIPS_SURVEYS.some((survey) => survey.id === surveyId)) return;
    if (pendingImage?.surveyId === surveyId && snapshot.image.state === "loading") return;
    if (activeImage?.surveyId === surveyId && snapshot.image.state === "ready") return;
    removeImage(pendingImage);
    pendingImage = null;
    snapshot.image = {
      surveyId,
      opacity: snapshot.image.opacity,
      state: surveyId ? "loading" : "disabled",
    };
    if (surveyId === null) {
      removeImage(activeImage);
      activeImage = null;
      publish();
      return;
    }
    const survey = HIPS_SURVEYS.find((candidate) => candidate.id === surveyId)!;
    const request: ImageRequest = {
      surveyId,
      name: `sky-map-comparison-${controllerId}-${++imageSequence}`,
      aborter: new AbortController(),
    };
    pendingImage = request;
    publish();
    const active = () => !disposed && pendingImage === request && !request.aborter.signal.aborted;
    const fail = () => {
      if (!active()) return;
      removeImage(request);
      pendingImage = null;
      // Keep the previous image visible until a replacement really loads.
      snapshot.image = {
        ...snapshot.image,
        state: "error",
        message: activeImage
          ? "Ce relevé ne répond pas. La superposition précédente reste visible ; réessayez ou désactivez-la."
          : "Ce relevé ne répond pas. Le fond et les autres couches restent disponibles.",
      };
      publish();
    };
    void (async () => {
      try {
        // A base image and a comparison must NEVER share a HiPS cache ID:
        // changing comparison opacity would otherwise also hide a future base.
        const layer = api.imageHiPS(`sky-map-comparison-${controllerId}:${survey.id}`, {
          url: survey.serviceUrl,
          name: `Comparaison · ${survey.label}`,
          opacity: 0,
          successCallback: (loaded) => {
            if (active() || activeImage === request) return;
            loaded.setOpacity(0);
            // The callback runs just BEFORE SDK registration; remove in the next task.
            setTimeout(() => aladin.removeImageLayer(request.name), 0);
          },
          errorCallback: fail,
        });
        request.layer = layer;
        await awaitHipsMetadata(layer, request.aborter.signal);
        if (!active()) return;
        aladin.setOverlayImageLayer(layer, request.name);
        // Cached SDK options may restore opacity: keep the pending layer invisible.
        layer.setOpacity(0);
        await awaitImageLayerReady(layer, request.aborter.signal);
        if (!active()) {
          removeImage(request);
          return;
        }
        removeImage(activeImage);
        activeImage = request;
        pendingImage = null;
        layer.setOpacity(snapshot.image.opacity);
        snapshot.image = { ...snapshot.image, state: "ready" };
        publish();
        ensureImageOnTop();
      } catch {
        fail();
      }
    })();
  };

  const ensureImageOnTop = (): void => {
    const request = activeImage;
    const layer = request?.layer;
    if (disposed || !request || !layer || restackingImage === request) return;
    if (aladin.getStackLayers().at(-1) === request.name) return;
    restackingImage = request;
    let restored = false;
    void (async () => {
      try {
        // Public API only: the same layer keeps its metadata, cache ID and
        // cancellation token. Removing it does not touch the base or catalogues.
        aladin.removeImageLayer(request.name);
        aladin.setOverlayImageLayer(layer, request.name);
        layer.setOpacity(snapshot.image.opacity);
        await awaitImageLayerReady(layer, request.aborter.signal);
        if (disposed || activeImage !== request || request.aborter.signal.aborted) return;
        layer.setOpacity(snapshot.image.opacity);
        restored = true;
      } catch {
        if (disposed || activeImage !== request || request.aborter.signal.aborted) return;
        snapshot.image = {
          ...snapshot.image,
          state: "error",
          message:
            "La superposition n’a pas pu être replacée au premier plan. Réessayez cette image.",
        };
        publish();
      } finally {
        if (restackingImage === request) restackingImage = null;
        // Another published layer may have arrived during this reattachment.
        if (restored) ensureImageOnTop();
      }
    })();
  };

  const refreshViewport = () => {
    if (disposed) return;
    gaiaFallback?.schedule();
    for (const fallback of viewportFallbacks.values()) fallback.schedule();
    if (viewportTimer !== undefined) clearTimeout(viewportTimer);
    viewportTimer = setTimeout(() => {
      if (disposed) return;
      for (const id of Object.keys(PROGRESSIVE_CATALOG_URLS) as Array<
        keyof typeof PROGRESSIVE_CATALOG_URLS
      >) {
        const entry = rendered.get(id);
        if (!entry?.ready || !snapshot.layers[id].enabled) continue;
        const count = (entry.layer as AladinCatalogLayer).getSources().length;
        entry.count = count;
        snapshot.layers[id] = { enabled: true, state: "ready", count };
      }
      publish();
    }, 1_000);
  };

  publish();
  for (const { id } of SKY_OVERLAYS) {
    if (snapshot.layers[id].enabled) setEnabled(id, true);
  }
  if (snapshot.image.surveyId) setImageSurvey(snapshot.image.surveyId);

  return {
    setEnabled,
    retry(id) {
      if (disposed || !SKY_OVERLAYS.some((entry) => entry.id === id)) return;
      pending.get(id)?.abort();
      pending.delete(id);
      removeRendered(id);
      if (id === "gaia") stopGaiaFallback();
      stopViewportFallback(id);
      setEnabled(id, true);
    },
    setImageSurvey,
    setImageOpacity(opacity) {
      if (disposed || !Number.isFinite(opacity)) return;
      snapshot.image.opacity = Math.min(1, Math.max(0, opacity));
      activeImage?.layer?.setOpacity(snapshot.image.opacity);
      publish();
    },
    ensureImageOnTop,
    refreshViewport,
    getSnapshot,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const request of pending.values()) request.abort();
      pending.clear();
      if (viewportTimer !== undefined) clearTimeout(viewportTimer);
      stopGaiaFallback();
      for (const fallback of viewportFallbacks.values()) fallback.dispose();
      viewportFallbacks.clear();
      for (const id of rendered.keys()) removeRendered(id);
      removeImage(pendingImage);
      removeImage(activeImage);
      pendingImage = null;
      activeImage = null;
      aladin.setCooGrid({ enabled: initialGridEnabled });
    },
  };
}
