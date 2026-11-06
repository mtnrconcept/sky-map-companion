import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { authenticateRequest, createAdminClient, noStoreJson } from "@/lib/api-auth.server";
import {
  COSMOS_EVIDENCE_TYPES,
  cosmosReportSchema,
  normalizeReport,
  validEvidencePath,
  validObservationTime,
} from "../domain/report";
import {
  correlateObservations,
  triangulate,
  type CosmosScienceObservation,
} from "../domain/science";

type Admin = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;
const signal = () => AbortSignal.timeout(8_000);
const JOB_FIELDS =
  "id,status,progress,error_code,attempts,updated_at,completed_at,cosmos_observation_id,result";

function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function processing(status: "ready" | "degraded", message: string) {
  return { status, message };
}

export function projectObservation(value: unknown) {
  const row = object(value);
  const latitude = number(row["latitude"]),
    longitude = number(row["longitude"]);
  if (
    typeof row["id"] !== "string" ||
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  return {
    id: row["id"],
    user_id: null,
    latitude: Math.round(latitude * 10) / 10,
    longitude: Math.round(longitude * 10) / 10,
    altitude_m: null,
    azimuth: null,
    elevation: null,
    image_url: null,
    phenomenon_type: row["phenomenon_type"],
    description: String(row["description"] ?? "").slice(0, 500),
    duration_s: number(row["duration_s"]),
    magnitude: number(row["magnitude"]),
    ai_confidence: number(row["confidence"]),
    status: row["status"],
    event_id: typeof row["event_id"] === "string" ? row["event_id"] : null,
    observed_at: row["observed_at"],
  };
}

export function projectTriangulation(value: unknown) {
  const row = object(value);
  const latitude = number(row["estimated_latitude"]),
    longitude = number(row["estimated_longitude"]),
    altitude = number(row["estimated_altitude_km"]);
  if (
    latitude === null ||
    longitude === null ||
    altitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    altitude < 0 ||
    altitude > 50_000
  )
    return null;
  return {
    estimated_latitude: latitude,
    estimated_longitude: longitude,
    estimated_altitude_km: altitude,
    residual_rms_km: number(row["residual_rms_km"]),
    max_residual_km: number(row["max_residual_km"]),
    angular_residual_deg: number(row["angular_residual_deg"]),
    observer_count: number(row["observer_count"]),
    baseline_km: number(row["baseline_km"]),
    condition_number: number(row["condition_number"]),
    time_span_seconds: number(row["time_span_seconds"]),
    method: "geometric",
    model: typeof row["model"] === "string" ? row["model"] : "legacy",
    status: "estimate",
    confidence: null,
  };
}
export function projectEvent(value: unknown) {
  const row = object(value);
  return {
    id: row["id"],
    phenomenon_type: row["phenomenon_type"],
    title: row["title"],
    description: typeof row["description"] === "string" ? row["description"].slice(0, 1000) : null,
    observation_count: number(row["observation_count"]) ?? 0,
    confidence_score: null,
    status: row["status"],
    event_at: row["event_at"],
    triangulation: projectTriangulation(row["triangulation"]),
    ai_analysis: null,
  };
}
function jobSummary(value: unknown) {
  const job = object(value),
    result = object(job["result"]);
  if (!job["id"]) return null;
  return {
    id: job["id"],
    status: job["status"],
    progress: number(job["progress"]) ?? 0,
    error_code: typeof job["error_code"] === "string" ? job["error_code"] : null,
    attempts: number(job["attempts"]) ?? 0,
    updated_at: job["updated_at"],
    completed_at: job["completed_at"],
    result: {
      clustered: result["clustered"] === true,
      triangulated: result["triangulated"] === true,
      observer_count: number(result["observer_count"]),
      matching_observations: number(result["matching_observations"]),
    },
  };
}
function ownObservation(value: unknown, job: unknown = null) {
  const row = object(value);
  return {
    id: row["id"],
    status: row["status"],
    event_id: row["event_id"],
    observed_at: row["observed_at"],
    phenomenon_type: row["phenomenon_type"],
    description: row["description"],
    job: jobSummary(job),
  };
}
async function loadOwnObservations(admin: Admin, userId: string) {
  const { data: observations, error } = await admin
    .from("cosmos_observations")
    .select("id,status,event_id,observed_at,phenomenon_type,description")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30)
    .abortSignal(signal());
  if (error) throw new Error("OWN_OBSERVATIONS_UNAVAILABLE");
  if (!observations?.length) return [];
  const { data: jobs, error: jobsError } = await admin
    .from("processing_jobs")
    .select(JOB_FIELDS)
    .eq("owner_user_id", userId)
    .eq("job_type", "cluster_cosmos")
    .in(
      "cosmos_observation_id",
      observations.map((row) => row.id),
    )
    .abortSignal(signal());
  if (jobsError) throw new Error("OWN_JOBS_UNAVAILABLE");
  const byId = new Map((jobs ?? []).map((job) => [job.cosmos_observation_id, job]));
  return observations.map((row) => ownObservation(row, byId.get(row.id)));
}

export async function handleCosmosFeed(request: Request) {
  const minutes = Number(new URL(request.url).searchParams.get("since_minutes") ?? 120);
  if (![120, 1440].includes(minutes))
    return noStoreJson({ error: "Période invalide." }, { status: 400 });
  try {
    const admin = createAdminClient();
    const [observations, events, runtime] = await Promise.all([
      admin
        .rpc("get_public_cosmos_observations", { p_since_minutes: minutes, p_limit: 200 })
        .abortSignal(signal()),
      admin
        .rpc("get_public_cosmos_events", { p_since_hours: 24, p_limit: 50 })
        .abortSignal(signal()),
      admin.rpc("get_cosmos_runtime_status").abortSignal(signal()),
    ]);
    if (observations.error || events.error)
      return noStoreJson(
        { error: "Le flux Cosmos Live est indisponible. Réessayez dans un instant." },
        { status: 503 },
      );
    let own: ReturnType<typeof ownObservation>[] = [];
    let ownError: string | null = null;
    if (request.headers.has("authorization")) {
      try {
        const user = await authenticateRequest(request);
        if (user) own = await loadOwnObservations(admin, user.id);
        else ownError = "Votre session a expiré. Reconnectez-vous pour consulter vos signalements.";
      } catch {
        ownError = "Vos signalements sont temporairement indisponibles.";
      }
    }
    return noStoreJson({
      observations: (observations.data ?? []).map(projectObservation).filter(Boolean),
      events: (events.data ?? []).map(projectEvent),
      generated_at: new Date().toISOString(),
      processing: runtime.error
        ? processing("degraded", "Le traitement des observations est temporairement indisponible.")
        : processing("ready", "Corrélation et estimation géométrique disponibles."),
      own_observations: own,
      own_observations_error: ownError,
      limits: { observations: 200, events: 50, since_minutes: minutes },
    });
  } catch {
    return noStoreJson(
      { error: "Le flux Cosmos Live est temporairement indisponible." },
      { status: 503 },
    );
  }
}

export async function processObservation(admin: Admin, observationId: string, userId: string) {
  // Optimistic retry: a simultaneous report may extend the event while geometry
  // is computed. Only the database can commit a current, locked snapshot.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await admin
      .rpc("get_cosmos_analysis_context", { p_observation_id: observationId, p_user_id: userId })
      .abortSignal(signal());
    if (error) throw new Error(error.message);
    const context = object(data),
      candidates = context["candidates"];
    if (
      !Array.isArray(candidates) ||
      candidates.length > 500 ||
      typeof context["snapshot"] !== "string"
    )
      throw new Error("COSMOS_CAPACITY");
    const cluster = correlateObservations(
      context["seed"] as CosmosScienceObservation,
      candidates as CosmosScienceObservation[],
    );
    const completed = await admin
      .rpc("complete_cosmos_analysis", {
        p_observation_id: observationId,
        p_user_id: userId,
        p_snapshot: context["snapshot"],
        p_observation_ids: cluster.map((row) => row.id),
        p_solution: triangulate(cluster),
      })
      .abortSignal(signal());
    if (!completed.error)
      return processing(
        "ready",
        "Observation analysée. Les résultats restent des estimations à vérifier.",
      );
    if (!completed.error.message.includes("COSMOS_STALE_SNAPSHOT"))
      throw new Error(completed.error.message);
  }
  throw new Error("COSMOS_STALE_SNAPSHOT");
}
async function analyzeSafely(admin: Admin, observationId: string, userId: string) {
  try {
    return await processObservation(admin, observationId, userId);
  } catch (error) {
    const busy = error instanceof Error && error.message.includes("COSMOS_JOB_BUSY");
    // Persistence already succeeded. Retry the same report; never duplicate it.
    if (!busy) {
      try {
        await admin
          .from("processing_jobs")
          .update({ error_code: "COSMOS_ANALYSIS_RETRY", updated_at: new Date().toISOString() })
          .eq("cosmos_observation_id", observationId)
          .eq("owner_user_id", userId)
          .is("completed_at", null)
          .is("leased_by", null)
          .abortSignal(signal());
      } catch {
        // A diagnostic write must not erase the durable submission receipt.
      }
    }
    return processing(
      "degraded",
      "Observation enregistrée. L’analyse peut être relancée depuis « Mes signalements ».",
    );
  }
}
async function currentReport(admin: Admin, observationId: string, userId: string) {
  const [observation, job] = await Promise.all([
    admin
      .from("cosmos_observations")
      .select("id,status,event_id,observed_at,phenomenon_type,description")
      .eq("id", observationId)
      .eq("user_id", userId)
      .abortSignal(signal())
      .maybeSingle(),
    admin
      .from("processing_jobs")
      .select(JOB_FIELDS)
      .eq("cosmos_observation_id", observationId)
      .eq("owner_user_id", userId)
      .eq("job_type", "cluster_cosmos")
      .abortSignal(signal())
      .maybeSingle(),
  ]);
  return {
    observation: observation.data ? ownObservation(observation.data) : null,
    job: jobSummary(job.data),
  };
}

export async function handleCosmosReport(request: Request) {
  try {
    const user = await authenticateRequest(request);
    if (!user)
      return noStoreJson({ error: "Connectez-vous pour envoyer un signalement." }, { status: 401 });
    if (Number(request.headers.get("content-length") ?? 0) > 16_384)
      return noStoreJson({ error: "Signalement trop volumineux." }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 16_384)
      return noStoreJson({ error: "Signalement trop volumineux." }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return noStoreJson({ error: "Corps JSON invalide." }, { status: 400 });
    }
    const parsed = cosmosReportSchema.safeParse(body);
    if (!parsed.success || !validObservationTime(parsed.data.observed_at))
      return noStoreJson(
        {
          error:
            "Données invalides : vérifiez les coordonnées, la description et l’heure (dernières 24 h).",
        },
        { status: 400 },
      );
    const input = parsed.data;
    if (input.evidence_path && !validEvidencePath(input.evidence_path, user.id))
      return noStoreJson({ error: "Chemin de preuve interdit." }, { status: 403 });
    const admin = createAdminClient();
    if (input.evidence_path) {
      const slash = input.evidence_path.lastIndexOf("/"),
        folder = input.evidence_path.slice(0, slash),
        filename = input.evidence_path.slice(slash + 1);
      const { data, error } = await admin.storage
        .from("cosmos-evidence")
        .list(folder, { search: filename, limit: 10 });
      const evidence = data?.find((item) => item.name === filename),
        metadata = object(evidence?.metadata),
        size = number(metadata["size"]);
      if (error || !evidence)
        return noStoreJson(
          { error: "Preuve privée introuvable. Réessayez son transfert." },
          { status: 409 },
        );
      if (
        size === null ||
        size <= 0 ||
        size > 100 * 1024 * 1024 ||
        !COSMOS_EVIDENCE_TYPES.has(String(metadata["mimetype"]))
      )
        return noStoreJson(
          { error: "Preuve invalide : JPEG, PNG, WebP, MP4 ou MOV, jusqu’à 100 Mio." },
          { status: 400 },
        );
    }
    const payload = normalizeReport(input),
      observationId = input.idempotency_key ?? randomUUID();
    const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const saved = await admin
      .rpc("submit_cosmos_observation", {
        p_user_id: user.id,
        p_submission_id: observationId,
        p_fingerprint: fingerprint,
        p_payload: payload,
      })
      .abortSignal(signal());
    if (saved.error) {
      const message = saved.error.message;
      if (message.includes("COSMOS_IDEMPOTENCY_CONFLICT"))
        return noStoreJson(
          {
            error:
              "Cette tentative correspond déjà à un autre signalement. Actualisez le formulaire.",
          },
          { status: 409 },
        );
      if (message.includes("COSMOS_RATE_LIMIT"))
        return noStoreJson(
          { error: "Limite de 20 signalements en 10 minutes atteinte. Réessayez plus tard." },
          { status: 429, headers: { "Retry-After": "600" } },
        );
      if (message.includes("COSMOS_INVALID_REPORT"))
        return noStoreJson({ error: "Données d’observation invalides." }, { status: 400 });
      return noStoreJson(
        {
          error: "L’enregistrement est momentanément indisponible. Réessayez le même signalement.",
        },
        { status: 503 },
      );
    }
    const stored = object(saved.data);
    const storedJob = object(stored["job"]);
    const state =
      stored["created"] === false && storedJob["status"] === "published"
        ? processing("ready", "Ce signalement est déjà enregistré et analysé.")
        : await analyzeSafely(admin, observationId, user.id);
    const current = await currentReport(admin, observationId, user.id).catch(() => ({
      observation: null,
      job: null,
    }));
    return noStoreJson(
      {
        success: true,
        observation: current.observation ?? ownObservation(stored["observation"]),
        job: current.job ?? jobSummary(stored["job"]),
        processing: state,
      },
      { status: stored["created"] === true ? 201 : 200 },
    );
  } catch {
    return noStoreJson(
      {
        error:
          "Le service est momentanément indisponible. Votre tentative peut être renvoyée sans doublon.",
      },
      { status: 503 },
    );
  }
}

export async function handleCosmosAnalyze(request: Request) {
  try {
    const user = await authenticateRequest(request);
    if (!user) return noStoreJson({ error: "Authentification requise." }, { status: 401 });
    const parsed = z
      .object({ observation_id: z.string().uuid() })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success) return noStoreJson({ error: "Observation invalide." }, { status: 400 });
    const admin = createAdminClient(),
      id = parsed.data.observation_id;
    const { data, error } = await admin
      .from("cosmos_observations")
      .select("id,status")
      .eq("id", id)
      .eq("user_id", user.id)
      .abortSignal(signal())
      .maybeSingle();
    if (error)
      return noStoreJson({ error: "Signalement temporairement indisponible." }, { status: 503 });
    if (!data || data.status === "rejected")
      return noStoreJson({ error: "Observation introuvable." }, { status: 404 });
    const state = await analyzeSafely(admin, id, user.id),
      current = await currentReport(admin, id, user.id);
    return noStoreJson(
      { ...current, processing: state },
      { status: state.status === "ready" ? 200 : 202 },
    );
  } catch {
    return noStoreJson(
      { error: "L’analyse est temporairement indisponible. Réessayez dans un instant." },
      { status: 503 },
    );
  }
}
