import starsRaw from "./stars.json";
import constellationsRaw from "./constellations.json";
import dsoRaw from "./dso.json";

export interface Star {
  /** ascension droite en degrés */
  r: number;
  /** déclinaison en degrés */
  d: number;
  /** magnitude apparente */
  m: number;
  /** nom propre */
  n: string;
  /** lettre de Bayer */
  b: string;
  /** abréviation de la constellation */
  c: string;
  /** indice de couleur B-V */
  v: string;
}

export interface ConstellationShape {
  id: string;
  n: string;
  r: number;
  d: number;
  l: number[][][];
}

export type DsoType =
  "gc" | "oc" | "pn" | "snr" | "sfr" | "rn" | "s" | "e" | "i" | "pos" | "g" | "dn";

export type Instrument = "oeil-nu" | "jumelles" | "petit-telescope" | "telescope";

export interface DeepSkyObject {
  id: string;
  name: string;
  designation: string;
  type: DsoType;
  mag: number | null;
  size: number;
  dim: string;
  ra: number;
  dec: number;
  con: string;
  instrument: Instrument;
  description: string;
  catalog: string;
}

export const stars = starsRaw as Star[];
export const constellations = constellationsRaw as ConstellationShape[];
export const deepSky = dsoRaw as DeepSkyObject[];

export const constellationNames: Record<string, string> = Object.fromEntries(
  constellations.map((c) => [c.id, c.n]),
);

export const TYPE_LABELS: Record<string, string> = {
  gc: "Amas globulaire",
  oc: "Amas ouvert",
  pn: "Nébuleuse planétaire",
  snr: "Rémanent de supernova",
  sfr: "Nébuleuse diffuse",
  rn: "Nébuleuse par réflexion",
  s: "Galaxie spirale",
  e: "Galaxie elliptique",
  i: "Galaxie irrégulière",
  g: "Galaxie",
  pos: "Astérisme",
  dn: "Nébuleuse obscure",
};

export const TYPE_FAMILY: Record<string, "nebuleuse" | "galaxie" | "amas"> = {
  gc: "amas",
  oc: "amas",
  pos: "amas",
  pn: "nebuleuse",
  snr: "nebuleuse",
  sfr: "nebuleuse",
  rn: "nebuleuse",
  dn: "nebuleuse",
  s: "galaxie",
  e: "galaxie",
  i: "galaxie",
  g: "galaxie",
};

export const INSTRUMENT_LABELS: Record<Instrument, string> = {
  "oeil-nu": "À l'œil nu",
  jumelles: "Aux jumelles",
  "petit-telescope": "Petit télescope (100 mm)",
  telescope: "Télescope (200 mm)",
};

export const deepSkyById = new Map(deepSky.map((o) => [o.id, o]));

/** Étoiles nommées, utilisées pour la recherche et les étiquettes. */
export const namedStars = stars.filter((s) => s.n);

/** Couleur d'une étoile à partir de son indice B-V. */
export function starColor(bv: string): string {
  const v = Number.parseFloat(bv);
  if (!Number.isFinite(v)) return "#f4f7ff";
  if (v < -0.1) return "#a7c3ff";
  if (v < 0.2) return "#cbdcff";
  if (v < 0.5) return "#f2f4ff";
  if (v < 0.9) return "#fff4de";
  if (v < 1.4) return "#ffd9a8";
  return "#ffb37a";
}
