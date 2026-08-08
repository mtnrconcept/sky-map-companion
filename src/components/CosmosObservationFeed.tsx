import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CosmosObservation, CosmosEvent } from "@/hooks/useCosmosLive";

const PHENOMENON_LABELS: Record<string, string> = {
  meteor: "☄️ Météore",
  fireball: "🔥 Bolide",
  comet: "☄️ Comète",
  supernova: "💥 Supernova",
  aurora: "🌌 Aurore",
  satellite: "🛰️ Satellite",
  atmospheric: "🌈 Atmosphérique",
  unknown: "❔ Inconnu",
};

const PHENOMENON_COLORS: Record<string, string> = {
  meteor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  fireball: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  comet: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  supernova: "bg-red-500/20 text-red-300 border-red-500/30",
  aurora: "bg-green-500/20 text-green-300 border-green-500/30",
  satellite: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  atmospheric: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  unknown: "bg-muted text-muted-foreground",
};

interface Props {
  observations: CosmosObservation[];
  events: CosmosEvent[];
  userPosition: GeolocationCoordinates | null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  return `il y a ${h}h`;
}

function distance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function CosmosObservationFeed({ observations, events, userPosition }: Props) {
  const recentObs = useMemo(() => observations.slice(0, 50), [observations]);

  return (
    <div className="space-y-3">
      {/* Événements confirmés en haut */}
      {events.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Événements détectés ({events.length})
          </p>
          {events.slice(0, 5).map((evt) => (
            <Card key={evt.id} className="border-primary/30 bg-primary/5 backdrop-blur-sm">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-tight">
                    {PHENOMENON_LABELS[evt.phenomenon_type] ?? evt.phenomenon_type} — {evt.title}
                  </CardTitle>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {evt.observation_count} obs.
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {evt.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{evt.description}</p>
                )}
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{timeAgo(evt.event_at)}</span>
                  <span>·</span>
                  <span className="capitalize">{evt.status}</span>
                  {evt.confidence_score != null && (
                    <>
                      <span>·</span>
                      <span>Confiance {Math.round(evt.confidence_score * 100)}%</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Flux des observations brutes */}
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Observations en direct ({observations.length})
      </p>
      {recentObs.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucune observation récente. Soyez le premier à signaler un phénomène !
        </p>
      )}
      <div className="space-y-2">
        {recentObs.map((obs) => (
          <div
            key={obs.id}
            className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 p-3 backdrop-blur-sm"
          >
            <span
              className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${PHENOMENON_COLORS[obs.phenomenon_type] ?? ""}`}
            >
              {PHENOMENON_LABELS[obs.phenomenon_type] ?? obs.phenomenon_type}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground line-clamp-2">{obs.description}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {timeAgo(obs.observed_at)}
                {userPosition && (
                  <>
                    {" "}
                    · à ~
                    {distance(
                      userPosition.latitude,
                      userPosition.longitude,
                      obs.latitude,
                      obs.longitude,
                    )}{" "}
                    km
                  </>
                )}
                {obs.event_id && <span className="ml-2 text-primary">✓ regroupé</span>}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
