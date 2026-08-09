import * as healpix from "@hscmap/healpix";
import type { CelestialCell, EquatorialCoordinate, SkyOrder, SkyResolutionClass } from "./types";

const degreesToRadians = (value: number) => (value * Math.PI) / 180;
const radiansToDegrees = (value: number) => (value * 180) / Math.PI;

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

export function normalizeRa(raDeg: number): number {
  assertFinite(raDeg, "right ascension");
  return ((raDeg % 360) + 360) % 360;
}

export function radecToCell(order: SkyOrder, raDeg: number, decDeg: number): CelestialCell {
  assertFinite(decDeg, "declination");
  if (decDeg < -90 || decDeg > 90) throw new RangeError("declination must be between -90 and 90");

  const nside = healpix.order2nside(order);
  const phi = degreesToRadians(normalizeRa(raDeg));
  const theta = degreesToRadians(90 - decDeg);
  return { order, index: healpix.ang2pix_nest(nside, theta, phi) };
}

export function cellBoundary(cell: CelestialCell): EquatorialCoordinate[] {
  const nside = healpix.order2nside(cell.order);
  const maxIndex = healpix.nside2npix(nside) - 1;
  if (!Number.isSafeInteger(cell.index) || cell.index < 0 || cell.index > maxIndex) {
    throw new RangeError("HEALPix index is outside the selected order");
  }

  return healpix.corners_nest(nside, cell.index).map((vector) => {
    const { theta, phi } = healpix.vec2ang(vector);
    return {
      raDeg: normalizeRa(radiansToDegrees(phi)),
      decDeg: 90 - radiansToDegrees(theta),
    };
  });
}

export function cellCenter(cell: CelestialCell): EquatorialCoordinate {
  const { theta, phi } = healpix.pix2ang_nest(healpix.order2nside(cell.order), cell.index);
  return { raDeg: normalizeRa(radiansToDegrees(phi)), decDeg: 90 - radiansToDegrees(theta) };
}

export function resolutionForPixelScale(value: number): SkyResolutionClass | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= 1.5) return "high-definition";
  if (value <= 3) return "detailed";
  if (value <= 6) return "wide-field";
  if (value <= 12) return "discovery";
  return null;
}

export function orderForResolution(value: SkyResolutionClass): SkyOrder {
  return {
    discovery: 6,
    "wide-field": 7,
    detailed: 8,
    "high-definition": 9,
  }[value] as SkyOrder;
}
