import {
  deepSky,
  stars,
  constellationNames,
  TYPE_FAMILY,
  TYPE_LABELS,
  type Instrument,
} from "@/data/catalog";
import {
  dsoToSkyObject,
  starToSkyObject,
  solarSystemObjects,
  type SkyObject,
} from "@/lib/sky-objects";
import {
  equatorialToHorizontal,
  localSiderealTime,
  riseSetTimes,
  cardinalName,
  type GeoPosition,
} from "@/lib/astro";

export type Family = "planete" | "lune" | "soleil" | "etoile" | "amas" | "nebuleuse" | "galaxie";

export const FAMILY_LABELS: Record<Family, string> = {
  planete: "Planètes",
  lune: "Lune",
  soleil: "Soleil",
  etoile: "Étoiles",
  amas: "Amas",
  nebuleuse: "Nébuleuses",
  galaxie: "Galaxies",
};

export interface CatalogEntry extends SkyObject {
  family: Family;
  typeLabel: string;
  search: string;
}

/** Catalogue statique (objets profonds + étoiles nommées). */
export const staticCatalog: CatalogEntry[] = [
  ...deepSky.map((o) => {
    const s = dsoToSkyObject(o);
    return {
      ...s,
      family: TYPE_FAMILY[o.type] ?? "nebuleuse",
      typeLabel: TYPE_LABELS[o.type] ?? "Objet du ciel profond",
      search: `${o.id} ${o.designation} ${o.name} ${s.constellation}`.toLowerCase(),
    } as CatalogEntry;
  }),
  ...stars
    .map((s, i) => (s.n ? starToSkyObject(i) : null))
    .filter((s): s is SkyObject => Boolean(s))
    .map((s) => ({
      ...s,
      family: "etoile" as const,
      typeLabel: "Étoile",
      search: `${s.name} ${s.constellation}`.toLowerCase(),
    })),
];

export function fullCatalog(date: Date): CatalogEntry[] {
  const solar = solarSystemObjects(date).map((o) => ({
    ...o,
    family: (o.kind === "planet" ? "planete" : o.kind === "moon" ? "lune" : "soleil") as Family,
    typeLabel: o.kind === "planet" ? "Planète" : o.kind === "moon" ? "Satellite" : "Étoile",
    search: `${o.name}`.toLowerCase(),
  }));
  return [...solar, ...staticCatalog];
}

export interface Visibility {
  altitude: number;
  azimuth: number;
  direction: string;
  visible: boolean;
  rise: Date | null;
  set: Date | null;
  transit: Date | null;
  maxAltitude: number;
}

export function computeVisibility(
  o: { ra: number; dec: number },
  date: Date,
  pos: GeoPosition,
): Visibility {
  const lst = localSiderealTime(date, pos.longitude);
  const hz = equatorialToHorizontal({ ra: o.ra, dec: o.dec }, lst, pos.latitude);
  const rs = riseSetTimes({ ra: o.ra, dec: o.dec }, date, pos);
  return {
    altitude: hz.alt,
    azimuth: hz.az,
    direction: cardinalName(hz.az),
    visible: hz.alt > 0,
    rise: rs.rise,
    set: rs.set,
    transit: rs.transit,
    maxAltitude: rs.maxAltitude,
  };
}

export interface SearchFilters {
  query: string;
  families: Family[];
  instruments: Instrument[];
  maxMagnitude: number;
  minAltitude: number;
  onlyVisible: boolean;
  constellation: string;
  sort: "nom" | "magnitude" | "hauteur";
}

export const DEFAULT_FILTERS: SearchFilters = {
  query: "",
  families: [],
  instruments: [],
  maxMagnitude: 14,
  minAltitude: 0,
  onlyVisible: false,
  constellation: "",
  sort: "hauteur",
};

export interface SearchResult extends CatalogEntry {
  vis: Visibility;
}

export function searchSky(filters: SearchFilters, date: Date, pos: GeoPosition): SearchResult[] {
  const q = filters.query.trim().toLowerCase();
  const out: SearchResult[] = [];
  for (const entry of fullCatalog(date)) {
    if (filters.families.length && !filters.families.includes(entry.family)) continue;
    if (filters.instruments.length && !filters.instruments.includes(entry.instrument)) continue;
    if (entry.mag !== null && entry.mag > filters.maxMagnitude) continue;
    if (filters.constellation && entry.constellation !== filters.constellation) continue;
    if (q && !(entry.search || entry.name.toLowerCase()).includes(q)) continue;
    const vis = computeVisibility(entry, date, pos);
    if (filters.onlyVisible && !vis.visible) continue;
    if (vis.altitude < filters.minAltitude && filters.minAltitude > 0) continue;
    out.push({ ...entry, vis });
  }
  out.sort((a, b) => {
    if (filters.sort === "nom") return a.name.localeCompare(b.name, "fr");
    if (filters.sort === "magnitude") return (a.mag ?? 99) - (b.mag ?? 99);
    return b.vis.altitude - a.vis.altitude;
  });
  return out.slice(0, 400);
}

export const constellationOptions = Array.from(new Set(Object.values(constellationNames))).sort(
  (a, b) => a.localeCompare(b, "fr"),
);

/** Score d'intérêt pour la sélection « ce soir ». */
export function tonightHighlights(date: Date, pos: GeoPosition, limit = 12): SearchResult[] {
  const results = searchSky({ ...DEFAULT_FILTERS, onlyVisible: true, maxMagnitude: 10 }, date, pos);
  return results
    .map((r) => ({
      r,
      score: r.vis.altitude / 90 - (r.mag ?? 8) / 20 + (r.family === "planete" ? 0.6 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}
