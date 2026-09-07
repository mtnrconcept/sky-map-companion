import { describe, expect, it, vi } from "vitest";
import { recoverAvailableJobs } from "./recovery";

const jobs = [
  {
    job_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
    job_type: "qualify_upload",
    idempotency_key: "qualify:one:science-v1",
  },
  {
    job_id: "0d638064-83d7-4f22-adf9-e7106a242c8a",
    job_type: "stack_object",
    idempotency_key: "stack:M31:science-v1",
  },
];

describe("recoverAvailableJobs", () => {
  it("re-enqueues each bounded recovery row once", async () => {
    const listJobs = vi.fn(async () => jobs);
    const queueSend = vi.fn(async () => undefined);

    const count = await recoverAvailableJobs({ listJobs, queueSend });

    expect(count).toBe(2);
    expect(listJobs).toHaveBeenCalledWith(100);
    expect(queueSend).toHaveBeenNthCalledWith(1, {
      schema_version: 1,
      job_id: jobs[0]?.job_id,
      job_type: jobs[0]?.job_type,
      idempotency_key: jobs[0]?.idempotency_key,
    });
    expect(queueSend).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed recovery rows instead of poisoning the queue", async () => {
    await expect(
      recoverAvailableJobs({
        listJobs: vi.fn(async () => [
          { job_id: "bad", job_type: "qualify_upload", idempotency_key: "x" },
        ]),
        queueSend: vi.fn(),
      }),
    ).rejects.toThrow(/recovery row/i);
  });
});
