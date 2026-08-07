import {
  deepSky,
  stars,
  constellationNames,
  TYPE_LABELS,
  INSTRUMENT_LABELS,
  type DeepSkyObject,
  type Instrument,
} from "@/data/catalog";
import {
  moonPhaseName,
  moonPosition,
  planetPosition,
  sunPosition,
  PLANET_NAMES,
  type PlanetName,
} from "@/lib/astro";

export type ObjectKind = "star" | "dso" | "planet" | "moon" | "sun";

export interface SkyObject {
  key: string;
  name: string;
  subtitle: string;
  kind: ObjectKind;
  ra: number;
  dec: number;
  mag: number | null;
  constellation: string;
  instrument: Instrument;
  description: string;
  sizeArcmin: number;
  extra?: string;
  /** requête utilisée pour retrouver de vraies photographies */
  photoQuery: string;
  /** requêtes complémentaires pour enrichir la galerie */
  photoQueries?: string[];
}


const TYPE_EN: Record<string, string> = {
  gc: "globular cluster",
  oc: "open cluster",
  pn: "planetary nebula",
  snr: "supernova remnant",
  sfr: "nebula",
  rn: "reflection nebula",
  dn: "dark nebula",
  s: "spiral galaxy",
  e: "elliptical galaxy",
  i: "irregular galaxy",
  g: "galaxy",
  pos: "asterism",
};

const PLANET_EN: Record<PlanetName, string> = {
  mercure: "Mercury",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturne: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
};

const PLANET_LABELS: Record<PlanetName, string> = {
  mercure: "Mercure",
  venus: "Vénus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturne: "Saturne",
  uranus: "Uranus",
  neptune: "Neptune",
};

const PLANET_DESCRIPTIONS: Record<PlanetName, string> = {
  mercure:
    "La planète la plus proche du Soleil, toujours basse dans les lueurs du crépuscule. Montre des phases comme la Lune dans un petit télescope.",
  venus:
    "L'astre le plus brillant après le Soleil et la Lune. Ses phases sont évidentes aux jumelles tenues bien stables.",
  mars: "La planète rouge. Sa calotte polaire et ses taches sombres apparaissent lors des oppositions, avec 150 mm et un bon ciel.",
  jupiter:
    "Ses quatre lunes galiléennes sont visibles aux jumelles, et les bandes nuageuses dès le plus petit télescope.",
  saturne:
    "Les anneaux se devinent dès 30× de grossissement : le plus beau choc visuel de l'astronomie amateur.",
  uranus:
    "Un petit disque verdâtre à peine plus gros qu'une étoile, repérable aux jumelles si on sait où chercher.",
  neptune:
    "Un point bleuté de magnitude 8, nécessite une carte de champ précise et un télescope.",
};

export function dsoToSkyObject(o: DeepSkyObject): SkyObject {
  return {
    key: `dso:${o.id}`,
    name: o.name,
    subtitle: `${o.id}${o.designation && o.designation !== o.id ? ` · ${o.designation}` : ""} · ${TYPE_LABELS[o.type] ?? "Objet"}`,
    kind: "dso",
    ra: o.ra,
    dec: o.dec,
    mag: o.mag,
    constellation: constellationNames[o.con] ?? o.con,
    instrument: o.instrument,
    description: o.description,
    sizeArcmin: o.size,
    photoQuery: `${o.id} ${o.designation && o.designation !== o.id ? o.designation : ""} astronomy`,
    photoQueries: [
      `${o.id} ${o.designation && o.designation !== o.id ? o.designation : ""}`.trim(),
      o.designation && o.designation !== o.id ? o.designation : `${o.id} object`,
      `${o.id} ${TYPE_EN[o.type] ?? "deep sky object"}`,
      `${o.id} telescope image`,
    ],
  };

}

export function starToSkyObject(index: number): SkyObject | null {
  const s = stars[index];
  if (!s) return null;
  return {
    key: `star:${index}`,
    name: s.n || `${s.b || "Étoile"} ${constellationNames[s.c] ?? s.c}`,
    subtitle: `Étoile · magnitude ${s.m.toFixed(2)}`,
    kind: "star",
    ra: s.r,
    dec: s.d,
    mag: s.m,
    constellation: constellationNames[s.c] ?? s.c,
    instrument: s.m <= 6 ? "oeil-nu" : "jumelles",
    description: s.n
      ? `${s.n} est l'une des étoiles nommées du ciel, dans la constellation ${constellationNames[s.c] ?? s.c}.`
      : `Étoile de la constellation ${constellationNames[s.c] ?? s.c}.`,
    sizeArcmin: 0,
    photoQuery: `${s.n || `${s.b ?? ""} ${s.c}`} star astronomy`,
    photoQueries: [
      `${s.n || `${s.b ?? ""} ${s.c}`} star`,
      `${s.n || s.b} ${s.c} constellation`,
      `${s.c} constellation night sky`,
    ],
  };

}

export function solarSystemObjects(date: Date): SkyObject[] {
  const sun = sunPosition(date);
  const moon = moonPosition(date);
  const list: SkyObject[] = [
    {
      key: "sun",
      name: "Soleil",
      subtitle: "Étoile · notre étoile",
      kind: "sun",
      ra: sun.ra,
      dec: sun.dec,
      mag: -26.7,
      constellation: "—",
      instrument: "oeil-nu",
      description:
        "Ne jamais observer le Soleil sans filtre solaire certifié : le risque de cécité est immédiat et définitif.",
      sizeArcmin: 32,
      photoQuery: "Sun photosphere solar telescope photograph",
      photoQueries: [
        "Sun photosphere telescope photograph",
        "solar prominence Hydrogen alpha",
        "sunspot group photograph",
        "solar eclipse corona",
      ],
    },
    {
      key: "moon",
      name: "Lune",
      subtitle: `Satellite · ${moonPhaseName(moon.phase)}`,
      kind: "moon",
      ra: moon.ra,
      dec: moon.dec,
      mag: -12.7,
      constellation: "—",
      instrument: "jumelles",
      description:
        "Les cratères se détaillent le mieux près du terminateur, la ligne d'ombre qui sépare le jour de la nuit lunaire.",
      sizeArcmin: 31,
      extra: `${Math.round(moon.illumination * 100)} % illuminée`,
      photoQuery: "Moon lunar surface telescope photograph",
      photoQueries: [
        "Moon telescope photograph",
        "lunar crater Copernicus",
        "lunar terminator amateur astrophotography",
        "full moon photograph",
      ],
    },

  ];
  for (const p of PLANET_NAMES) {
    const pos = planetPosition(p, date);
    list.push({
      key: `planet:${p}`,
      name: PLANET_LABELS[p],
      subtitle: `Planète · magnitude ${pos.magnitude.toFixed(1)}`,
      kind: "planet",
      ra: pos.ra,
      dec: pos.dec,
      mag: pos.magnitude,
      constellation: "—",
      instrument:
        pos.magnitude < 4
          ? "oeil-nu"
          : pos.magnitude < 8
            ? "jumelles"
            : "petit-telescope",
      description: PLANET_DESCRIPTIONS[p],
      sizeArcmin: 0.5,
      extra: `${pos.distance.toFixed(2)} UA de la Terre`,
      photoQuery: `${PLANET_EN[p]} planet spacecraft photograph`,
    });

  }
  return list;
}

export function findSkyObject(key: string, date: Date): SkyObject | null {
  if (key.startsWith("dso:")) {
    const o = deepSky.find((d) => d.id === key.slice(4));
    return o ? dsoToSkyObject(o) : null;
  }
  if (key.startsWith("star:")) {
    return starToSkyObject(Number.parseInt(key.slice(5), 10));
  }
  return solarSystemObjects(date).find((o) => o.key === key) ?? null;
}

export function instrumentLabel(i: Instrument) {
  return INSTRUMENT_LABELS[i];
}
