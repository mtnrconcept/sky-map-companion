import type { AladinImageSurvey } from "./aladin-lite";

const HIPS_READY_TIMEOUT_MS = 15_000;
const HIPS_READY_POLL_MS = 100;

function abortError(): Error {
  return new DOMException("Chargement de la couche annulé", "AbortError");
}

/** A HiPS metadata promise alone does not mean the SDK attached the image layer. */
export function awaitHipsMetadata(
  layer: AladinImageSurvey,
  signal?: AbortSignal,
): Promise<AladinImageSurvey> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      void layer.query?.catch(() => undefined);
      reject(abortError());
      return;
    }
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error !== undefined) reject(error);
      else resolve(layer);
    };
    const abort = () => finish(abortError());
    const timer = setTimeout(
      () => finish(new Error("Le serveur du relevé ne répond pas. Réessayez cette couche.")),
      HIPS_READY_TIMEOUT_MS,
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (!layer.query) {
      finish(new Error("Les métadonnées du relevé HiPS sont indisponibles."));
      return;
    }
    // Handle rejection even after cancellation: no unhandled network promise.
    void layer.query.then(
      () => finish(),
      (error: unknown) => finish(error),
    );
  });
}

/**
 * Aladin 3.8.2 setBaseImageLayer/setOverlayImageLayer return a HiPS object
 * synchronously. Its `added` flag is set after the WebGL layer is installed.
 * Do not wrap that return value in Promise.resolve and report a false success.
 */
export function awaitImageLayerReady(
  layer: AladinImageSurvey,
  signal?: AbortSignal,
): Promise<AladinImageSurvey> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      void layer.query?.catch(() => undefined);
      reject(abortError());
      return;
    }
    let settled = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (poll !== undefined) clearTimeout(poll);
      signal?.removeEventListener("abort", abort);
      if (error !== undefined) reject(error);
      else resolve(layer);
    };
    const abort = () => finish(abortError());
    const deadline = setTimeout(
      () => finish(new Error("La couche n’a pas pu être affichée. Réessayez le chargement.")),
      HIPS_READY_TIMEOUT_MS,
    );
    signal?.addEventListener("abort", abort, { once: true });
    const inspect = () => {
      if (settled) return;
      if (layer.added === true) finish();
      else poll = setTimeout(inspect, HIPS_READY_POLL_MS);
    };
    void layer.query?.catch((error: unknown) => finish(error));
    inspect();
  });
}
