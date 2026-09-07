import type {
  R2UploadFinalizeInput,
  RegisteredScienceUpload,
} from "./upload-finalize";

export interface SupabaseEdgeEnv {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  PIPELINE_VERSION: string;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function verifySupabaseBearer(
  request: Request,
  env: Pick<SupabaseEdgeEnv, "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY">,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  const response = await fetcher(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as { id?: unknown };
  return typeof payload.id === "string" && UUID_RE.test(payload.id) ? payload.id : null;
}

function parseRegistration(payload: unknown): RegisteredScienceUpload {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== "object") {
    throw new Error("Invalid registration response from Supabase.");
  }

  const value = row as Partial<RegisteredScienceUpload>;
  if (
    typeof value.upload_id !== "string" ||
    !UUID_RE.test(value.upload_id) ||
    typeof value.job_id !== "string" ||
    !UUID_RE.test(value.job_id) ||
    typeof value.idempotency_key !== "string" ||
    value.idempotency_key.length === 0 ||
    typeof value.replayed !== "boolean"
  ) {
    throw new Error("Invalid registration response from Supabase.");
  }

  return {
    upload_id: value.upload_id,
    job_id: value.job_id,
    idempotency_key: value.idempotency_key,
    replayed: value.replayed,
  };
}

export async function registerR2UploadRpc(
  input: R2UploadFinalizeInput,
  env: SupabaseEdgeEnv,
  fetcher: Fetcher = fetch,
): Promise<RegisteredScienceUpload> {
  const response = await fetcher(
    `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/register_r2_astro_upload`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: input.userId,
        p_storage_bucket: "astro-raw",
        p_storage_key: input.storageKey,
        p_file_size_bytes: input.fileSizeBytes,
        p_original_filename: input.originalFilename,
        p_object_id: input.objectId,
        p_frame_type: input.frameType,
        p_licence_code: input.licenceCode,
        p_metadata: input.metadata ?? {},
        p_pipeline_version: env.PIPELINE_VERSION,
      }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Failed to register R2 upload in Supabase (${response.status}): ${detail}`);
  }

  return parseRegistration(await response.json());
}
