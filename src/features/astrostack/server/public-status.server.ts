import { z } from "zod";
import { createAdminClient } from "@/lib/api-auth.server";
import {
  astroObjectIdSchema,
  astroStackPublicStatusSchema,
  type AstroStackPublicStatus,
} from "../domain/public-status";

const timestamp = z.string().datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const count = z.number().int().min(0);
const metric = z.number().finite().min(0);
const fraction = z.number().finite().min(0).max(1);

const rpcStatusSchema = z
  .object({
    object: z
      .object({
        id: astroObjectIdSchema,
        common_name: z.string().nullable(),
        type: z.string(),
        ra_deg: z.number().finite(),
        dec_deg: z.number().finite(),
        total_lights: count,
        total_exposure_hours: metric,
        total_contributors: count,
        master_image_url: z.string().nullable(),
        master_updated_at: nullableTimestamp,
      })
      .strict(),
    run: z
      .object({
        status: z.enum([
          "discovering",
          "downloading",
          "qualifying",
          "building",
          "complete",
          "failed",
          "cancelled",
        ]),
        source_id: z.string(),
        source_name: z.string(),
        spectral_band: z.string(),
        discovered_files: count,
        registered_files: count,
        rejected_files: count,
        downloaded_bytes: count,
        started_at: timestamp,
        completed_at: nullableTimestamp,
      })
      .strict()
      .nullable(),
    qualification: z
      .object({
        total: count,
        accepted: count,
        rejected: count,
        active: count,
        failed: count,
      })
      .strict()
      .nullable(),
    build: z
      .object({
        status: z.enum(["building", "verifying", "complete", "failed", "retired"]),
        job_status: z.string().nullable(),
        progress: count.max(100),
        generation: count.nullable(),
        planned_tiles: count,
        expected_tiles: count,
        published_tiles: count,
        actual_tiles: count,
        failed_tiles: count,
        expected_sources: count,
        contributing_sources: count,
        created_at: nullableTimestamp,
        activated_at: nullableTimestamp,
      })
      .strict()
      .nullable(),
    master: z
      .object({
        generation: count,
        image_url: z.string().nullable(),
        thumbnail_url: z.string().nullable(),
        preview_storage_path: z.string().nullable(),
        fits_storage_path: z.string().nullable(),
        lights_stacked: count,
        total_exposure_hours: metric,
        final_snr: metric.nullable(),
        final_fwhm: metric.nullable(),
        dynamic_range_stops: metric.nullable(),
        source_uploads_count: count,
        spatial_coverage_fraction: fraction.nullable(),
        is_partial: z.boolean(),
        native_pixel_scale_arcsec: metric.nullable(),
        output_pixel_scale_arcsec: metric.nullable(),
        width_px: count.nullable(),
        height_px: count.nullable(),
        created_at: timestamp,
      })
      .strict()
      .nullable(),
  })
  .strict();

export type RpcArchiveMasterStatusV9 = z.infer<typeof rpcStatusSchema>;

export interface InternalTileRow {
  healpix_order: number;
  healpix_index: number;
  storage_path: string;
  media_type: string;
}

interface InternalSourceRow {
  name: string;
  acknowledgement: string;
  terms_url: string;
}

interface ProjectionInput {
  rpc: RpcArchiveMasterStatusV9;
  source: InternalSourceRow | null;
  tiles: InternalTileRow[];
  supabaseUrl: string;
  fetchedAt?: string;
}

export class AstroStackStatusNotFoundError extends Error {}
export class AstroStackStatusUnavailableError extends Error {}

export function parseRpcArchiveMasterStatusV9(input: unknown): RpcArchiveMasterStatusV9 {
  const container = z.object({ object: z.unknown() }).passthrough().safeParse(input);
  if (container.success && container.data.object === null) {
    throw new AstroStackStatusNotFoundError("Astro object not found");
  }

  const parsed = rpcStatusSchema.safeParse(input);
  if (!parsed.success) {
    throw new AstroStackStatusUnavailableError("Archive status RPC returned an invalid payload");
  }
  return parsed.data;
}

function safeStoragePath(path: string, prefix: "hips/" | "masters/", extension: string): string {
  if (
    !path.startsWith(prefix) ||
    !path.toLowerCase().endsWith(extension) ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new AstroStackStatusUnavailableError("Invalid public derivative path");
  }
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function masterPathBelongsToObject(path: string, objectId: string, generation: number): boolean {
  const parts = path.split("/");
  if (parts.length < 3 || parts[0] !== "masters") return false;

  const objectScope = parts[1];
  const normalizedObjectId = objectId.toLowerCase();
  if (!objectScope) return false;

  // Classic user stacks are stored as masters/{OBJECT_ID}/{sha256}.{ext}.
  if (objectScope.toLowerCase() === normalizedObjectId) return true;

  // Archive mosaics v9 use an object-scoped deterministic namespace such as
  // masters/m31-ps1-r/2/{sha256}.fits. The latest archive ingest run can be
  // unrelated to the currently published master, so validation must be tied
  // to the object + master generation rather than the latest run metadata.
  return (
    objectScope.startsWith(`${normalizedObjectId}-`) &&
    parts[2] === String(generation) &&
    parts.length >= 4
  );
}

export function publicDerivativeUrl(
  supabaseUrl: string,
  storagePath: string,
  prefix: "hips/" | "masters/",
  extension: ".webp" | ".fits",
): string {
  const baseUrl = new URL(supabaseUrl);
  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
    throw new AstroStackStatusUnavailableError("Invalid Supabase URL protocol");
  }
  const origin = baseUrl.origin;
  const encodedPath = safeStoragePath(storagePath, prefix, extension);
  return `${origin}/storage/v1/object/public/astro-derived/${encodedPath}`;
}

function legacyPublicDerivativeUrl(supabaseUrl: string, candidate: string | null): string | null {
  if (!candidate) return null;
  try {
    const baseUrl = new URL(supabaseUrl);
    const candidateUrl = new URL(candidate);
    const publicPrefix = "/storage/v1/object/public/astro-derived/";
    if (
      (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") ||
      candidateUrl.origin !== baseUrl.origin ||
      !candidateUrl.pathname.startsWith(publicPrefix)
    ) {
      return null;
    }
    const decodedPath = decodeURIComponent(candidateUrl.pathname.slice(publicPrefix.length));
    if (
      decodedPath.includes("\\") ||
      decodedPath.split("/").some((part) => part === "" || part === "." || part === "..")
    ) {
      return null;
    }
    return `${candidateUrl.origin}${candidateUrl.pathname}`;
  } catch {
    return null;
  }
}

export function projectAstroStackPublicStatus({
  rpc,
  source,
  tiles,
  supabaseUrl,
  fetchedAt = new Date().toISOString(),
}: ProjectionInput): AstroStackPublicStatus {
  if (
    rpc.master?.preview_storage_path &&
    !masterPathBelongsToObject(
      rpc.master.preview_storage_path,
      rpc.object.id,
      rpc.master.generation,
    )
  ) {
    throw new AstroStackStatusUnavailableError("Master path does not match its object");
  }
  if (
    rpc.master?.fits_storage_path &&
    !masterPathBelongsToObject(rpc.master.fits_storage_path, rpc.object.id, rpc.master.generation)
  ) {
    throw new AstroStackStatusUnavailableError("Master path does not match its object");
  }

  const master = rpc.master
    ? {
        generation: rpc.master.generation,
        preview_url: rpc.master.preview_storage_path
          ? publicDerivativeUrl(supabaseUrl, rpc.master.preview_storage_path, "masters/", ".webp")
          : (legacyPublicDerivativeUrl(supabaseUrl, rpc.master.thumbnail_url) ??
            legacyPublicDerivativeUrl(supabaseUrl, rpc.master.image_url)),
        download_url: rpc.master.fits_storage_path
          ? publicDerivativeUrl(supabaseUrl, rpc.master.fits_storage_path, "masters/", ".fits")
          : null,
        lights_stacked: rpc.master.lights_stacked,
        source_uploads_count:
          rpc.master.source_uploads_count > 0
            ? rpc.master.source_uploads_count
            : rpc.master.lights_stacked,
        total_exposure_hours: rpc.master.total_exposure_hours,
        final_snr: rpc.master.final_snr,
        final_fwhm: rpc.master.final_fwhm,
        dynamic_range_stops: rpc.master.dynamic_range_stops,
        spatial_coverage_fraction: rpc.master.spatial_coverage_fraction,
        native_pixel_scale_arcsec: rpc.master.native_pixel_scale_arcsec,
        output_pixel_scale_arcsec: rpc.master.output_pixel_scale_arcsec,
        width_px: rpc.master.width_px,
        height_px: rpc.master.height_px,
        partial: rpc.master.is_partial,
        created_at: rpc.master.created_at,
      }
    : null;

  const projected = {
    schema_version: 1 as const,
    object: {
      id: rpc.object.id,
      total_lights: rpc.object.total_lights,
      total_exposure_hours: rpc.object.total_exposure_hours,
      total_contributors: rpc.object.total_contributors,
    },
    source: rpc.run
      ? {
          kind: "public_archive" as const,
          name: source?.name ?? rpc.run.source_name,
          spectral_band: rpc.run.spectral_band,
          acknowledgement: source?.acknowledgement ?? null,
          terms_url: source?.terms_url ?? null,
        }
      : null,
    qualification:
      rpc.run && rpc.qualification
        ? {
            status: rpc.run.status,
            total: rpc.qualification.total,
            published: rpc.qualification.accepted,
            rejected: rpc.qualification.rejected,
            active: rpc.qualification.active,
            failed: rpc.qualification.failed,
          }
        : null,
    build: rpc.build
      ? {
          status: rpc.build.status,
          job_status: rpc.build.job_status,
          progress: rpc.build.progress,
          generation: rpc.build.generation,
          planned_tiles: rpc.build.planned_tiles,
          expected_tiles: rpc.build.expected_tiles,
          published_tiles: rpc.build.published_tiles,
          actual_tiles: rpc.build.actual_tiles,
          failed_tiles: rpc.build.failed_tiles,
          expected_sources: rpc.build.expected_sources,
          contributing_sources: rpc.build.contributing_sources,
        }
      : null,
    master,
    tiles: tiles.map((tile) => {
      if (tile.media_type !== "image/webp") {
        throw new AstroStackStatusUnavailableError("Unexpected public tile media type");
      }
      return {
        order: tile.healpix_order,
        index: tile.healpix_index,
        url: publicDerivativeUrl(supabaseUrl, tile.storage_path, "hips/", ".webp"),
      };
    }),
    fetched_at: fetchedAt,
  };

  const result = astroStackPublicStatusSchema.safeParse(projected);
  if (!result.success) {
    throw new AstroStackStatusUnavailableError("Invalid public AstroStack projection");
  }
  return result.data;
}

async function loadGenerationTiles(
  admin: ReturnType<typeof createAdminClient>,
  objectId: string,
  generation: number | null | undefined,
): Promise<InternalTileRow[]> {
  if (generation === null || generation === undefined) return [];

  const { data: run, error: runError } = await admin
    .from("archive_ingest_runs")
    .select("id")
    .eq("object_id", objectId)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (runError) throw new AstroStackStatusUnavailableError("Archive run lookup failed");
  if (!run) return [];

  const { data: mosaicGeneration, error: generationError } = await admin
    .from("mosaic_generations")
    .select("id")
    .eq("archive_ingest_run_id", run.id)
    .eq("generation", generation)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (generationError)
    throw new AstroStackStatusUnavailableError("Mosaic generation lookup failed");
  if (!mosaicGeneration) return [];

  const { data: tileRows, error: tileError } = await admin
    .from("mosaic_tiles")
    .select("healpix_order,healpix_index,storage_path,media_type")
    .eq("generation_id", mosaicGeneration.id)
    .eq("media_type", "image/webp")
    .order("healpix_order", { ascending: true })
    .order("healpix_index", { ascending: true })
    .limit(512);
  if (tileError) throw new AstroStackStatusUnavailableError("Mosaic tile lookup failed");
  return (tileRows ?? []) as InternalTileRow[];
}

export async function getAstroStackPublicStatus(objectId: string): Promise<AstroStackPublicStatus> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_archive_master_status_v9", {
    p_object_id: objectId,
  });
  if (error) throw new AstroStackStatusUnavailableError("Archive status RPC failed");
  if (!data) throw new AstroStackStatusNotFoundError("Astro object not found");

  const parsed = parseRpcArchiveMasterStatusV9(data);

  const [sourceResult, tiles] = await Promise.all([
    parsed.run
      ? admin
          .from("archive_sources")
          .select("name,acknowledgement,terms_url")
          .eq("id", parsed.run.source_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    loadGenerationTiles(admin, objectId, parsed.build?.generation),
  ]);
  if (sourceResult.error)
    throw new AstroStackStatusUnavailableError("Archive source lookup failed");

  const supabaseUrl = process.env["SUPABASE_URL"];
  if (!supabaseUrl) throw new AstroStackStatusUnavailableError("Supabase URL is not configured");
  return projectAstroStackPublicStatus({
    rpc: parsed,
    source: sourceResult.data as InternalSourceRow | null,
    tiles,
    supabaseUrl,
  });
}
