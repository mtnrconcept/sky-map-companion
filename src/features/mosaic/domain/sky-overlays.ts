import { HIPS_SURVEYS } from "./hips-surveys";

/** Curated layers use documented catalogues, or the local astronomical datasets. */
export const SKY_OVERLAYS = [
  {
    id: "bright-stars",
    label: "Étoiles brillantes",
    description: "Repères locaux disponibles sur tout le ciel, même sans connexion aux catalogues.",
    group: "Catalogues",
    color: "#fef3c7",
    defaultEnabled: true,
  },
  {
    id: "gaia",
    label: "Étoiles · Gaia DR3",
    description: "Catalogue stellaire progressif : de nouveaux repères apparaissent au zoom.",
    group: "Catalogues",
    color: "#ffb547",
    defaultEnabled: true,
  },
  {
    id: "simbad",
    label: "Objets identifiés · SIMBAD",
    description: "Étoiles, galaxies et autres objets référencés dans la base du CDS.",
    group: "Catalogues",
    color: "#22d3ee",
    defaultEnabled: false,
  },
  {
    id: "2mass",
    label: "Sources infrarouges · 2MASS",
    description: "Catalogue progressif des sources ponctuelles observées en proche infrarouge.",
    group: "Catalogues",
    color: "#fb7185",
    defaultEnabled: false,
  },
  {
    id: "galaxies",
    label: "Galaxies",
    description: "Galaxies des catalogues locaux Messier et NGC, avec fiche au clic.",
    group: "Ciel profond",
    color: "#c4b5fd",
    defaultEnabled: false,
  },
  {
    id: "nebulae",
    label: "Nébuleuses",
    description: "Nébuleuses et rémanents de supernova du catalogue local.",
    group: "Ciel profond",
    color: "#f9a8d4",
    defaultEnabled: false,
  },
  {
    id: "clusters",
    label: "Amas d’étoiles",
    description: "Amas ouverts, amas globulaires et astérismes du catalogue local.",
    group: "Ciel profond",
    color: "#86efac",
    defaultEnabled: false,
  },
  {
    id: "constellations",
    label: "Tracés des constellations",
    description: "Figures reliant les étoiles repères, indépendantes du fond photographique.",
    group: "Repères célestes",
    color: "#7dd3fc",
    defaultEnabled: false,
  },
  {
    id: "constellation-labels",
    label: "Noms des constellations",
    description: "Noms français placés aux coordonnées des constellations.",
    group: "Repères célestes",
    color: "#bae6fd",
    defaultEnabled: false,
  },
  {
    id: "equatorial-grid",
    label: "Grille équatoriale",
    description: "Ascension droite et déclinaison dans le repère ICRS.",
    group: "Repères célestes",
    color: "#94a3b8",
    defaultEnabled: false,
  },
  {
    id: "galactic-plane",
    label: "Plan galactique",
    description: "Grand cercle de latitude galactique nulle, repère de la Voie lactée.",
    group: "Repères célestes",
    color: "#c084fc",
    defaultEnabled: false,
  },
  {
    id: "ecliptic",
    label: "Écliptique",
    description: "Plan de l’orbite terrestre, projeté dans le repère J2000.",
    group: "Repères célestes",
    color: "#facc15",
    defaultEnabled: false,
  },
] as const;

export type SkyOverlayId = (typeof SKY_OVERLAYS)[number]["id"];
export type SkyOverlayLoadState = "disabled" | "loading" | "ready" | "error";

export interface SkyOverlayLayerState {
  enabled: boolean;
  state: SkyOverlayLoadState;
  /** Loaded catalogue records; this is not a claim of complete viewport coverage. */
  count?: number;
  message?: string;
}

export interface SkyOverlaySnapshot {
  layers: Record<SkyOverlayId, SkyOverlayLayerState>;
  image: {
    surveyId: string | null;
    opacity: number;
    state: SkyOverlayLoadState;
    message?: string;
  };
}

export interface SkyOverlayPreferences {
  enabled?: Partial<Record<SkyOverlayId, boolean>>;
  imageSurveyId?: string | null;
  imageOpacity?: number;
}

/** Only known layer IDs and curated surveys may be restored from browser storage. */
export function sanitizeSkyOverlayPreferences(value: unknown): SkyOverlayPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const preferences: SkyOverlayPreferences = {};
  const enabled = input["enabled"];
  if (enabled && typeof enabled === "object" && !Array.isArray(enabled)) {
    const flags = enabled as Record<string, unknown>;
    preferences.enabled = {};
    for (const { id } of SKY_OVERLAYS) {
      if (typeof flags[id] === "boolean") preferences.enabled[id] = flags[id];
    }
  }
  if (input["imageSurveyId"] === null) preferences.imageSurveyId = null;
  else if (HIPS_SURVEYS.some((survey) => survey.id === input["imageSurveyId"])) {
    preferences.imageSurveyId = input["imageSurveyId"] as string;
  }
  const opacity = input["imageOpacity"];
  if (typeof opacity === "number" && Number.isFinite(opacity)) {
    preferences.imageOpacity = Math.min(1, Math.max(0, opacity));
  }
  return preferences;
}

export function createSkyOverlaySnapshot(
  preferences: SkyOverlayPreferences = {},
): SkyOverlaySnapshot {
  const safe = sanitizeSkyOverlayPreferences(preferences);
  return {
    layers: Object.fromEntries(
      SKY_OVERLAYS.map(({ id, defaultEnabled }) => {
        const enabled = safe.enabled?.[id] ?? defaultEnabled;
        return [id, { enabled, state: enabled ? "loading" : "disabled" }];
      }),
    ) as Record<SkyOverlayId, SkyOverlayLayerState>,
    image: {
      surveyId: safe.imageSurveyId ?? null,
      opacity: safe.imageOpacity ?? 0.5,
      state: safe.imageSurveyId ? "loading" : "disabled",
    },
  };
}
