import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Clock } from "lucide-react";
import { PageHeader } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { CommonsImage } from "@/components/CommonsImage";
import { ResourceBreadcrumb } from "@/components/ResourceSections";
import { TUTORIALS, imageQuery } from "@/data/resources";

export const Route = createFileRoute("/ressources/tutoriels")({
  head: () => ({
    meta: [
      { title: "Tutoriels d'astrophotographie pas à pas — Carte du Ciel" },
      {
        name: "description",
        content:
          "Guides complets d'astrophoto : Lune au smartphone, règle des 500, empilement, planétaire, bande étroite. Matériel, étapes, réglages exacts et pièges à éviter.",
      },
      { property: "og:title", content: "Tutoriels d'astrophotographie pas à pas" },
      {
        property: "og:description",
        content:
          "Du premier cliché lunaire au ciel profond en bande étroite : étapes, réglages et erreurs à éviter.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TutorialsPage,
});

function TutorialsPage() {
  return (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader
        title="Tutoriels d'astrophotographie"
        subtitle={`${TUTORIALS.length} guides complets : matériel requis, étapes dans l'ordre, réglages exacts et erreurs à éviter.`}
      />
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <ResourceBreadcrumb current="Tutoriels d'astrophotographie" />
        <div className="space-y-5">
          {TUTORIALS.map((t) => (
            <article
              key={t.title}
              className="group overflow-hidden rounded-xl border border-border/60 bg-card/40 md:flex"
            >
              <CommonsImage
                query={imageQuery(t.title, t.gear)}
                alt={t.title}
                className="h-44 w-full md:h-auto md:w-64 md:shrink-0"
              />
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{t.level}</Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" /> {t.duration}
                  </span>
                </div>
                <h2 className="mt-2 text-base font-semibold">{t.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Matériel : {t.gear}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-foreground/85">
                  {t.intro}
                </p>
                <ol className="mt-4 space-y-2">
                  {t.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-[11px] text-primary">
                        {i + 1}
                      </span>
                      <span className="text-muted-foreground">{s}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 font-mono text-xs text-primary">
                  {t.settings}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {t.pitfalls.map((p, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-xs leading-relaxed text-muted-foreground"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400/80" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
