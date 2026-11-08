import { useMemo, useRef, useState, type PointerEvent } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { type CosmosEvent, type CosmosObservation } from "@/features/cosmos/domain/client-state";

interface Props {
  event: CosmosEvent | null;
  observations: CosmosObservation[];
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

function localPoint(
  latitude: number,
  longitude: number,
  originLat: number,
  originLon: number,
  altitudeKm = 0,
): Point3D {
  return {
    x: (longitude - originLon) * 111.195 * Math.cos((originLat * Math.PI) / 180),
    y: (latitude - originLat) * 111.195,
    z: altitudeKm,
  };
}

export function CosmosTriangulationScene({ event, observations }: Props) {
  const [yaw, setYaw] = useState(-0.48);
  const [tilt, setTilt] = useState(0.65);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ id: number; x: number; y: number; yaw: number; tilt: number } | null>(null);
  const estimation = event?.triangulation ?? null;
  const model = useMemo(() => {
    const latitude = estimation?.estimated_latitude ?? 46.4;
    const longitude = estimation?.estimated_longitude ?? 7.5;
    const points = observations.map((point) =>
      localPoint(point.latitude, point.longitude, latitude, longitude),
    );
    const siteExtent = Math.max(65, ...points.map((p) => Math.hypot(p.x, p.y)));
    const radius = Math.min(
      1200,
      Math.max(siteExtent * 1.2, (estimation?.estimated_altitude_km ?? 60) * 1.3, 80),
    );
    return {
      radius,
      points,
      target: estimation
        ? localPoint(latitude, longitude, latitude, longitude, estimation.estimated_altitude_km)
        : null,
    };
  }, [estimation, observations]);
  const scale = (165 / model.radius) * zoom;
  const project = (point: Point3D): { x: number; y: number } => {
    const rx = point.x * Math.cos(yaw) - point.y * Math.sin(yaw);
    const ry = point.x * Math.sin(yaw) + point.y * Math.cos(yaw);
    return {
      x: Math.round((300 + rx * scale) * 1000) / 1000,
      y:
        Math.round((230 + ry * Math.sin(tilt) * scale - point.z * Math.cos(tilt) * scale) * 1000) /
        1000,
    };
  };
  const grid = Array.from({ length: 9 }, (_, i) => ((i - 4) * model.radius) / 4);
  const target = model.target ? project(model.target) : null;

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, tilt };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    setYaw(start.yaw + (event.clientX - start.x) * 0.011);
    setTilt(Math.max(0.24, Math.min(1.27, start.tilt + (event.clientY - start.y) * 0.006)));
  }
  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className="cs-triang-layout">
      <div className="cs-triang-canvas">
        <div className="cs-3d-tools">
          <button
            type="button"
            onClick={() => setZoom((v) => Math.min(2.1, v + 0.2))}
            aria-label="Agrandir la vue 3D"
          >
            <ZoomIn size={15} />
          </button>
          <button
            type="button"
            onClick={() => setZoom((v) => Math.max(0.55, v - 0.2))}
            aria-label="Réduire la vue 3D"
          >
            <ZoomOut size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              setYaw(-0.48);
              setTilt(0.65);
              setZoom(1);
            }}
            aria-label="Réinitialiser la vue 3D"
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <svg
          className="cs-3d-svg"
          viewBox="0 0 600 290"
          role="img"
          aria-label={
            estimation
              ? "Vue 3D indicative des positions publiques des témoins reliées à l'estimation géométrique"
              : "Grille tridimensionnelle en attente d'une estimation géométrique"
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <radialGradient id="cs-tri-aura">
              <stop stopColor="#e8b8ff" stopOpacity=".95" />
              <stop offset=".26" stopColor="#9f56ff" stopOpacity=".4" />
              <stop offset="1" stopColor="#9f56ff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="cs-tri-ray" x1="0" x2="1">
              <stop stopColor="#2dd4bf" stopOpacity=".35" />
              <stop offset="1" stopColor="#ae7aff" stopOpacity=".98" />
            </linearGradient>
          </defs>
          {grid.map((v) => {
            const a = project({ x: v, y: -model.radius, z: 0 });
            const b = project({ x: v, y: model.radius, z: 0 });
            const c = project({ x: -model.radius, y: v, z: 0 });
            const d = project({ x: model.radius, y: v, z: 0 });
            return (
              <g key={v}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#217c93"
                  strokeOpacity=".31"
                  strokeWidth="1"
                />
                <line
                  x1={c.x}
                  y1={c.y}
                  x2={d.x}
                  y2={d.y}
                  stroke="#217c93"
                  strokeOpacity=".31"
                  strokeWidth="1"
                />
              </g>
            );
          })}
          {target &&
            model.points.map((point, i) => {
              const from = project(point);
              return (
                <g key={observations[i]?.id ?? i}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="url(#cs-tri-ray)"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={from.x}
                    cy={from.y}
                    r={5}
                    fill="#12eab6"
                    stroke="#063e43"
                    strokeWidth="2"
                  />
                  <text x={from.x + 8} y={from.y - 8} fill="#89e6d6" fontSize="12">
                    {i + 1}
                  </text>
                </g>
              );
            })}
          {target && (
            <>
              <line
                x1={target.x}
                x2={project({ x: 0, y: 0, z: 0 }).x}
                y1={target.y}
                y2={project({ x: 0, y: 0, z: 0 }).y}
                stroke="#e0aaff"
                strokeDasharray="4 5"
                strokeOpacity=".7"
              />
              <circle cx={target.x} cy={target.y} r="49" fill="url(#cs-tri-aura)" />
              <circle cx={target.x} cy={target.y} r="5" fill="#fff" />
              <path
                d={
                  "M" +
                  (target.x - 10) +
                  " " +
                  target.y +
                  "h20 M" +
                  target.x +
                  " " +
                  (target.y - 10) +
                  "v20"
                }
                stroke="#fff"
                strokeWidth=".8"
              />
            </>
          )}
        </svg>
        {!estimation && <p className="cs-3d-empty">Aucune triangulation mesurée pour le moment.</p>}
        <span className="cs-3d-caption">Glisser pour orienter · projection 3D indicative</span>
      </div>
      <dl className="cs-3d-readings">
        <div>
          <dt>Témoins rattachés</dt>
          <dd>{estimation?.observer_count ?? (event ? event.observation_count : "—")}</dd>
        </div>
        <div>
          <dt>Écart aux visées</dt>
          <dd>
            {estimation?.residual_rms_km != null
              ? estimation.residual_rms_km.toFixed(2) + " km"
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Base géométrique</dt>
          <dd>
            {estimation?.baseline_km != null ? estimation.baseline_km.toFixed(1) + " km" : "—"}
          </dd>
        </div>
        <div>
          <dt>Intervalle</dt>
          <dd>
            {estimation?.time_span_seconds != null
              ? estimation.time_span_seconds.toFixed(1) + " s"
              : "—"}
          </dd>
        </div>
        <p>
          Positions publiques arrondies ; schéma indicatif, non une reconstruction des mesures
          privées.
        </p>
      </dl>
    </div>
  );
}
