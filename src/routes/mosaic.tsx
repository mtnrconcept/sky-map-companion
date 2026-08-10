import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppNav";
import { GlobalMosaicObservatory } from "@/features/mosaic/components/GlobalMosaicObservatory";
import { MosaicObservatory } from "@/features/mosaic/components/MosaicObservatory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/mosaic")({
  head: () => ({
    meta: [
      { title: "Mosaïque tout-ciel de l’univers" },
      {
        name: "description",
        content:
          "Explorez toute la sphère céleste : zones rouges non couvertes, photos Sky Map sur les cellules déjà publiées et navigation continue par pan et zoom.",
      },
    ],
  }),
  component: MosaicPage,
});

function MosaicPage() {
  return (
    <main className="min-h-[100dvh] bg-background pb-24">
      <PageHeader
        title="Mosaïque de l’univers"
        subtitle="Une carte tout-ciel continue : rouge là où Sky Map doit encore observer, photo là où une génération scientifique est publiée"
      />
      <div className="mx-auto max-w-7xl space-y-5 px-4 pt-6">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Découverte", "55′ · ≤12″/px · 2 XP"],
            ["Grand champ", "27′ · ≤6″/px · 5 XP"],
            ["Détaillé", "14′ · ≤3″/px · 10 XP"],
            ["Haute définition", "7′ · ≤1,5″/px · 20 XP"],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="p-3">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <GlobalMosaicObservatory />

        <details className="rounded-xl border border-border bg-card/40">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
            Comparer avec les surveys scientifiques externes — Aladin Lite
          </summary>
          <div className="border-t border-border p-4">
            <p className="mb-4 text-xs text-muted-foreground">
              Ce panneau charge directement des surveys HiPS publics comme Pan-STARRS, Euclid,
              2MASS, AllWISE ou GALEX. Il sert de référence de comparaison et ne remplace pas la
              mosaïque Sky Map affichée au-dessus.
            </p>
            <MosaicObservatory />
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
          <div>
            <p className="font-semibold">Une zone est rouge ?</p>
            <p className="text-xs text-muted-foreground">
              Déposez un RAW : après astrométrie et qualification scientifique, une contribution
              retenue peut progressivement remplacer le rouge par une vraie tuile photographique.
            </p>
          </div>
          <Button asChild>
            <Link to="/astrostack">Contribuer à la mosaïque</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
