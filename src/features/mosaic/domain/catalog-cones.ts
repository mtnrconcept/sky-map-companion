/** Public, bounded cone searches used when a progressive catalogue is unavailable. */
export const CATALOG_CONE_LIMIT = 400;
export const CATALOG_CONE_MAX_BYTES = 300_000;

export type ConeCatalogId = "simbad" | "2mass";

export interface CatalogConeViewport {
  catalog: ConeCatalogId;
  ra: number;
  dec: number;
  fov: number;
}

export interface CatalogConeSource {
  ra: number;
  dec: number;
  data: Record<string, string | number>;
}

export interface CatalogConeResponse {
  catalog: "SIMBAD" | "2MASS";
  sources: CatalogConeSource[];
  /** A bounded cone and a row cap do not establish complete viewport coverage. */
  limited: true;
}

const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !DECIMAL_NUMBER.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinatesAreValid(ra: number | null, dec: number | null): boolean {
  return (
    ra !== null &&
    Number.isFinite(ra) &&
    ra >= 0 &&
    ra < 360 &&
    dec !== null &&
    Number.isFinite(dec) &&
    dec >= -90 &&
    dec <= 90
  );
}

function viewportIsValid(viewport: CatalogConeViewport): boolean {
  return (
    (viewport.catalog === "simbad" || viewport.catalog === "2mass") &&
    coordinatesAreValid(viewport.ra, viewport.dec) &&
    Number.isFinite(viewport.fov) &&
    viewport.fov >= 0.02 &&
    viewport.fov <= 8
  );
}

export function validateCatalogConeViewport(params: URLSearchParams): CatalogConeViewport | null {
  if (["catalog", "ra", "dec", "fov"].some((key) => params.getAll(key).length !== 1)) {
    return null;
  }
  const catalog = params.get("catalog");
  if (catalog !== "simbad" && catalog !== "2mass") return null;
  const ra = finiteNumber(params.get("ra"));
  const dec = finiteNumber(params.get("dec"));
  const fov = finiteNumber(params.get("fov"));
  if (ra === null || dec === null || fov === null) return null;
  const viewport: CatalogConeViewport = { catalog, ra, dec, fov };
  return viewportIsValid(viewport) ? viewport : null;
}

export function buildCatalogConeQuery(viewport: CatalogConeViewport): string {
  if (!viewportIsValid(viewport)) throw new Error("Champ de catalogue invalide.");
  const ra = viewport.ra.toFixed(7);
  const dec = viewport.dec.toFixed(7);
  const radius = Math.min(2, viewport.fov * 0.75).toFixed(7);
  if (viewport.catalog === "simbad") {
    return (
      `SELECT TOP ${CATALOG_CONE_LIMIT} main_id,ra,dec,otype FROM basic ` +
      `WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${ra},${dec},${radius}))=1`
    );
  }
  // IRSA documents the ADQL 2.1 geometry syntax without a coordinate-frame argument.
  return (
    `SELECT TOP ${CATALOG_CONE_LIMIT} designation,ra,dec,j_m FROM fp_psc ` +
    `WHERE CONTAINS(POINT(ra,dec),CIRCLE(${ra},${dec},${radius}))=1`
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function plainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const hasControlCharacter = Array.from(text).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!text || text.length > maxLength || hasControlCharacter) return null;
  return text;
}

/** SIMBAD TAP returns array rows whose order is defined by its metadata, not by us. */
export function parseSimbadConeResponse(payload: unknown): CatalogConeSource[] {
  const table = record(payload);
  const metadata = table?.["metadata"];
  const rows = table?.["data"];
  if (!Array.isArray(metadata) || !Array.isArray(rows)) {
    throw new Error("Réponse SIMBAD invalide.");
  }
  const columns = metadata.map((column) => {
    const name = record(column)?.["name"];
    return typeof name === "string" ? name.trim().toLowerCase() : "";
  });
  const required = ["main_id", "ra", "dec", "otype"] as const;
  if (required.some((name) => columns.filter((column) => column === name).length !== 1)) {
    throw new Error("Colonnes SIMBAD manquantes ou ambiguës.");
  }
  const indices = Object.fromEntries(
    required.map((name) => [name, columns.indexOf(name)]),
  ) as Record<(typeof required)[number], number>;
  const sources: CatalogConeSource[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, CATALOG_CONE_LIMIT)) {
    if (!Array.isArray(row)) continue;
    const name = plainText(row[indices.main_id], 256);
    const ra = finiteNumber(row[indices.ra]);
    const dec = finiteNumber(row[indices.dec]);
    if (!name || ra === null || dec === null || !coordinatesAreValid(ra, dec) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    const type = plainText(row[indices.otype], 80);
    const data: Record<string, string | number> = { Identification: name, Catalogue: "SIMBAD" };
    if (type) data["Type"] = type;
    sources.push({ ra, dec, data });
  }
  return sources;
}

/** Tab-separated data with optional quoted fields, escaped quotes, BOM and CRLF. */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0 && !closedQuote) {
      quoted = true;
    } else if (char === "\t") {
      row.push(cell);
      cell = "";
      closedQuote = false;
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      closedQuote = false;
      if (char === "\r" && input[index + 1] === "\n") index += 1;
    } else {
      if (closedQuote && char !== " ") throw new Error("Champ TSV invalide.");
      cell += char;
    }
  }
  if (quoted) throw new Error("Champ TSV non terminé.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

export function parseTwoMassConeTsv(text: string): CatalogConeSource[] {
  const rows = parseTsv(text);
  // Some TAP deployments prefix comments; they never define source coordinates.
  while (rows[0]?.[0]?.startsWith("#")) rows.shift();
  const columns = rows.shift()?.map((column) => column.trim().toLowerCase()) ?? [];
  const required = ["designation", "ra", "dec", "j_m"] as const;
  if (required.some((name) => columns.filter((column) => column === name).length !== 1)) {
    throw new Error("Colonnes 2MASS manquantes ou ambiguës.");
  }
  const indices = Object.fromEntries(
    required.map((name) => [name, columns.indexOf(name)]),
  ) as Record<(typeof required)[number], number>;
  const sources: CatalogConeSource[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, CATALOG_CONE_LIMIT)) {
    const id = row[indices.designation]?.trim();
    const ra = finiteNumber(row[indices.ra]);
    const dec = finiteNumber(row[indices.dec]);
    if (
      !id ||
      !/^\d{8}[+-]\d{7}$/.test(id) ||
      ra === null ||
      dec === null ||
      !coordinatesAreValid(ra, dec) ||
      seen.has(id)
    ) {
      continue;
    }
    const rawMagnitude = row[indices.j_m]?.trim() ?? "";
    const magnitude = finiteNumber(rawMagnitude);
    const missingMagnitude = rawMagnitude === "" || /^(?:null|nan)$/i.test(rawMagnitude);
    // Missing photometry must not turn into magnitude zero; retain valid astrometry.
    if (!missingMagnitude && (magnitude === null || magnitude < -10 || magnitude > 40)) continue;
    const data: Record<string, string | number> = {
      Identification: `2MASS J${id}`,
      Catalogue: "2MASS",
    };
    if (magnitude !== null) data["Magnitude J"] = magnitude;
    seen.add(id);
    sources.push({ ra, dec, data });
  }
  return sources;
}
