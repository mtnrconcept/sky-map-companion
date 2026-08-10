export const GLOBAL_MOSAIC_HIPS_URL = "/api/mosaic/hips";
export const GLOBAL_MOSAIC_MAX_ORDER = 9;
export const GLOBAL_MOSAIC_MIN_PHOTO_ORDER = 0;
export const GLOBAL_MOSAIC_ALLSKY_ORDER = 3;
export const GLOBAL_MOSAIC_ALLSKY_PATH = `Norder${GLOBAL_MOSAIC_ALLSKY_ORDER}/Allsky.webp`;

export interface GlobalMosaicTileRequest {
  order: number;
  directory: number;
  index: number;
}

const TILE_PATTERN = /^Norder(\d+)\/Dir(\d+)\/Npix(\d+)\.webp$/;

export function healpixDirectory(index: number): number {
  return Math.floor(index / 10_000) * 10_000;
}

export function isGlobalMosaicAllskyPath(path: string): boolean {
  return path.replace(/^\/+|\/+$/g, "") === GLOBAL_MOSAIC_ALLSKY_PATH;
}

export function parseGlobalMosaicTilePath(path: string): GlobalMosaicTileRequest | null {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  const match = TILE_PATTERN.exec(normalized);
  if (!match) return null;

  const order = Number(match[1]);
  const directory = Number(match[2]);
  const index = Number(match[3]);
  if (
    !Number.isSafeInteger(order) ||
    !Number.isSafeInteger(directory) ||
    !Number.isSafeInteger(index) ||
    order < 0 ||
    order > GLOBAL_MOSAIC_MAX_ORDER ||
    index < 0
  ) {
    return null;
  }

  const maxIndexExclusive = 12 * 4 ** order;
  if (index >= maxIndexExclusive || directory !== healpixDirectory(index)) return null;

  return { order, directory, index };
}

export function buildGlobalMosaicProperties(): string {
  return [
    "creator_did = ivo://sky-map-companion/global-mosaic",
    "obs_title = Sky Map Companion — mosaïque tout-ciel",
    "obs_description = Atlas HEALPix global : rouge lorsque Sky Map ne possède pas encore de donnée, photographie lorsqu'une tuile scientifique courante est publiée.",
    "dataproduct_type = image",
    "hips_version = 1.4",
    "hips_release_date = 2026-08-10T00:00Z",
    "hips_status = public master",
    "hips_frame = equatorial",
    `hips_order = ${GLOBAL_MOSAIC_MAX_ORDER}`,
    `hips_order_min = ${GLOBAL_MOSAIC_MIN_PHOTO_ORDER}`,
    "hips_tile_width = 512",
    "hips_tile_format = webp",
    "hips_initial_ra = 180",
    "hips_initial_dec = 0",
    "hips_initial_fov = 360",
    "client_category = Image/Optical",
    "client_sort_key = 001",
    "obs_regime = Optical",
    "",
  ].join("\n");
}
