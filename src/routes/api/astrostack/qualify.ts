import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateRequest, createAdminClient, noStoreJson } from "@/lib/api-auth.server";
import { presentQualificationJob } from "@/features/astrostack/api/qualification-state";

/**
 * La qualification exige une vraie lecture des pixels, une résolution
 * astrométrique et le worker scientifique. Cette route refuse donc de produire
 * un score dérivé uniquement des métadonnées ou de l'IA textuelle.
 */
export const Route = createFileRoute("/api/astrostack/qualify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticateRequest(request);
        if (!user) return noStoreJson({ error: "Authentification requise." }, { status: 401 });
        const input = z
          .object({ upload_id: z.string().uuid() })
          .safeParse(await request.json().catch(() => null));
        if (!input.success) return noStoreJson({ error: "Upload invalide." }, { status: 400 });
        const admin = createAdminClient();
        const { data: upload, error: uploadError } = await admin
          .from("astro_uploads")
          .select("id,status,user_id,rejection_reason")
          .eq("id", input.data.upload_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (uploadError) {
          return noStoreJson({ error: "Suivi des contributions indisponible." }, { status: 503 });
        }
        if (!upload) return noStoreJson({ error: "Upload introuvable." }, { status: 404 });
        const { data: job, error: jobError } = await admin
          .from("processing_jobs")
          .select(
            "id,status,progress,error_code,created_at,updated_at,attempts,max_attempts,completed_at,lease_expires_at",
          )
          .eq("upload_id", upload.id)
          .eq("job_type", "qualify_upload")
          .maybeSingle();
        if (jobError) {
          return noStoreJson({ error: "Suivi scientifique indisponible." }, { status: 503 });
        }
        return noStoreJson(
          { upload, job: job ? presentQualificationJob(job) : null },
          { status: 200 },
        );
      },
    },
  },
});
