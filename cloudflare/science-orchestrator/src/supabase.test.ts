import { describe, expect, it, vi } from "vitest";
import { registerR2UploadRpc, verifySupabaseBearer } from "./supabase";

const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-public",
  SUPABASE_SECRET_KEY: "test-private",
  R2_RAW_BUCKET: "sky-raw",
  PIPELINE_VERSION: "science-v1",
};

const input = {
  userId: "cbb3e41f-90f0-4911-af97-e4ecced4e085",
  storageKey:
    "raw/cbb3e41f-90f0-4911-af97-e4ecced4e085/3fb2377d-4cb1-4863-97bc-dca665a13300/frame.jpg",
  fileSizeBytes: 6,
  originalFilename: "frame.jpg",
  objectId: "M31",
  frameType: "light" as const,
  licenceCode: "CC-BY-4.0" as const,
};

describe("verifySupabaseBearer", () => {
  it("verifies the user token with the publishable key", async () => {
    const fetcher = vi.fn(async (requestInput: string | URL | Request, init?: RequestInit) => {
      expect(String(requestInput)).toBe("https://project.supabase.co/auth/v1/user");
      expect(new Headers(init?.headers).get("apikey")).toBe("test-public");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer user-token");
      return Response.json({ id: input.userId });
    });
    const request = new Request("https://worker.invalid/uploads/finalize", {
      headers: { Authorization: "Bearer user-token" },
    });

    await expect(verifySupabaseBearer(request, env, fetcher)).resolves.toBe(input.userId);
  });

  it("returns null for missing or rejected bearer credentials", async () => {
    const noAuth = new Request("https://worker.invalid/uploads/finalize");
    expect(await verifySupabaseBearer(noAuth, env, vi.fn())).toBeNull();

    const fetcher = vi.fn(async () => new Response("no", { status: 401 }));
    const rejected = new Request("https://worker.invalid/uploads/finalize", {
      headers: { Authorization: "Bearer bad-token" },
    });
    expect(await verifySupabaseBearer(rejected, env, fetcher)).toBeNull();
  });
});

describe("registerR2UploadRpc", () => {
  it("uses the configured R2 bucket and parses the returned job", async () => {
    const fetcher = vi.fn(async (requestInput: string | URL | Request, init?: RequestInit) => {
      expect(String(requestInput)).toBe(
        "https://project.supabase.co/rest/v1/rpc/register_r2_astro_upload_edge",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe("test-private");
      expect(headers.get("Authorization")).toBeNull();
      expect(JSON.parse(String(init?.body))).toMatchObject({
        p_user_id: input.userId,
        p_storage_bucket: "sky-raw",
        p_storage_key: input.storageKey,
        p_object_id: "M31",
        p_pipeline_version: "science-v1",
      });
      return Response.json([
        {
          upload_id: "a015a7bc-6a90-45df-93d7-92f029544c26",
          job_id: "0d638064-83d7-4f22-adf9-e7106a242c8a",
          idempotency_key: "qualify:a015a7bc-6a90-45df-93d7-92f029544c26:science-v1",
          replayed: false,
        },
      ]);
    });

    const result = await registerR2UploadRpc(input, env, fetcher);

    expect(result.job_id).toBe("0d638064-83d7-4f22-adf9-e7106a242c8a");
    expect(result.replayed).toBe(false);
  });

  it("rejects malformed or failing RPC responses", async () => {
    await expect(
      registerR2UploadRpc(
        input,
        env,
        vi.fn(async () => new Response("no", { status: 500 })),
      ),
    ).rejects.toThrow(/register R2 upload/i);

    await expect(
      registerR2UploadRpc(
        input,
        env,
        vi.fn(async () => Response.json([])),
      ),
    ).rejects.toThrow(/invalid registration/i);
  });
});
