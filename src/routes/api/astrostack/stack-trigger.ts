import { createFileRoute } from "@tanstack/react-router";

/**
 * Le déclenchement reste exposé afin que le client reçoive une erreur explicite
 * tant que le worker scientifique (calibration, astrométrie et stacking) n'est
 * pas déployé. Aucun master ou score factice n'est créé.
 */
export const Route = createFileRoute("/api/astrostack/stack-trigger")({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({
            error: "Le worker scientifique AstroStack n'est pas encore déployé.",
            code: "STACKING_WORKER_NOT_CONFIGURED",
          }),
          {
            status: 501,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        ),
    },
  },
});
