import { startContributionUpload } from "@/features/mosaic/api/resumable-upload";
import {
  startR2MultipartUpload,
  type AstroContributionMetadata,
  type R2MultipartUploadOptions,
} from "./r2-multipart-upload";

interface UploadCallbacks {
  onProgress?: (percentage: number) => void;
}

interface LegacyTransfer {
  path: string;
  completed: Promise<void>;
  cancel: () => Promise<void>;
}

interface CommonTransfer {
  backend: "r2" | "supabase";
  path?: string;
  completed: Promise<{ uploadId: string | null }>;
  cancel: () => Promise<void>;
}

interface ContributionUploadDependencies {
  edgeUrl?: string;
  edgeStart?: typeof startR2MultipartUpload;
  legacyStart?: (
    file: File,
    accessToken: string,
    userId: string,
    callbacks?: UploadCallbacks,
  ) => LegacyTransfer;
}

function configuredEdgeUrl(explicit?: string): string {
  if (explicit !== undefined) return explicit.trim();
  return ((import.meta.env["VITE_SCIENCE_EDGE_URL"] as string | undefined) ?? "").trim();
}

export function startAstroContributionUpload(
  file: File,
  accessToken: string,
  userId: string,
  metadata: AstroContributionMetadata,
  callbacks: UploadCallbacks = {},
  dependencies: ContributionUploadDependencies = {},
): CommonTransfer {
  const edgeUrl = configuredEdgeUrl(dependencies.edgeUrl);
  if (edgeUrl) {
    const edgeStart = dependencies.edgeStart ?? startR2MultipartUpload;
    const options: R2MultipartUploadOptions = {
      edgeUrl,
      onProgress: callbacks.onProgress,
    };
    const transfer = edgeStart(file, accessToken, userId, metadata, options);
    return {
      backend: "r2",
      completed: transfer.completed.then((result) => ({ uploadId: result.uploadId })),
      cancel: transfer.cancel,
    };
  }

  const legacyStart = dependencies.legacyStart ?? startContributionUpload;
  const transfer = legacyStart(file, accessToken, userId, callbacks);
  return {
    backend: "supabase",
    path: transfer.path,
    completed: transfer.completed.then(() => ({ uploadId: null })),
    cancel: transfer.cancel,
  };
}
