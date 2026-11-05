import { HIPS_SURVEYS, mocUrlForSurvey } from "../domain/hips-surveys";
import type { AladinApi, AladinMoc } from "./aladin-lite";

const MOC_REQUEST_TIMEOUT_MS = 4_500;

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

  // Registry union is a last resort; it can be slower than a HiPS-local MOC.
  candidates.push(mocUrlForSurvey(surveyId));
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
export async function loadSurveyMoc(api: AladinApi, surveyId: string): Promise<AladinMoc> {
  let lastError: unknown;
  for (const url of mocSourcesForSurvey(surveyId)) {
    try {
      return await readMoc(api, surveyId, url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Empreinte MOC indisponible");
}
