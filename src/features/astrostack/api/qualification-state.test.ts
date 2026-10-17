import { describe, expect, it } from "vitest";
import { presentQualificationJob, type QualificationJobState } from "./qualification-state";

const base: QualificationJobState = {
  status: "extracting",
  attempts: 2,
  max_attempts: 5,
  completed_at: null,
  lease_expires_at: null,
  error_code: null,
};

describe("presentQualificationJob", () => {
  it("reports legacy exhausted uploads as failed", () => {
    const state = presentQualificationJob({ ...base, attempts: 5 });
    expect(state.status).toBe("failed");
    expect(state.error_code).toBe("MAX_ATTEMPTS_EXHAUSTED");
  });

  it("does not prematurely fail the last running attempt", () => {
    const job = {
      ...base,
      attempts: 5,
      lease_expires_at: "2026-10-17T11:00:00Z",
    };
    expect(presentQualificationJob(job, Date.parse("2026-10-17T10:00:00Z"))).toEqual(job);
  });

  it("keeps retryable failed jobs nonterminal until all attempts are used", () => {
    const retrying = presentQualificationJob({
      ...base,
      status: "failed",
      error_code: "TIMEOUTEXPIRED",
    });
    expect(retrying.status).toBe("retrying");
    expect(retrying.error_code).toBeNull();
  });

  it("does not change completed failed jobs or approved images", () => {
    const terminal = { ...base, status: "failed", completed_at: "2026-10-17T10:00:00Z" };
    expect(presentQualificationJob(terminal, Date.now())).toEqual(terminal);
    const approved = { ...base, status: "published", attempts: 5 };
    expect(presentQualificationJob(approved, Date.now())).toEqual(approved);
  });
});
