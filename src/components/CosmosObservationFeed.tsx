import { useState } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  distanceKm,
  eventStatus,
  formatCoordinate,
  phenomenonLabel,
  relativeTime,
  type CosmosObservation,
  type CosmosEvent,
  type ObserverPosition,
} from "@/features/cosmos/domain/client-state";

interface Props {
  observations: CosmosObservation[];
  events: CosmosEvent[];
  userPosition: ObserverPosition | null;
  selectedObservationId?: string | null;
  onSelectObservation?: (id: string) => void;
}

export function CosmosObservationFeed({
  observations,
  events,
  userPosition,
  selectedObservationId = null,
  onSelectObservation,
}: Props) {
  const [visibleObservations, setVisibleObservations] = useState(20);
  const [visibleEvents, setVisibleEvents] = useState(5);

  return (
    <div className="space-y-5">
      {events.length > 0 && (
        <section className="space-y-2" aria-label="Rapprochements de signalements">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Rapprochements sur 24 h ({events.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Des signalements proches dans le temps et l’espace, dont la nature reste à vérifier.
          </p>
          {events.slice(0, visibleEvents).map((event) => (
            <Card key={event.id} className="border-primary/30 bg-primary/5">
              <CardHeader className="px-4 pb-2 pt-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="min-w-0 break-words text-sm font-semibold leading-snug">
                    {event.title}
                  </CardTitle>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {event.observation_count} obs.
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="mb-1 text-xs font-medium">{phenomenonLabel(event.phenomenon_type)}</p>
                {event.description && (
                  <p className="break-words text-xs text-muted-foreground">{event.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <time
                    dateTime={event.event_at}
                    title={new Date(event.event_at).toLocaleString("fr")}
                  >
                    {relativeTime(event.event_at)}
                  </time>
                  <span>· {eventStatus(event.status)}</span>
                  {event.triangulation && <span>· Estimation géométrique disponible</span>}
                </div>
              </CardContent>
            </Card>
          ))}
          {events.length > visibleEvents && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setVisibleEvents((count) => count + 10)}
            >
              Voir les autres rapprochements ({events.length - visibleEvents})
            </Button>
          )}
        </section>
      )}

      <section className="space-y-3" aria-label="Liste des observations">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Observations ({observations.length})
        </h3>
        {observations.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun signalement pour les filtres choisis.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Consultez les dernières 24 heures ou signalez ce que vous avez observé.
            </p>
          </div>
        )}
        <div className="space-y-2">
          {observations.slice(0, visibleObservations).map((observation) => {
            const selected = observation.id === selectedObservationId;
            return (
              <button
                key={observation.id}
                type="button"
                onClick={() => onSelectObservation?.(observation.id)}
                aria-pressed={selected}
                aria-label={
                  "Voir sur la carte : " +
                  phenomenonLabel(observation.phenomenon_type) +
                  ", " +
                  observation.description
                }
                className={
                  "w-full min-w-0 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary " +
                  (selected
                    ? "border-primary bg-primary/10"
                    : "border-border/60 bg-card/50 hover:border-primary/50")
                }
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold">
                    {phenomenonLabel(observation.phenomenon_type)}
                  </span>
                  <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </span>
                <span
                  className={"mt-2 block break-words text-sm " + (selected ? "" : "line-clamp-3")}
                >
                  {observation.description}
                </span>
                <span className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <time
                    dateTime={observation.observed_at}
                    title={new Date(observation.observed_at).toLocaleString("fr")}
                  >
                    {relativeTime(observation.observed_at)}
                  </time>
                  {userPosition && (
                    <span>· à environ {Math.round(distanceKm(userPosition, observation))} km</span>
                  )}
                  {observation.event_id && (
                    <span className="text-primary">· Rapproché d’autres signalements</span>
                  )}
                </span>
                {selected && (
                  <span className="mt-2 block space-y-1 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                    <span className="block">
                      Position arrondie : {formatCoordinate(observation.latitude, "latitude")},{" "}
                      {formatCoordinate(observation.longitude, "longitude")}
                    </span>
                    {observation.duration_s !== null && (
                      <span className="block">Durée déclarée : {observation.duration_s} s</span>
                    )}
                    {observation.magnitude !== null && (
                      <span className="block">Magnitude déclarée : {observation.magnitude}</span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {observations.length > visibleObservations && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setVisibleObservations((count) => count + 30)}
          >
            Afficher plus d’observations ({observations.length - visibleObservations})
          </Button>
        )}
      </section>
    </div>
  );
}
