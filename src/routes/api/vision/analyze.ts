import { createFileRoute } from "@tanstack/react-router";
import { analyzeImage } from "@/lib/vision-analysis.server";

export const Route = createFileRoute("/api/vision/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { "Content-Type": "application/json" };
        try {
          const body = await request.json();
          const { imageUrl } = body as { imageUrl?: string };

          if (!imageUrl) {
            return new Response(JSON.stringify({ error: "imageUrl requis" }), {
              status: 400,
              headers,
            });
          }

          const result = await analyzeImage(imageUrl);
          return new Response(JSON.stringify(result), { status: 200, headers });
        } catch (err) {
          console.error("[vision/analyze]", err);
          return new Response(JSON.stringify({ error: "Erreur d'analyse" }), {
            status: 500,
            headers,
          });
        }
      },
    },
  },
});
