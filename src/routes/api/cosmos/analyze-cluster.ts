import { createFileRoute } from "@tanstack/react-router";

/**
 * Le clustering scientifique doit être exécuté par une file de travaux
 * authentifiée. L'ancien endpoint public utilisait le rôle service et pouvait
 * fabriquer un événement à partir d'une réponse IA ; il reste donc fermé.
 */
export const Route = createFileRoute("/api/cosmos/analyze-cluster")({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({
            error: "Le worker de clustering scientifique n'est pas encore déployé.",
            code: "CLUSTER_WORKER_NOT_CONFIGURED",
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
