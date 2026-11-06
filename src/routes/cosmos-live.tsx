import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { LocateFixed, MapPin, Radio, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/AppNav";
import { CosmosLiveMap } from "@/components/CosmosLiveMap";
import { CosmosObservationFeed } from "@/components/CosmosObservationFeed";
import { CosmosReportForm } from "@/components/CosmosReportForm";
import { CosmosTriangulationPanel } from "@/components/CosmosTriangulationPanel";
import { useCosmosLive } from "@/hooks/useCosmosLive";
import {
  PHENOMENA,
  formatCoordinate,
  observationProgress,
  parseManualPosition,
  phenomenonLabel,
  relativeTime,
  type FeedPeriod,
  type PhenomenonType,
} from "@/features/cosmos/domain/client-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/cosmos-live")({
  head: () => ({
    meta: [
      { title: "Cosmos Live — Observatoire collaboratif" },
      {
        name: "description",
        content:
          "Consultez les observations célestes récentes, signalez un phénomène et suivez les rapprochements entre observateurs.",
      },
    ],
  }),
  component: CosmosLivePage,
});

function CosmosLivePage() {
  const {
    observations,
    events,
    ownObservations,
    processing,
    sinceMinutes,
    changePeriod,
    isLoading,
    isRefreshing,
    feedError,
    accountError,
    lastUpdatedAt,
    isOnline,
    isLive,
    userPosition,
    positionError,
    isLocating,
    isSubmitting,
    isActive,
    isAuthenticated,
    isAuthLoading,
    activate,
    deactivate,
    applyManualPosition,
    submitObservation,
    retryAnalysis,
    retryingObservationIds,
    refresh,
  } = useCosmosLive();
  const [phenomenonFilter, setPhenomenonFilter] = useState<PhenomenonType | "all">("all");
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);
  const [manualLocationOpen, setManualLocationOpen] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [altitude, setAltitude] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [visibleOwnCount, setVisibleOwnCount] = useState(10);
  const filteredObservations = observations.filter(
    (item) => phenomenonFilter === "all" || item.phenomenon_type === phenomenonFilter,
  );
  const filteredEvents = events.filter(
    (item) => phenomenonFilter === "all" || item.phenomenon_type === phenomenonFilter,
  );
  const triangulationCount = filteredEvents.filter((event) => event.triangulation !== null).length;
  const periodLabel = sinceMinutes === 120 ? "2 h" : "24 h";

  function saveManualLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      applyManualPosition(parseManualPosition(latitude, longitude, altitude));
      setManualError(null);
      setManualLocationOpen(false);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "Vérifiez le lieu d’observation.");
    }
  }

  return (
    <main className="min-h-[100dvh] bg-background pb-24">
      <PageHeader title="Cosmos Live" subtitle="Observer, signaler, rapprocher les témoignages" />

      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6">
        <section
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card/50 p-4"
          aria-label="État du flux public"
        >
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Radio className="size-4 text-primary" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Observatoire en direct</h2>
              <Badge
                variant="outline"
                className={isLive ? "border-green-500/40 text-green-400" : "text-muted-foreground"}
              >
                {isLoading
                  ? "Chargement…"
                  : !isOnline
                    ? "Hors ligne"
                    : isLive
                      ? "Flux actualisé"
                      : "Actualisation interrompue"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Consultation libre, sans connexion ni GPS. Actualisation toutes les 10 secondes.
            </p>
            {lastUpdatedAt !== null && (
              <p className="text-[11px] text-muted-foreground">
                Dernière réception :{" "}
                <time dateTime={new Date(lastUpdatedAt).toISOString()}>
                  {new Date(lastUpdatedAt).toLocaleTimeString("fr")}
                </time>
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw
              className={"mr-2 size-4 " + (isRefreshing ? "motion-safe:animate-spin" : "")}
              aria-hidden="true"
            />
            {isRefreshing ? "Actualisation…" : "Actualiser"}
          </Button>
        </section>

        {feedError && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm"
            role="alert"
          >
            <p className="font-medium">Le flux n’a pas pu être actualisé.</p>
            <p className="mt-1 text-xs text-muted-foreground">{feedError}</p>
            {lastUpdatedAt !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Les éléments affichés correspondent à la dernière réception réussie.
              </p>
            )}
          </div>
        )}
        {(processing.status === "degraded" || processing.status === "unavailable") && (
          <div
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
            role="status"
          >
            <p className="font-medium">Analyse temporairement ralentie</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {processing.message ??
                "Les signalements enregistrés restent conservés. Le suivi indique ceux dont l’analyse doit être relancée."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { value: filteredObservations.length, label: "Observations (" + periodLabel + ")" },
            { value: filteredEvents.length, label: "Rapprochements (24 h)" },
            { value: triangulationCount, label: "Estimations géométriques" },
          ].map((stat) => (
            <Card key={stat.label} className="bg-card/50">
              <CardContent className="p-3 text-center sm:p-4">
                <p className="text-2xl font-bold tabular-nums">
                  {isLoading || (lastUpdatedAt === null && feedError) ? "—" : stat.value}
                </p>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground sm:text-xs">
                  {stat.label}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="space-y-3" aria-labelledby="cosmos-map-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="cosmos-map-heading" className="text-sm font-semibold">
              Carte des signalements
            </h2>
            <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
              <div className="min-w-[130px] flex-1 space-y-1 sm:flex-initial">
                <Label htmlFor="cosmos-period" className="text-xs text-muted-foreground">
                  Période
                </Label>
                <select
                  id="cosmos-period"
                  value={sinceMinutes}
                  onChange={(event) => {
                    changePeriod(Number(event.target.value) as FeedPeriod);
                    setSelectedObservationId(null);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <option value={120}>Dernières 2 h</option>
                  <option value={1440}>Dernières 24 h</option>
                </select>
              </div>
              <div className="min-w-[160px] flex-1 space-y-1 sm:flex-initial">
                <Label htmlFor="cosmos-type-filter" className="text-xs text-muted-foreground">
                  Phénomène
                </Label>
                <select
                  id="cosmos-type-filter"
                  value={phenomenonFilter}
                  onChange={(event) => {
                    setPhenomenonFilter(event.target.value as PhenomenonType | "all");
                    setSelectedObservationId(null);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <option value="all">Tous les phénomènes</option>
                  {PHENOMENA.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <CosmosLiveMap
            observations={filteredObservations}
            userPosition={userPosition}
            selectedObservationId={selectedObservationId}
            onSelectObservation={setSelectedObservationId}
            isLive={isLive}
          />
          {observations.length >= 200 && (
            <p className="text-xs text-muted-foreground">
              La carte affiche les 200 signalements les plus récents de la période.
            </p>
          )}
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            {isLoading ? (
              <div
                className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground"
                role="status"
              >
                Chargement des observations…
              </div>
            ) : feedError && lastUpdatedAt === null ? (
              <div className="space-y-3 rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Les observations ne sont pas disponibles pour le moment.
                </p>
                <Button variant="outline" disabled={isRefreshing} onClick={() => void refresh()}>
                  Réessayer le chargement
                </Button>
              </div>
            ) : (
              <Tabs defaultValue="feed">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="feed">
                    Observations ({filteredObservations.length})
                  </TabsTrigger>
                  <TabsTrigger value="triangulations">
                    Estimations ({triangulationCount})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="feed" className="mt-4">
                  <CosmosObservationFeed
                    observations={filteredObservations}
                    events={filteredEvents}
                    userPosition={userPosition}
                    selectedObservationId={selectedObservationId}
                    onSelectObservation={setSelectedObservationId}
                  />
                </TabsContent>
                <TabsContent value="triangulations" className="mt-4">
                  <CosmosTriangulationPanel events={filteredEvents} />
                </TabsContent>
              </Tabs>
            )}

            {isAuthenticated && (
              <section
                className="mt-6 space-y-3 rounded-xl border border-border bg-card/30 p-4"
                aria-labelledby="cosmos-own-heading"
              >
                <h2 id="cosmos-own-heading" className="text-sm font-semibold">
                  Mes signalements
                </h2>
                <p className="text-xs text-muted-foreground">
                  Suivi privé de vos 30 derniers signalements.
                </p>
                {accountError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {accountError}
                  </p>
                ) : ownObservations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {isLoading
                      ? "Chargement…"
                      : "Vos nouveaux signalements et leur suivi apparaîtront ici."}
                  </p>
                ) : (
                  ownObservations.slice(0, visibleOwnCount).map((observation) => {
                    const canRetry =
                      observation.status !== "rejected" &&
                      observation.job?.status !== "rejected" &&
                      (Boolean(observation.job?.error_code) ||
                        observation.job?.status === "failed" ||
                        observation.job?.status === "cancelled" ||
                        !observation.job ||
                        (observation.job.status !== "published" &&
                          Boolean(observation.job.updated_at) &&
                          Date.now() - Date.parse(observation.job.updated_at ?? "") > 60_000));
                    const isRetrying = retryingObservationIds.has(observation.id);
                    return (
                      <div
                        key={observation.id}
                        className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                          <p className="font-medium">
                            {phenomenonLabel(observation.phenomenon_type)}
                          </p>
                          <time
                            dateTime={observation.observed_at}
                            className="text-muted-foreground"
                          >
                            {relativeTime(observation.observed_at)}
                          </time>
                        </div>
                        {observation.description && (
                          <p className="break-words text-xs text-muted-foreground">
                            {observation.description}
                          </p>
                        )}
                        <p className="text-xs font-medium">{observationProgress(observation)}</p>
                        {canRetry && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRetrying}
                            onClick={() => void retryAnalysis(observation.id)}
                          >
                            {isRetrying ? "Vérification…" : "Relancer l’analyse"}
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
                {ownObservations.length > visibleOwnCount && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setVisibleOwnCount((count) => count + 10)}
                  >
                    Afficher les autres signalements
                  </Button>
                )}
              </section>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <Card className="bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Signaler un phénomène</CardTitle>
                {isAuthLoading ? (
                  <p className="text-xs text-muted-foreground">Vérification de la connexion…</p>
                ) : (
                  !isAuthenticated && (
                    <p className="text-xs text-muted-foreground">
                      Préparez votre signalement puis{" "}
                      <Link to="/auth" className="font-medium text-primary underline">
                        connectez-vous
                      </Link>{" "}
                      pour l’envoyer.
                    </p>
                  )
                )}
              </CardHeader>
              <CardContent className="space-y-5">
                <section
                  className="space-y-3 rounded-lg border border-border bg-background/50 p-3"
                  aria-labelledby="cosmos-location-heading"
                >
                  <h3
                    id="cosmos-location-heading"
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    <MapPin className="size-4" />
                    Lieu d’observation
                  </h3>
                  {userPosition && (
                    <div className="space-y-1 text-xs">
                      <p className="font-mono">
                        {formatCoordinate(userPosition.latitude, "latitude", 4)},{" "}
                        {formatCoordinate(userPosition.longitude, "longitude", 4)}
                      </p>
                      <p className="text-muted-foreground">
                        {userPosition.source === "manual"
                          ? "Lieu saisi manuellement"
                          : "Position GPS"}
                        {userPosition.accuracy !== null &&
                          " · Précision annoncée : " + Math.round(userPosition.accuracy) + " m"}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isSubmitting || isLocating}
                      onClick={activate}
                    >
                      <LocateFixed className="mr-1.5 size-4" />
                      {isLocating
                        ? "Localisation…"
                        : userPosition?.source === "gps"
                          ? "Actualiser le GPS"
                          : "Utiliser mon GPS"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => setManualLocationOpen((open) => !open)}
                      aria-expanded={manualLocationOpen}
                      aria-controls="cosmos-manual-location"
                    >
                      Saisir le lieu
                    </Button>
                    {isActive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={deactivate}
                        disabled={isSubmitting}
                      >
                        Arrêter
                      </Button>
                    )}
                  </div>
                  {positionError && (
                    <p className="text-xs text-destructive" role="alert">
                      {positionError}
                    </p>
                  )}
                  {manualLocationOpen && (
                    <form
                      id="cosmos-manual-location"
                      onSubmit={saveManualLocation}
                      className="space-y-3 border-t border-border pt-3"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="cosmos-latitude" className="text-xs">
                            Latitude (°)
                          </Label>
                          <Input
                            id="cosmos-latitude"
                            inputMode="decimal"
                            placeholder="Ex. 46.20"
                            required
                            value={latitude}
                            onChange={(event) => setLatitude(event.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="cosmos-longitude" className="text-xs">
                            Longitude (°)
                          </Label>
                          <Input
                            id="cosmos-longitude"
                            inputMode="decimal"
                            placeholder="Ex. 6.14"
                            required
                            value={longitude}
                            onChange={(event) => setLongitude(event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="cosmos-altitude" className="text-xs">
                          Altitude en mètres, si connue
                        </Label>
                        <Input
                          id="cosmos-altitude"
                          inputMode="decimal"
                          placeholder="Facultatif"
                          value={altitude}
                          onChange={(event) => setAltitude(event.target.value)}
                        />
                      </div>
                      {manualError && (
                        <p className="text-xs text-destructive" role="alert">
                          {manualError}
                        </p>
                      )}
                      <Button type="submit" variant="secondary" size="sm" disabled={isSubmitting}>
                        Utiliser ce lieu
                      </Button>
                    </form>
                  )}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Choisissez l’endroit d’où vous avez observé le phénomène. Votre position reste
                    locale jusqu’à l’envoi ; sa version publique sera arrondie.
                  </p>
                </section>

                <CosmosReportForm
                  onSubmit={submitObservation}
                  isSubmitting={isSubmitting}
                  disabled={!isActive || !userPosition || !isAuthenticated || !isOnline}
                />
                {!isOnline && (
                  <p className="text-xs text-muted-foreground">
                    Reconnectez-vous à Internet pour envoyer le signalement.
                  </p>
                )}
                {isAuthenticated && !userPosition && (
                  <p className="text-xs text-muted-foreground">
                    Le lieu d’observation est nécessaire avant l’envoi. Vous pouvez déjà remplir le
                    formulaire.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-dashed bg-card/30">
              <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
                <h2 className="font-semibold text-foreground">
                  Comment les observations sont rapprochées
                </h2>
                <ol className="list-inside list-decimal space-y-2 leading-relaxed">
                  <li>Vous indiquez le lieu, le moment et le phénomène observé.</li>
                  <li>
                    Votre signalement est enregistré, avec une position publique arrondie à 0,1°.
                  </li>
                  <li>Les observations compatibles dans le temps et l’espace sont regroupées.</li>
                  <li>
                    Lorsque les directions de plusieurs témoins le permettent, une position
                    géométrique est estimée et reste à vérifier.
                  </li>
                </ol>
                <p>
                  Les photos et vidéos restent privées. Une estimation ne constitue pas une
                  confirmation scientifique.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
