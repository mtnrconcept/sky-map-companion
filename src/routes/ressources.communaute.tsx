import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppNav";
import { LinkGrid, ResourceBreadcrumb } from "@/components/ResourceSections";
import { BLOGS } from "@/data/resources";

export const Route = createFileRoute("/ressources/communaute")({
  head: () => ({
    meta: [
      { title: "Blogs, forums et communauté astro — sites de référence" },
      {
        name: "description",
        content:
          "Astrosurf, Webastro, Cloudy Nights, Astrobin, Ciel & Espace, APOD : les forums, blogs et galeries incontournables pour progresser en astronomie.",
      },
      { property: "og:title", content: "Blogs, forums et communauté astro" },
      {
        property: "og:description",
        content: "Les sites, forums et galeries de référence, en français et en anglais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader
        title="Blogs, forums & communauté"
        subtitle="Les sites de référence francophones et internationaux, les forums actifs et les galeries d'images."
      />
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <ResourceBreadcrumb current="Blogs, forums & communauté" />
        <LinkGrid items={BLOGS} />
      </div>
    </main>
  ),
});
