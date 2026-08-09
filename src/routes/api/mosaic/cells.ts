import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient, noStoreJson } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/mosaic/cells")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const order = Number(url.searchParams.get("order"));
        const indices = (url.searchParams.get("indices") ?? "")
          .split(",")
          .filter(Boolean)
          .map(Number);
        if (
          ![6, 7, 8, 9].includes(order) ||
          indices.length === 0 ||
          indices.length > 1_000 ||
          indices.some((value) => !Number.isSafeInteger(value) || value < 0)
        ) {
          return noStoreJson({ error: "Requête de cellules invalide." }, { status: 400 });
        }
        const admin = createAdminClient();
        const { data, error } = await admin.rpc("get_mosaic_cells", {
          p_order: order,
          p_indices: indices,
        });
        if (error)
          return noStoreJson({ error: "Lecture de la mosaïque impossible." }, { status: 503 });
        const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
        return noStoreJson({
          cells: (data ?? []).map((cell: Record<string, unknown>) => ({
            ...cell,
            tile_url: cell["tile_path"]
              ? `${supabaseUrl}/storage/v1/object/public/astro-derived/${cell["tile_path"]}`
              : null,
            tile_path: undefined,
          })),
        });
      },
    },
  },
});
