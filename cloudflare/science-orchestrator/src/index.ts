import { DurableObject } from "cloudflare:workers";
import { parseScienceQueueMessage } from "./queue-message";
import { runScheduledRecovery } from "./recovery";
import { handleUploadRequest } from "./uploads";

interface ExecOutputLike {
  exitCode: number;
  stdout: ArrayBuffer;
  stderr: ArrayBuffer;
}

interface ExecProcessLike {
  output(): Promise<ExecOutputLike>;
}

interface ContainerApiLike {
  readonly running: boolean;
  start(options?: {
    env?: Record<string, string>;
    enableInternet?: boolean;
    entrypoint?: string[];
  }): void;
  exec(command: string[], options?: { env?: Record<string, string> }): Promise<ExecProcessLike>;
  destroy(error?: string): Promise<void>;
}

interface DurableObjectStateLike {
  container: ContainerApiLike;
}

interface QueueMessageLike<T = unknown> {
  body: T;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

interface MessageBatchLike<T = unknown> {
  messages: QueueMessageLike<T>[];
}

interface QueueLike<T> {
  send(message: T): Promise<void>;
}

interface R2MultipartUploadLike {
  uploadId: string;
  key: string;
  uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer): Promise<{ etag: string }>;
  complete(parts: { partNumber: number; etag: string }[]): Promise<unknown>;
  abort(): Promise<void>;
}

interface R2BucketLike {
  head(key: string): Promise<{ size: number } | null>;
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2MultipartUploadLike>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUploadLike;
}

interface DurableObjectNamespaceLike<T> {
  getByName(name: string): T;
}

export interface Env {
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  R2_ENDPOINT: string;
  R2_REGION: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_RAW_BUCKET: string;
  R2_DERIVED_BUCKET: string;
  R2_HIPS_BUCKET: string;
  R2_PUBLIC_BASE_URL?: string;
  PIPELINE_VERSION: string;
  LEASE_SECONDS: string;
  MAX_DERIVATIVE_BYTES: string;
  MAX_MASTER_PIXELS: string;
  MAX_SCALE_DEGRADATION: string;
  RAW_BUCKET: R2BucketLike;
  DERIVED_BUCKET: R2BucketLike;
  HIPS_BUCKET: R2BucketLike;
  QUARANTINE_BUCKET: R2BucketLike;
  SCIENCE_QUEUE: QueueLike<unknown>;
  SCIENCE_CONTAINER: DurableObjectNamespaceLike<ScienceContainer>;
}

export interface ScienceJobResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const CONTAINER_START_TIMEOUT_MS = 90_000;
const CONTAINER_START_POLL_MS = 250;

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`Missing Cloudflare science secret: ${name}`);
  return value.trim();
}

function containerEnvironment(env: Env): Record<string, string> {
  const values: Record<string, string> = {
    WORKER_MODE: "container-host",
    DATABASE_URL: required(env.DATABASE_URL, "DATABASE_URL"),
    SUPABASE_URL: required(env.SUPABASE_URL, "SUPABASE_URL"),
    SUPABASE_SECRET_KEY: required(env.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY"),
    STORAGE_PRIMARY: "r2",
    R2_ENDPOINT: required(env.R2_ENDPOINT, "R2_ENDPOINT"),
    R2_REGION: env.R2_REGION || "auto",
    R2_ACCESS_KEY_ID: required(env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: required(env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY"),
    R2_RAW_BUCKET: required(env.R2_RAW_BUCKET, "R2_RAW_BUCKET"),
    R2_DERIVED_BUCKET: required(env.R2_DERIVED_BUCKET, "R2_DERIVED_BUCKET"),
    R2_HIPS_BUCKET: required(env.R2_HIPS_BUCKET, "R2_HIPS_BUCKET"),
    PIPELINE_VERSION: env.PIPELINE_VERSION || "science-v1",
    LEASE_SECONDS: env.LEASE_SECONDS || "300",
    POLL_SECONDS: "2",
    MAX_DERIVATIVE_BYTES: env.MAX_DERIVATIVE_BYTES || "524288000",
    MAX_MASTER_PIXELS: env.MAX_MASTER_PIXELS || "40000000",
    MAX_SCALE_DEGRADATION: env.MAX_SCALE_DEGRADATION || "2.5",
  };
  if (env.R2_PUBLIC_BASE_URL?.trim()) {
    values["R2_PUBLIC_BASE_URL"] = env.R2_PUBLIC_BASE_URL.trim();
  }
  return values;
}

async function waitUntilContainerRunning(container: ContainerApiLike): Promise<void> {
  const deadline = Date.now() + CONTAINER_START_TIMEOUT_MS;
  while (!container.running) {
    if (Date.now() >= deadline) throw new Error("Science Container did not start before timeout");
    await new Promise((resolve) => setTimeout(resolve, CONTAINER_START_POLL_MS));
  }
}

export class ScienceContainer extends DurableObject<Env> {
  declare ctx: DurableObjectStateLike;
  declare env: Env;

  async runJob(jobId: string): Promise<ScienceJobResult> {
    const container = this.ctx.container;
    if (!container.running) {
      container.start({
        env: containerEnvironment(this.env),
        enableInternet: true,
      });
      await waitUntilContainerRunning(container);
    }

    try {
      const process = await container.exec(["sky-science-job", "--job-id", jobId], {
        env: { WORKER_ID: `cloudflare-${jobId}` },
      });
      const output = await process.output();
      const decoder = new TextDecoder();
      return {
        exitCode: output.exitCode,
        stdout: decoder.decode(output.stdout).slice(-8_000),
        stderr: decoder.decode(output.stderr).slice(-8_000),
      };
    } finally {
      if (container.running) await container.destroy();
    }
  }
}

async function processQueueMessage(message: QueueMessageLike, env: Env): Promise<void> {
  let parsed;
  try {
    parsed = parseScienceQueueMessage(message.body);
  } catch (error) {
    console.error("science_queue_message_rejected", {
      error: error instanceof Error ? error.message : String(error),
    });
    message.ack();
    return;
  }

  try {
    const container = env.SCIENCE_CONTAINER.getByName(parsed.job_id);
    const result = await container.runJob(parsed.job_id);
    if (result.exitCode !== 0) {
      console.error("science_container_job_failed", {
        job_id: parsed.job_id,
        job_type: parsed.job_type,
        exit_code: result.exitCode,
        stderr: result.stderr,
      });
      message.retry();
      return;
    }
    message.ack();
  } catch (error) {
    console.error("science_container_rpc_failed", {
      job_id: parsed.job_id,
      error: error instanceof Error ? error.message : String(error),
    });
    message.retry();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const uploadResponse = await handleUploadRequest(request, env);
    if (uploadResponse) return uploadResponse;

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", service: "sky-science-orchestrator" });
    }
    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatchLike, env: Env): Promise<void> {
    await Promise.all(batch.messages.map((message) => processQueueMessage(message, env)));
  },

  async scheduled(_controller: unknown, env: Env): Promise<void> {
    const recovered = await runScheduledRecovery(env);
    console.log("science_queue_recovery_complete", { recovered });
  },
};
