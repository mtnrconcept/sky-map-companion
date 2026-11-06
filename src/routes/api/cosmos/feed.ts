import { createFileRoute } from "@tanstack/react-router";
import { handleCosmosFeed } from "@/features/cosmos/server/live.server";

export const Route = createFileRoute("/api/cosmos/feed")({
  server: { handlers: { GET: ({ request }) => handleCosmosFeed(request) } },
});
