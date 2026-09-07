export const IVOA_HIPS_POINTER_PATH = "hips-ivoa/public-optical-r/current.json";
export const IVOA_HIPS_STORAGE_PREFIX = "hips-ivoa/public-optical-r/";
export const IVOA_HIPS_DEEP_POINTER_PATH = "hips-ivoa/public-optical-r-deep/current.json";
export const IVOA_HIPS_DEEP_STORAGE_PREFIX = "hips-ivoa/public-optical-r-deep/";
export const IVOA_HIPS_POINTER_SCHEMA = "sky-map-ivoa-hips-pointer-v1";
/** HiPS 2.0 supports orders through 29. Product builders still choose their own safer operational cap. */
export const IVOA_HIPS_MAX_ORDER = 29;
export const IVOA_HIPS_UNCOVERED_BACKGROUND = "rgb(104, 18, 28)";

export interface IvoaHipsPointer {
  schema: typeof IVOA_HIPS_POINTER_SCHEMA;
  profile?: string;
  root_path: string;
  manifest_path: string;
  manifest_sha256: string;
  inventory_sha256: string;
  source_count: number;
  hips_order: number;
  hipsgen_version: string;
  hipsgen_sha256: string;
  spectral_filter: string;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_PATH_PATTERN = /^[a-zA-Z0-9._/-]+$/;
const HEALPIX_ORDER_ZERO_PIXEL_WIDTH_DEG = 58.6323;

function isSafeStoragePath(value: unknown, storagePrefix: string): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(storagePrefix) &&
    SAFE_PATH_PATTERN.test(value) &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.endsWith("/")
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

export function hipsPixelScaleArcsec(order: number, tileWidth = 512): number {
  if (!Number.isInteger(order) || order < 0 || order > IVOA_HIPS_MAX_ORDER) {
    throw new Error("Ordre HiPS IVOA invalide");
  }
  if (!Number.isInteger(tileWidth) || tileWidth < 1) {
    throw new Error("Largeur de tuile HiPS invalide");
  }
  return (HEALPIX_ORDER_ZERO_PIXEL_WIDTH_DEG * 3600) / (tileWidth * 2 ** order);
}

export function parseIvoaHipsPointer(
  value: unknown,
  storagePrefix = IVOA_HIPS_STORAGE_PREFIX,
): IvoaHipsPointer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Publication HiPS IVOA invalide");
  }
  if (
    !storagePrefix.endsWith("/") ||
    storagePrefix.includes("..") ||
    storagePrefix.includes("//")
  ) {
    throw new Error("Préfixe HiPS IVOA invalide");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate["schema"] !== IVOA_HIPS_POINTER_SCHEMA) {
    throw new Error("Version de publication HiPS IVOA inconnue");
  }
  if (!isSafeStoragePath(candidate["root_path"], storagePrefix)) {
    throw new Error("Chemin de publication HiPS IVOA invalide");
  }
  if (!isSafeStoragePath(candidate["manifest_path"], storagePrefix)) {
    throw new Error("Chemin de manifeste HiPS IVOA invalide");
  }
  if (!isSha256(candidate["manifest_sha256"]) || !isSha256(candidate["inventory_sha256"])) {
    throw new Error("Empreinte de publication HiPS IVOA invalide");
  }
  if (!isSha256(candidate["hipsgen_sha256"])) {
    throw new Error("Empreinte Hipsgen invalide");
  }
  const sourceCount = candidate["source_count"];
  const order = candidate["hips_order"];
  if (!Number.isSafeInteger(sourceCount) || Number(sourceCount) < 1) {
    throw new Error("Inventaire HiPS IVOA vide");
  }
  if (!Number.isSafeInteger(order) || Number(order) < 0 || Number(order) > IVOA_HIPS_MAX_ORDER) {
    throw new Error("Ordre HiPS IVOA invalide");
  }
  if (
    typeof candidate["hipsgen_version"] !== "string" ||
    candidate["hipsgen_version"].length < 1 ||
    typeof candidate["spectral_filter"] !== "string" ||
    candidate["spectral_filter"].length < 1
  ) {
    throw new Error("Métadonnées HiPS IVOA incomplètes");
  }
  if (candidate["profile"] !== undefined && typeof candidate["profile"] !== "string") {
    throw new Error("Profil HiPS IVOA invalide");
  }

  return candidate as unknown as IvoaHipsPointer;
}
