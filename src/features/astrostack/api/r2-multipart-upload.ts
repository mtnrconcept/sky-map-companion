export interface AstroContributionMetadata {
  object_id: string;
  frame_type: "light" | "dark" | "flat" | "bias";
  licence_code: "CC-BY-4.0" | "CC-BY-SA-4.0" | "CC0-1.0";
  telescope?: string;
  camera?: string;
  focal_length_mm?: number;
  aperture_mm?: number;
  exposure_s?: number;
  gain?: number;
  temperature_c?: number;
  filter_name?: string;
  binning?: number;
  latitude?: number;
  longitude?: number;
  captured_at?: string;
  pixel_size_um?: number;
}

interface ResumeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CompletedPart {
  partNumber: number;
  etag: string;
}

interface ResumeState {
  uploadId: string;
  key: string;
  partSize: number;
  completedParts: CompletedPart[];
}

export interface R2MultipartUploadOptions {
  edgeUrl: string;
  fetcher?: typeof fetch;
  storage?: ResumeStorage;
  onProgress?: (percentage: number) => void;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface R2MultipartResult {
  uploadId: string;
  jobId: string;
  replayed: boolean;
}

export interface StartedR2MultipartUpload {
  completed: Promise<R2MultipartResult>;
  cancel: () => Promise<void>;
}

const RETRY_DELAYS = [0, 1_000, 3_000, 5_000] as const;

function normalizeEdgeUrl(value: string): string {
  const normalized = value.trim().replace(/\/$/, "");
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Science edge URL must use HTTPS.");
  }
  return normalized;
}

function resumeFingerprint(file: File, userId: string): string {
  return `sky:r2-upload:${userId}:${encodeURIComponent(file.name)}:${file.size}:${file.lastModified}`;
}

function defaultStorage(): ResumeStorage | undefined {
  return typeof localStorage === "undefined" ? undefined : localStorage;
}

function readResumeState(storage: ResumeStorage | undefined, key: string): ResumeState | null {
  const raw = storage?.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ResumeState>;
    if (
      typeof parsed.uploadId !== "string" ||
      typeof parsed.key !== "string" ||
      !Number.isSafeInteger(parsed.partSize) ||
      Number(parsed.partSize) <= 0 ||
      !Array.isArray(parsed.completedParts)
    ) {
      storage?.removeItem(key);
      return null;
    }
    const completedParts = parsed.completedParts.filter((part): part is CompletedPart =>
      Boolean(
        part &&
          typeof part === "object" &&
          Number.isInteger(part.partNumber) &&
          part.partNumber > 0 &&
          typeof part.etag === "string" &&
          part.etag.length > 0,
      ),
    );
    return {
      uploadId: parsed.uploadId,
      key: parsed.key,
      partSize: Number(parsed.partSize),
      completedParts,
    };
  } catch {
    storage?.removeItem(key);
    return null;
  }
}

function writeResumeState(
  storage: ResumeStorage | undefined,
  key: string,
  state: ResumeState,
): void {
  storage?.setItem(key, JSON.stringify(state));
}

async function responseJson<T>(response: Response, label: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const detail = body && typeof body === "object" && "error" in body ? body.error : undefined;
    throw new Error(detail || `${label} failed (${response.status}).`);
  }
  if (!body) throw new Error(`${label} returned an empty response.`);
  return body as T;
}

async function uploadPartWithRetry(
  fetcher: typeof fetch,
  edgeUrl: string,
  token: string,
  state: ResumeState,
  partNumber: number,
  chunk: Blob,
  sleep: (milliseconds: number) => Promise<void>,
  isCancelled: () => boolean,
): Promise<CompletedPart> {
  let lastError: unknown;
  for (const delay of RETRY_DELAYS) {
    if (isCancelled()) throw new DOMException("Upload aborted", "AbortError");
    if (delay > 0) await sleep(delay);
    try {
      const response = await fetcher(
        `${edgeUrl}/v1/uploads/${encodeURIComponent(state.uploadId)}/parts/${partNumber}?key=${encodeURIComponent(state.key)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Length": String(chunk.size),
            "Content-Type": "application/octet-stream",
          },
          body: chunk,
        },
      );
      const value = await responseJson<{ partNumber: number; etag: string }>(
        response,
        "R2 part upload",
      );
      if (value.partNumber !== partNumber || !value.etag) {
        throw new Error("R2 part upload returned invalid metadata.");
      }
      return { partNumber, etag: value.etag };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("R2 part upload failed.");
}

export function startR2MultipartUpload(
  file: File,
  accessToken: string,
  userId: string,
  metadata: AstroContributionMetadata,
  options: R2MultipartUploadOptions,
): StartedR2MultipartUpload {
  const edgeUrl = normalizeEdgeUrl(options.edgeUrl);
  const fetcher = options.fetcher ?? fetch;
  const storage = options.storage ?? defaultStorage();
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const fingerprint = resumeFingerprint(file, userId);
  let state = readResumeState(storage, fingerprint);
  let cancelled = false;

  const completed = (async (): Promise<R2MultipartResult> => {
    if (!state) {
      const startResponse = await fetcher(`${edgeUrl}/v1/uploads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originalFilename: file.name,
          contentType: file.type || "application/octet-stream",
          fileSizeBytes: file.size,
          objectId: metadata.object_id,
          frameType: metadata.frame_type,
          licenceCode: metadata.licence_code,
          metadata,
        }),
      });
      const started = await responseJson<{ uploadId: string; key: string; partSize: number }>(
        startResponse,
        "R2 multipart start",
      );
      if (
        !started.uploadId ||
        !started.key ||
        !Number.isSafeInteger(started.partSize) ||
        started.partSize <= 0
      ) {
        throw new Error("R2 multipart start returned invalid metadata.");
      }
      state = { ...started, completedParts: [] };
      writeResumeState(storage, fingerprint, state);
    }

    const active = state;
    const completedByNumber = new Map(active.completedParts.map((part) => [part.partNumber, part]));
    const totalParts = Math.ceil(file.size / active.partSize);

    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      if (cancelled) throw new DOMException("Upload aborted", "AbortError");
      if (!completedByNumber.has(partNumber)) {
        const start = (partNumber - 1) * active.partSize;
        const end = Math.min(file.size, start + active.partSize);
        const part = await uploadPartWithRetry(
          fetcher,
          edgeUrl,
          accessToken,
          active,
          partNumber,
          file.slice(start, end),
          sleep,
          () => cancelled,
        );
        if (cancelled) throw new DOMException("Upload aborted", "AbortError");
        completedByNumber.set(partNumber, part);
        active.completedParts = [...completedByNumber.values()].sort(
          (left, right) => left.partNumber - right.partNumber,
        );
        writeResumeState(storage, fingerprint, active);
      }
      const uploadedBytes = Math.min(file.size, partNumber * active.partSize);
      options.onProgress?.((uploadedBytes / file.size) * 100);
    }

    if (cancelled) throw new DOMException("Upload aborted", "AbortError");
    const completeResponse = await fetcher(
      `${edgeUrl}/v1/uploads/${encodeURIComponent(active.uploadId)}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: active.key,
          fileSizeBytes: file.size,
          originalFilename: file.name,
          objectId: metadata.object_id,
          frameType: metadata.frame_type,
          licenceCode: metadata.licence_code,
          metadata,
          parts: active.completedParts,
        }),
      },
    );
    const completedBody = await responseJson<{
      upload: { upload_id: string; job_id: string; replayed: boolean };
    }>(completeResponse, "R2 multipart completion");
    if (!completedBody.upload?.upload_id || !completedBody.upload.job_id) {
      throw new Error("R2 multipart completion returned invalid registration metadata.");
    }
    storage?.removeItem(fingerprint);
    options.onProgress?.(100);
    return {
      uploadId: completedBody.upload.upload_id,
      jobId: completedBody.upload.job_id,
      replayed: completedBody.upload.replayed,
    };
  })();

  return {
    completed,
    cancel: async () => {
      cancelled = true;
      const active = state;
      if (active) {
        const response = await fetcher(
          `${edgeUrl}/v1/uploads/${encodeURIComponent(active.uploadId)}?key=${encodeURIComponent(active.key)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (!response.ok && response.status !== 404) {
          throw new Error(`Unable to abort R2 multipart upload (${response.status}).`);
        }
      }
      storage?.removeItem(fingerprint);
    },
  };
}
