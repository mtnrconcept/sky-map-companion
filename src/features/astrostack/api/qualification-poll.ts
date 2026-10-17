export type QualificationOutcome =
  | { status: "qualified" }
  | { status: "rejected"; reason: string }
  | { status: "error"; reason: string };

interface QualificationSnapshot {
  upload?: { status?: string | null };
  job?: {
    status?: string | null;
    progress?: number | null;
    error_code?: string | null;
  } | null;
}

export interface QualificationPollOptions {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxPolls?: number;
  onProgress?: (progress: number) => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pollDelay(attempt: number): number {
  if (attempt < 10) return 2_000;
  if (attempt < 30) return 5_000;
  return 10_000;
}

function errorReason(code: string | null | undefined): string {
  if (code === "UNDEFINEDCOLUMN") {
    return "Le schéma Supabase du moteur scientifique doit être mis à jour.";
  }
  if (code === "RUNTIMEERROR") {
    return "Le moteur de traitement scientifique a rencontré une erreur.";
  }
  return code
    ? "Le traitement scientifique a échoué (" + code + ")."
    : "Le traitement scientifique a échoué.";
}

/**
 * Waits for an actual scientific qualification. A file transfer alone is never
 * considered a qualified contribution. Transient HTTP failures are bounded.
 */
export async function pollQualification(
  uploadId: string,
  accessToken: string,
  options: QualificationPollOptions = {},
): Promise<QualificationOutcome> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? delay;
  const maxPolls = options.maxPolls ?? 70;
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    await sleep(pollDelay(attempt));
    let response: Response;
    try {
      response = await fetcher("/api/astrostack/qualify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({ upload_id: uploadId }),
      });
    } catch {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 5) {
        return { status: "error", reason: "Impossible de joindre le moteur scientifique." };
      }
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      return {
        status: "error",
        reason: "Session expirée. Reconnectez-vous pour consulter le traitement.",
      };
    }
    if (response.status === 404) {
      return { status: "error", reason: "La contribution est introuvable sur le serveur." };
    }
    if (!response.ok) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 5 || response.status < 500) {
        return {
          status: "error",
          reason: "Le suivi scientifique est temporairement indisponible.",
        };
      }
      continue;
    }

    let data: QualificationSnapshot;
    try {
      data = (await response.json()) as QualificationSnapshot;
    } catch {
      return { status: "error", reason: "Réponse de qualification invalide." };
    }
    consecutiveFailures = 0;

    const uploadStatus = data.upload?.status;
    const jobStatus = data.job?.status;
    if (uploadStatus === "approved" || uploadStatus === "published") {
      return { status: "qualified" };
    }
    if (uploadStatus === "rejected" || jobStatus === "rejected") {
      return { status: "rejected", reason: errorReason(data.job?.error_code) };
    }
    if (uploadStatus === "duplicate" || jobStatus === "duplicate") {
      return { status: "rejected", reason: "Cette image a déjà été soumise." };
    }
    if (
      uploadStatus === "failed" ||
      uploadStatus === "cancelled" ||
      jobStatus === "failed" ||
      jobStatus === "cancelled"
    ) {
      return { status: "error", reason: errorReason(data.job?.error_code) };
    }
    if (typeof data.job?.progress === "number" && Number.isFinite(data.job.progress)) {
      options.onProgress?.(Math.min(100, Math.max(0, data.job.progress)));
    }
  }

  return {
    status: "error",
    reason:
      "Qualification non terminée dans le délai prévu. Vérifiez l’état du worker scientifique.",
  };
}
