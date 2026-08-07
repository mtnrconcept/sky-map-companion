import { createFileRoute } from "@tanstack/react-router";
import { Camera, Youtube, BookOpen, Wrench, ExternalLink, Star } from "lucide-react";
import { PageHeader } from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/ressources")({
  head: () => ({
    meta: [
      { title: "Ressources astrophoto — tutoriels, blogs et vidéos" },
      {
        name: "description",
        content:
          "Tutoriels d'astrophotographie du débutant à l'expert, réglages types, logiciels de traitement, blogs de référence et chaînes YouTube pour progresser en observation du ciel.",
      },
      { property: "og:title", content: "Ressources astrophoto — tutoriels et guides" },
      {
        property: "og:description",
        content:
          "Techniques d'astrophoto, réglages, logiciels, blogs et vidéos sélectionnés pour les astronomes amateurs.",
      },
    ],
  }),
  component: ResourcesPage,
});

const TUTORIALS = [
  {
    level: "Débutant",
    title: "Photographier la Lune au smartphone",
    body: "Posez l'objectif contre l'oculaire (afocal), verrouillez la mise au point sur le limbe lunaire et baissez l'exposition de 2 crans : la Lune est très brillante et la plupart des photos ratées sont surexposées.",
    settings: "ISO 100 · 1/125 s · mise au point manuelle à l'infini",
  },
  {
    level: "Débutant",
    title: "La règle des 500 pour les étoiles fixes",
    body: "Sans suivi, la pose maximale avant que les étoiles ne filent vaut 500 divisé par la focale équivalente 24×36. À 20 mm, cela donne environ 25 secondes. Sur capteur APS-C, divisez encore par 1,5.",
    settings: "f/2.8 · ISO 1600-3200 · 15 à 25 s · RAW",
  },
  {
    level: "Intermédiaire",
    title: "Empilement (stacking) : gagner en signal",
    body: "Cumulez 50 à 200 poses courtes puis empilez-les avec Sequator, DeepSkyStacker ou Siril. Le bruit décroît en racine du nombre de poses : 100 images valent 10× moins de bruit qu'une seule.",
    settings: "Darks, flats et offsets obligatoires pour un fond propre",
  },
  {
    level: "Intermédiaire",
    title: "Mise en station et suivi équatorial",
    body: "Une monture équatoriale bien alignée sur l'étoile polaire permet des poses de plusieurs minutes. Utilisez le viseur polaire ou la méthode de Bigourdan, puis vérifiez la dérive sur 5 minutes avant de lancer la séquence.",
    settings: "Erreur de mise en station < 5' pour des poses de 2 min à 500 mm",
  },
  {
    level: "Avancé",
    title: "Imagerie planétaire : la technique du lucky imaging",
    body: "Filmez 2 à 3 minutes en vidéo à haute cadence, puis conservez les 10 % de trames les plus nettes avec AutoStakkert. La turbulence atmosphérique est ainsi contournée image par image.",
    settings: "Barlow 2-3× · ROI réduite · 100-200 images/s · format SER",
  },
  {
    level: "Avancé",
    title: "Filtres à bande étroite en ciel pollué",
    body: "Un filtre dual-band Hα/OIII isole les raies d'émission des nébuleuses et écrase la pollution lumineuse. C'est la seule façon d'imager sérieusement des nébuleuses depuis une ville.",
    settings: "Poses de 180-300 s · gain unitaire · caméra refroidie -10 °C",
  },
  {
    level: "Traitement",
    title: "Étirement d'histogramme sans cramer les étoiles",
    body: "Travaillez en linéaire dans Siril ou PixInsight, appliquez un étirement par transformation en arcsinus pour préserver la couleur des étoiles, puis ne remontez la saturation qu'en toute fin de traitement.",
    settings: "Siril (gratuit) · GraXpert pour le gradient · StarNet++ pour séparer les étoiles",
  },
  {
    level: "Terrain",
    title: "Préserver sa vision nocturne",
    body: "Il faut 20 à 30 minutes d'obscurité pour adapter l'œil. Une seule lumière blanche annule tout : utilisez le mode nuit rouge de cette application et une frontale rouge à faible intensité.",
    settings: "Vision décalée : regardez légèrement à côté de l'objet faible",
  },
];

const SOFTWARE = [
  { name: "Siril", desc: "Prétraitement et traitement complet, gratuit et open source.", url: "https://siril.org/" },
  { name: "DeepSkyStacker", desc: "Empilement classique pour le ciel profond sous Windows.", url: "http://deepskystacker.free.fr/french/index.html" },
  { name: "AutoStakkert!", desc: "Référence du stacking planétaire à partir de vidéos.", url: "https://www.autostakkert.com/" },
  { name: "GraXpert", desc: "Suppression automatique des gradients de pollution lumineuse.", url: "https://www.graxpert.com/" },
  { name: "Stellarium", desc: "Planétarium bureau pour préparer ses séances.", url: "https://stellarium.org/fr/" },
  { name: "Light pollution map", desc: "Trouver un site d'observation sombre près de chez vous.", url: "https://www.lightpollutionmap.info/" },
];

const BLOGS = [
  { name: "Astrosurf", desc: "La communauté francophone historique : forums, tutoriels et tests de matériel.", url: "https://www.astrosurf.com/" },
  { name: "Ciel & Espace", desc: "Actualité astronomique et éphémérides en français.", url: "https://www.cieletespace.fr/" },
  { name: "Webastro", desc: "Forum francophone très actif, idéal pour les débutants.", url: "https://www.webastro.net/" },
  { name: "Sky & Telescope", desc: "Guides d'observation hebdomadaires et cartes du ciel.", url: "https://skyandtelescope.org/" },
  { name: "Astrobin", desc: "Galerie d'astrophotos avec les réglages complets de chaque image.", url: "https://www.astrobin.com/" },
  { name: "Clear Outside", desc: "Météo dédiée à l'astronomie : couverture nuageuse par couche et seeing.", url: "https://clearoutside.com/" },
];

const VIDEOS = [
  { name: "AstroBackyard", desc: "Astrophoto du ciel profond, matériel et traitement pas à pas.", url: "https://www.youtube.com/@AstroBackyard" },
  { name: "Cuiv, The Lazy Geek", desc: "Tests de matériel et automatisation de l'astrophoto.", url: "https://www.youtube.com/@CuivTheLazyGeek" },
  { name: "Nebula Photos", desc: "Astrophoto accessible, même en ville et avec peu de budget.", url: "https://www.youtube.com/@NebulaPhotos" },
  { name: "Astro Guigeek", desc: "Chaîne francophone : tutoriels, tests et sorties terrain.", url: "https://www.youtube.com/@AstroGuigeek" },
  { name: "Le Sptinik", desc: "Vulgarisation astronomique en français.", url: "https://www.youtube.com/@LeSptinik" },
  { name: "Deep Sky Detail", desc: "Traitement avancé sous PixInsight expliqué clairement.", url: "https://www.youtube.com/@DeepSkyDetail" },
];

function ResourcesPage() {
  return (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader
        title="Ressources & tutoriels"
        subtitle="Techniques d'astrophotographie, logiciels, blogs et chaînes vidéo pour progresser du premier cliché lunaire au ciel profond."
      />

      <div className="mx-auto max-w-6xl space-y-12 px-4 pt-8">
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Camera className="size-4 text-primary" /> Techniques d'astrophoto
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {TUTORIALS.map((t) => (
              <article
                key={t.title}
                className="rounded-xl border border-border/60 bg-card/40 p-4"
              >
                <Badge variant="outline">{t.level}</Badge>
                <h3 className="mt-2 font-medium">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {t.body}
                </p>
                <p className="mt-3 rounded-md bg-secondary/60 px-2.5 py-1.5 font-mono text-xs text-foreground/80">
                  {t.settings}
                </p>
              </article>
            ))}
          </div>
        </section>

        <LinkSection
          icon={<Wrench className="size-4 text-primary" />}
          title="Logiciels essentiels"
          items={SOFTWARE}
        />
        <LinkSection
          icon={<BookOpen className="size-4 text-primary" />}
          title="Blogs et sites de référence"
          items={BLOGS}
        />
        <LinkSection
          icon={<Youtube className="size-4 text-primary" />}
          title="Chaînes YouTube"
          items={VIDEOS}
        />

        <section className="rounded-xl border border-border/60 bg-card/40 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Star className="size-4 text-primary" /> Progression conseillée
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>1. Apprenez le ciel à l'œil nu : 10 constellations suffisent pour tout repérer.</li>
            <li>2. Jumelles 10×50 : Pléiades, Andromède, amas d'Hercule, lunes de Jupiter.</li>
            <li>3. Premier télescope 130-200 mm : Lune, planètes, Messier les plus brillants.</li>
            <li>4. Photo fixe sur trépied : voie lactée, constellations, filés d'étoiles.</li>
            <li>5. Monture équatoriale motorisée puis empilement : le ciel profond s'ouvre.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}

function LinkSection({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: { name: string; desc: string; url: string }[];
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {icon} {title}
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <a
            key={i.url}
            href={i.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <p className="flex items-center gap-1.5 font-medium">
              {i.name}
              <ExternalLink className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{i.desc}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
