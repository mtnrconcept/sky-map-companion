import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppNav";
import { LinkGrid, ResourceBreadcrumb } from "@/components/ResourceSections";
import { SOFTWARE } from "@/data/resources";

export const Route = createFileRoute("/ressources/logiciels")({
  head: () => ({
    meta: [
      { title: "Logiciels d'astrophotographie — capture, empilement, traitement" },
      {
        name: "description",
        content:
          "Siril, DeepSkyStacker, AutoStakkert!, PHD2, N.I.N.A., GraXpert : les logiciels gratuits et payants pour capturer, empiler et traiter vos images du ciel.",
      },
      { property: "og:title", content: "Logiciels d'astrophotographie" },
      {
        property: "og:description",
        content: "La chaîne logicielle complète, de la capture au traitement final.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader
        title="Logiciels"
        subtitle="Capture, empilement, traitement et autoguidage — l'essentiel est gratuit et open source."
      />
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <ResourceBreadcrumb current="Logiciels" />
        <LinkGrid items={SOFTWARE} />
      </div>
    </main>
  ),
});
