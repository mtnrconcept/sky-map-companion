import { describe, expect, it, vi } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  MULTIPART_PART_SIZE,
  buildRawUploadKey,
  completeMultipartUpload,
  validatePartNumber,
  validateUploadStart,
} from "./uploads";

const USER_ID = "cbb3e41f-90f0-4911-af97-e4ecced4e085";

const startInput = {
  originalFilename: "M31 light 001.fits",
  contentType: "application/fits",
  fileSizeBytes: 34 * 1024 * 1024,
  objectId: "M31",
  frameType: "light" as const,
  licenceCode: "CC-BY-4.0" as const,
};

describe("validateUploadStart", () => {
  it("accepts an astronomical file within the 5 GiB limit", () => {
    expect(validateUploadStart(startInput)).toMatchObject(startInput);
    expect(MULTIPART_PART_SIZE).toBe(16 * 1024 * 1024);
  });

  it("rejects oversized, unsupported and malformed uploads", () => {
    expect(() =>
      validateUploadStart({ ...startInput, fileSizeBytes: MAX_UPLOAD_BYTES + 1 }),
    ).toThrow(/5 GiB/i);
    expect(() => validateUploadStart({ ...startInput, originalFilename: "frame.txt" })).toThrow(
      /extension/i,
    );
    expect(() =>
      validateUploadStart({ ...startInput, frameType: "other" as never }),
    ).toThrow(/frame type/i);
  });
});

describe("buildRawUploadKey", () => {
  it("builds a deterministic user-owned prefix and sanitizes the filename", () => {
    expect(
      buildRawUploadKey(USER_ID, "3fb2377d-4cb1-4863-97bc-dca665a13300", "M31 light 001.fits"),
    ).toBe(
      "raw/cbb3e41f-90f0-4911-af97-e4ecced4e085/3fb2377d-4cb1-4863-97bc-dca665a13300/M31_light_001.fits",
    );
  });
});

describe("validatePartNumber", () => {
  it("accepts R2 multipart part numbers only in range", () => {
    expect(validatePartNumber(1)).toBe(1);
    expect(validatePartNumber(10_000)).toBe(10_000);
    expect(() => validatePartNumber(0)).toThrow(/part number/i);
    expect(() => validatePartNumber(10_001)).toThrow(/part number/i);
  });
});

describe("completeMultipartUpload", () => {
  it("completes, verifies the exact R2 size, registers and enqueues", async () => {
    const multipart = {
      complete: vi.fn(async () => ({ key: "ignored" })),
    };
    const rawHead = vi.fn(async () => ({ size: startInput.fileSizeBytes }));
    const finalize = vi.fn(async () => ({
      upload_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
      job_id: "0d638064-83d7-4f22-adf9-e7106a242c8a",
      idempotency_key: "qualify:a015a7bc-6a90-45df-93d7-92f029544c26:science-v1",
      replayed: false,
    }));
    const key = buildRawUploadKey(
      USER_ID,
      "3fb2377d-4cb1-4863-97bc-dca665a13300",
      startInput.originalFilename,
    );

    const result = await completeMultipartUpload(
      {
        userId: USER_ID,
        key,
        fileSizeBytes: startInput.fileSizeBytes,
        originalFilename: startInput.originalFilename,
        objectId: startInput.objectId,
        frameType: startInput.frameType,
        licenceCode: startInput.licenceCode,
        parts: [
          { partNumber: 1, etag: "etag-1" },
          { partNumber: 2, etag: "etag-2" },
        ],
      },
      { multipart, rawHead, finalize },
    );

    expect(multipart.complete).toHaveBeenCalledWith([
      { partNumber: 1, etag: "etag-1" },
      { partNumber: 2, etag: "etag-2" },
    ]);
    expect(rawHead).toHaveBeenCalledWith(key);
    expect(finalize).toHaveBeenCalledOnce();
    expect(result.job_id).toBe("0d638064-83d7-4f22-adf9-e7106a242c8a");
  });

  it("rejects a completed object whose exact size differs", async () => {
    const multipart = { complete: vi.fn(async () => ({ key: "ignored" })) };
    const finalize = vi.fn();

    await expect(
      completeMultipartUpload(
        {
          userId: USER_ID,
          key: buildRawUploadKey(
            USER_ID,
            "3fb2377d-4cb1-4863-97bc-dca665a13300",
            startInput.originalFilename,
          ),
          fileSizeBytes: startInput.fileSizeBytes,
          originalFilename: startInput.originalFilename,
          objectId: startInput.objectId,
          frameType: startInput.frameType,
          licenceCode: startInput.licenceCode,
          parts: [{ partNumber: 1, etag: "etag-1" }],
        },
        {
          multipart,
          rawHead: vi.fn(async () => ({ size: startInput.fileSizeBytes - 1 })),
          finalize,
        },
      ),
    ).rejects.toThrow(/size mismatch/i);
    expect(finalize).not.toHaveBeenCalled();
  });
});
