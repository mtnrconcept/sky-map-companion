import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateRequest, createAdminClient, noStoreJson } from "@/lib/api-auth.server";

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
        const { data: upload } = await admin
          .from("astro_uploads")
          .select("id,status,user_id")
          .eq("id", input.data.upload_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!upload) return noStoreJson({ error: "Upload introuvable." }, { status: 404 });
        const { data: job } = await admin
          .from("processing_jobs")
          .select("id,status,progress,error_code,created_at,updated_at")
          .eq("upload_id", upload.id)
          .eq("job_type", "qualify_upload")
          .maybeSingle();
        return noStoreJson({ upload, job }, { status: 200 });
      },
    },
  },
});
