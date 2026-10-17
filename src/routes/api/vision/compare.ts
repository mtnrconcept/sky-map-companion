import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { compareImages } from "@/lib/vision-analysis.server";
import { authenticateRequest, createAdminClient, noStoreJson } from "@/lib/api-auth.server";
import type { Json } from "@/integrations/supabase/types";

const inputSchema = z
  .object({
    objectId: z.string().min(1).max(50),
    newImageId: z.string().uuid(),
  })
  .strict();

export const Route = createFileRoute("/api/vision/compare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticateRequest(request);
        if (!user) return noStoreJson({ error: "Authentification requise." }, { status: 401 });

        const parsed = inputSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return noStoreJson({ error: "Images à comparer invalides." }, { status: 400 });
        }
        const { objectId, newImageId } = parsed.data;
        const admin = createAdminClient();

        const { data: submitted, error: submittedError } = await admin
          .from("user_images")
          .select("id,storage_path")
          .eq("id", newImageId)
          .eq("object_id", objectId)
          .eq("user_id", user.id)
          .eq("is_ai_generated", false)
          .maybeSingle();
        if (submittedError) {
          return noStoreJson({ error: "Vérification de l’image impossible." }, { status: 503 });
        }
        if (!submitted) {
          return noStoreJson(
            { error: "Image vérifiée appartenant au compte introuvable." },
            { status: 404 },
          );
        }

        const { data: previous, error: imagesError } = await admin
          .from("user_images")
          .select("id,storage_path")
          .eq("object_id", objectId)
          .eq("is_ai_generated", false)
          .neq("id", newImageId)
          .order("uploaded_at", { ascending: false })
          .limit(5);
        if (imagesError) {
          return noStoreJson({ error: "Lecture des images impossible." }, { status: 503 });
        }
        const images = [submitted, ...(previous ?? [])];
        if (images.length < 2) {
          return noStoreJson({ message: "Pas assez d’images validées pour la comparaison." });
        }

        const validImages = images.filter((image) => {
          const parts = image.storage_path.split("/");
          return (
            parts.length === 3 &&
            /^[0-9a-f-]{36}$/i.test(parts[0] ?? "") &&
            /^[a-zA-Z0-9_-]{1,50}$/.test(parts[1] ?? "") &&
            /^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(parts[2] ?? "")
          );
        });
        if (validImages.length < 2 || validImages[0]?.id !== newImageId) {
          return noStoreJson({ error: "Chemin image non autorisé." }, { status: 400 });
        }
        const urls = validImages.map(
          (image) =>
            admin.storage.from("user-images").getPublicUrl(image.storage_path).data.publicUrl,
        );

        try {
          const comparison = await compareImages(urls, objectId);
          const { error } = await admin.from("image_comparisons").insert({
            object_id: objectId,
            image_ids: validImages.map((image) => image.id),
            differences_detected: comparison.differences as unknown as Json,
            discoveries: comparison.discoveries as unknown as Json,
            confidence_score: comparison.overallSimilarity,
            analysis_metadata: { recommendations: comparison.recommendations } as Json,
          });
          if (error) {
            return noStoreJson(
              { error: "Enregistrement de la comparaison impossible." },
              { status: 503 },
            );
          }
          return noStoreJson(comparison);
        } catch (reason) {
          console.error(
            "[vision/compare] Comparaison indisponible:",
            reason instanceof Error ? reason.message : "unknown error",
          );
          return noStoreJson(
            { error: "Le service de comparaison est momentanément indisponible." },
            { status: 503 },
          );
        }
      },
    },
  },
});
