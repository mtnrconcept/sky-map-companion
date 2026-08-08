import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cellCenter, radecToCell } from "../domain/celestial-grid";
import { projectedCellPath, type SkyViewport } from "../domain/viewport";
import type { CelestialCell } from "../domain/types";
import { useMosaicViewport } from "../hooks/useMosaicViewport";
import { MosaicCellPanel } from "./MosaicCellPanel";
import { MosaicLegend } from "./MosaicLegend";

const WIDTH = 1000;
const HEIGHT = 520;
const MAX_VISIBLE_TILE_IMAGES = 256;

export function MosaicObservatory() {
  const [viewport, setViewport] = useState<SkyViewport>({
    centerRaDeg: 10.6847,
    centerDecDeg: 41.2692,
    widthDeg: 120,
    heightDeg: 62.4,
  });
  const [selected, setSelected] = useState<CelestialCell | null>(null);
  const { order, proceduralCells, coveredCells, loading, error } = useMosaicViewport(viewport);
  const coverageByIndex = useMemo(
    () => new Map(coveredCells.map((cell) => [cell.healpix_index, cell])),
    [coveredCells],
  );
  const imagedCellIndices = useMemo(() => {
    const distanceFromCenter = (cell: (typeof coveredCells)[number]) => {
      const center = cellCenter({ order: cell.healpix_order, index: cell.healpix_index });
      let deltaRa = Math.abs(center.raDeg - viewport.centerRaDeg);
      if (deltaRa > 180) deltaRa = 360 - deltaRa;
      return (
        deltaRa * Math.cos((viewport.centerDecDeg * Math.PI) / 180) +
        Math.abs(center.decDeg - viewport.centerDecDeg)
      );
    };
    return new Set(
      coveredCells
        .filter((cell) => cell.tile_url)
        .sort((left, right) => distanceFromCenter(left) - distanceFromCenter(right))
        .slice(0, MAX_VISIBLE_TILE_IMAGES)
        .map((cell) => cell.healpix_index),
    );
  }, [coveredCells, viewport.centerDecDeg, viewport.centerRaDeg]);
  const selectedCoverage =
    selected && selected.order === order ? (coverageByIndex.get(selected.index) ?? null) : null;

  useEffect(() => setSelected(null), [order]);

  const zoom = (factor: number) => {
    setViewport((current) => {
      const widthDeg = Math.min(180, Math.max(3.5, current.widthDeg * factor));
      return { ...current, widthDeg, heightDeg: widthDeg * (HEIGHT / WIDTH) };
    });
  };
  const pan = (ra: number, dec: number) =>
    setViewport((current) => ({
      ...current,
      centerRaDeg: (((current.centerRaDeg + ra) % 360) + 360) % 360,
      centerDecDeg: Math.max(-85, Math.min(85, current.centerDecDeg + dec)),
    }));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <Card className="overflow-hidden bg-slate-950">
        <CardHeader className="border-b border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto text-sm text-white">
              Observatoire multi-résolution
            </CardTitle>
            {order ? (
              <Badge variant="secondary">Ordre {order}</Badge>
            ) : (
              <Badge variant="outline">Vue globale</Badge>
            )}
            {loading && (
              <span className="text-[11px] text-cyan-300" role="status" aria-live="polite">
                Chargement…
              </span>
            )}
            <Button size="sm" variant="secondary" onClick={() => zoom(0.5)} aria-label="Zoomer">
              +
            </Button>
            <Button size="sm" variant="secondary" onClick={() => zoom(2)} aria-label="Dézoomer">
              −
            </Button>
            {order && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setSelected(radecToCell(order, viewport.centerRaDeg, viewport.centerDecDeg))
                }
              >
                Inspecter le centre
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => pan(-viewport.widthDeg * 0.3, 0)}>
              ← RA
            </Button>
            <Button size="sm" variant="ghost" onClick={() => pan(viewport.widthDeg * 0.3, 0)}>
              RA →
            </Button>
            <Button size="sm" variant="ghost" onClick={() => pan(0, viewport.heightDeg * 0.3)}>
              Dec ↑
            </Button>
            <Button size="sm" variant="ghost" onClick={() => pan(0, -viewport.heightDeg * 0.3)}>
              Dec ↓
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full touch-none"
            role="img"
            aria-label="Mosaïque interactive de l’univers"
            onWheel={(event) => {
              event.preventDefault();
              zoom(event.deltaY > 0 ? 1.25 : 0.8);
            }}
          >
            <defs>
              <radialGradient id="mosaic-space" cx="50%" cy="45%" r="70%">
                <stop offset="0" stopColor="#172554" />
                <stop offset="1" stopColor="#020617" />
              </radialGradient>
              {coveredCells.map((cell) =>
                cell.tile_url && imagedCellIndices.has(cell.healpix_index) ? (
                  <pattern
                    key={`${cell.healpix_order}:${cell.healpix_index}`}
                    id={`mosaic-tile-${cell.healpix_order}-${cell.healpix_index}`}
                    width="1"
                    height="1"
                    patternContentUnits="objectBoundingBox"
                  >
                    <image
                      href={cell.tile_url}
                      width="1"
                      height="1"
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </pattern>
                ) : null,
              )}
            </defs>
            <rect width={WIDTH} height={HEIGHT} fill="url(#mosaic-space)" />
            {Array.from({ length: 180 }, (_, index) => (
              <circle
                key={index}
                cx={(index * 83) % WIDTH}
                cy={(index * 47) % HEIGHT}
                r={index % 13 === 0 ? 1.5 : 0.65}
                fill="white"
                opacity={0.25 + (index % 5) * 0.12}
              />
            ))}
            {!order && (
              <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" fill="#cbd5e1" fontSize="18">
                Zoomez pour révéler la grille HEALPix
              </text>
            )}
            {proceduralCells.map((cell) => {
              const coverage = coverageByIndex.get(cell.index);
              const active = selected?.index === cell.index && selected.order === cell.order;
              const stroke = active
                ? "#fbbf24"
                : coverage?.moderation_status === "disputed"
                  ? "#a78bfa"
                  : coverage
                    ? "#22d3ee"
                    : "#475569";
              return (
                <path
                  key={cell.index}
                  d={projectedCellPath(cell, viewport, WIDTH, HEIGHT)}
                  fill={
                    coverage?.tile_url && imagedCellIndices.has(cell.index)
                      ? `url(#mosaic-tile-${cell.order}-${cell.index})`
                      : coverage
                        ? active
                          ? "#f59e0b33"
                          : "#06b6d426"
                        : "transparent"
                  }
                  stroke={stroke}
                  strokeWidth={active ? 2 : 0.65}
                  vectorEffect="non-scaling-stroke"
                  onClick={() => setSelected(cell)}
                >
                  <title>
                    {`Cellule ${cell.index}${coverage ? `, pionnier ${coverage.pioneer_name}` : ", vide"}`}
                  </title>
                </path>
              );
            })}
            {selected &&
              (() => {
                const center = cellCenter(selected);
                return (
                  <text x={12} y={HEIGHT - 14} fill="#94a3b8" fontSize="11">
                    RA {center.raDeg.toFixed(3)}° · Dec {center.decDeg.toFixed(3)}°
                  </text>
                );
              })()}
          </svg>
          <div className="border-t border-white/10 bg-slate-950 p-3">
            <MosaicLegend />
          </div>
          {error && (
            <p className="p-3 text-xs text-red-300" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cellule sélectionnée</CardTitle>
        </CardHeader>
        <CardContent>
          <MosaicCellPanel cell={selected} coverage={selectedCoverage} />
        </CardContent>
      </Card>
    </div>
  );
}
