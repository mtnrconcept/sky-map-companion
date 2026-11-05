import {
  angularDistanceDegrees,
  type GaiaStar,
  type GaiaStarsResponse,
} from "../domain/gaia-stars";
import type { AladinApi, AladinInstance, AladinStarCatalog, AladinStarSource } from "./aladin-lite";

export interface StellarPointerStatus {
  state: "zoom" | "loading" | "ready" | "partial" | "fallback" | "disabled" | "error";
  count: number;
  source: "Gaia DR3" | "étoiles brillantes";
}

export interface StellarPointerController {
  schedule(): void;
  setEnabled(enabled: boolean): void;
  identify(ra: number, dec: number): void;
  dispose(): void;
}

function validCoordinate(ra: number, dec: number): boolean {
  return (
    Number.isFinite(ra) && ra >= 0 && ra < 360 && Number.isFinite(dec) && dec >= -90 && dec <= 90
  );
}

function sanitizedPopup(star: GaiaStar): string {
  return (
    `<p><strong>Magnitude Gaia G :</strong> ${star.mag.toFixed(2)}</p>` +
    `<p>RA : ${star.ra.toFixed(6)}° · Dec : ${star.dec.toFixed(6)}°</p>` +
    "<p>Source : ESA / Gaia DR3 (positions astrométriques)</p>"
  );
}

function updateCatalog(
  api: AladinApi,
  catalog: AladinStarCatalog,
  stars: readonly GaiaStar[],
): void {
  const aladinSources: AladinStarSource[] = stars.map((star) =>
    api.source(star.ra, star.dec, {
      Identification: star.id,
      "Magnitude G": star.mag.toFixed(2),
      "RA (°)": star.ra.toFixed(6),
      "Dec (°)": star.dec.toFixed(6),
      Catalogue: star.id.startsWith("Gaia DR3") ? "ESA / Gaia DR3" : "Étoiles brillantes Sky Map",
    }),
  );
  catalog.removeAll();
  if (aladinSources.length > 0) catalog.addSources(aladinSources);
}

async function brightStarFallback(
  center: { ra: number; dec: number },
  fov: number,
): Promise<GaiaStar[]> {
  const { default: data } = await import("@/data/stars.json");
  const radius = Math.min(10, fov * 0.78);
  return data
    .filter(
      (star) =>
        star.m <= 6 && angularDistanceDegrees({ ra: star.r, dec: star.d }, center) <= radius,
    )
    .slice(0, 300)
    .map((star) => ({
      id: star.n || `${star.b || "Étoile"} ${star.c}`.trim(),
      ra: star.r,
      dec: star.d,
      mag: star.m,
    }));
}

export function createStellarPointers(
  api: AladinApi,
  aladin: AladinInstance,
  onStatus: (status: StellarPointerStatus) => void,
  ownedCatalog?: AladinStarCatalog,
): StellarPointerController {
  const catalog =
    ownedCatalog ??
    api.catalog({
      name: "Repères stellaires interactifs · Gaia DR3",
      shape: "circle",
      color: "#ffb547",
      sourceSize: 7,
      limit: 650,
      onClick: "showPopup",
    });
  aladin.addCatalog(catalog);

  let disposed = false;
  let enabled = true;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let aborter: AbortController | null = null;
  let sequence = 0;
  let lastViewport: { ra: number; dec: number; fov: number } | null = null;
  let lastIdentifySequence = 0;

  const notify = (
    state: StellarPointerStatus["state"],
    count: number,
    source: StellarPointerStatus["source"] = "Gaia DR3",
  ) => {
    if (!disposed) onStatus({ state, count, source });
  };

  const load = async () => {
    if (disposed || !enabled) return;
    const [ra, dec] = aladin.getRaDec();
    const fovs = aladin.getFov();
    const fov = Array.isArray(fovs) ? fovs[0] : Number.NaN;
    if (!validCoordinate(ra, dec) || !Number.isFinite(fov)) return;
    if (fov > 8 || fov <= 0) {
      aborter?.abort();
      catalog.removeAll();
      lastViewport = null;
      notify("zoom", 0);
      return;
    }
    if (
      lastViewport &&
      angularDistanceDegrees(lastViewport, { ra, dec }) < fov * 0.15 &&
      Math.abs(lastViewport.fov / fov - 1) < 0.15
    )
      return;
    lastViewport = { ra, dec, fov };
    aborter?.abort();
    const controller = new AbortController();
    aborter = controller;
    const seq = ++sequence;
    notify("loading", 0);
    try {
      const params = new URLSearchParams({
        ra: ra.toFixed(5),
        dec: dec.toFixed(5),
        // Keep deep-zoom markers available while respecting the server's
        // minimum query field. The map naturally clips offscreen sources.
        fov: Math.max(0.02, fov).toFixed(5),
      });
      const response = await fetch(`/api/mosaic/stars?${params}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Gaia HTTP ${response.status}`);
      const payload = (await response.json()) as GaiaStarsResponse;
      if (!Array.isArray(payload.stars)) throw new Error("Catalogue Gaia mal formé");
      const stars = payload.stars.filter(
        (s) =>
          s && typeof s.id === "string" && validCoordinate(s.ra, s.dec) && Number.isFinite(s.mag),
      );
      if (disposed || !enabled || seq !== sequence) return;
      updateCatalog(api, catalog, stars);
      notify(payload.partial ? "partial" : "ready", stars.length);
    } catch (reason) {
      if (controller.signal.aborted || disposed || !enabled || seq !== sequence) return;
      try {
        const fallback = await brightStarFallback({ ra, dec }, fov);
        if (disposed || !enabled || seq !== sequence) return;
        updateCatalog(api, catalog, fallback);
        notify("fallback", fallback.length, "étoiles brillantes");
      } catch {
        if (disposed || seq !== sequence) return;
        catalog.removeAll();
        notify("error", 0);
      }
    }
  };

  const schedule = () => {
    if (disposed || !enabled) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void load();
    }, 650);
  };

  const setEnabled = (value: boolean) => {
    if (disposed) return;
    enabled = value;
    if (!enabled) {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      aborter?.abort();
      sequence += 1;
      catalog.hide();
      notify("disabled", 0);
    } else {
      catalog.show();
      lastViewport = null;
      schedule();
    }
  };

  const identify = (ra: number, dec: number) => {
    if (!enabled || disposed || !validCoordinate(ra, dec)) return;
    const fovs = aladin.getFov();
    const fov = Array.isArray(fovs) ? fovs[0] : Number.NaN;
    if (!Number.isFinite(fov) || fov > 8 || fov <= 0) return;
    const selection = ++lastIdentifySequence;
    const radius = Math.min(0.04, Math.max(0.0015, (fov / 900) * 8));
    aladin.showPopup(ra, dec, "Identification stellaire", "Recherche Gaia DR3…");
    const params = new URLSearchParams({
      mode: "nearest",
      ra: ra.toFixed(6),
      dec: dec.toFixed(6),
      fov: Math.max(0.02, fov).toFixed(5),
      radius: radius.toFixed(6),
    });
    void fetch(`/api/mosaic/stars?${params}`, { signal: AbortSignal.timeout(11_000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Gaia indisponible");
        return response.json() as Promise<{ star: GaiaStar | null }>;
      })
      .then(({ star }) => {
        if (disposed || !enabled || selection !== lastIdentifySequence) return;
        if (star && validCoordinate(star.ra, star.dec) && /^Gaia DR3 \d+$/.test(star.id)) {
          aladin.showPopup(star.ra, star.dec, star.id, sanitizedPopup(star));
        } else {
          aladin.showPopup(
            ra,
            dec,
            "Position céleste",
            `Aucune source Gaia suffisamment proche.<br/>RA : ${ra.toFixed(5)}° · Dec : ${dec.toFixed(5)}°`,
          );
        }
      })
      .catch(() => {
        if (disposed || !enabled || selection !== lastIdentifySequence) return;
        aladin.showPopup(
          ra,
          dec,
          "Position céleste",
          `Catalogue Gaia temporairement indisponible.<br/>RA : ${ra.toFixed(5)}° · Dec : ${dec.toFixed(5)}°`,
        );
      });
  };

  return {
    schedule,
    setEnabled,
    identify,
    dispose() {
      disposed = true;
      aborter?.abort();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      catalog.removeAll();
      catalog.hide();
    },
  };
}
