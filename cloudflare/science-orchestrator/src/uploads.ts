import type {
  FrameType,
  LicenceCode,
  R2UploadFinalizeInput,
  RegisteredScienceUpload,
} from "./upload-finalize";
import { finalizeR2Upload } from "./upload-finalize";
import { registerR2UploadRpc, verifySupabaseBearer } from "./supabase";
import type { SupabaseEdgeEnv } from "./supabase";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;
export const MULTIPART_PART_SIZE = 16 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "fit",
  "fits",
  "fts",
  "xisf",
  "tif",
  "tiff",
  "jpg",
  "jpeg",
  "png",
  "cr2",
  "cr3",
  "nef",
  "arw",
  "dng",
  "orf",
  "rw2",
  "raf",
  "pef",
  "srw",
]);

const ALLOWED_CONTENT_TYPES = new Set([
  "application/fits",
  "application/octet-stream",
  "image/fits",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/x-canon-cr2",
  "image/x-canon-cr3",
  "image/x-fuji-raf",
  "image/x-nikon-nef",
  "image/x-olympus-orf",
  "image/x-panasonic-rw2",
  "image/x-pentax-pef",
  "image/x-sony-arw",
]);

const FRAME_TYPES = new Set<FrameType>(["light", "dark", "flat", "bias"]);
const LICENCES = new Set<LicenceCode>(["CC-BY-4.0", "CC-BY-SA-4.0", "CC0-1.0"]);

export interface UploadStartInput {
  originalFilename: string;
  contentType: string;
  fileSizeBytes: number;
  objectId: string;
  frameType: FrameType;
  licenceCode: LicenceCode;
  metadata?: Record<string, unknown>;
}

export interface MultipartPart {
  partNumber: number;
  etag: string;
}

export interface MultipartUploadLike {
  complete(parts: MultipartPart[]): Promise<unknown>;
}

interface R2MultipartUploadHandleLike extends MultipartUploadLike {
  uploadId: string;
  key: string;
  uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer): Promise<{ etag: string }>;
  abort(): Promise<void>;
}

interface R2RawBucketLike {
  head(key: string): Promise<{ size: number } | null>;
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2MultipartUploadHandleLike>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUploadHandleLike;
}

interface QueueLike {
  send(message: unknown): Promise<void>;
}

export interface UploadRouteEnv extends SupabaseEdgeEnv {
  RAW_BUCKET: R2RawBucketLike;
  SCIENCE_QUEUE: QueueLike;
}

export interface CompleteMultipartUploadInput {
  userId: string;
  key: string;
  fileSizeBytes: number;
  originalFilename: string;
  objectId: string;
  frameType: FrameType;
  licenceCode: LicenceCode;
  metadata?: Record<string, unknown>;
  parts: MultipartPart[];
}

export interface CompleteMultipartUploadDependencies {
  multipart: MultipartUploadLike;
  rawHead(key: string): Promise<{ size: number } | null>;
  finalize(input: R2UploadFinalizeInput): Promise<RegisteredScienceUpload>;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function validateUploadStart(input: UploadStartInput): UploadStartInput {
  if (!input || typeof input !== "object") throw new Error("Invalid upload metadata.");
  if (
    typeof input.originalFilename !== "string" ||
    input.originalFilename.trim().length === 0 ||
    input.originalFilename.length > 255
  ) {
    throw new Error("Invalid original filename.");
  }
  if (!ALLOWED_EXTENSIONS.has(extensionOf(input.originalFilename))) {
    throw new Error("Unsupported astronomical file extension.");
  }
  if (typeof input.contentType !== "string" || !ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    throw new Error("Unsupported upload content type.");
  }
  if (!Number.isSafeInteger(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new Error("Invalid upload size.");
  }
  if (input.fileSizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error("Upload exceeds the 5 GiB limit.");
  }
  if (
    typeof input.objectId !== "string" ||
    input.objectId.trim().length === 0 ||
    input.objectId.length > 50
  ) {
    throw new Error("Invalid astro object id.");
  }
  if (!FRAME_TYPES.has(input.frameType)) throw new Error("Invalid frame type.");
  if (!LICENCES.has(input.licenceCode)) throw new Error("Invalid licence code.");
  if (
    input.metadata !== undefined &&
    (input.metadata === null || typeof input.metadata !== "object" || Array.isArray(input.metadata))
  ) {
    throw new Error("Invalid upload metadata.");
  }
  return input;
}

export function validatePartNumber(partNumber: number): number {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    throw new Error("Invalid multipart part number.");
  }
  return partNumber;
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 180);
  if (!sanitized) throw new Error("Filename cannot be sanitized safely.");
  return sanitized;
}

export function buildRawUploadKey(userId: string, uploadId: string, filename: string): string {
  if (!userId || !uploadId) throw new Error("Upload key identifiers are required.");
  return `raw/${userId}/${uploadId}/${sanitizeFilename(filename)}`;
}

function validateOwnedKey(userId: string, key: string): void {
  if (!key.startsWith(`raw/${userId}/`) || key.includes("..") || key.includes("\\")) {
    throw new Error("Invalid storage key ownership.");
  }
}

function validateParts(parts: MultipartPart[]): MultipartPart[] {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 10_000) {
    throw new Error("Invalid multipart completion parts.");
  }
  const seen = new Set<number>();
  for (const part of parts) {
    validatePartNumber(part.partNumber);
    if (typeof part.etag !== "string" || part.etag.trim().length === 0 || part.etag.length > 512) {
      throw new Error("Invalid multipart ETag.");
    }
    if (seen.has(part.partNumber)) throw new Error("Duplicate multipart part number.");
    seen.add(part.partNumber);
  }
  return [...parts].sort((a, b) => a.partNumber - b.partNumber);
}

export async function completeMultipartUpload(
  input: CompleteMultipartUploadInput,
  dependencies: CompleteMultipartUploadDependencies,
): Promise<RegisteredScienceUpload> {
  validateOwnedKey(input.userId, input.key);
  if (!Number.isSafeInteger(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new Error("Invalid upload size.");
  }
  if (input.fileSizeBytes > MAX_UPLOAD_BYTES) throw new Error("Upload exceeds the 5 GiB limit.");

  const parts = validateParts(input.parts);
  await dependencies.multipart.complete(parts);

  const object = await dependencies.rawHead(input.key);
  if (!object) throw new Error("Completed R2 object is missing.");
  if (object.size !== input.fileSizeBytes) {
    throw new Error(
      `Completed R2 object size mismatch (${object.size} != ${input.fileSizeBytes}).`,
    );
  }

  const finalizeInput: R2UploadFinalizeInput = {
    userId: input.userId,
    storageKey: input.key,
    fileSizeBytes: input.fileSizeBytes,
    originalFilename: input.originalFilename,
    objectId: input.objectId,
    frameType: input.frameType,
    licenceCode: input.licenceCode,
  };
  if (input.metadata !== undefined) finalizeInput.metadata = input.metadata;
  return dependencies.finalize(finalizeInput);
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Upload request failed.";
  const status = /collision|already exists|size mismatch|missing/i.test(message) ? 409 : 400;
  return Response.json({ error: message }, { status });
}

function parseKey(url: URL): string {
  const key = url.searchParams.get("key") ?? "";
  if (!key) throw new Error("Missing upload key.");
  return key;
}

export async function handleUploadRequest(
  request: Request,
  env: UploadRouteEnv,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/v1/uploads")) return null;

  const userId = await verifySupabaseBearer(request, env);
  if (!userId) return Response.json({ error: "Authentication required." }, { status: 401 });

  try {
    if (request.method === "POST" && url.pathname === "/v1/uploads") {
      const input = validateUploadStart((await request.json()) as UploadStartInput);
      const uploadToken = crypto.randomUUID();
      const key = buildRawUploadKey(userId, uploadToken, input.originalFilename);
      if (await env.RAW_BUCKET.head(key)) {
        return Response.json({ error: "Immutable R2 key collision." }, { status: 409 });
      }
      const multipart = await env.RAW_BUCKET.createMultipartUpload(key, {
        httpMetadata: { contentType: input.contentType },
      });
      return Response.json(
        {
          uploadId: multipart.uploadId,
          key,
          partSize: MULTIPART_PART_SIZE,
        },
        { status: 201 },
      );
    }

    const partMatch = url.pathname.match(/^\/v1\/uploads\/([^/]+)\/parts\/(\d+)$/);
    if (request.method === "PUT" && partMatch) {
      const uploadId = decodeURIComponent(partMatch[1] ?? "");
      const partNumber = validatePartNumber(Number(partMatch[2]));
      const key = parseKey(url);
      validateOwnedKey(userId, key);
      const contentLength = Number(request.headers.get("Content-Length") ?? "");
      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength <= 0 ||
        contentLength > MULTIPART_PART_SIZE
      ) {
        return Response.json({ error: "Invalid multipart part size." }, { status: 400 });
      }
      const body = request.body ?? (await request.arrayBuffer());
      const uploaded = await env.RAW_BUCKET.resumeMultipartUpload(key, uploadId).uploadPart(
        partNumber,
        body,
      );
      return Response.json({ partNumber, etag: uploaded.etag });
    }

    const completeMatch = url.pathname.match(/^\/v1\/uploads\/([^/]+)\/complete$/);
    if (request.method === "POST" && completeMatch) {
      const uploadId = decodeURIComponent(completeMatch[1] ?? "");
      const payload = (await request.json()) as Omit<CompleteMultipartUploadInput, "userId">;
      validateOwnedKey(userId, payload.key);
      const multipart = env.RAW_BUCKET.resumeMultipartUpload(payload.key, uploadId);
      const result = await completeMultipartUpload(
        { ...payload, userId },
        {
          multipart,
          rawHead: (key) => env.RAW_BUCKET.head(key),
          finalize: (input) =>
            finalizeR2Upload(input, {
              rawHead: (key) => env.RAW_BUCKET.head(key),
              registerUpload: (value) => registerR2UploadRpc(value, env),
              queueSend: (message) => env.SCIENCE_QUEUE.send(message),
            }),
        },
      );
      return Response.json({ upload: result }, { status: result.replayed ? 200 : 201 });
    }

    const abortMatch = url.pathname.match(/^\/v1\/uploads\/([^/]+)$/);
    if (request.method === "DELETE" && abortMatch) {
      const uploadId = decodeURIComponent(abortMatch[1] ?? "");
      const key = parseKey(url);
      validateOwnedKey(userId, key);
      await env.RAW_BUCKET.resumeMultipartUpload(key, uploadId).abort();
      return new Response(null, { status: 204 });
    }

    return new Response("Not found", { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
