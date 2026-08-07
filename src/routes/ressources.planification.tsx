import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppNav";
import { LinkGrid, ResourceBreadcrumb } from "@/components/ResourceSections";
import { PLANNING } from "@/data/resources";

export const Route = createFileRoute("/ressources/planification")({
  head: () => ({
    meta: [
      { title: "Planification & météo astro — seeing, pollution, éphémérides" },
      {
        name: "description",
        content:
          "Prévisions de seeing et de couverture nuageuse, cartes de pollution lumineuse, éphémérides officielles, passages de l'ISS et planificateurs de cibles.",
      },
      { property: "og:title", content: "Planification & météo pour l'observation" },
      {
        property: "og:description",
        content: "Choisir la bonne nuit, le bon site et la bonne cible.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader
        title="Planification & météo"
        subtitle="Seeing, nuages, pollution lumineuse, éphémérides et planificateurs de cibles."
      />
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <ResourceBreadcrumb current="Planification & météo" />
        <LinkGrid items={PLANNING} />
      </div>
    </main>
  ),
});
