import * as tus from "tus-js-client";

const CHUNK_SIZE = 6 * 1024 * 1024;
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "fit",
  "fits",
  "fts",
  "cr2",
  "cr3",
  "nef",
  "arw",
  "raf",
  "orf",
  "rw2",
  "dng",
  "tif",
  "tiff",
  "png",
  "jpg",
  "jpeg",
]);

interface UploadCallbacks {
  onProgress?: (percentage: number) => void;
}

interface StartedUpload {
  path: string;
  completed: Promise<void>;
  cancel: () => Promise<void>;
}

function clientEnvironment() {
  const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
  if (!url || !key) throw new Error("Supabase n’est pas configuré dans le client.");
  return { url, key };
}

export function validateContributionFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension))
    throw new Error(`Format .${extension || "inconnu"} non pris en charge.`);
  if (file.size <= 0 || file.size > MAX_FILE_SIZE)
    throw new Error("Le fichier doit peser entre 1 octet et 5 Gio.");
}

export function startContributionUpload(
  file: File,
  accessToken: string,
  userId: string,
  callbacks: UploadCallbacks = {},
): StartedUpload {
  validateContributionFile(file);
  const { url, key } = clientEnvironment();
  const safeName = file.name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-180);
  const path = `${userId}/${crypto.randomUUID()}/${safeName}`;
  let upload: tus.Upload;
  const completed = new Promise<void>((resolve, reject) => {
    upload = new tus.Upload(file, {
      endpoint: `${url}/storage/v1/upload/resumable`,
      headers: { authorization: `Bearer ${accessToken}`, apikey: key },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
      metadata: {
        bucketName: "astro-raw",
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: (uploaded, total) => callbacks.onProgress?.(total ? (uploaded / total) * 100 : 0),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
  return {
    path,
    completed,
    cancel: async () => {
      await upload.abort(true);
    },
  };
}
