export interface GaiaStar {
  id: string;
  ra: number;
  dec: number;
  mag: number;
}

export interface GaiaStarsResponse {
  stars: GaiaStar[];
  partial: boolean;
  catalog: "Gaia DR3";
}

const MAX_FOV_DEG = 8;
const QUERY_LIMIT = 92;

function numberAt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseGaiaTapResponse(payload: unknown): GaiaStar[] {
  if (!payload || typeof payload !== "object" || !("data" in payload)) return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data.slice(0, QUERY_LIMIT).flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return [];
    const fields = row as Record<string, unknown>;
    const id = fields["designation"];
    const ra = numberAt(fields["ra"]);
    const dec = numberAt(fields["dec"]);
    const mag = numberAt(fields["phot_g_mean_mag"]);
    if (
      typeof id !== "string" ||
      !/^Gaia DR3 \d{8,22}$/.test(id) ||
      ra === null ||
      ra < 0 ||
      ra >= 360 ||
      dec === null ||
      dec < -90 ||
      dec > 90 ||
      mag === null ||
      mag < -5 ||
      mag > 25
    )
      return [];
    return [{ id, ra, dec, mag }];
  });
}

export function validateGaiaViewport(
  params: URLSearchParams,
): { ra: number; dec: number; fov: number } | null {
  const required = ["ra", "dec", "fov"] as const;
  if (required.some((name) => !params.get(name)?.trim())) return null;
  const ra = Number(params.get("ra"));
  const dec = Number(params.get("dec"));
  const fov = Number(params.get("fov"));
  if (
    !Number.isFinite(ra) ||
    ra < 0 ||
    ra >= 360 ||
    !Number.isFinite(dec) ||
    dec < -90 ||
    dec > 90 ||
    !Number.isFinite(fov) ||
    fov < 0.02 ||
    fov > MAX_FOV_DEG
  )
    return null;
  return { ra, dec, fov };
}

export function gaiaMagnitudeLimit(fov: number): number {
  if (fov < 0.15) return 20;
  if (fov < 0.5) return 19;
  if (fov < 1.5) return 18;
  if (fov < 3) return 17;
  return 15.5;
}

function adqlFloat(value: number): string {
  return value.toFixed(5);
}

export function buildGaiaViewportQueries(ra: number, dec: number, fov: number): string[] {
  const radians = (dec * Math.PI) / 180;
  const cosDec = Math.max(0.12, Math.cos(radians));
  const raOffset = (fov * 0.34) / cosDec;
  const decOffset = fov * 0.26;
  const radius = Math.max(0.015, Math.min(2.5, fov * 0.26));
  const mag = gaiaMagnitudeLimit(fov);
  // Nine spatial cones give representative stars throughout the viewport.
  // TAP's TOP rows are often HEALPix-ordered, so four large cones clustered
  // all markers in narrow strips rather than over the actual visible stars.
  return [-1, 0, 1].flatMap((decSign) =>
    [-1, 0, 1].map((raSign) => {
      const centerRa = (ra + raSign * raOffset + 360) % 360;
      const centerDec = Math.max(-89.9, Math.min(89.9, dec + decSign * decOffset));
      return [
        `SELECT TOP ${QUERY_LIMIT} designation, ra, dec, phot_g_mean_mag`,
        "FROM gaiadr3.gaia_source",
        `WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${adqlFloat(centerRa)},${adqlFloat(centerDec)},${adqlFloat(radius)}))=1`,
        `AND phot_g_mean_mag < ${adqlFloat(mag)}`,
      ].join(" ");
    }),
  );
}

export function buildNearestGaiaQuery(ra: number, dec: number, radius: number): string {
  return [
    "SELECT TOP 100 designation, ra, dec, phot_g_mean_mag",
    "FROM gaiadr3.gaia_source",
    `WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${adqlFloat(ra)},${adqlFloat(dec)},${adqlFloat(radius)}))=1`,
    "AND phot_g_mean_mag < 20.7",
  ].join(" ");
}

export function angularDistanceDegrees(
  a: { ra: number; dec: number },
  b: { ra: number; dec: number },
): number {
  const dRa = ((((a.ra - b.ra + 540) % 360) - 180) * Math.PI) / 180;
  const aDec = (a.dec * Math.PI) / 180;
  const bDec = (b.dec * Math.PI) / 180;
  const sinHalfDec = Math.sin((aDec - bDec) / 2);
  const sinHalfRa = Math.sin(dRa / 2);
  const h = sinHalfDec ** 2 + Math.cos(aDec) * Math.cos(bDec) * sinHalfRa ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h)))) * 180) / Math.PI;
}

export function mergeGaiaStars(groups: readonly GaiaStar[][]): GaiaStar[] {
  const found = new Map<string, GaiaStar>();
  for (const group of groups) {
    for (const star of group) found.set(star.id, star);
  }
  return [...found.values()].sort((a, b) => a.mag - b.mag).slice(0, 650);
}
