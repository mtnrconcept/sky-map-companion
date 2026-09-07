import { describe, expect, it, vi } from "vitest";
import { finalizeR2Upload } from "./upload-finalize";

const BASE_INPUT = {
  userId: "cbb3e41f-90f0-4911-af97-e4ecced4e085",
  storageKey:
    "raw/cbb3e41f-90f0-4911-af97-e4ecced4e085/3fb2377d-4cb1-4863-97bc-dca665a13300/frame.jpg",
  fileSizeBytes: 6,
  originalFilename: "frame.jpg",
  objectId: "M31",
  frameType: "light" as const,
  licenceCode: "CC-BY-4.0" as const,
};

function dependencies(options?: { size?: number; missing?: boolean; replayed?: boolean }) {
  const queueSend = vi.fn(async () => undefined);
  const registerUpload = vi.fn(async () => ({
    upload_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
    job_id: "0d638064-83d7-4f22-adf9-e7106a242c8a",
    idempotency_key:
      "qualify:a015a7bc-6a90-45df-93d7-92f029544c26:science-v1",
    replayed: options?.replayed ?? false,
  }));
  const rawHead = vi.fn(async () =>
    options?.missing
      ? null
      : {
          size: options?.size ?? BASE_INPUT.fileSizeBytes,
        },
  );
  return { queueSend, registerUpload, rawHead };
}

describe("finalizeR2Upload", () => {
  it("verifies the R2 object, registers it and enqueues the returned job", async () => {
    const deps = dependencies();

    const result = await finalizeR2Upload(BASE_INPUT, deps);

    expect(deps.rawHead).toHaveBeenCalledWith(BASE_INPUT.storageKey);
    expect(deps.registerUpload).toHaveBeenCalledTimes(1);
    expect(deps.queueSend).toHaveBeenCalledWith({
      schema_version: 1,
      job_id: result.job_id,
      job_type: "qualify_upload",
      idempotency_key: result.idempotency_key,
    });
    expect(result.replayed).toBe(false);
  });

  it("rejects a key outside the authenticated user prefix", async () => {
    const deps = dependencies();

    await expect(
      finalizeR2Upload(
        {
          ...BASE_INPUT,
          storageKey: "raw/another-user/upload/frame.jpg",
        },
        deps,
      ),
    ).rejects.toThrow(/storage key ownership/i);

    expect(deps.rawHead).not.toHaveBeenCalled();
    expect(deps.registerUpload).not.toHaveBeenCalled();
    expect(deps.queueSend).not.toHaveBeenCalled();
  });

  it("rejects an absent or incomplete R2 object before database registration", async () => {
    const missing = dependencies({ missing: true });
    await expect(finalizeR2Upload(BASE_INPUT, missing)).rejects.toThrow(/R2 object/i);
    expect(missing.registerUpload).not.toHaveBeenCalled();

    const wrongSize = dependencies({ size: 5 });
    await expect(finalizeR2Upload(BASE_INPUT, wrongSize)).rejects.toThrow(/size mismatch/i);
    expect(wrongSize.registerUpload).not.toHaveBeenCalled();
  });

  it("replays the same DB upload/job while emitting at most one queue delivery per request", async () => {
    const deps = dependencies({ replayed: true });

    const result = await finalizeR2Upload(BASE_INPUT, deps);

    expect(result.replayed).toBe(true);
    expect(deps.registerUpload).toHaveBeenCalledTimes(1);
    expect(deps.queueSend).toHaveBeenCalledTimes(1);
  });
});
