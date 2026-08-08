import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/AppNav";
import { CommonsImage } from "@/components/CommonsImage";
import { ResourceBreadcrumb } from "@/components/ResourceSections";
import { GEAR, imageQuery, slugify } from "@/data/resources";

export const Route = createFileRoute("/ressources/materiel/")({
  head: () => ({
    meta: [
      { title: "Matériel d'astronomie — télescopes, montures, caméras, filtres" },
      {
        name: "description",
        content:
          "Catalogue de matériel astro par rayon : télescopes, montures, oculaires, caméras, filtres, jumelles, accessoires de terrain et livres, avec conseils et ordres de prix.",
      },
      { property: "og:title", content: "Matériel d'astronomie par catégorie" },
      {
        property: "og:description",
        content:
          "Huit rayons de matériel avec conseils d'achat et ordres de prix réels.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GearMenu,
});

function GearMenu() {
  return (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader
        title="Matériel"
        subtitle="Choisissez un rayon : chaque catégorie détaille les modèles types, leur usage et leur budget."
      />
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <ResourceBreadcrumb current="Matériel" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GEAR.map((cat) => (
            <Link
              key={cat.title}
              to="/ressources/materiel/$slug"
              params={{ slug: slugify(cat.title) }}
              className="group overflow-hidden rounded-2xl border border-border/60 bg-card/40 transition-colors hover:border-primary/50 hover:bg-accent/30"
            >
              <CommonsImage
                query={imageQuery(cat.title)}
                alt={cat.title}
                className="h-40 w-full"
              />
              <div className="p-5">
                <p className="font-mono text-[11px] uppercase tracking-wide text-primary">
                  {cat.items.length} références
                </p>
                <h2 className="mt-1 flex items-center gap-1.5 text-base font-semibold">
                  {cat.title}
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {cat.blurb}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
