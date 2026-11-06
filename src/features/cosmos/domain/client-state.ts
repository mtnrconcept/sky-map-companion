import { z } from "zod";

export const PHENOMENA = [
  {
    value: "meteor",
    label: "Météore",
    icon: "☄️",
    color: "#60a5fa",
    hint: "Traînée lumineuse rapide",
  },
  {
    value: "fireball",
    label: "Bolide",
    icon: "🔥",
    color: "#fb923c",
    hint: "Météore particulièrement brillant",
  },
  {
    value: "comet",
    label: "Comète",
    icon: "☄️",
    color: "#22d3ee",
    hint: "Objet diffus avec une queue visible",
  },
  {
    value: "supernova",
    label: "Supernova potentielle",
    icon: "💥",
    color: "#f87171",
    hint: "Point lumineux nouveau ou devenu plus brillant, à vérifier",
  },
  {
    value: "aurora",
    label: "Aurore",
    icon: "🌌",
    color: "#4ade80",
    hint: "Lumières et voiles colorés dans le ciel",
  },
  {
    value: "satellite",
    label: "Satellite",
    icon: "🛰️",
    color: "#c084fc",
    hint: "Point lumineux se déplaçant, ou train de satellites",
  },
  {
    value: "atmospheric",
    label: "Atmosphérique",
    icon: "🌈",
    color: "#fbbf24",
    hint: "Halo, arc lumineux ou autre phénomène atmosphérique",
  },
  {
    value: "unknown",
    label: "Non identifié",
    icon: "❔",
    color: "#cbd5e1",
    hint: "Phénomène dont vous ne connaissez pas la nature",
  },
] as const;

export type PhenomenonType = (typeof PHENOMENA)[number]["value"];
export type FeedPeriod = 120 | 1440;

export interface ObserverPosition {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  source: "gps" | "manual";
  recordedAt: number;
}

export interface ObservationDraft {
  phenomenon_type: PhenomenonType;
  description: string;
  observed_at?: string;
  azimuth?: number;
  elevation?: number;
  duration_s?: number;
  magnitude?: number;
  evidence_file?: File;
}

const finite = z.number().finite();
const nullableNumber = finite.nullish().transform((value) => value ?? null);
const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

const observationSchema = z.object({
  id: z.string().min(1),
  latitude: finite.min(-90).max(90),
  longitude: finite.min(-180).max(180),
  phenomenon_type: z
    .string()
    .transform((value): PhenomenonType =>
      PHENOMENA.some((item) => item.value === value) ? (value as PhenomenonType) : "unknown",
    ),
  description: z.string(),
  duration_s: nullableNumber,
  magnitude: nullableNumber,
  status: z.string(),
  event_id: nullableString,
  observed_at: timestamp,
});

export type CosmosObservation = z.infer<typeof observationSchema>;

const triangulationSchema = z.object({
  estimated_latitude: finite.min(-90).max(90),
  estimated_longitude: finite.min(-180).max(180),
  estimated_altitude_km: finite.min(0),
  residual_rms_km: finite
    .min(0)
    .nullish()
    .transform((value) => value ?? null),
  max_residual_km: finite
    .min(0)
    .nullish()
    .transform((value) => value ?? null),
  observer_count: finite
    .int()
    .min(2)
    .nullish()
    .transform((value) => value ?? null),
  baseline_km: finite
    .min(0)
    .nullish()
    .transform((value) => value ?? null),
  time_span_seconds: finite
    .min(0)
    .nullish()
    .transform((value) => value ?? null),
  method: z.string().optional(),
});

export type TriangulationData = z.infer<typeof triangulationSchema>;

export function readTriangulation(value: unknown): TriangulationData | null {
  const parsed = triangulationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const eventSchema = z.object({
  id: z.string().min(1),
  phenomenon_type: z.string(),
  title: z.string(),
  description: nullableString,
  observation_count: finite.int().nonnegative(),
  status: z.string(),
  event_at: timestamp,
  triangulation: z.unknown().transform(readTriangulation),
});

export type CosmosEvent = z.infer<typeof eventSchema>;

const jobSchema = z.object({
  id: z.string(),
  status: z.string(),
  progress: finite
    .min(0)
    .max(100)
    .nullish()
    .transform((value) => value ?? null),
  error_code: nullableString,
  attempts: finite.int().nonnegative().optional(),
  updated_at: timestamp.nullish(),
  completed_at: timestamp.nullish(),
});

export type CosmosJob = z.infer<typeof jobSchema>;

const ownObservationSchema = z.object({
  id: z.string().min(1),
  phenomenon_type: z.string(),
  description: z.string().optional(),
  status: z.string(),
  observed_at: timestamp,
  event_id: nullableString,
  job: jobSchema.nullish().transform((value) => value ?? null),
});

export type OwnCosmosObservation = z.infer<typeof ownObservationSchema>;

const processingSchema = z.object({
  status: z.enum(["ready", "degraded", "unavailable", "unknown"]),
  message: z.string().optional(),
});

export type CosmosProcessing = z.infer<typeof processingSchema>;

const feedSchema = z.object({
  observations: z.array(observationSchema).max(500),
  events: z.array(eventSchema).max(200),
  own_observations: z.array(ownObservationSchema).max(200).optional().default([]),
  own_observations_error: nullableString,
  generated_at: timestamp.optional(),
  processing: processingSchema.optional().default({ status: "unknown" }),
});

export type CosmosFeed = z.infer<typeof feedSchema>;

/** Reject malformed responses; a failed request must never look like an empty sky. */
export function parseCosmosFeed(value: unknown): CosmosFeed {
  const parsed = feedSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Le flux reçu est incomplet. Réessayez dans quelques instants.");
  }
  return parsed.data;
}

export function readSubmissionReceipt(value: unknown): {
  observation: OwnCosmosObservation;
  processing: CosmosProcessing;
} {
  const parsed = z
    .object({
      success: z.literal(true),
      observation: ownObservationSchema,
      job: jobSchema.nullish(),
      processing: processingSchema.optional().default({ status: "unknown" }),
    })
    .safeParse(value);
  if (!parsed.success) {
    throw new Error("La confirmation n’a pas pu être lue. Réessayez le même signalement.");
  }
  return {
    observation: {
      ...parsed.data.observation,
      job: parsed.data.job ?? parsed.data.observation.job ?? null,
    },
    processing: parsed.data.processing,
  };
}

export function readAnalysisReceipt(value: unknown): {
  observation: OwnCosmosObservation;
  processing: CosmosProcessing;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Le suivi de l’analyse n’a pas pu être lu. Actualisez le flux.");
  }
  return readSubmissionReceipt({ ...value, success: true });
}

export function phenomenonLabel(value: string): string {
  const item = PHENOMENA.find((phenomenon) => phenomenon.value === value);
  return item ? item.icon + " " + item.label : "❔ Non identifié";
}

export function formatCoordinate(
  value: number,
  axis: "latitude" | "longitude",
  digits = 1,
): string {
  const suffix =
    value === 0 ? "" : axis === "latitude" ? (value > 0 ? " N" : " S") : value > 0 ? " E" : " O";
  return Math.abs(value).toFixed(digits) + "°" + suffix;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const elapsed = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(elapsed)) return "Heure inconnue";
  if (elapsed < 60) return "À l’instant";
  if (elapsed < 3600) return "Il y a " + Math.floor(elapsed / 60) + " min";
  if (elapsed < 86400) return "Il y a " + Math.floor(elapsed / 3600) + " h";
  return "Il y a " + Math.floor(elapsed / 86400) + " j";
}

export function distanceKm(
  a: Pick<ObserverPosition, "latitude" | "longitude">,
  b: Pick<ObserverPosition, "latitude" | "longitude">,
): number {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, value))));
}

export function observationProgress(observation: OwnCosmosObservation): string {
  if (observation.status === "rejected" || observation.job?.status === "rejected")
    return "Signalement non retenu";
  if (observation.job?.error_code || observation.job?.status === "failed")
    return "Enregistré · analyse à relancer";
  if (observation.event_id) return "Rapproché d’autres signalements";
  if (observation.job?.status === "published" || observation.status === "analyzed")
    return "Analysé · en attente d’autres témoins";
  if (observation.job?.status === "cancelled") return "Analyse interrompue";
  if (!observation.job || observation.job.status === "uploaded")
    return "Enregistré · analyse en attente";
  return "Analyse en cours";
}

export function eventStatus(status: string): string {
  if (status === "confirmed") return "Validation enregistrée";
  if (status === "transmitted") return "Transmis";
  if (status === "rejected") return "Non retenu";
  return "Rapprochement à vérifier";
}

const EVIDENCE_FORMATS: Record<string, { mime: string; extension: string }> = {
  "image/jpeg": { mime: "image/jpeg", extension: "jpg" },
  "image/png": { mime: "image/png", extension: "png" },
  "image/webp": { mime: "image/webp", extension: "webp" },
  "video/mp4": { mime: "video/mp4", extension: "mp4" },
  "video/quicktime": { mime: "video/quicktime", extension: "mov" },
};
const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

export function validateEvidenceFile(file: Pick<File, "name" | "type" | "size">): {
  mime: string;
  extension: string;
} {
  if (file.size <= 0) throw new Error("Ce fichier est vide.");
  if (file.size > 100 * 1024 * 1024) throw new Error("La preuve dépasse la limite de 100 Mio.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type || EXTENSION_MIME[extension] || "";
  const format = EVIDENCE_FORMATS[mime];
  if (!format) throw new Error("Choisissez une image JPEG, PNG ou WebP, ou une vidéo MP4 ou MOV.");
  return format;
}

export function parseManualPosition(
  latitude: string,
  longitude: string,
  altitude: string,
): ObserverPosition {
  if (!latitude.trim() || !longitude.trim())
    throw new Error("Renseignez la latitude et la longitude du lieu d’observation.");
  const lat = Number(latitude.replace(",", "."));
  const lon = Number(longitude.replace(",", "."));
  const alt = altitude.trim() ? Number(altitude.replace(",", ".")) : null;
  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lon) ||
    lon < -180 ||
    lon > 180
  ) {
    throw new Error(
      "La latitude doit être comprise entre −90 et 90°, la longitude entre −180 et 180°.",
    );
  }
  if (alt !== null && (!Number.isFinite(alt) || alt < -500 || alt > 10000))
    throw new Error("L’altitude doit être comprise entre −500 et 10 000 m.");
  return {
    latitude: lat,
    longitude: lon,
    altitude: alt,
    accuracy: null,
    source: "manual",
    recordedAt: Date.now(),
  };
}
