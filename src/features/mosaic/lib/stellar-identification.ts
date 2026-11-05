import type { GaiaStar } from "../domain/gaia-stars";
import type { AladinInstance } from "./aladin-lite";

export interface StellarIdentifier {
  setEnabled(enabled: boolean): void;
  identify(ra: number, dec: number): void;
  cancel(): void;
  dispose(): void;
}

/** A precise click lookup, independent of the progressive display catalogues. */
export function createStellarIdentifier(aladin: AladinInstance): StellarIdentifier {
  let enabled = true;
  let disposed = false;
  let request: AbortController | null = null;
  let sequence = 0;

  const cancel = () => {
    sequence += 1;
    request?.abort();
    request = null;
  };

  return {
    cancel,
    setEnabled(value) {
      enabled = value;
      if (!value) cancel();
    },
    identify(ra, dec) {
      if (
        !enabled ||
        disposed ||
        !Number.isFinite(ra) ||
        ra < 0 ||
        ra >= 360 ||
        !Number.isFinite(dec) ||
        dec < -90 ||
        dec > 90
      )
        return;
      const [fov] = aladin.getFov();
      if (!Number.isFinite(fov) || fov <= 0 || fov > 8) return;

      cancel();
      const current = sequence;
      const controller = new AbortController();
      request = controller;
      const timer = setTimeout(() => controller.abort(), 11_000);
      const radius = Math.min(0.04, Math.max(0.0015, (fov / 900) * 8));
      const params = new URLSearchParams({
        mode: "nearest",
        ra: ra.toFixed(6),
        dec: dec.toFixed(6),
        // The display can zoom past the minimum cone-search field.
        fov: Math.max(0.02, fov).toFixed(5),
        radius: radius.toFixed(6),
      });
      const isCurrent = () => !disposed && enabled && current === sequence;
      aladin.showPopup(ra, dec, "Identification stellaire", "Recherche Gaia DR3…");
      void fetch(`/api/mosaic/stars?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Gaia indisponible");
          return response.json() as Promise<{ star?: GaiaStar | null }>;
        })
        .then(({ star }) => {
          if (!isCurrent()) return;
          if (
            star &&
            typeof star.id === "string" &&
            /^Gaia DR3 \d{8,22}$/.test(star.id) &&
            Number.isFinite(star.ra) &&
            star.ra >= 0 &&
            star.ra < 360 &&
            Number.isFinite(star.dec) &&
            star.dec >= -90 &&
            star.dec <= 90 &&
            Number.isFinite(star.mag)
          ) {
            aladin.showPopup(
              star.ra,
              star.dec,
              star.id,
              `<p>Magnitude Gaia G : ${star.mag.toFixed(2)}</p>` +
                `<p>RA : ${star.ra.toFixed(6)}° · Dec : ${star.dec.toFixed(6)}°</p>` +
                "<p>Source : ESA / Gaia DR3</p>",
            );
          } else {
            aladin.showPopup(
              ra,
              dec,
              "Position céleste",
              `Aucune source Gaia suffisamment proche.<br>RA : ${ra.toFixed(5)}° · Dec : ${dec.toFixed(5)}°`,
            );
          }
        })
        .catch(() => {
          if (!isCurrent()) return;
          aladin.showPopup(
            ra,
            dec,
            "Position céleste",
            `Identification Gaia temporairement indisponible.<br>RA : ${ra.toFixed(5)}° · Dec : ${dec.toFixed(5)}°`,
          );
        })
        .finally(() => {
          clearTimeout(timer);
          if (request === controller) request = null;
        });
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
