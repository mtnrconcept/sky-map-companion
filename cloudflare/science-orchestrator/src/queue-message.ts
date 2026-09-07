export interface ScienceQueueMessage {
  schema_version: 1;
  job_id: string;
  job_type: string;
  idempotency_key: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseScienceQueueMessage(input: unknown): ScienceQueueMessage {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid science queue message.");
  }

  const candidate = input as Record<string, unknown>;
  if (
    candidate.schema_version !== 1 ||
    typeof candidate.job_id !== "string" ||
    !UUID_PATTERN.test(candidate.job_id) ||
    typeof candidate.job_type !== "string" ||
    candidate.job_type.trim().length === 0 ||
    typeof candidate.idempotency_key !== "string" ||
    candidate.idempotency_key.trim().length === 0
  ) {
    throw new Error("Invalid science queue message.");
  }

  return {
    schema_version: 1,
    job_id: candidate.job_id,
    job_type: candidate.job_type,
    idempotency_key: candidate.idempotency_key,
  };
}
