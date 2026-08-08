import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { compareImages } from "@/lib/vision-analysis.server";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/vision/compare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Content-Type": "application/json" };
        try {
          const { objectId } = (await request.json()) as {
            objectId: string;
            newImageId: string;
          };

          if (!objectId) {
            return new Response(JSON.stringify({ error: "objectId requis" }), {
              status: 400,
              headers,
            });
          }

          const supabaseAdmin = createClient<Database>(
            process.env["SUPABASE_URL"]!,
            process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          );

          const { data: images, error } = await supabaseAdmin
            .from("user_images")
            .select("id, image_url")
            .eq("object_id", objectId)
            .eq("is_ai_generated", false)
            .order("uploaded_at", { ascending: false })
            .limit(8);

          if (error) throw error;

          if (!images || images.length < 2) {
            return new Response(
              JSON.stringify({ message: "Pas assez d'images pour la comparaison" }),
              { status: 200, headers },
            );
          }

          const imageUrls = images.map((img) => img.image_url);
          const comparison = await compareImages(imageUrls, objectId);

          await supabaseAdmin.from("image_comparisons").insert({
            object_id: objectId,
            image_ids: images.map((img) => img.id),
            differences_detected:
              comparison.differences as unknown as import("@/integrations/supabase/types").Json,
            discoveries:
              comparison.discoveries as unknown as import("@/integrations/supabase/types").Json,
            confidence_score: comparison.overallSimilarity,
            analysis_metadata: {
              recommendations: comparison.recommendations,
            } as unknown as import("@/integrations/supabase/types").Json,
          });

          return new Response(JSON.stringify(comparison), { status: 200, headers });
        } catch (err) {
          console.error("[vision/compare]", err);
          return new Response(JSON.stringify({ error: "Erreur de comparaison" }), {
            status: 500,
            headers,
          });
        }
      },
    },
  },
});
