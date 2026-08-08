import { createFileRoute } from "@tanstack/react-router";

/**
 * La qualification exige une vraie lecture des pixels, une résolution
 * astrométrique et le worker scientifique. Cette route refuse donc de produire
 * un score dérivé uniquement des métadonnées ou de l'IA textuelle.
 */
export const Route = createFileRoute("/api/astrostack/qualify")({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({
            error: "Le worker de qualification scientifique n'est pas encore déployé.",
            code: "QUALIFICATION_WORKER_NOT_CONFIGURED",
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
