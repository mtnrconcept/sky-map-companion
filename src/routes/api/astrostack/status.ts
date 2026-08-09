import { createFileRoute } from "@tanstack/react-router";
import { astroObjectIdSchema } from "@/features/astrostack/domain/public-status";
import {
  AstroStackStatusNotFoundError,
  getAstroStackPublicStatus,
} from "@/features/astrostack/server/public-status.server";
import { noStoreJson } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/astrostack/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const objectId = astroObjectIdSchema.safeParse(
          new URL(request.url).searchParams.get("object_id") ?? "M31",
        );
        if (!objectId.success) {
          return noStoreJson({ error: "Objet céleste invalide." }, { status: 400 });
        }

        try {
          return noStoreJson(await getAstroStackPublicStatus(objectId.data));
        } catch (error) {
          if (error instanceof AstroStackStatusNotFoundError) {
            return noStoreJson({ error: "Objet céleste introuvable." }, { status: 404 });
          }
          console.error(
            "[astrostack-status] Public status unavailable",
            error instanceof Error ? error.message : "unknown error",
          );
          return noStoreJson(
            { error: "État AstroStack temporairement indisponible." },
            { status: 503 },
          );
        }
      },
    },
  },
});
