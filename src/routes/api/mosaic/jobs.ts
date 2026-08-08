import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateRequest, createAdminClient, noStoreJson } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/mosaic/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await authenticateRequest(request);
        if (!user) return noStoreJson({ error: "Authentification requise." }, { status: 401 });
        const admin = createAdminClient();
        const { data, error } = await admin
          .from("processing_jobs")
          .select(
            "id,job_type,upload_id,object_id,status,progress,error_code,attempts,max_attempts,created_at,updated_at,completed_at",
          )
          .eq("owner_user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100);
        return error
          ? noStoreJson({ error: "Impossible de charger les traitements." }, { status: 500 })
          : noStoreJson({ jobs: data });
      },
      DELETE: async ({ request }) => {
        const user = await authenticateRequest(request);
        if (!user) return noStoreJson({ error: "Authentification requise." }, { status: 401 });
        const input = z
          .object({ job_id: z.string().uuid() })
          .safeParse(await request.json().catch(() => null));
        if (!input.success) return noStoreJson({ error: "Job invalide." }, { status: 400 });
        const admin = createAdminClient();
        const { data, error } = await admin.rpc("cancel_processing_job", {
          p_job_id: input.data.job_id,
          p_user_id: user.id,
        });
        if (error || !data)
          return noStoreJson({ error: "Ce job ne peut plus être annulé." }, { status: 409 });
        return noStoreJson({ cancelled: true });
      },
    },
  },
});
