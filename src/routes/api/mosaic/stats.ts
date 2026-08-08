import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createAdminClient, noStoreJson } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/mosaic/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const input = z.string().uuid().safeParse(new URL(request.url).searchParams.get("user_id"));
        if (!input.success) return noStoreJson({ error: "Utilisateur invalide." }, { status: 400 });
        const admin = createAdminClient();
        const { data, error } = await admin.rpc("get_user_mosaic_stats", { p_user_id: input.data });
        if (error) return noStoreJson({ error: "Statistiques indisponibles." }, { status: 503 });
        return noStoreJson({ stats: data?.[0] ?? { xp_total: 0, pioneer_cells: 0 } });
      },
    },
  },
});
