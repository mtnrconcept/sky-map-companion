import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppNav";
import { MosaicObservatory } from "@/features/mosaic/components/MosaicObservatory";
import { SkyMapMasterViewer } from "@/features/mosaic/components/SkyMapMasterViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/mosaic")({
  head: () => ({
    meta: [
      { title: "Mosaïque collaborative de l’univers" },
      {
        name: "description",
        content:
          "Explorez les masters Sky Map réellement produits et comparez-les aux surveys scientifiques HiPS de référence.",
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
        subtitle="Masters Sky Map propriétaires construits à partir des images astrophotographiques qualifiées"
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

        <SkyMapMasterViewer />

        <details className="rounded-xl border border-border bg-card/40">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
            Afficher l’atlas scientifique externe de référence — Aladin Lite
          </summary>
          <div className="border-t border-border p-4">
            <p className="mb-4 text-xs text-muted-foreground">
              Aladin Lite est le moteur de navigation des surveys HiPS publics; ce panneau sert de
              référence scientifique et n’est pas le master Sky Map propriétaire.
            </p>
            <MosaicObservatory />
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div>
            <p className="font-semibold">Une zone est encore vide ?</p>
            <p className="text-xs text-muted-foreground">
              Déposez un RAW : la qualification WCS et les métriques scientifiques déterminent s’il
              peut améliorer le master de l’objet.
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
