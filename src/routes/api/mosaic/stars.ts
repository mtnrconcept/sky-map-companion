import { createFileRoute } from "@tanstack/react-router";
import {
  angularDistanceDegrees,
  buildGaiaViewportQueries,
  buildNearestGaiaQuery,
  mergeGaiaStars,
  parseGaiaTapResponse,
  validateGaiaViewport,
  type GaiaStar,
} from "@/features/mosaic/domain/gaia-stars";

const GAIA_TAP_URL = "https://gaia.ari.uni-heidelberg.de/tap/sync";
const GAIA_TIMEOUT_MS = 9_000;
const CACHE_HEADER = "public, max-age=30, s-maxage=150, stale-while-revalidate=300";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function apiResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      ...JSON_HEADERS,
      "Cache-Control": status === 200 ? CACHE_HEADER : "no-store",
    },
  });
}

async function fetchGaia(query: string): Promise<GaiaStar[]> {
  const response = await fetch(GAIA_TAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      REQUEST: "doQuery",
      LANG: "ADQL",
      FORMAT: "json",
      QUERY: query,
    }),
    signal: AbortSignal.timeout(GAIA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Gaia TAP HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 300_000) throw new Error("Réponse Gaia trop volumineuse");
  return parseGaiaTapResponse(JSON.parse(text));
}

export const Route = createFileRoute("/api/mosaic/stars")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const viewport = validateGaiaViewport(params);
        if (!viewport) return apiResponse({ error: "Champ céleste invalide." }, 400);

        if (params.get("mode") === "nearest") {
          const radius = Number(params.get("radius"));
          if (!Number.isFinite(radius) || radius < 0.001 || radius > 0.07) {
            return apiResponse({ error: "Rayon de sélection invalide." }, 400);
          }
          try {
            const nearby = await fetchGaia(
              buildNearestGaiaQuery(viewport.ra, viewport.dec, radius),
            );
            const candidate = nearby
              .map((star) => ({ star, distance: angularDistanceDegrees(star, viewport) }))
              .sort((a, b) => a.distance - b.distance)[0];
            return apiResponse({
              star: candidate && candidate.distance <= radius ? candidate.star : null,
              catalog: "Gaia DR3",
            });
          } catch {
            return apiResponse({ error: "Identification Gaia temporairement indisponible." }, 503);
          }
        }

        if (params.has("mode")) return apiResponse({ error: "Mode invalide." }, 400);

        const queries = buildGaiaViewportQueries(viewport.ra, viewport.dec, viewport.fov);
        const results = await Promise.allSettled(queries.map(fetchGaia));
        const successful = results.filter(
          (item): item is PromiseFulfilledResult<GaiaStar[]> => item.status === "fulfilled",
        );
        if (successful.length === 0) {
          return apiResponse({ error: "Catalogue Gaia temporairement indisponible." }, 503);
        }
        return apiResponse({
          stars: mergeGaiaStars(successful.map((item) => item.value)),
          partial: successful.length !== queries.length,
          catalog: "Gaia DR3",
        });
      },
    },
  },
});
