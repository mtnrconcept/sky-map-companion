import type { ScienceQueueMessage } from "./queue-message";

export type FrameType = "light" | "dark" | "flat" | "bias";
export type LicenceCode = "CC-BY-4.0" | "CC-BY-SA-4.0" | "CC0-1.0";

export interface R2UploadFinalizeInput {
  userId: string;
  storageKey: string;
  fileSizeBytes: number;
  originalFilename: string;
  objectId: string;
  frameType: FrameType;
  licenceCode: LicenceCode;
  metadata?: Record<string, unknown>;
}

export interface RegisteredScienceUpload {
  upload_id: string;
  job_id: string;
  idempotency_key: string;
  replayed: boolean;
}

export interface UploadFinalizeDependencies {
  rawHead(key: string): Promise<{ size: number } | null>;
  registerUpload(input: R2UploadFinalizeInput): Promise<RegisteredScienceUpload>;
  queueSend(message: ScienceQueueMessage): Promise<void>;
}

export async function finalizeR2Upload(
  input: R2UploadFinalizeInput,
  dependencies: UploadFinalizeDependencies,
): Promise<RegisteredScienceUpload> {
  const ownedPrefix = `raw/${input.userId}/`;
  if (!input.storageKey.startsWith(ownedPrefix)) {
    throw new Error("Invalid storage key ownership.");
  }
  if (!Number.isSafeInteger(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new Error("Invalid upload file size.");
  }

  const object = await dependencies.rawHead(input.storageKey);
  if (!object) throw new Error("R2 object is missing or incomplete.");
  if (object.size !== input.fileSizeBytes) {
    throw new Error(
      `R2 object size mismatch (${object.size} != ${input.fileSizeBytes}).`,
    );
  }

  const registration = await dependencies.registerUpload(input);
  await dependencies.queueSend({
    schema_version: 1,
    job_id: registration.job_id,
    job_type: "qualify_upload",
    idempotency_key: registration.idempotency_key,
  });
  return registration;
}
