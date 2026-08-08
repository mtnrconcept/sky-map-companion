import { createFileRoute, notFound } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/AppNav";
import { CommonsImage } from "@/components/CommonsImage";
import { ResourceBreadcrumb } from "@/components/ResourceSections";
import { GEAR, imageQuery, slugify } from "@/data/resources";

export const Route = createFileRoute("/ressources/materiel/$slug")({
  loader: ({ params }) => {
    const cat = GEAR.find((g) => slugify(g.title) === params.slug);
    if (!cat) throw notFound();
    return { title: cat.title, blurb: cat.blurb };
  },
  head: ({ loaderData }) => {
    if (!loaderData)
      return {
        meta: [
          { title: "Rayon introuvable — Matériel astro" },
          { name: "robots", content: "noindex" },
        ],
      };
    return {
      meta: [
        { title: `${loaderData.title} — matériel d'astronomie` },
        { name: "description", content: loaderData.blurb.slice(0, 155) },
        { property: "og:title", content: `${loaderData.title} — matériel astro` },
        { property: "og:description", content: loaderData.blurb.slice(0, 155) },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: GearCategoryPage,
});

function GearCategoryPage() {
  const { slug } = Route.useParams();
  const cat = GEAR.find((g) => slugify(g.title) === slug)!;

  return (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader title={cat.title} subtitle={cat.blurb} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <ResourceBreadcrumb current="Matériel" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cat.items.map((i) => (
            <a
              key={i.url + i.name}
              href={i.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              <CommonsImage
                query={imageQuery(i.name, cat.title, i.desc)}
                alt={i.name}
                className="h-32 w-full"
              />
              <div className="p-4">
                <p className="flex items-center gap-1.5 font-medium">
                  {i.name}
                  <ExternalLink className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{i.desc}</p>
                <p className="mt-2 font-mono text-xs text-primary">{i.price}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
