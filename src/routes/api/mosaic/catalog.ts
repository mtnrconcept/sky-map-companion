import { createFileRoute } from "@tanstack/react-router";
import { handleCatalogConeRequest } from "@/features/mosaic/server/catalog-cones.server";

export const Route = createFileRoute("/api/mosaic/catalog")({
  server: {
    handlers: {
      GET: ({ request }) => handleCatalogConeRequest(request),
    },
  },
});
