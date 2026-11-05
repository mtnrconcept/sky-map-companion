import { hipsServiceUrlForSurvey } from "../domain/hips-surveys";
import type { AladinApi, AladinInstance } from "./aladin-lite";
import { awaitHipsMetadata, awaitImageLayerReady } from "./hips-layer-ready";

/** Only the most recent user/automatic selection may replace a viewer's base. */
export function createBaseSurveyController(api: AladinApi, aladin: AladinInstance) {
  let pending: AbortController | null = null;
  let disposed = false;

  return {
    async select(survey: string, name = "Fond céleste"): Promise<boolean> {
      if (disposed) return false;
      pending?.abort();
      const aborter = new AbortController();
      pending = aborter;
      const current = () => !disposed && pending === aborter && !aborter.signal.aborted;
      try {
        const url = hipsServiceUrlForSurvey(survey);
        // Image overlays have separate IDs, so hiding one cannot cache a
        // zero-opacity setting for this base image in Aladin 3.8.2.
        const layer = api.imageHiPS(`sky-map-base:${url}`, { url, name, opacity: 1 });
        await awaitHipsMetadata(layer, aborter.signal);
        if (!current()) return false;
        aladin.setBaseImageLayer(layer);
        await awaitImageLayerReady(layer, aborter.signal);
        if (!current()) return false;
        layer.setOpacity(1);
        return true;
      } catch (reason) {
        if (!current()) return false;
        throw reason;
      } finally {
        if (pending === aborter) pending = null;
      }
    },
    cancel() {
      pending?.abort();
      pending = null;
    },
    dispose() {
      disposed = true;
      pending?.abort();
      pending = null;
    },
  };
}
