import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Star } from "lucide-react";
import { PageHeader } from "@/components/AppNav";
import { CommonsImage } from "@/components/CommonsImage";
import { CATEGORIES, PROGRESSION } from "@/data/resources";

export const Route = createFileRoute("/ressources/")({
  head: () => ({
    meta: [
      { title: "Ressources astro — tutoriels, matériel, logiciels et communauté" },
      {
        name: "description",
        content:
          "Le sommaire des ressources d'astronomie : tutoriels d'astrophoto pas à pas, catalogue de matériel, logiciels de traitement, outils de planification, blogs, forums et chaînes vidéo.",
      },
      { property: "og:title", content: "Ressources astro — sommaire par catégorie" },
      {
        property: "og:description",
        content:
          "Six catégories de ressources : tutoriels, matériel, logiciels, planification, communauté et vidéos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResourcesMenu,
});

function ResourcesMenu() {
  return (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader
        title="Ressources & tutoriels"
        subtitle="Choisissez une catégorie : guides d'astrophotographie, matériel par rayon, logiciels, planification, communauté et vidéos."
      />

      <div className="mx-auto max-w-6xl space-y-12 px-4 pt-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              to={c.to}
              className="group overflow-hidden rounded-2xl border border-border/60 bg-card/40 transition-colors hover:border-primary/50 hover:bg-accent/30"
            >
              <CommonsImage query={c.image} alt={c.title} className="h-44 w-full" />
              <div className="p-5">
                <p className="font-mono text-[11px] uppercase tracking-wide text-primary">
                  {c.count}
                </p>
                <h2 className="mt-1 flex items-center gap-1.5 text-base font-semibold">
                  {c.title}
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.blurb}</p>
              </div>
            </Link>
          ))}
        </div>

        <section className="rounded-xl border border-border/60 bg-card/40 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Star className="size-4 text-primary" /> Progression conseillée
          </h2>
          <ol className="mt-3 space-y-2.5 text-sm text-muted-foreground">
            {PROGRESSION.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
