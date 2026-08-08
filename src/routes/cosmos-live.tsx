import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppNav";
import { CosmosLiveMap } from "@/components/CosmosLiveMap";
import { CosmosObservationFeed } from "@/components/CosmosObservationFeed";
import { CosmosReportForm } from "@/components/CosmosReportForm";
import { CosmosTriangulationPanel } from "@/components/CosmosTriangulationPanel";
import { useCosmosLive } from "@/hooks/useCosmosLive";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/cosmos-live")({
  head: () => ({
    meta: [
      { title: "Cosmos Live - Observatoire Collaboratif" },
      {
        name: "description",
        content:
          "Participez en temps réel à la détection de météores, bolides, aurores et phénomènes rares. Chaque téléphone devient un capteur scientifique.",
      },
    ],
  }),
  component: CosmosLivePage,
});

function CosmosLivePage() {
  const {
    observations,
    events,
    userPosition,
    positionError,
    isSubmitting,
    isActive,
    isAuthenticated,
    activate,
    deactivate,
    submitObservation,
  } = useCosmosLive();

  return (
    <main className="min-h-[100dvh] bg-background pb-24">
      <PageHeader
        title="Cosmos Live"
        subtitle="Collecte collaborative et authentifiée d'observations célestes"
      />

      <div className="mx-auto max-w-5xl px-4 pt-6 space-y-6">
        {/* Statut + activation */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card/50 p-4 backdrop-blur-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block size-2.5 rounded-full ${
                  isActive ? "animate-pulse bg-green-500" : "bg-muted-foreground"
                }`}
              />
              <span className="text-sm font-semibold">
                {isActive ? "Mode observation actif" : "Mode observation inactif"}
              </span>
              {isActive && (
                <Badge variant="outline" className="text-[10px] text-green-400 border-green-500/40">
                  EN DIRECT
                </Badge>
              )}
            </div>
            {positionError ? (
              <p className="text-xs text-destructive">{positionError}</p>
            ) : userPosition ? (
              <p className="text-xs text-muted-foreground">
                📍 {userPosition.latitude.toFixed(4)}°N, {userPosition.longitude.toFixed(4)}°E —
                précision {Math.round(userPosition.accuracy ?? 0)} m
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                GPS requis pour participer aux observations et à la triangulation
              </p>
            )}
          </div>
          <Button
            variant={isActive ? "destructive" : "default"}
            onClick={isActive ? deactivate : activate}
            className="shrink-0"
          >
            {isActive ? "? Désactiver" : "? Activer Cosmos Live"}
          </Button>
        </div>

        {/* Statistiques globales */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{observations.length}</p>
              <p className="text-[11px] text-muted-foreground">Observations (2h)</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{events.length}</p>
              <p className="text-[11px] text-muted-foreground">Événements détectés</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">
                {events.filter((e) => e.triangulation != null).length}
              </p>
              <p className="text-[11px] text-muted-foreground">Triangulations</p>
            </CardContent>
          </Card>
        </div>

        {/* Carte en direct */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-widest">
            Carte en direct
          </h2>
          <CosmosLiveMap observations={observations} userPosition={userPosition} />
        </section>

        {/* Contenu principal en deux colonnes */}
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Colonne gauche : flux + triangulations */}
          <Tabs defaultValue="feed">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="feed">
                Observations{" "}
                {observations.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {observations.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="triangulations">
                Triangulations{" "}
                {events.filter((e) => e.triangulation).length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {events.filter((e) => e.triangulation).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="feed" className="mt-4">
              <CosmosObservationFeed
                observations={observations}
                events={events}
                userPosition={userPosition}
              />
            </TabsContent>

            <TabsContent value="triangulations" className="mt-4">
              <CosmosTriangulationPanel events={events} />
            </TabsContent>
          </Tabs>

          {/* Colonne droite : formulaire de signalement */}
          <div className="space-y-4">
            <Card className="bg-card/50 backdrop-blur-sm sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">📡 Signaler un phénomène</CardTitle>
                {!isActive && (
                  <p className="text-xs text-muted-foreground">
                    Activez Cosmos Live pour pouvoir signaler une observation.
                  </p>
                )}
                {!isAuthenticated && (
                  <p className="text-xs text-yellow-500">
                    Connectez-vous pour soumettre une observation.
                  </p>
                )}
                {isActive && !userPosition && (
                  <p className="text-xs text-yellow-500">? En attente du GPS...</p>
                )}
              </CardHeader>
              <CardContent>
                <CosmosReportForm
                  onSubmit={submitObservation}
                  isSubmitting={isSubmitting}
                  disabled={!isActive || !userPosition || !isAuthenticated}
                />
              </CardContent>
            </Card>

            {/* Explication du système */}
            <Card className="bg-card/30 border-dashed">
              <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Comment ça fonctionne ?</p>
                <ol className="space-y-1.5 list-decimal list-inside">
                  <li>Activez le mode pour partager votre position GPS</li>
                  <li>Signalez tout phénomène inhabituel dans le ciel</li>
                  <li>L'observation authentifiée est enregistrée et diffusée en temps réel</li>
                  <li>
                    Le clustering et la triangulation resteront désactivés jusqu'au déploiement du
                    worker scientifique
                  </li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
