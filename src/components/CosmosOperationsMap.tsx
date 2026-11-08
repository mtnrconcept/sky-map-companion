import { useEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { LocateFixed, Maximize2, Minus, Plus } from "lucide-react";
import {
  PHENOMENA,
  type CosmosEvent,
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

export type CosmosMapMode = "map" | "trajectories" | "density" | "network";

interface Props {
  observations: CosmosObservation[];
  events: CosmosEvent[];
  selectedEventId: string | null;
  selectedObservationId: string | null;
  onSelectObservation: (id: string) => void;
  userPosition: ObserverPosition | null;
  mode: CosmosMapMode;
}

const WIDTH = 920;
const HEIGHT = 540;
const fallback: MapView = { latitude: 46.4, longitude: 6.8, zoom: 5 };

export function CosmosOperationsMap({
  observations,
  events,
  selectedEventId,
  selectedObservationId,
  onSelectObservation,
  userPosition,
  mode,
}: Props) {
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const points = useMemo(
    () => [
      ...observations,
      ...events.flatMap((event) =>
        event.triangulation
          ? [
              {
                latitude: event.triangulation.estimated_latitude,
                longitude: event.triangulation.estimated_longitude,
              },
            ]
          : [],
      ),
      ...(userPosition ? [userPosition] : []),
    ],
    [observations, events, userPosition],
  );
  const automaticView = useMemo(
    () => (points.length ? fitMapView(points, WIDTH, HEIGHT) : fallback),
    [points],
  );
  const [manualView, setManualView] = useState<MapView | null>(null);
  const view = manualView ?? automaticView;
  const tiles = useMemo(() => visibleTiles(view, WIDTH, HEIGHT), [view]);
  const [failures, setFailures] = useState<Set<string>>(new Set());
  const [retry, setRetry] = useState(0);
  const drag = useRef<{ id: number; x: number; y: number; view: MapView } | null>(null);
  const selectedObservation = observations.find(
    (observation) => observation.id === selectedObservationId,
  );
  const selectedLatitude = selectedObservation?.latitude;
  const selectedLongitude = selectedObservation?.longitude;

  useEffect(() => {
    if (selectedLatitude === undefined || selectedLongitude === undefined) return;
    setManualView((current) => ({
      latitude: selectedLatitude,
      longitude: selectedLongitude,
      zoom: Math.max(current?.zoom ?? 5, 5),
    }));
  }, [selectedLatitude, selectedLongitude, selectedObservationId]);

  function zoomBy(delta: number) {
    setManualView({ ...view, zoom: Math.max(1, Math.min(MAP_MAX_ZOOM, view.zoom + delta)) });
  }
  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setManualView(
      panView(
        start.view,
        ((event.clientX - start.x) * WIDTH) / rect.width,
        ((event.clientY - start.y) * HEIGHT) / rect.height,
      ),
    );
  }
  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [100, 0],
      ArrowRight: [-100, 0],
      ArrowUp: [0, 100],
      ArrowDown: [0, -100],
    };
    const movement = moves[event.key];
    if (movement) {
      event.preventDefault();
      setManualView(panView(view, ...movement));
    } else if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault();
      zoomBy(event.key === "-" ? -1 : 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setManualView(automaticView);
    }
  }

  const focus = selectedEvent?.triangulation;
  const observers = selectedEvent
    ? observations.filter((obs) => obs.event_id === selectedEvent.id)
    : [];
  const center = focus
    ? projectViewport(
        {
          latitude: focus.estimated_latitude,
          longitude: focus.estimated_longitude,
        },
        view,
        WIDTH,
        HEIGHT,
      )
    : null;
  const failed = tiles.some((tile) => failures.has(tile.url));

  return (
    <div className="cs-ops-map">
      <svg
        className="cs-ops-map-svg"
        viewBox={"0 0 " + WIDTH + " " + HEIGHT}
        role="group"
        tabIndex={0}
        aria-label="Carte interactive des positions publiques approximatives des observations"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerCancel={onPointerUp}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <defs>
          <radialGradient id="cs-map-halo">
            <stop stopColor="#a855f7" stopOpacity=".8" />
            <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cs-map-link">
            <stop stopColor="#fbbf24" />
            <stop offset="1" stopColor="#ae73ff" />
          </linearGradient>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="#071223" />
        {tiles.map((tile) => (
          <image
            key={tile.key + ":" + retry}
            href={tile.url}
            x={tile.x}
            y={tile.y}
            width={TILE_SIZE}
            height={TILE_SIZE}
            pointerEvents="none"
            className="cs-map-tile"
            onError={() => setFailures((previous) => new Set(previous).add(tile.url))}
            onLoad={() =>
              setFailures((previous) => {
                if (!previous.has(tile.url)) return previous;
                const next = new Set(previous);
                next.delete(tile.url);
                return next;
              })
            }
          />
        ))}
        {Array.from({ length: 7 }, (_, i) => i * 20 - 60).map((latitude) => {
          const y = projectViewport({ latitude, longitude: view.longitude }, view, WIDTH, HEIGHT).y;
          return y > 0 && y < HEIGHT ? (
            <line
              key={latitude}
              x1={0}
              y1={y}
              x2={WIDTH}
              y2={y}
              stroke="#56a7d3"
              strokeOpacity=".16"
              strokeDasharray="5 9"
            />
          ) : null;
        })}
        {Array.from({ length: 13 }, (_, i) => i * 30 - 180).map((longitude) => {
          const x = projectViewport({ latitude: view.latitude, longitude }, view, WIDTH, HEIGHT).x;
          return x > 0 && x < WIDTH ? (
            <line
              key={longitude}
              x1={x}
              y1={0}
              x2={x}
              y2={HEIGHT}
              stroke="#56a7d3"
              strokeOpacity=".16"
              strokeDasharray="5 9"
            />
          ) : null;
        })}
        {mode === "density" &&
          observations.map((obs) => {
            const p = projectViewport(obs, view, WIDTH, HEIGHT);
            return (
              <circle
                key={obs.id}
                cx={p.x}
                cy={p.y}
                r="48"
                fill="#22d3ee"
                opacity=".12"
                pointerEvents="none"
              />
            );
          })}
        {(mode === "network" || mode === "trajectories" || mode === "map") &&
          center &&
          observers.map((obs) => {
            const p = projectViewport(obs, view, WIDTH, HEIGHT);
            return (
              <line
                key={obs.id}
                x1={p.x}
                y1={p.y}
                x2={center.x}
                y2={center.y}
                stroke="url(#cs-map-link)"
                strokeWidth={mode === "map" ? 2 : 3.2}
                strokeOpacity={mode === "map" ? 0.45 : 0.95}
                strokeDasharray={mode === "map" ? "8 6" : undefined}
                pointerEvents="none"
              />
            );
          })}
        {center && (
          <>
            <circle
              cx={center.x}
              cy={center.y}
              r={58}
              fill="url(#cs-map-halo)"
              pointerEvents="none"
            />
            <circle
              cx={center.x}
              cy={center.y}
              r={19}
              fill="#220e47"
              stroke="#b26dff"
              strokeWidth={3}
              pointerEvents="none"
            />
            <circle cx={center.x} cy={center.y} r={6} fill="#d7aeff" pointerEvents="none" />
          </>
        )}
        {observations.map((obs) => {
          const p = projectViewport(obs, view, WIDTH, HEIGHT);
          if (p.x < -20 || p.x > WIDTH + 20 || p.y < -20 || p.y > HEIGHT + 20) return null;
          const color =
            PHENOMENA.find((item) => item.value === obs.phenomenon_type)?.color ?? "#bcd";
          const selected = obs.id === selectedObservationId;
          return (
            <g
              key={obs.id}
              transform={"translate(" + p.x + " " + p.y + ")"}
              role="button"
              tabIndex={0}
              aria-label={"Observation " + obs.phenomenon_type + " : " + obs.description}
              aria-pressed={selected}
              className="cs-map-marker"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelectObservation(obs.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectObservation(obs.id);
                }
              }}
            >
              <title>{obs.description}</title>
              <circle r={23} fill="transparent" />
              <circle
                r={selected ? 18 : 12}
                fill="#020d1a"
                stroke={selected ? "#fff" : color}
                strokeWidth={selected ? 3 : 2.5}
              />
              <circle r={selected ? 7 : 5.5} fill={color} />
              {obs.event_id && (
                <circle
                  r={21}
                  fill="none"
                  stroke={color}
                  strokeOpacity=".65"
                  strokeDasharray="3 4"
                />
              )}
            </g>
          );
        })}
        {userPosition &&
          (() => {
            const p = projectViewport(userPosition, view, WIDTH, HEIGHT);
            return (
              <g transform={"translate(" + p.x + " " + p.y + ")"} pointerEvents="none">
                <circle r="13" fill="#06121e" stroke="white" strokeWidth="2" />
                <path d="M-8 0H8M0 -8V8" stroke="#22d3ee" strokeWidth="2" />
              </g>
            );
          })()}
      </svg>
      {selectedEvent && (
        <div className="cs-map-legend">
          <strong>{selectedEvent.title}</strong>
          <span>
            <b className="cs-legend-point" /> Observations ({observers.length})
          </span>
          <span>
            <b className="cs-legend-target" /> {focus ? "Position estimée" : "Position non estimée"}
          </span>
          {focus && (
            <span>
              <b className="cs-legend-line" /> Liaisons indicatives
            </span>
          )}
        </div>
      )}
      <div className="cs-map-controls">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          aria-label="Zoom avant"
          disabled={view.zoom >= MAP_MAX_ZOOM}
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          aria-label="Zoom arrière"
          disabled={view.zoom <= 1}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          onClick={() => setManualView(automaticView)}
          aria-label="Ajuster la carte aux observations"
        >
          <Maximize2 size={15} />
        </button>
        <button
          type="button"
          onClick={() => userPosition && setManualView({ ...userPosition, zoom: 6 })}
          aria-label="Centrer sur mon lieu"
          disabled={!userPosition}
        >
          <LocateFixed size={15} />
        </button>
      </div>
      {!observations.length && (
        <div className="cs-map-empty" role="status">
          <strong>Carte prête</strong>
          <span>Aucune observation publique pour cette période.</span>
        </div>
      )}
      {failed && (
        <button
          type="button"
          className="cs-map-tile-retry"
          onClick={() => {
            setFailures(new Set());
            setRetry((v) => v + 1);
          }}
        >
          Fond indisponible · réessayer
        </button>
      )}
      <p className="cs-map-attribution">
        ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{" "}
        contributors
      </p>
      <p className="cs-map-privacy">Positions arrondies à 0,1° · lignes indicatives</p>
    </div>
  );
}
