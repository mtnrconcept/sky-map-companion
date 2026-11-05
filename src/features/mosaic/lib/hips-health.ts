import { FEDERATED_BASE_SURVEY_URL } from "../domain/hips-surveys";

// Official, independent DSS2 HiPS mirrors published by the CDS registry.
// Remote data are federated: tiles are never downloaded into Sky Map Storage.
export const DSS2_HIPS_MIRRORS = [
  "https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color",
  "https://stpubdata.s3.us-east-1.amazonaws.com/mast/skybackgrounds/DSSColor",
  "https://skies.esac.esa.int/DSSColor",
  "https://alaskybis.cds.unistra.fr/DSS/DSSColor",
  FEDERATED_BASE_SURVEY_URL,
] as const;

const MIRROR_PROBE_TIMEOUT_MS = 3_000;

export interface SelectedHipsMirror {
  url: string;
  verified: boolean;
}

async function mirrorIsHealthy(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = globalThis.setTimeout(abort, MIRROR_PROBE_TIMEOUT_MS);

  try {
    const properties = await fetch(`${baseUrl}/properties`, {
      cache: "no-store",
      mode: "cors",
      signal: controller.signal,
    });
    if (!properties.ok) return false;
    const metadata = await properties.text();
    if (!/creator_did\s*=\s*ivo:\/\/CDS\/P\/DSS2\/color/.test(metadata)) return false;
    if (!/hips_tile_format\s*=\s*jpeg/.test(metadata)) return false;

    // A valid properties file does not guarantee that imagery is served.
    // Check an actual low-resolution sky tile before selecting a mirror.
    const tile = await fetch(`${baseUrl}/Norder0/Dir0/Npix0.jpg`, {
      cache: "force-cache",
      mode: "cors",
      signal: controller.signal,
    });
    return tile.ok && !(tile.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function resolveHealthyDss2Mirror(signal?: AbortSignal): Promise<SelectedHipsMirror> {
  for (const url of DSS2_HIPS_MIRRORS) {
    if (signal?.aborted) break;
    if (await mirrorIsHealthy(url, signal)) return { url, verified: true };
  }

  // Keep Aladin interactive even if every probe fails (e.g. an offline client).
  // The UI will clearly report that the optical background is unverified.
  return { url: DSS2_HIPS_MIRRORS[0], verified: false };
}
