import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCoordinate,
  readTriangulation,
  relativeTime,
  type CosmosEvent,
} from "@/features/cosmos/domain/client-state";

interface Props {
  events: CosmosEvent[];
}

export function CosmosTriangulationPanel({ events }: Props) {
  const [visibleCount, setVisibleCount] = useState(10);
  const triangulated = events.flatMap((event) => {
    const result = readTriangulation(event.triangulation);
    return result ? [{ event, result }] : [];
  });

  if (!triangulated.length) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Aucune estimation géométrique disponible.</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Il faut au moins deux observateurs indépendants, à des endroits différents, ayant
          renseigné l’azimut et l’élévation du même phénomène. Des directions incompatibles ou trop
          proches ne permettent pas une estimation fiable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Ces positions résultent du croisement des directions déclarées. Elles ne confirment ni
        l’identification ni la nature du phénomène.
      </p>
      {triangulated.slice(0, visibleCount).map(({ event, result }) => (
        <Card key={event.id} className="border-primary/30 bg-card/50">
          <CardHeader className="px-4 pb-2 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle className="min-w-0 break-words text-sm font-semibold">
                {event.title}
              </CardTitle>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                À vérifier
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Estimation géométrique</p>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-[11px] text-muted-foreground">Latitude</dt>
                <dd className="mt-1 font-mono font-medium">
                  {formatCoordinate(result.estimated_latitude, "latitude", 3)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Longitude</dt>
                <dd className="mt-1 font-mono font-medium">
                  {formatCoordinate(result.estimated_longitude, "longitude", 3)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Altitude estimée</dt>
                <dd className="mt-1 font-mono font-medium">
                  {result.estimated_altitude_km.toFixed(1)} km
                </dd>
              </div>
            </dl>
            {result.residual_rms_km !== null && (
              <div className="space-y-1 text-xs">
                <p>
                  Écart aux lignes de visée :{" "}
                  <span className="font-mono">{result.residual_rms_km.toFixed(2)} km</span>
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Cet écart décrit l’ajustement des directions. Il ne mesure pas l’incertitude
                  réelle de la position, qui dépend aussi de la précision des mesures.
                </p>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {result.observer_count !== null
                ? result.observer_count + " observateurs indépendants"
                : event.observation_count + " signalement(s)"}
              {result.baseline_km !== null &&
                " · Séparation maximale : " + result.baseline_km.toFixed(1) + " km"}
              {result.time_span_seconds !== null &&
                " · Intervalle : " + Math.round(result.time_span_seconds) + " s"}
              {" · " + relativeTime(event.event_at)}
            </p>
          </CardContent>
        </Card>
      ))}
      {triangulated.length > visibleCount && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setVisibleCount((count) => count + 10)}
        >
          Voir les autres estimations ({triangulated.length - visibleCount})
        </Button>
      )}
    </div>
  );
}
