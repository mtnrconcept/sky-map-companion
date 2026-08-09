import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateRequest, createAdminClient, noStoreJson } from "@/lib/api-auth.server";

/**
 * Le déclenchement reste exposé afin que le client reçoive une erreur explicite
 * tant que le worker scientifique (calibration, astrométrie et stacking) n'est
 * pas déployé. Aucun master ou score factice n'est créé.
 */
export const Route = createFileRoute("/api/astrostack/stack-trigger")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticateRequest(request);
        if (!user) return noStoreJson({ error: "Authentification requise." }, { status: 401 });
        const input = z
          .object({ object_id: z.string().min(1).max(50) })
          .safeParse(await request.json().catch(() => null));
        if (!input.success) return noStoreJson({ error: "Objet invalide." }, { status: 400 });
        const suppliedKey = request.headers.get("idempotency-key")?.trim();
        const idempotencyKey =
          suppliedKey && suppliedKey.length <= 200
            ? `stack:${user.id}:${input.data.object_id}:${suppliedKey}`
            : `stack:${user.id}:${input.data.object_id}:${crypto.randomUUID()}`;
        const admin = createAdminClient();
        const { data, error } = await admin.rpc("request_stack_job", {
          p_object_id: input.data.object_id,
          p_user_id: user.id,
          p_idempotency_key: idempotencyKey,
        });
        if (error) {
          const insufficient = error.message.includes("three approved light");
          return noStoreJson(
            {
              error: insufficient
                ? "Trois LIGHT validées au minimum sont requises."
                : "Impossible de créer le job de stacking.",
            },
            { status: insufficient ? 409 : 500 },
          );
        }
        return noStoreJson({ job: data }, { status: 202 });
      },
    },
  },
});
