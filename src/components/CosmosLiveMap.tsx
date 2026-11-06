import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { LocateFixed, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PHENOMENA,
  formatCoordinate,
  phenomenonLabel,
  type CosmosObservation,
  type ObserverPosition,
} from "@/features/cosmos/domain/client-state";
import {
  fitMapView,
  MAP_MAX_ZOOM,
  panView,
  projectViewport,
  TILE_SIZE,
  visibleTiles,
  type MapView,
} from "@/features/cosmos/domain/map-projection";

interface Props {
  observations: CosmosObservation[];
  userPosition: ObserverPosition | null;
  selectedObservationId?: string | null;
  onSelectObservation?: (id: string) => void;
  isLive?: boolean;
  widthPx?: number;
  heightPx?: number;
}

export function CosmosLiveMap({
  observations,
  userPosition,
  selectedObservationId = null,
  onSelectObservation,
  isLive = false,
  widthPx = 800,
  heightPx = 420,
}: Props) {
  const automaticView = useMemo(
    () => fitMapView([...observations, ...(userPosition ? [userPosition] : [])], widthPx, heightPx),
    [observations, userPosition, widthPx, heightPx],
  );
  const [manualView, setManualView] = useState<MapView | null>(null);
  const view = manualView ?? automaticView;
  const tiles = useMemo(() => visibleTiles(view, widthPx, heightPx), [view, widthPx, heightPx]);
  const [failedTiles, setFailedTiles] = useState<Set<string>>(new Set());
  const [tileAttempt, setTileAttempt] = useState(0);
  const hasTileFailure = tiles.some((tile) => failedTiles.has(tile.url));
  const selected = observations.find((observation) => observation.id === selectedObservationId);
  const selectedLatitude = selected?.latitude;
  const selectedLongitude = selected?.longitude;
  const drag = useRef<{ pointerId: number; x: number; y: number; view: MapView } | null>(null);

  useEffect(() => {
    if (selectedLatitude === undefined || selectedLongitude === undefined) return;
    setManualView((current) => ({
      latitude: selectedLatitude,
      longitude: selectedLongitude,
      zoom: Math.max(current?.zoom ?? 5, 5),
    }));
  }, [selectedObservationId, selectedLatitude, selectedLongitude]);

  function zoomBy(delta: number) {
    setManualView({ ...view, zoom: Math.max(1, Math.min(MAP_MAX_ZOOM, view.zoom + delta)) });
  }

  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setManualView(
      panView(
        start.view,
        ((event.clientX - start.x) * widthPx) / rect.width,
        ((event.clientY - start.y) * heightPx) / rect.height,
      ),
    );
  }

  function stopDrag(event: PointerEvent<SVGSVGElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKeys(event: KeyboardEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [100, 0],
      ArrowRight: [-100, 0],
      ArrowUp: [0, 100],
      ArrowDown: [0, -100],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setManualView(panView(view, ...move));
    } else if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault();
      zoomBy(event.key === "-" ? -1 : 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setManualView(automaticView);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{observations.length}</span> signalement(s)
          <span className="ml-2">{isLive ? "· Flux actualisé" : "· Dernières données reçues"}</span>
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => zoomBy(-1)}
            disabled={view.zoom <= 1}
            aria-label="Dézoomer la carte"
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => zoomBy(1)}
            disabled={view.zoom >= MAP_MAX_ZOOM}
            aria-label="Zoomer la carte"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setManualView(automaticView)}
            aria-label="Afficher tous les signalements"
          >
            <Maximize2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!userPosition}
            onClick={() => {
              if (userPosition) setManualView({ ...userPosition, zoom: 6 });
            }}
            aria-label="Centrer sur mon lieu d’observation"
          >
            <LocateFixed className="size-4" />
          </Button>
        </div>
      </div>

      <div className="relative bg-slate-950">
        <svg
          viewBox={"0 0 " + widthPx + " " + heightPx}
          className="block h-auto w-full cursor-grab focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
          style={{ touchAction: "none" }}
          tabIndex={0}
          role="group"
          aria-label="Carte géographique des signalements"
          aria-describedby="cosmos-map-help"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onKeyDown={handleKeys}
        >
          <title>Positions approximatives des observations</title>
          <rect width={widthPx} height={heightPx} fill="#0f172a" />
          {tiles.map((tile) => (
            <image
              key={tile.key + ":" + tileAttempt}
              href={tile.url}
              x={tile.x}
              y={tile.y}
              width={TILE_SIZE}
              height={TILE_SIZE}
              opacity={0.72}
              pointerEvents="none"
              onError={() => setFailedTiles((current) => new Set(current).add(tile.url))}
              onLoad={() =>
                setFailedTiles((current) => {
                  if (!current.has(tile.url)) return current;
                  const next = new Set(current);
                  next.delete(tile.url);
                  return next;
                })
              }
            />
          ))}
          {[-60, -30, 0, 30, 60].map((latitude) => {
            const y = projectViewport(
              { latitude, longitude: view.longitude },
              view,
              widthPx,
              heightPx,
            ).y;
            if (y < 12 || y > heightPx - 12) return null;
            return (
              <g key={"lat" + latitude} pointerEvents="none">
                <line
                  x1={0}
                  y1={y}
                  x2={widthPx}
                  y2={y}
                  stroke="#475569"
                  strokeWidth={0.6}
                  strokeDasharray="4 5"
                />
                <text
                  x={8}
                  y={y - 4}
                  fill="#f8fafc"
                  fontSize={12}
                  stroke="#0f172a"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {formatCoordinate(latitude, "latitude", 0)}
                </text>
              </g>
            );
          })}
          {Array.from({ length: 12 }, (_, index) => index * 30 - 180).map((longitude) => {
            const x = projectViewport(
              { latitude: view.latitude, longitude },
              view,
              widthPx,
              heightPx,
            ).x;
            if (x < 12 || x > widthPx - 12) return null;
            return (
              <g key={"lon" + longitude} pointerEvents="none">
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={heightPx}
                  stroke="#475569"
                  strokeWidth={0.6}
                  strokeDasharray="4 5"
                />
                <text
                  x={x + 4}
                  y={heightPx - 12}
                  fill="#f8fafc"
                  fontSize={12}
                  stroke="#0f172a"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {formatCoordinate(longitude, "longitude", 0)}
                </text>
              </g>
            );
          })}
          {observations.map((observation) => {
            const { x, y } = projectViewport(observation, view, widthPx, heightPx);
            if (x < -16 || x > widthPx + 16 || y < -16 || y > heightPx + 16) return null;
            const color =
              PHENOMENA.find((item) => item.value === observation.phenomenon_type)?.color ??
              "#cbd5e1";
            const isSelected = observation.id === selectedObservationId;
            return (
              <g
                key={observation.id}
                transform={"translate(" + x + " " + y + ")"}
                tabIndex={0}
                role="button"
                aria-label={
                  phenomenonLabel(observation.phenomenon_type) + " : " + observation.description
                }
                aria-pressed={isSelected}
                className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onSelectObservation?.(observation.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectObservation?.(observation.id);
                  }
                }}
              >
                <title>
                  {phenomenonLabel(observation.phenomenon_type) + " — " + observation.description}
                </title>
                <circle r={20} fill="transparent" />
                <circle
                  r={isSelected ? 13 : 10}
                  fill="#0f172a"
                  stroke={isSelected ? "#ffffff" : color}
                  strokeWidth={2.5}
                />
                <circle r={5} fill={color} />
                {observation.event_id && (
                  <circle
                    r={16}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                  />
                )}
              </g>
            );
          })}
          {userPosition &&
            (() => {
              const { x, y } = projectViewport(userPosition, view, widthPx, heightPx);
              return (
                <g transform={"translate(" + x + " " + y + ")"} pointerEvents="none">
                  <title>Votre lieu d’observation, visible uniquement par vous</title>
                  <circle r={12} fill="#0f172a" stroke="#ffffff" strokeWidth={2} />
                  <path d="M-6 0H6M0 -6V6" stroke="#38bdf8" strokeWidth={3} />
                </g>
              );
            })()}
        </svg>
        <div className="absolute bottom-1 right-1 rounded bg-slate-950/90 px-2 py-1 text-[10px] text-slate-200">
          ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="underline focus-visible:outline"
          >
            OpenStreetMap
          </a>{" "}
          contributors
        </div>
      </div>

      {hasTileFailure && (
        <div
          className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground"
          role="status"
        >
          <span>
            Fond de carte indisponible. Les points, coordonnées et la liste restent accessibles.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFailedTiles(new Set());
              setTileAttempt((attempt) => attempt + 1);
            }}
          >
            Recharger le fond
          </Button>
        </div>
      )}
      {selected && (
        <div
          className="space-y-1 border-t border-primary/30 bg-primary/5 px-4 py-3 text-sm"
          aria-live="polite"
        >
          <p className="font-semibold">{phenomenonLabel(selected.phenomenon_type)}</p>
          <p className="break-words text-muted-foreground">{selected.description}</p>
          <p className="text-xs text-muted-foreground">
            Position publique approximative : {formatCoordinate(selected.latitude, "latitude")},{" "}
            {formatCoordinate(selected.longitude, "longitude")}
          </p>
        </div>
      )}
      <div className="space-y-2 border-t border-border px-3 py-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          {PHENOMENA.map((item) => (
            <span key={item.value} className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              {item.label}
            </span>
          ))}
        </div>
        <p id="cosmos-map-help" className="text-[11px] leading-relaxed text-muted-foreground">
          Déplacez la carte au doigt ou à la souris. Au clavier : flèches, +, − et Début.
          Sélectionnez un point ou une observation dans la liste. Les positions publiques sont
          arrondies à 0,1° ; elles ne localisent pas exactement les témoins.
        </p>
      </div>
    </div>
  );
}
