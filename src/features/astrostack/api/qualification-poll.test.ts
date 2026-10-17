import { describe, expect, it, vi } from "vitest";
import { pollQualification } from "./qualification-poll";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pollQualification", () => {
  const sleep = vi.fn(async () => undefined);

  it("waits for actual scientific approval, not just a successful upload", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          upload: { status: "uploaded" },
          job: { status: "extracting", progress: 25 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          upload: { status: "approved" },
          job: { status: "approved", progress: 100 },
        }),
      );
    const onProgress = vi.fn();

    const result = await pollQualification("upload-1", "token-1", {
      fetcher,
      sleep,
      maxPolls: 3,
      onProgress,
    });

    expect(result).toEqual({ status: "qualified" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(25);
    expect(fetcher.mock.calls[0]?.[1]?.headers.Authorization).toBe("Bearer token-1");
  });

  it("reports a worker database schema mismatch without marking the file qualified", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        upload: { status: "uploaded" },
        job: { status: "failed", error_code: "UNDEFINEDCOLUMN" },
      }),
    );
    const result = await pollQualification("upload-2", "token-2", { fetcher, sleep });
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.reason).toContain("Supabase");
  });

  it("stops for an expired login", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));
    const result = await pollQualification("upload-3", "token-3", { fetcher, sleep });
    expect(result.status).toBe("error");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails explicitly after a bounded timeout", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse({ upload: { status: "uploaded" }, job: { status: "uploaded" } }),
      );
    const result = await pollQualification("upload-4", "token-4", {
      fetcher,
      sleep,
      maxPolls: 3,
    });
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.reason).toContain("délai");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("stops after repeated network failures without unbounded requests", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network unavailable"));
    const result = await pollQualification("upload-5", "token-5", {
      fetcher,
      sleep,
      maxPolls: 50,
    });
    expect(result.status).toBe("error");
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("reports an exhausted legacy extraction instead of polling forever", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        upload: { status: "extracting" },
        job: { status: "failed", error_code: "MAX_ATTEMPTS_EXHAUSTED" },
      }),
    );
    const result = await pollQualification("upload-6", "token-6", { fetcher, sleep });
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.reason).toContain("tentatives");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not confuse a retryable scientific failure with a terminal one", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        upload: { status: "extracting" },
        job: { status: "retrying", progress: 25 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        upload: { status: "approved" },
        job: { status: "approved", progress: 100 },
      }));
    const result = await pollQualification("upload-7", "token-7", {
      fetcher, sleep, maxPolls: 3,
    });
    expect(result).toEqual({ status: "qualified" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("gives the scientific quality reason for a rejected image", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        upload: { status: "rejected", rejection_reason: "signal-to-noise-too-low" },
        job: { status: "rejected", error_code: null },
      }),
    );
    const result = await pollQualification("upload-8", "token-8", { fetcher, sleep });
    expect(result).toEqual({ status: "rejected", reason: "signal-to-noise-too-low" });
  });

});
