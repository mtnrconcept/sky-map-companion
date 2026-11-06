import { createFileRoute } from "@tanstack/react-router";
import { handleCosmosAnalyze } from "@/features/cosmos/server/live.server";

export const Route = createFileRoute("/api/cosmos/analyze-cluster")({
  server: { handlers: { POST: ({ request }) => handleCosmosAnalyze(request) } },
});
