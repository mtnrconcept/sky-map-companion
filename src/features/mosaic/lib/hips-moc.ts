import { HIPS_SURVEYS } from "../domain/hips-surveys";
import type { AladinApi, AladinMoc } from "./aladin-lite";

const MOC_REQUEST_TIMEOUT_MS = 4_500;
const FAILED_COVERAGE_BACKOFF_MS = 10 * 60 * 1_000;
const failedCoverageUntil = new Map<string, number>();

export interface LoadedSurveyMoc {
  moc: AladinMoc;
  hipsUrl: string;
}

/** Each candidate is an official remote HiPS endpoint: never a client-provided URL. */
export function mocSourcesForSurvey(surveyId: string): string[] {
  const survey = HIPS_SURVEYS.find((entry) => entry.id === surveyId);
  if (!survey) throw new Error(`Relevé HiPS inconnu : ${surveyId}`);

  const service = new URL(survey.serviceUrl);
  const main = `${service.href.replace(/\/$/, "")}/Moc.fits`;
  const candidates = [main];

  // The CDS HiPS registry declares an independent mirror for several surveys.
  if (service.hostname === "alasky.cds.unistra.fr") {
    service.hostname = "alaskybis.cds.unistra.fr";
    candidates.push(`${service.href.replace(/\/$/, "")}/Moc.fits`);
  }

  // No central MocServer fallback: it repeatedly times out for users on
  // restricted networks. Unknown coverage simply disables this optional
  // high-resolution survey; the public all-sky base stays available.
  return [...new Set(candidates)];
}

function readMoc(api: AladinApi, surveyId: string, url: string): Promise<AladinMoc> {
  return new Promise<AladinMoc>((resolve, reject) => {
    let complete = false;
    let moc: AladinMoc | undefined;
    const finish = (error?: unknown) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (moc) resolve(moc);
      else reject(new Error("Réponse MOC vide"));
    };

    const timer = globalThis.setTimeout(
      () => finish(new Error(`Serveur MOC lent : ${new URL(url).hostname}`)),
      MOC_REQUEST_TIMEOUT_MS,
    );

    try {
      moc = api.MOCFromURL(
        url,
        { name: `coverage:${surveyId}`, fill: false, perimeter: false, edge: false },
        () => finish(),
        (error) => finish(error ?? new Error("Échec MOC")),
      );
    } catch (error) {
      finish(error);
    }
  });
}

/** A missing remote footprint never grants coverage and never blocks the main canvas. */
export async function loadSurveyMoc(
  api: AladinApi,
  surveyId: string,
  options: { forceRetry?: boolean } = {},
): Promise<LoadedSurveyMoc> {
  const retryAfter = failedCoverageUntil.get(surveyId) ?? 0;
  if (!options.forceRetry && retryAfter > Date.now()) {
    throw new Error("Empreinte HiPS temporairement indisponible (nouvel essai différé)");
  }

  let lastError: unknown;
  for (const url of mocSourcesForSurvey(surveyId)) {
    try {
      const moc = await readMoc(api, surveyId, url);
      failedCoverageUntil.delete(surveyId);
      return { moc, hipsUrl: url.slice(0, -"/Moc.fits".length) };
    } catch (error) {
      lastError = error;
    }
  }
  // A failed network never grants geographic coverage, and does not start
  // another wave of timeouts on every React remount or route navigation.
  failedCoverageUntil.set(surveyId, Date.now() + FAILED_COVERAGE_BACKOFF_MS);
  throw lastError instanceof Error ? lastError : new Error("Empreinte MOC indisponible");
}
