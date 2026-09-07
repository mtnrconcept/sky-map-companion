import { describe, expect, it } from "vitest";
import { parseScienceQueueMessage } from "./queue-message";

describe("parseScienceQueueMessage", () => {
  it("accepts the minimal stable queue contract", () => {
    expect(
      parseScienceQueueMessage({
        schema_version: 1,
        job_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
        job_type: "qualify_upload",
        idempotency_key: "qualify:a015a7bc-6a90-45df-93d7-92f029544c26",
      }),
    ).toEqual({
      schema_version: 1,
      job_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
      job_type: "qualify_upload",
      idempotency_key: "qualify:a015a7bc-6a90-45df-93d7-92f029544c26",
    });
  });

  it.each([
    null,
    {},
    {
      schema_version: 2,
      job_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
      job_type: "x",
      idempotency_key: "x",
    },
    { schema_version: 1, job_id: "not-a-uuid", job_type: "x", idempotency_key: "x" },
    {
      schema_version: 1,
      job_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
      job_type: "",
      idempotency_key: "x",
    },
    {
      schema_version: 1,
      job_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
      job_type: "x",
      idempotency_key: "",
    },
  ])("rejects malformed messages: %j", (input) => {
    expect(() => parseScienceQueueMessage(input)).toThrow(/queue message/i);
  });
});
