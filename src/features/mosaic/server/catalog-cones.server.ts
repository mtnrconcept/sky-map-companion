import {
  buildCatalogConeQuery,
  CATALOG_CONE_MAX_BYTES,
  parseSimbadConeResponse,
  parseTwoMassConeTsv,
  validateCatalogConeViewport,
  type CatalogConeResponse,
  type ConeCatalogId,
} from "../domain/catalog-cones";

const CATALOG_TIMEOUT_MS = 12_000;
const PROVIDERS: Record<ConeCatalogId, { url: string; format: string; accept: string }> = {
  simbad: {
    // Official Harvard mirror: https://simbad.harvard.edu/simbad/
    url: "https://simbad.harvard.edu/simbad/sim-tap/sync",
    format: "json",
    accept: "application/json",
  },
  "2mass": {
    // https://irsa.ipac.caltech.edu/docs/program_interface/TAP.html
    url: "https://irsa.ipac.caltech.edu/TAP/sync",
    format: "TSV",
    accept: "text/tab-separated-values",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":
        status === 200
          ? "public, max-age=30, s-maxage=120, stale-while-revalidate=300"
          : "no-store",
    },
  });
}

/** Bound bytes while streaming, before decoding/parsing an external response. */
async function boundedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > CATALOG_CONE_MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("Réponse de catalogue trop volumineuse.");
  }
  if (!response.body) throw new Error("Réponse de catalogue vide.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CATALOG_CONE_MAX_BYTES) {
        await reader.cancel();
        throw new Error("Réponse de catalogue trop volumineuse.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** Fixed providers only; no user-supplied URL, catalogue name, columns or ADQL. */
export async function handleCatalogConeRequest(
  request: Request,
  fetchProvider: typeof fetch = fetch,
): Promise<Response> {
  const viewport = validateCatalogConeViewport(new URL(request.url).searchParams);
  if (!viewport) {
    return jsonResponse(
      { error: "Catalogue ou champ céleste invalide (zoom de 0,02° à 8°)." },
      400,
    );
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(abort, CATALOG_TIMEOUT_MS);
  const label = viewport.catalog === "simbad" ? "SIMBAD" : "2MASS";
  try {
    if (controller.signal.aborted) throw new Error("Requête annulée.");
    const provider = PROVIDERS[viewport.catalog];
    const url = new URL(provider.url);
    url.search = new URLSearchParams({
      REQUEST: "doQuery",
      LANG: "ADQL",
      FORMAT: provider.format,
      QUERY: buildCatalogConeQuery(viewport),
    }).toString();
    const response = await fetchProvider(url.toString(), {
      signal: controller.signal,
      headers: { Accept: provider.accept },
      // An upstream redirect must not turn this fixed-provider endpoint into a proxy.
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Catalogue distant indisponible.");
    }
    const text = await boundedResponseText(response);
    if (controller.signal.aborted) throw new Error("Requête annulée.");
    const sources =
      viewport.catalog === "simbad"
        ? parseSimbadConeResponse(JSON.parse(text))
        : parseTwoMassConeTsv(text);
    const payload: CatalogConeResponse = { catalog: label, sources, limited: true };
    return jsonResponse(payload);
  } catch {
    return jsonResponse(
      {
        error: `Catalogue ${label} temporairement indisponible. Réessayez dans quelques instants.`,
      },
      503,
    );
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
  }
}
