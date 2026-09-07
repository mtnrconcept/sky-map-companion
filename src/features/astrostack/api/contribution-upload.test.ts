import { describe, expect, it, vi } from "vitest";
import { startAstroContributionUpload } from "./contribution-upload";

const file = new File([new Uint8Array([1])], "m31.fits", { type: "application/fits" });
const metadata = {
  object_id: "M31",
  frame_type: "light" as const,
  licence_code: "CC-BY-4.0" as const,
};

describe("startAstroContributionUpload", () => {
  it("uses R2 edge when configured and exposes the registered upload id", async () => {
    const edgeStart = vi.fn(() => ({
      completed: Promise.resolve({ uploadId: "upload-r2", jobId: "job-r2", replayed: false }),
      cancel: vi.fn(async () => undefined),
    }));
    const legacyStart = vi.fn();

    const transfer = startAstroContributionUpload(
      file,
      "token",
      "user",
      metadata,
      {},
      {
        edgeUrl: "https://science.example.workers.dev",
        edgeStart,
        legacyStart,
      },
    );

    expect(transfer.backend).toBe("r2");
    await expect(transfer.completed).resolves.toEqual({ uploadId: "upload-r2" });
    expect(edgeStart).toHaveBeenCalledOnce();
    expect(legacyStart).not.toHaveBeenCalled();
  });

  it("preserves the legacy Supabase TUS path when no edge URL is configured", async () => {
    const legacyCancel = vi.fn(async () => undefined);
    const legacyStart = vi.fn(() => ({
      path: "user/session/m31.fits",
      completed: Promise.resolve(),
      cancel: legacyCancel,
    }));
    const edgeStart = vi.fn();

    const transfer = startAstroContributionUpload(
      file,
      "token",
      "user",
      metadata,
      {},
      {
        edgeUrl: "",
        edgeStart,
        legacyStart,
      },
    );

    expect(transfer.backend).toBe("supabase");
    expect(transfer.path).toBe("user/session/m31.fits");
    await expect(transfer.completed).resolves.toEqual({ uploadId: null });
    expect(legacyStart).toHaveBeenCalledOnce();
    expect(edgeStart).not.toHaveBeenCalled();
    await transfer.cancel();
    expect(legacyCancel).toHaveBeenCalledOnce();
  });
});
