import { z } from "zod";

const nonNegativeInteger = z.number().int().min(0);
const nonNegativeNumber = z.number().finite().min(0);
const fraction = z.number().finite().min(0).max(1);
const timestamp = z.string().datetime({ offset: true });
const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "URL HTTP(S) attendue");

export const astroObjectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9][A-Za-z0-9+_.-]*$/, "Identifiant d’objet céleste invalide");

export const archiveRunStatusSchema = z.enum([
  "discovering",
  "downloading",
  "qualifying",
  "building",
  "complete",
  "failed",
  "cancelled",
]);

export const mosaicBuildStatusSchema = z.enum([
  "building",
  "verifying",
  "complete",
  "failed",
  "retired",
]);

export const astroStackPublicStatusSchema = z
  .object({
    schema_version: z.literal(1),
    object: z
      .object({
        id: astroObjectIdSchema,
        total_lights: nonNegativeInteger,
        total_exposure_hours: nonNegativeNumber,
        total_contributors: nonNegativeInteger,
      })
      .strict(),
    source: z
      .object({
        kind: z.enum(["public_archive", "community"]),
        name: z.string().min(1).max(300),
        spectral_band: z.string().min(1).max(40).nullable(),
        acknowledgement: z.string().min(1).max(2_000).nullable(),
        terms_url: httpUrl.nullable(),
      })
      .strict()
      .nullable(),
    qualification: z
      .object({
        status: archiveRunStatusSchema,
        total: nonNegativeInteger,
        published: nonNegativeInteger,
        rejected: nonNegativeInteger,
        active: nonNegativeInteger,
        failed: nonNegativeInteger,
      })
      .strict()
      .nullable(),
    build: z
      .object({
        status: mosaicBuildStatusSchema,
        job_status: z.string().min(1).max(80).nullable(),
        progress: nonNegativeInteger.max(100),
        generation: nonNegativeInteger.nullable(),
        planned_tiles: nonNegativeInteger,
        expected_tiles: nonNegativeInteger,
        published_tiles: nonNegativeInteger,
        actual_tiles: nonNegativeInteger,
        failed_tiles: nonNegativeInteger,
        expected_sources: nonNegativeInteger,
        contributing_sources: nonNegativeInteger,
      })
      .strict()
      .nullable(),
    master: z
      .object({
        generation: nonNegativeInteger,
        preview_url: httpUrl.nullable(),
        download_url: httpUrl.nullable(),
        lights_stacked: nonNegativeInteger,
        source_uploads_count: nonNegativeInteger,
        total_exposure_hours: nonNegativeNumber,
        final_snr: nonNegativeNumber.nullable(),
        final_fwhm: nonNegativeNumber.nullable(),
        dynamic_range_stops: nonNegativeNumber.nullable(),
        spatial_coverage_fraction: fraction.nullable(),
        native_pixel_scale_arcsec: nonNegativeNumber.nullable(),
        output_pixel_scale_arcsec: nonNegativeNumber.nullable(),
        width_px: nonNegativeInteger.nullable(),
        height_px: nonNegativeInteger.nullable(),
        partial: z.boolean(),
        created_at: timestamp,
      })
      .strict()
      .nullable(),
    tiles: z
      .array(
        z
          .object({
            order: nonNegativeInteger.max(12),
            index: nonNegativeInteger,
            url: httpUrl,
          })
          .strict(),
      )
      .max(512),
    fetched_at: timestamp,
  })
  .strict();

export type AstroStackPublicStatus = z.infer<typeof astroStackPublicStatusSchema>;
export type AstroStackQualification = NonNullable<AstroStackPublicStatus["qualification"]>;
export type AstroStackBuild = NonNullable<AstroStackPublicStatus["build"]>;

function percentage(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export function qualificationProgress(qualification: AstroStackQualification | null): number {
  if (!qualification) return 0;
  return percentage(
    qualification.published + qualification.rejected + qualification.failed,
    qualification.total,
  );
}

export function buildProgress(build: AstroStackBuild | null): number {
  if (!build) return 0;
  return build.expected_tiles > 0
    ? percentage(build.published_tiles, build.expected_tiles)
    : build.progress;
}

export function astroStackStatusIsActive(status: AstroStackPublicStatus | null): boolean {
  if (!status) return false;
  if (status.qualification && status.qualification.active > 0) return true;
  if (
    status.qualification &&
    ["discovering", "downloading", "qualifying", "building"].includes(status.qualification.status)
  ) {
    return true;
  }
  return status.build?.status === "building" || status.build?.status === "verifying";
}

export function astroStackPollDelay(
  status: AstroStackPublicStatus | null,
  consecutiveFailures: number,
): number {
  const baseDelay = status === null || astroStackStatusIsActive(status) ? 5_000 : 30_000;
  const exponent = Math.max(0, Math.min(5, consecutiveFailures));
  return Math.min(60_000, baseDelay * 2 ** exponent);
}
