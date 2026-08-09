import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateRequest, createAdminClient, noStoreJson } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/cosmos/analyze-cluster")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticateRequest(request);
        if (!user) return noStoreJson({ error: "Authentification requise." }, { status: 401 });
        const parsed = z
          .object({ observation_id: z.string().uuid() })
          .safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return noStoreJson({ error: "Observation invalide." }, { status: 400 });

        const admin = createAdminClient();
        const { data: observation } = await admin
          .from("cosmos_observations")
          .select("id,user_id,status,event_id")
          .eq("id", parsed.data.observation_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!observation)
          return noStoreJson({ error: "Observation introuvable." }, { status: 404 });

        const idempotencyKey = `cosmos-cluster:${observation.id}`;
        const { error: queueError } = await admin.from("processing_jobs").upsert(
          {
            job_type: "cluster_cosmos",
            cosmos_observation_id: observation.id,
            owner_user_id: user.id,
            status: "uploaded",
            idempotency_key: idempotencyKey,
          },
          { onConflict: "idempotency_key", ignoreDuplicates: true },
        );
        if (queueError)
          return noStoreJson({ error: "Impossible de mettre l’analyse en file." }, { status: 500 });

        const { data: job, error } = await admin
          .from("processing_jobs")
          .select("id,status,progress,error_code,attempts,updated_at,completed_at")
          .eq("idempotency_key", idempotencyKey)
          .single();
        if (error) return noStoreJson({ error: "Job d’analyse introuvable." }, { status: 500 });
        return noStoreJson({ observation, job }, { status: 202 });
      },
    },
  },
});
