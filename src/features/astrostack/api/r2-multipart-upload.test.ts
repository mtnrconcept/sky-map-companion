import { describe, expect, it, vi } from "vitest";
import { startR2MultipartUpload } from "./r2-multipart-upload";

const EDGE = "https://science.example.workers.dev";
const TOKEN = "user-token";
const USER = "cbb3e41f-90f0-4911-af97-e4ecced4e085";

function response(body: unknown, status = 200) {
  const init: ResponseInit = { status };
  if (body !== null) init.headers = { "Content-Type": "application/json" };
  return new Response(body === null ? null : JSON.stringify(body), init);
}

function makeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

const metadata = {
  object_id: "M31",
  frame_type: "light" as const,
  licence_code: "CC-BY-4.0" as const,
  telescope: "Test scope",
};

describe("startR2MultipartUpload", () => {
  it("uploads sequential chunks, reports progress and completes registration", async () => {
    const file = new File([new Uint8Array(10)], "m31.fits", {
      type: "application/fits",
      lastModified: 123,
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ uploadId: "mpu-1", key: `raw/${USER}/session/m31.fits`, partSize: 4 }, 201),
      )
      .mockResolvedValueOnce(response({ partNumber: 1, etag: "e1" }))
      .mockResolvedValueOnce(response({ partNumber: 2, etag: "e2" }))
      .mockResolvedValueOnce(response({ partNumber: 3, etag: "e3" }))
      .mockResolvedValueOnce(
        response({
          upload: {
            upload_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
            job_id: "0d638064-83d7-4f22-adf9-e7106a242c8a",
            replayed: false,
          },
        }),
      );
    const onProgress = vi.fn();
    const storage = makeStorage();

    const transfer = startR2MultipartUpload(file, TOKEN, USER, metadata, {
      edgeUrl: EDGE,
      fetcher,
      storage,
      onProgress,
    });
    const result = await transfer.completed;

    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("/parts/1?");
    expect(String(fetcher.mock.calls[2]?.[0])).toContain("/parts/2?");
    expect(String(fetcher.mock.calls[3]?.[0])).toContain("/parts/3?");
    expect(result.uploadId).toBe("a015a7bc-6a90-45df-93d7-92f029544c26");
    expect(onProgress).toHaveBeenLastCalledWith(100);
    expect(storage.removeItem).toHaveBeenCalledOnce();
  });

  it("retries a failed part and persists resumable completed parts", async () => {
    const file = new File([new Uint8Array(5)], "m31.fits", {
      type: "application/fits",
      lastModified: 456,
    });
    const storage = makeStorage();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ uploadId: "mpu-2", key: `raw/${USER}/session/m31.fits`, partSize: 4 }, 201),
      )
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(response({ partNumber: 1, etag: "e1" }))
      .mockResolvedValueOnce(response({ partNumber: 2, etag: "e2" }))
      .mockResolvedValueOnce(
        response({
          upload: {
            upload_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
            job_id: "0d638064-83d7-4f22-adf9-e7106a242c8a",
            replayed: false,
          },
        }),
      );

    const transfer = startR2MultipartUpload(file, TOKEN, USER, metadata, {
      edgeUrl: EDGE,
      fetcher,
      storage,
      sleep: vi.fn(async () => undefined),
    });
    await transfer.completed;

    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(storage.setItem).toHaveBeenCalled();
    const persisted = storage.setItem.mock.calls.map((call) => call[1]).join("\n");
    expect(persisted).toContain("e1");
  });

  it("resumes a matching persisted multipart session without starting another", async () => {
    const file = new File([new Uint8Array(5)], "m31.fits", {
      type: "application/fits",
      lastModified: 789,
    });
    const storage = makeStorage();
    storage.getItem.mockReturnValueOnce(
      JSON.stringify({
        uploadId: "mpu-existing",
        key: `raw/${USER}/session/m31.fits`,
        partSize: 4,
        completedParts: [{ partNumber: 1, etag: "e1" }],
      }),
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ partNumber: 2, etag: "e2" }))
      .mockResolvedValueOnce(
        response({
          upload: {
            upload_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
            job_id: "0d638064-83d7-4f22-adf9-e7106a242c8a",
            replayed: true,
          },
        }),
      );

    await startR2MultipartUpload(file, TOKEN, USER, metadata, {
      edgeUrl: EDGE,
      fetcher,
      storage,
    }).completed;

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/parts/2?");
  });

  it("aborts the remote multipart upload", async () => {
    const file = new File([new Uint8Array(2)], "m31.fits", { type: "application/fits" });
    const storage = makeStorage();
    let release!: () => void;
    const blocked = new Promise<Response>((resolve) => {
      release = () => resolve(response({ partNumber: 1, etag: "e1" }));
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ uploadId: "mpu-abort", key: `raw/${USER}/session/m31.fits`, partSize: 1 }, 201),
      )
      .mockImplementationOnce(() => blocked)
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const transfer = startR2MultipartUpload(file, TOKEN, USER, metadata, {
      edgeUrl: EDGE,
      fetcher,
      storage,
    });
    await Promise.resolve();
    await Promise.resolve();
    await transfer.cancel();
    release();
    await expect(transfer.completed).rejects.toThrow(/abort/i);
    expect(fetcher.mock.calls.some((call) => String(call[0]).includes("mpu-abort?"))).toBe(true);
  });
});
