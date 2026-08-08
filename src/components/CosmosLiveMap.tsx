import { useMemo } from "react";
import type { CosmosObservation } from "@/hooks/useCosmosLive";

const TYPE_COLOR: Record<string, string> = {
  meteor: "#60a5fa",
  fireball: "#fb923c",
  comet: "#22d3ee",
  supernova: "#f87171",
  aurora: "#4ade80",
  satellite: "#c084fc",
  atmospheric: "#fbbf24",
  unknown: "#94a3b8",
};

interface Props {
  observations: CosmosObservation[];
  userPosition: GeolocationCoordinates | null;
  widthPx?: number;
  heightPx?: number;
}

/**
 * Mini carte SVG des observations — projection équirectangulaire simplifiée.
 * Pas de dépendance externe, fonctionne entièrement en SVG React.
 */
export function CosmosLiveMap({
  observations,
  userPosition,
  widthPx = 600,
  heightPx = 300,
}: Props) {
  const recentObs = useMemo(
    () =>
      observations
        .filter((o) => Date.now() - new Date(o.observed_at).getTime() < 2 * 3600_000)
        .slice(0, 200),
    [observations],
  );

  // Détermine les bornes de la carte
  const bounds = useMemo(() => {
    const lats = [...recentObs.map((o) => o.latitude), userPosition?.latitude ?? 0];
    const lons = [...recentObs.map((o) => o.longitude), userPosition?.longitude ?? 0];
    const minLat = Math.min(...lats) - 5;
    const maxLat = Math.max(...lats) + 5;
    const minLon = Math.min(...lons) - 5;
    const maxLon = Math.max(...lons) + 5;
    return { minLat, maxLat, minLon, maxLon };
  }, [recentObs, userPosition]);

  function project(lat: number, lon: number): [number, number] {
    const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * widthPx;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * heightPx;
    return [x, y];
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background/80 backdrop-blur-sm">
      <svg
        viewBox={`0 0 ${widthPx} ${heightPx}`}
        className="h-auto w-full"
        style={{ background: "radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)" }}
      >
        {/* Grille de fond */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={(i * widthPx) / 5}
            y1={0}
            x2={(i * widthPx) / 5}
            y2={heightPx}
            stroke="#1e293b"
            strokeWidth={0.5}
          />
        ))}
        {Array.from({ length: 4 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={(i * heightPx) / 3}
            x2={widthPx}
            y2={(i * heightPx) / 3}
            stroke="#1e293b"
            strokeWidth={0.5}
          />
        ))}

        {/* Observations */}
        {recentObs.map((obs) => {
          const [x, y] = project(obs.latitude, obs.longitude);
          const age = Date.now() - new Date(obs.observed_at).getTime();
          const opacity = Math.max(0.2, 1 - age / (2 * 3600_000));
          const color = TYPE_COLOR[obs.phenomenon_type] ?? "#94a3b8";
          const r = obs.event_id ? 5 : 3;
          return (
            <g key={obs.id} opacity={opacity}>
              {obs.event_id && (
                <circle
                  cx={x}
                  cy={y}
                  r={r + 4}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.4}
                />
              )}
              <circle cx={x} cy={y} r={r} fill={color} />
            </g>
          );
        })}

        {/* Position de l'utilisateur */}
        {userPosition &&
          (() => {
            const [x, y] = project(userPosition.latitude, userPosition.longitude);
            return (
              <g>
                <circle cx={x} cy={y} r={6} fill="none" stroke="#38bdf8" strokeWidth={2} />
                <circle cx={x} cy={y} r={3} fill="#38bdf8" />
                <circle
                  cx={x}
                  cy={y}
                  r={12}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={0.5}
                  opacity={0.4}
                >
                  <animate attributeName="r" values="10;20;10" dur="2s" repeatCount="indefinite" />
                  <animate
                    attributeName="opacity"
                    values="0.4;0;0.4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            );
          })()}

        {/* Légende */}
        {Object.entries(TYPE_COLOR)
          .slice(0, 4)
          .map(([type, color], i) => (
            <g key={type} transform={`translate(${widthPx - 120}, ${10 + i * 16})`}>
              <circle cx={5} cy={5} r={4} fill={color} />
              <text x={13} y={9} fill="#94a3b8" fontSize={9} fontFamily="monospace">
                {type}
              </text>
            </g>
          ))}
      </svg>

      {/* Compteurs */}
      <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{recentObs.length}</span> observations (2h)
        </span>
        {userPosition && (
          <span>
            📍 {userPosition.latitude.toFixed(2)}°, {userPosition.longitude.toFixed(2)}°
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="inline-block size-2 animate-pulse rounded-full bg-green-500" />
          EN DIRECT
        </span>
      </div>
    </div>
  );
}
