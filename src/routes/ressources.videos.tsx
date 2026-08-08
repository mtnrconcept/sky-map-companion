import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppNav";
import { LinkGrid, ResourceBreadcrumb } from "@/components/ResourceSections";
import { VIDEOS } from "@/data/resources";

export const Route = createFileRoute("/ressources/videos")({
  head: () => ({
    meta: [
      { title: "Chaînes YouTube d'astronomie et d'astrophotographie" },
      {
        name: "description",
        content:
          "Une sélection de chaînes YouTube francophones et anglophones : astrophoto du ciel profond, tests de matériel, traitement d'image et sessions d'observation.",
      },
      { property: "og:title", content: "Chaînes vidéo d'astronomie" },
      {
        property: "og:description",
        content: "Les meilleures chaînes pour apprendre l'astrophoto en vidéo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader
        title="Chaînes vidéo"
        subtitle="Les meilleures chaînes YouTube d'astronomie et d'astrophoto, en français et en anglais."
      />
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <ResourceBreadcrumb current="Chaînes vidéo" />
        <LinkGrid items={VIDEOS} />
      </div>
    </main>
  ),
});
