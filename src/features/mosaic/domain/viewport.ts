import { cellBoundary, radecToCell } from "./celestial-grid";
import type { CelestialCell, EquatorialCoordinate, SkyOrder } from "./types";

export interface SkyViewport {
  centerRaDeg: number;
  centerDecDeg: number;
  widthDeg: number;
  heightDeg: number;
}

const CELL_SIZE_DEG: Record<SkyOrder, number> = { 6: 0.916, 7: 0.458, 8: 0.229, 9: 0.115 };

export function orderForViewport(widthDeg: number): SkyOrder | null {
  if (widthDeg <= 7.5) return 9;
  if (widthDeg <= 15) return 8;
  if (widthDeg <= 30) return 7;
  if (widthDeg <= 60) return 6;
  return null;
}

export function cellsForViewport(
  viewport: SkyViewport,
  order: SkyOrder,
  maxCells = 4_000,
): CelestialCell[] {
  const step = CELL_SIZE_DEG[order] * 0.8;
  const halfWidth = viewport.widthDeg / 2;
  const halfHeight = viewport.heightDeg / 2;
  const minimumDec = Math.max(-90, viewport.centerDecDeg - halfHeight - step);
  const maximumDec = Math.min(90, viewport.centerDecDeg + halfHeight + step);
  const indices = new Map<number, CelestialCell>();
  for (let dec = minimumDec; dec <= maximumDec; dec += step) {
    const raCorrection = Math.max(0.15, Math.cos((dec * Math.PI) / 180));
    const raStep = step / raCorrection;
    for (let offset = -halfWidth - raStep; offset <= halfWidth + raStep; offset += raStep) {
      const cell = radecToCell(order, viewport.centerRaDeg + offset, dec);
      indices.set(cell.index, cell);
      if (indices.size >= maxCells) return [...indices.values()];
    }
  }
  return [...indices.values()];
}

export function projectCoordinate(
  coordinate: EquatorialCoordinate,
  viewport: SkyViewport,
  width: number,
  height: number,
): { x: number; y: number } {
  let deltaRa = coordinate.raDeg - viewport.centerRaDeg;
  if (deltaRa > 180) deltaRa -= 360;
  if (deltaRa < -180) deltaRa += 360;
  return {
    x: width / 2 + (deltaRa / viewport.widthDeg) * width,
    y: height / 2 - ((coordinate.decDeg - viewport.centerDecDeg) / viewport.heightDeg) * height,
  };
}

export function projectedCellPath(
  cell: CelestialCell,
  viewport: SkyViewport,
  width: number,
  height: number,
) {
  return (
    cellBoundary(cell)
      .map((coordinate, index) => {
        const point = projectCoordinate(coordinate, viewport, width, height);
        return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(" ") + " Z"
  );
}
