export interface QualificationJobState {
  status: string;
  attempts: number;
  max_attempts: number;
  completed_at: string | null;
  lease_expires_at: string | null;
  error_code: string | null;
}

/**
 * A worker can exhaust its attempts while a legacy database row still says
 * "extracting". Expose a terminal failure instead of an endless progress bar.
 * Keep an in-flight last attempt alive while its lease has not expired.
 */
export function presentQualificationJob(
  job: QualificationJobState,
  now = Date.now(),
): QualificationJobState {
  const terminal = new Set(["approved", "published", "rejected", "duplicate", "cancelled"]);
  if (terminal.has(job.status) || job.completed_at !== null) return job;

  const leaseTime = job.lease_expires_at ? Date.parse(job.lease_expires_at) : Number.NaN;
  const leaseExpired = !Number.isFinite(leaseTime) || leaseTime <= now;

  if (job.attempts >= job.max_attempts && leaseExpired) {
    return {
      ...job,
      status: "failed",
      error_code: job.error_code ?? "MAX_ATTEMPTS_EXHAUSTED",
    };
  }
  if (job.status === "failed" && job.attempts < job.max_attempts) {
    return { ...job, status: "retrying", error_code: null };
  }
  return job;
}
