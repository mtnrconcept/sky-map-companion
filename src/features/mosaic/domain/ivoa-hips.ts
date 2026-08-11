export const IVOA_HIPS_POINTER_PATH = "hips-ivoa/public-optical-r/current.json";
export const IVOA_HIPS_STORAGE_PREFIX = "hips-ivoa/public-optical-r/";
export const IVOA_HIPS_POINTER_SCHEMA = "sky-map-ivoa-hips-pointer-v1";
export const IVOA_HIPS_MAX_ORDER = 9;
export const IVOA_HIPS_UNCOVERED_BACKGROUND = "rgb(104, 18, 28)";

export interface IvoaHipsPointer {
  schema: typeof IVOA_HIPS_POINTER_SCHEMA;
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

function isSafeStoragePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(IVOA_HIPS_STORAGE_PREFIX) &&
    SAFE_PATH_PATTERN.test(value) &&
    !value.includes("..") &&
    !value.includes("//") &&
    !value.endsWith("/")
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

export function parseIvoaHipsPointer(value: unknown): IvoaHipsPointer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Publication HiPS IVOA invalide");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate["schema"] !== IVOA_HIPS_POINTER_SCHEMA) {
    throw new Error("Version de publication HiPS IVOA inconnue");
  }
  if (!isSafeStoragePath(candidate["root_path"])) {
    throw new Error("Chemin de publication HiPS IVOA invalide");
  }
  if (!isSafeStoragePath(candidate["manifest_path"])) {
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

  return candidate as unknown as IvoaHipsPointer;
}
