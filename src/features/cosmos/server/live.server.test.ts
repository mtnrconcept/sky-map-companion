import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  storage: { from: vi.fn() },
}));
vi.mock("@/lib/api-auth.server", async (original) => ({
  ...(await original<typeof import("@/lib/api-auth.server")>()),
  authenticateRequest: mocks.auth,
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from, storage: mocks.storage }),
}));

import { createAdminClient } from "@/lib/api-auth.server";
import {
  handleCosmosAnalyze,
  handleCosmosFeed,
  handleCosmosReport,
  processObservation,
  projectObservation,
  projectTriangulation,
} from "./live.server";

function query(data: unknown = null, error: { message: string } | null = null) {
  const result = Promise.resolve({ data, error });
  const chain: Record<string, unknown> = { then: result.then.bind(result) };
  for (const name of [
    "select",
    "eq",
    "in",
    "is",
    "order",
    "limit",
    "maybeSingle",
    "abortSignal",
    "update",
  ])
    chain[name] = vi.fn(() => chain);
  return chain;
}
const owner = "d2e724bf-3e29-4ff9-9d87-867e10e5374d";
const id = "94b42b6a-1ff4-4e35-8f14-6dbd947a8d5d";
const seed = {
  id,
  user_id: owner,
  latitude: 46.2,
  longitude: 6.1,
  phenomenon_type: "meteor",
  observed_at: "2026-11-06T12:00:00Z",
  status: "pending",
};
const report = {
  latitude: 46.2,
  longitude: 6.1,
  phenomenon_type: "meteor",
  description: "Trait lumineux",
  idempotency_key: id,
};
const post = (body: unknown) =>
  new Request("https://example.test/api/cosmos/report", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
  mocks.from.mockImplementation(() => query());
});

describe("Cosmos endpoints", () => {
  it("requires authentication before accepting reports or analysis", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await handleCosmosReport(post(report))).status).toBe(401);
    expect((await handleCosmosAnalyze(post({ observation_id: id }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects invalid numeric types and unowned evidence before database writes", async () => {
    expect((await handleCosmosReport(post({ ...report, latitude: null }))).status).toBe(400);
    expect(
      (await handleCosmosReport(post({ ...report, evidence_path: `other/${id}/evidence.png` })))
        .status,
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and oversized payloads", async () => {
    expect(
      (await handleCosmosReport(new Request("https://example.test", { method: "POST", body: "{" })))
        .status,
    ).toBe(400);
    expect(
      (await handleCosmosReport(post({ ...report, description: "x".repeat(20_000) }))).status,
    ).toBe(413);
  });
  it("does not expose internal database errors", async () => {
    mocks.rpc.mockReturnValue(query(null, { message: "postgres failed with secret credentials" }));
    const result = await handleCosmosReport(post(report));
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("secret");
  });
  it("returns conflicts and throttles explicitly", async () => {
    mocks.rpc.mockReturnValue(query(null, { message: "COSMOS_IDEMPOTENCY_CONFLICT" }));
    expect((await handleCosmosReport(post(report))).status).toBe(409);
    mocks.rpc.mockReturnValue(query(null, { message: "COSMOS_RATE_LIMIT" }));
    const result = await handleCosmosReport(post(report));
    expect(result.status).toBe(429);
    expect(result.headers.get("Retry-After")).toBe("600");
  });
  it("preserves a saved report when computation fails and offers recovery", async () => {
    mocks.rpc.mockImplementation((name) =>
      name === "submit_cosmos_observation"
        ? query({ created: true, observation: seed, job: { id, status: "uploaded" } })
        : query(null, { message: "compute unavailable" }),
    );
    const response = await handleCosmosReport(post(report));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.observation.id).toBe(id);
    expect(body.processing.status).toBe("degraded");
    expect(body.observation).not.toHaveProperty("latitude");
    expect(
      mocks.rpc.mock.calls.filter(([name]) => name === "submit_cosmos_observation"),
    ).toHaveLength(1);
  });
  it("returns a replay as 200 and keeps the submission key/fingerprint stable", async () => {
    mocks.rpc.mockImplementation((name) =>
      name === "submit_cosmos_observation"
        ? query({ created: false, observation: seed, job: { id, status: "uploaded" } })
        : name === "get_cosmos_analysis_context"
          ? query({ seed, candidates: [seed], snapshot: "s1" })
          : query({ clustered: false }),
    );
    const response = await handleCosmosReport(post(report));
    expect(response.status).toBe(200);
    expect((await response.json()).processing.status).toBe("ready");
    expect(mocks.rpc.mock.calls[0]?.[1]).toMatchObject({
      p_user_id: owner,
      p_submission_id: id,
      p_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it("does not rerun an already completed submission replay", async () => {
    mocks.rpc.mockReturnValue(
      query({ created: false, observation: seed, job: { id, status: "published" } }),
    );
    expect((await handleCosmosReport(post(report))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps the receipt after diagnostic writes and readback become unavailable", async () => {
    mocks.rpc.mockImplementation((name) =>
      name === "submit_cosmos_observation"
        ? query({ created: true, observation: seed, job: { id, status: "uploaded" } })
        : query(null, { message: "compute unavailable" }),
    );
    mocks.from.mockImplementation(() => {
      throw new Error("network disconnected");
    });
    const response = await handleCosmosReport(post(report));
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.observation.id).toBe(id);
    expect(result.processing.status).toBe("degraded");
  });
  it("returns a useful 503 for feed failures instead of an empty success", async () => {
    mocks.rpc.mockReturnValue(query(null, { message: "connection refused" }));
    const response = await handleCosmosFeed(new Request("https://example.test/api/cosmos/feed"));
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty("error");
  });
  it("serves a public feed without authentication and with no-store", async () => {
    mocks.rpc.mockImplementation((name) =>
      query(name === "get_cosmos_runtime_status" ? { status: "ready" } : []),
    );
    const response = await handleCosmosFeed(
      new Request("https://example.test/api/cosmos/feed?since_minutes=1440"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).own_observations).toEqual([]);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("bounds feed windows", async () => {
    expect(
      (
        await handleCosmosFeed(
          new Request("https://example.test/api/cosmos/feed?since_minutes=999999"),
        )
      ).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("cannot analyze another account's observation", async () => {
    const response = await handleCosmosAnalyze(post({ observation_id: id }));
    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("Scientific commit boundaries", () => {
  it("recomputes from fresh candidates on an optimistic conflict", async () => {
    let writes = 0;
    mocks.rpc.mockImplementation((name) =>
      name === "get_cosmos_analysis_context"
        ? query({ seed, candidates: [seed], snapshot: `s${writes}` })
        : ++writes === 1
          ? query(null, { message: "COSMOS_STALE_SNAPSHOT" })
          : query({ clustered: false }),
    );
    expect((await processObservation(createAdminClient(), id, owner)).status).toBe("ready");
    expect(writes).toBe(2);
  });
  it("bounds conflict retries and rejects truncated candidate sets", async () => {
    mocks.rpc.mockImplementation((name) =>
      name === "get_cosmos_analysis_context"
        ? query({ seed, candidates: [seed], snapshot: "s" })
        : query(null, { message: "COSMOS_STALE_SNAPSHOT" }),
    );
    await expect(processObservation(createAdminClient(), id, owner)).rejects.toThrow(
      "COSMOS_STALE_SNAPSHOT",
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(6);
    mocks.rpc.mockReturnValue(query({ seed, candidates: Array(501).fill(seed), snapshot: "s" }));
    await expect(processObservation(createAdminClient(), id, owner)).rejects.toThrow(
      "COSMOS_CAPACITY",
    );
  });
  it("allowlists public data independently of RPC projection", () => {
    const projected = projectObservation({
      ...seed,
      latitude: 46.23456,
      longitude: 6.17891,
      image_url: "private://secret",
      azimuth: 4,
      evidence: "secret",
    });
    expect(projected).toMatchObject({
      latitude: 46.2,
      longitude: 6.2,
      user_id: null,
      image_url: null,
      azimuth: null,
    });
    expect(projected).not.toHaveProperty("evidence");
    const solution = projectTriangulation({
      estimated_latitude: 0,
      estimated_longitude: 0,
      estimated_altitude_km: 85,
      observer_origins: ["secret"],
      confidence: 1,
    });
    expect(solution).toMatchObject({
      estimated_latitude: 0,
      estimated_longitude: 0,
      confidence: null,
      status: "estimate",
    });
    expect(solution).not.toHaveProperty("observer_origins");
    expect(
      projectTriangulation({
        estimated_latitude: 0,
        estimated_longitude: 0,
        estimated_altitude_km: -1,
      }),
    ).toBeNull();
  });
});
