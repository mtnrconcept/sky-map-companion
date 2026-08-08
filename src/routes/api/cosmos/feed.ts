import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient, noStoreJson } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/cosmos/feed")({
  server: {
    handlers: {
      GET: async () => {
        const admin = createAdminClient();
        const [observations, events] = await Promise.all([
          admin.rpc("get_public_cosmos_observations", { p_since_minutes: 120, p_limit: 200 }),
          admin.rpc("get_public_cosmos_events", { p_since_hours: 24, p_limit: 50 }),
        ]);
        if (observations.error || events.error) {
          return noStoreJson({ error: "Le flux Cosmos Live est indisponible." }, { status: 503 });
        }
        return noStoreJson({
          observations: (observations.data ?? []).map((item: Record<string, unknown>) => ({
            ...item,
            user_id: null,
            altitude_m: null,
            azimuth: null,
            elevation: null,
            image_url: null,
            ai_confidence: item["confidence"] ?? null,
          })),
          events: events.data ?? [],
        });
      },
    },
  },
});
