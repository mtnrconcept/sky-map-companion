import { createFileRoute } from "@tanstack/react-router";
import { CosmosControlCenter } from "@/components/CosmosControlCenter";

export const Route = createFileRoute("/cosmos-live")({
  head: () => ({
    meta: [
      { title: "Cosmos Live — Centre d'observation collaborative" },
      {
        name: "description",
        content:
          "Carte des observations en direct, corrélation des témoins et estimation géométrique 3D.",
      },
    ],
  }),
  component: CosmosControlCenter,
});
