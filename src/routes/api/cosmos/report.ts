import { createFileRoute } from "@tanstack/react-router";
import { handleCosmosReport } from "@/features/cosmos/server/live.server";

export const Route = createFileRoute("/api/cosmos/report")({
  server: { handlers: { POST: ({ request }) => handleCosmosReport(request) } },
});
