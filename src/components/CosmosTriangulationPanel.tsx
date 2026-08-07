import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CosmosEvent } from "@/hooks/useCosmosLive";

interface TriangulationData {
  estimated_latitude?: number;
  estimated_longitude?: number;
  estimated_altitude_km?: number;
  estimated_speed_km_s?: number | null;
  error_margin_km?: number;
  confidence?: number;
  method?: string;
  trajectory?: Array<{ lat: number; lon: number; alt_km: number }>;
}

interface Props {
  events: CosmosEvent[];
}

const SIG_COLORS: Record<string, string> = {
  exceptional: "text-red-400 bg-red-500/10 border-red-500/30",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  low: "text-muted-foreground bg-muted/30",
};

function getSignificance(evt: CosmosEvent): string {
  const analysis = evt.ai_analysis as Record<string, unknown> | null;
  return (analysis?.scientific_significance as string) ?? "low";
}

export function CosmosTriangulationPanel({ events }: Props) {
  const triangulated = useMemo(
    () =>
      events.filter((e) => e.triangulation != null).slice(0, 5),
    [events]
  );

  if (triangulated.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aucune triangulation disponible pour le moment.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          3 observateurs ou plus depuis des positions différentes sont nécessaires.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {triangulated.map((evt) => {
        const tri = evt.triangulation as TriangulationData;
        const sig = getSignificance(evt);

        return (
          <Card
            key={evt.id}
            className={`border ${SIG_COLORS[sig] ?? ""} backdrop-blur-sm`}
          >
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-semibold">
                  {evt.title}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] border ${SIG_COLORS[sig] ?? ""}`}
                >
                  {sig === "exceptional"
                    ? "?? Exceptionnel"
                    : sig === "high"
                    ? "? Élevé"
                    : sig === "medium"
                    ? "?? Moyen"
                    : "• Faible"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              {/* Position triangulée */}
              {tri.estimated_latitude && tri.estimated_longitude && (
                <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/30 p-2 text-xs">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Latitude</p>
                    <p className="font-mono font-medium">
                      {tri.estimated_latitude.toFixed(3)}°
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Longitude</p>
                    <p className="font-mono font-medium">
                      {tri.estimated_longitude.toFixed(3)}°
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Altitude</p>
                    <p className="font-mono font-medium">
                      {tri.estimated_altitude_km
                        ? `${Math.round(tri.estimated_altitude_km)} km`
                        : "—"}
                    </p>
                  </div>
                </div>
              )}

              {/* Trajectoire */}
              {tri.trajectory && tri.trajectory.length > 0 && (
                <div className="text-xs">
                  <p className="mb-1 text-[10px] text-muted-foreground">
                    Trajectoire estimée ({tri.trajectory.length} points)
                  </p>
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {tri.trajectory.map((pt, i) => (
                      <span
                        key={i}
                        className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {pt.lat.toFixed(1)},{pt.lon.toFixed(1)} @{Math.round(pt.alt_km)}km
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Métadonnées */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                {tri.error_margin_km && (
                  <span>±{Math.round(tri.error_margin_km)} km d'erreur</span>
                )}
                {tri.confidence && (
                  <span>Confiance {Math.round(tri.confidence * 100)}%</span>
                )}
                {tri.method && (
                  <span className="capitalize">Méthode : {tri.method}</span>
                )}
                <span>{evt.observation_count} observation(s)</span>
              </div>

              {/* Recommandation IA */}
              {(evt.ai_analysis as Record<string, unknown>)?.recommended_action && (
                <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs italic">
                  ??{" "}
                  {
                    (evt.ai_analysis as Record<string, string>)
                      .recommended_action
                  }
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
