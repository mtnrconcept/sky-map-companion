import { parseScienceQueueMessage, type ScienceQueueMessage } from "./queue-message";

export interface RecoveryJobRow {
  job_id: string;
  job_type: string;
  idempotency_key: string;
}

export interface RecoveryDependencies {
  listJobs(limit: number): Promise<RecoveryJobRow[]>;
  queueSend(message: ScienceQueueMessage): Promise<void>;
}

export interface RecoveryEnv {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  SCIENCE_QUEUE: { send(message: ScienceQueueMessage): Promise<void> };
}

export async function recoverAvailableJobs(dependencies: RecoveryDependencies): Promise<number> {
  const rows = await dependencies.listJobs(100);
  if (!Array.isArray(rows) || rows.length > 100) {
    throw new Error("Invalid science recovery row set.");
  }

  let count = 0;
  for (const row of rows) {
    try {
      const message = parseScienceQueueMessage({
        schema_version: 1,
        job_id: row.job_id,
        job_type: row.job_type,
        idempotency_key: row.idempotency_key,
      });
      await dependencies.queueSend(message);
      count += 1;
    } catch (error) {
      throw new Error(
        `Invalid science recovery row: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return count;
}

async function listRecoveryJobs(env: RecoveryEnv, limit: number): Promise<RecoveryJobRow[]> {
  const response = await fetch(
    `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/list_science_queue_recovery_jobs`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_limit: Math.max(1, Math.min(100, limit)) }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Science recovery RPC failed (${response.status}): ${detail}`);
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) throw new Error("Science recovery RPC returned invalid data.");
  return payload as RecoveryJobRow[];
}

export async function runScheduledRecovery(env: RecoveryEnv): Promise<number> {
  return recoverAvailableJobs({
    listJobs: (limit) => listRecoveryJobs(env, limit),
    queueSend: (message) => env.SCIENCE_QUEUE.send(message),
  });
}
