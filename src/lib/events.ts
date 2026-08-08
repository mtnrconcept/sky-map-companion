import {
  moonPosition,
  moonPhaseName,
  planetPosition,
  sunPosition,
  PLANET_NAMES,
  DEG,
  RAD,
  type PlanetName,
} from "@/lib/astro";

export type EventKind = "lune" | "planete" | "conjonction" | "meteores" | "saison";

export interface SkyEvent {
  id: string;
  date: Date;
  kind: EventKind;
  title: string;
  detail: string;
  /** 1 = spectaculaire, 3 = discret */
  rank: 1 | 2 | 3;
}

const PLANET_LABELS: Record<PlanetName, string> = {
  mercure: "Mercure",
  venus: "Vénus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturne: "Saturne",
  uranus: "Uranus",
  neptune: "Neptune",
};

function separation(a: { ra: number; dec: number }, b: { ra: number; dec: number }): number {
  const d =
    Math.sin(a.dec * DEG) * Math.sin(b.dec * DEG) +
    Math.cos(a.dec * DEG) * Math.cos(b.dec * DEG) * Math.cos((a.ra - b.ra) * DEG);
  return Math.acos(Math.max(-1, Math.min(1, d))) * RAD;
}

const SHOWERS: { name: string; month: number; day: number; zhr: number; detail: string }[] = [
  {
    name: "Quadrantides",
    month: 1,
    day: 3,
    zhr: 110,
    detail: "Pic bref de quelques heures, radiant dans le Bouvier.",
  },
  {
    name: "Lyrides",
    month: 4,
    day: 22,
    zhr: 18,
    detail: "Météores rapides issus de la comète Thatcher.",
  },
  {
    name: "Êta Aquarides",
    month: 5,
    day: 6,
    zhr: 50,
    detail: "Poussières de la comète de Halley, meilleures avant l'aube.",
  },
  {
    name: "Delta Aquarides",
    month: 7,
    day: 30,
    zhr: 25,
    detail: "Longue activité estivale, radiant bas au sud.",
  },
  {
    name: "Perséides",
    month: 8,
    day: 12,
    zhr: 100,
    detail: "La pluie la plus populaire de l'été, radiant dans Persée.",
  },
  {
    name: "Draconides",
    month: 10,
    day: 8,
    zhr: 10,
    detail: "Observables dès le début de soirée, parfois en sursaut.",
  },
  {
    name: "Orionides",
    month: 10,
    day: 21,
    zhr: 20,
    detail: "Seconde pluie issue de la comète de Halley.",
  },
  {
    name: "Léonides",
    month: 11,
    day: 17,
    zhr: 15,
    detail: "Météores très rapides, tempêtes historiques tous les 33 ans.",
  },
  {
    name: "Géminides",
    month: 12,
    day: 14,
    zhr: 150,
    detail: "La plus riche de l'année, météores lents et colorés.",
  },
  {
    name: "Ursides",
    month: 12,
    day: 22,
    zhr: 10,
    detail: "Petite pluie discrète autour du solstice.",
  },
];

const SEASONS: Record<number, string> = {
  0: "Équinoxe de printemps",
  90: "Solstice d'été",
  180: "Équinoxe d'automne",
  270: "Solstice d'hiver",
};

/** Événements astronomiques à venir sur `days` jours. */
export function upcomingEvents(from: Date, days = 120): SkyEvent[] {
  const events: SkyEvent[] = [];
  const stepH = 6;
  const steps = (days * 24) / stepH;
  let prev = snapshot(from);

  for (let i = 1; i <= steps; i++) {
    const t = new Date(from.getTime() + i * stepH * 3600_000);
    const cur = snapshot(t);

    // Phases lunaires
    for (const [target, label] of [
      [0, "Nouvelle lune"],
      [0.25, "Premier quartier"],
      [0.5, "Pleine lune"],
      [0.75, "Dernier quartier"],
    ] as const) {
      if (crossed(prev.moonPhase, cur.moonPhase, target)) {
        events.push({
          id: `moon-${label}-${t.toISOString().slice(0, 10)}`,
          date: t,
          kind: "lune",
          title: label,
          detail:
            target === 0
              ? "Ciel le plus sombre du mois : idéal pour le ciel profond."
              : target === 0.5
                ? "Lune très lumineuse toute la nuit : privilégiez les cratères et les planètes."
                : `${moonPhaseName(cur.moonPhase)} — première ou seconde partie de nuit dégagée.`,
          rank: target === 0 || target === 0.5 ? 1 : 3,
        });
      }
    }

    // Saisons
    for (const key of [0, 90, 180, 270]) {
      if (crossed(prev.sunLon / 360, cur.sunLon / 360, key / 360)) {
        events.push({
          id: `season-${key}-${t.toISOString().slice(0, 10)}`,
          date: t,
          kind: "saison",
          title: SEASONS[key]!,
          detail: "Repère saisonnier : la durée des nuits bascule.",
          rank: 3,
        });
      }
    }

    // Oppositions et conjonctions planétaires
    for (const p of PLANET_NAMES) {
      const el0 = prev.elong[p]!;
      const el1 = cur.elong[p]!;
      if (
        el0 < 178 &&
        el1 >= 178 &&
        ["mars", "jupiter", "saturne", "uranus", "neptune"].includes(p)
      ) {
        events.push({
          id: `opp-${p}-${t.toISOString().slice(0, 10)}`,
          date: t,
          kind: "planete",
          title: `Opposition de ${PLANET_LABELS[p]}`,
          detail: `${PLANET_LABELS[p]} est au plus près de la Terre et visible toute la nuit : la meilleure période de l'année pour l'observer.`,
          rank: 1,
        });
      }
    }

    // Rapprochements (planètes entre elles et avec la Lune)
    const bodies: { key: string; label: string; eq: { ra: number; dec: number } }[] = [
      { key: "lune", label: "la Lune", eq: cur.moon },
      ...PLANET_NAMES.map((p) => ({
        key: p,
        label: PLANET_LABELS[p],
        eq: cur.planets[p]!,
      })),
    ];
    for (let a = 0; a < bodies.length; a++) {
      for (let b = a + 1; b < bodies.length; b++) {
        const A = bodies[a]!;
        const B = bodies[b]!;
        const sep = separation(A.eq, B.eq);
        const prevSep = separation(
          A.key === "lune" ? prev.moon : prev.planets[A.key as PlanetName]!,
          B.key === "lune" ? prev.moon : prev.planets[B.key as PlanetName]!,
        );
        if (sep < 3 && sep < prevSep) {
          const next = new Date(t.getTime() + stepH * 3600_000);
          const nextSnap = snapshot(next);
          const nextSep = separation(
            A.key === "lune" ? nextSnap.moon : nextSnap.planets[A.key as PlanetName]!,
            B.key === "lune" ? nextSnap.moon : nextSnap.planets[B.key as PlanetName]!,
          );
          if (nextSep > sep) {
            events.push({
              id: `conj-${A.key}-${B.key}-${t.toISOString().slice(0, 10)}`,
              date: t,
              kind: "conjonction",
              title: `Rapprochement ${A.label} – ${B.label}`,
              detail: `Séparation minimale d'environ ${sep.toFixed(1)}° : les deux astres tiennent dans le même champ de jumelles.`,
              rank: sep < 1 ? 1 : 2,
            });
          }
        }
      }
    }

    prev = cur;
  }

  // Pluies d'étoiles filantes
  const year = from.getFullYear();
  for (const y of [year, year + 1]) {
    for (const s of SHOWERS) {
      const d = new Date(y, s.month - 1, s.day, 2, 0, 0);
      if (d > from && d.getTime() - from.getTime() < days * 86400_000) {
        events.push({
          id: `shower-${s.name}-${y}`,
          date: d,
          kind: "meteores",
          title: `Maximum des ${s.name}`,
          detail: `${s.detail} Jusqu'à ${s.zhr} météores par heure sous un ciel parfait.`,
          rank: s.zhr >= 80 ? 1 : 2,
        });
      }
    }
  }

  const seen = new Set<string>();
  return events
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

interface Snap {
  moonPhase: number;
  sunLon: number;
  moon: { ra: number; dec: number };
  planets: Record<PlanetName, { ra: number; dec: number }>;
  elong: Record<PlanetName, number>;
}

function snapshot(t: Date): Snap {
  const sun = sunPosition(t);
  const moon = moonPosition(t);
  const planets = {} as Record<PlanetName, { ra: number; dec: number }>;
  const elong = {} as Record<PlanetName, number>;
  for (const p of PLANET_NAMES) {
    const pos = planetPosition(p, t);
    planets[p] = { ra: pos.ra, dec: pos.dec };
    elong[p] = separation({ ra: sun.ra, dec: sun.dec }, pos);
  }
  return {
    moonPhase: moon.phase,
    sunLon: sun.lon,
    moon: { ra: moon.ra, dec: moon.dec },
    planets,
    elong,
  };
}

function crossed(a: number, b: number, target: number): boolean {
  const norm = (v: number) => ((((v - target) % 1) + 1.5) % 1) - 0.5;
  const x = norm(a);
  const y = norm(b);
  return x < 0 && y >= 0 && Math.abs(x) < 0.1 && Math.abs(y) < 0.1;
}

export const EVENT_LABELS: Record<EventKind, string> = {
  lune: "Lune",
  planete: "Planètes",
  conjonction: "Rapprochements",
  meteores: "Étoiles filantes",
  saison: "Saisons",
};
