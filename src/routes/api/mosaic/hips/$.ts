import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/api-auth.server";
import {
  buildGlobalMosaicProperties,
  GLOBAL_MOSAIC_MIN_PHOTO_ORDER,
  GLOBAL_MOSAIC_RED_TILE_BYTES,
  isGlobalMosaicAllskyPath,
  parseGlobalMosaicTilePath,
} from "@/features/mosaic/domain/global-hips";

const TILE_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=900";
const PROPERTIES_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600";
const GLOBAL_ALLSKY_STORAGE_PATH = "hips/global/Norder3/Allsky.webp";
const VALID_GEOMETRY_VERSION = "nested-icrs-image-y-flip-v2";
const GLOBAL_AGGREGATE_SLUG = "sky-ps1-r-global-loworder";

function redTileResponse(): Response {
  return new Response(GLOBAL_MOSAIC_RED_TILE_BYTES, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": TILE_CACHE_CONTROL,
      "X-Sky-Map-Coverage": "uncovered",
    },
  });
}

function isPublishedTilePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("hips/") &&
    value.endsWith(".webp") &&
    !value.includes("..")
  );
}

function publicDerivativeRedirect(storagePath: string, coverage: "covered" | "allsky"): Response {
  const supabaseUrl = process.env["SUPABASE_URL"]?.replace(/\/$/, "");
  if (!supabaseUrl) {
    return new Response("Sky Map storage is unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/astro-derived/${storagePath}`;
  return new Response(null, {
    status: 307,
    headers: {
      Location: storageUrl,
      "Cache-Control": TILE_CACHE_CONTROL,
      "X-Sky-Map-Coverage": coverage,
    },
  });
}

export const Route = createFileRoute("/api/mosaic/hips/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat?.replace(/^\/+|\/+$/g, "") ?? "";
        if (path === "properties") {
          return new Response(buildGlobalMosaicProperties(), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": PROPERTIES_CACHE_CONTROL,
            },
          });
        }

        if (isGlobalMosaicAllskyPath(path)) {
          // Old Allsky pixels were built from TAN projections, not exact HiPS.
          // Do not publish them again while corrected source layers are rebuilt.
          const admin = createAdminClient();
          const { data: layer, error: layerError } = await admin
            .from("mosaic_layers")
            .select("current_generation_id")
            .eq("slug", GLOBAL_AGGREGATE_SLUG)
            .maybeSingle();
          if (layerError) {
            return new Response("Sky Map Allsky metadata unavailable", {
              status: 503,
              headers: { "Cache-Control": "no-store" },
            });
          }
          if (!layer?.current_generation_id) {
            return new Response("Allsky astrometric reconstruction pending", {
              status: 404,
              headers: { "Cache-Control": "no-store" },
            });
          }
          const { data: generation, error: generationError } = await admin
            .from("mosaic_generations")
            .select("recipe,status")
            .eq("id", layer.current_generation_id)
            .maybeSingle();
          if (generationError) {
            return new Response("Sky Map Allsky generation unavailable", {
              status: 503,
              headers: { "Cache-Control": "no-store" },
            });
          }
          const recipe = generation?.recipe as Record<string, unknown> | null;
          if (
            generation?.status !== "complete" ||
            recipe?.["hips_pixel_geometry_version"] !== VALID_GEOMETRY_VERSION
          ) {
            return new Response("Allsky astrometric reconstruction pending", {
              status: 404,
              headers: { "Cache-Control": "no-store" },
            });
          }
          return publicDerivativeRedirect(GLOBAL_ALLSKY_STORAGE_PATH, "allsky");
        }

        const tile = parseGlobalMosaicTilePath(path);
        if (!tile) return new Response("HiPS resource not found", { status: 404 });
        if (tile.order < GLOBAL_MOSAIC_MIN_PHOTO_ORDER) return redTileResponse();

        const admin = createAdminClient();
        const { data, error } = await admin.rpc("resolve_global_mosaic_tile", {
          p_order: tile.order,
          p_index: tile.index,
        });
        if (error) {
          return new Response("Sky Map tile lookup unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
          });
        }

        const row = data?.[0] as { tile_path?: unknown } | undefined;
        if (!row || !isPublishedTilePath(row.tile_path)) return redTileResponse();
        return publicDerivativeRedirect(row.tile_path, "covered");
      },
    },
  },
});
