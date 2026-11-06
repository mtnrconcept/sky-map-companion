import { z } from "zod";

export const phenomenonSchema = z.enum([
  "meteor",
  "fireball",
  "comet",
  "supernova",
  "aurora",
  "satellite",
  "atmospheric",
  "unknown",
]);

const optionalNumber = (min: number, max: number) =>
  z.number().finite().min(min).max(max).nullish();

export const cosmosReportSchema = z
  .object({
    idempotency_key: z.string().uuid().optional(),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    altitude_m: optionalNumber(-500, 10_000),
    azimuth: optionalNumber(0, 360),
    elevation: optionalNumber(-90, 90),
    duration_s: optionalNumber(0, 86_400),
    magnitude: optionalNumber(-30, 30),
    phenomenon_type: phenomenonSchema,
    description: z.string().trim().min(1).max(2_000),
    observed_at: z.string().datetime({ offset: true }).optional(),
    evidence_path: z.string().max(300).nullable().optional(),
  })
  .strict();

export type CosmosReportInput = z.infer<typeof cosmosReportSchema>;

export function validObservationTime(value: string | undefined, now = Date.now()): boolean {
  if (value === undefined) return true;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= now - 86_400_000 && timestamp <= now + 300_000;
}

export function validEvidencePath(path: string, userId: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === userId &&
    z.string().uuid().safeParse(parts[1]).success &&
    /^evidence\.(?:jpe?g|png|webp|mp4|mov)$/i.test(parts[2] ?? "")
  );
}

export const COSMOS_EVIDENCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);

export function normalizeReport(input: CosmosReportInput) {
  return {
    latitude: input.latitude,
    longitude: input.longitude,
    altitude_m: input.altitude_m ?? null,
    azimuth: input.azimuth === 360 ? 0 : (input.azimuth ?? null),
    elevation: input.elevation ?? null,
    phenomenon_type: input.phenomenon_type,
    description: input.description,
    duration_s: input.duration_s ?? null,
    magnitude: input.magnitude ?? null,
    observed_at: input.observed_at ? new Date(input.observed_at).toISOString() : null,
    evidence_path: input.evidence_path ?? null,
  };
}
