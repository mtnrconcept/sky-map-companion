import { useState, useCallback, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { startContributionUpload } from "@/features/mosaic/api/resumable-upload";
import {
  astroStackPollDelay,
  astroStackPublicStatusSchema,
  astroStackStatusIsActive,
  type AstroStackPublicStatus,
} from "@/features/astrostack/domain/public-status";

// ——————————————————————————————————————————
// Types exposés au UI
// ——————————————————————————————————————————

export interface AstroObject {
  id: string;
  common_name: string | null;
  type: string;
  ra_deg: number;
  dec_deg: number;
  magnitude: number | null;
  size_arcmin: number | null;
  total_lights: number;
  total_darks: number;
  total_flats: number;
  total_bias: number;
  total_contributors: number;
  total_exposure_hours: number;
  master_image_url: string | null;
  master_updated_at: string | null;
}

export interface AstroUploadDraft {
  file: File;
  object_id: string;
  frame_type: "light" | "dark" | "flat" | "bias";
  // Métadonnées optionnelles
  telescope?: string;
  camera?: string;
  focal_length_mm?: number;
  aperture_mm?: number;
  exposure_s?: number;
  gain?: number;
  temperature_c?: number;
  filter_name?: string;
  binning?: number;
  latitude?: number;
  longitude?: number;
  captured_at?: string;
  pixel_size_um?: number;
  licence_code: "CC-BY-4.0" | "CC-BY-SA-4.0" | "CC0-1.0";
}

export interface UploadProgress {
  id: string;
  filename: string;
  progress: number; // 0–100
  status: "uploading" | "qualifying" | "qualified" | "rejected" | "error";
  quality_score?: number;
  rejection_reason?: string;
  error?: string;
}

const stackRequestResponseSchema = z
  .object({
    job: z
      .object({
        replayed: z.boolean(),
        lights_count: z.number().int().min(0),
        state: z.enum(["queued", "active", "cooldown", "completed", "terminal"]),
      })
      .strict(),
  })
  .strict();

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function fetchAstroStackStatus(
  objectId: string,
  signal: AbortSignal,
): Promise<AstroStackPublicStatus> {
  const params = new URLSearchParams({ object_id: objectId });
  const response = await fetch(`/api/astrostack/status?${params}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "État AstroStack indisponible.";
    throw new Error(error);
  }
  const parsed = astroStackPublicStatusSchema.safeParse(body);
  if (!parsed.success) throw new Error("Réponse AstroStack invalide.");
  return parsed.data;
}

// ——————————————————————————————————————————
// Hook principal
// ——————————————————————————————————————————

export function useAstroStack() {
  const [objects, setObjects] = useState<AstroObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<AstroObject | null>(null);
  const [publicStatus, setPublicStatus] = useState<AstroStackPublicStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isStatusStale, setIsStatusStale] = useState(false);
  const [userUploads, setUserUploads] = useState<UploadProgress[]>([]);
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);
  const [isSubmittingStack, setIsSubmittingStack] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  // Charge la liste des objets
  const loadObjects = useCallback(async (query = "") => {
    setIsLoadingObjects(true);
    try {
      let q = supabase
        .from("astro_objects")
        .select("*")
        .order("total_lights", { ascending: false })
        .limit(50);

      if (query.trim()) {
        q = q.or(`id.ilike.%${query}%,common_name.ilike.%${query}%`);
      }

      const { data } = await q;
      if (data) setObjects(data as AstroObject[]);
    } finally {
      setIsLoadingObjects(false);
    }
  }, []);

  useEffect(() => {
    loadObjects(searchQuery);
  }, [loadObjects, searchQuery]);

  useEffect(() => {
    const objectId = selectedObject?.id;
    if (!objectId) {
      setPublicStatus(null);
      setStatusError(null);
      setIsStatusStale(false);
      setIsLoadingStatus(false);
      return;
    }

    let stopped = false;
    let latestStatus: AstroStackPublicStatus | null = null;
    let consecutiveFailures = 0;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    setPublicStatus(null);
    setStatusError(null);
    setIsStatusStale(false);
    setIsLoadingStatus(true);

    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const schedule = (poll: () => Promise<void>) => {
      clearTimer();
      if (stopped || document.hidden) return;
      timer = setTimeout(() => void poll(), astroStackPollDelay(latestStatus, consecutiveFailures));
    };

    const poll = async () => {
      if (stopped || document.hidden) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const next = await fetchAstroStackStatus(objectId, controller.signal);
        if (stopped) return;
        latestStatus = next;
        consecutiveFailures = 0;
        setPublicStatus(next);
        setStatusError(null);
        setIsStatusStale(false);
        setObjects((current) =>
          current.map((object) =>
            object.id === objectId
              ? {
                  ...object,
                  total_lights: next.object.total_lights,
                  total_exposure_hours: next.object.total_exposure_hours,
                  total_contributors: next.object.total_contributors,
                  master_image_url: next.master?.preview_url ?? null,
                  master_updated_at: next.master?.created_at ?? null,
                }
              : object,
          ),
        );
        setSelectedObject((current) =>
          current?.id === objectId
            ? {
                ...current,
                total_lights: next.object.total_lights,
                total_exposure_hours: next.object.total_exposure_hours,
                total_contributors: next.object.total_contributors,
                master_image_url: next.master?.preview_url ?? null,
                master_updated_at: next.master?.created_at ?? null,
              }
            : current,
        );
      } catch (error) {
        if (stopped || isAbortError(error)) return;
        consecutiveFailures += 1;
        setStatusError(error instanceof Error ? error.message : "État AstroStack indisponible.");
        setIsStatusStale(latestStatus !== null);
      } finally {
        if (!stopped) {
          setIsLoadingStatus(false);
          schedule(poll);
        }
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
        controller?.abort();
      } else {
        clearTimer();
        void poll();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void poll();
    return () => {
      stopped = true;
      clearTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [selectedObject?.id, statusRefreshKey]);

  const uploadFrames = useCallback(
    async (drafts: AstroUploadDraft[]) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token || !session.user) {
        toast.error("Connectez-vous pour contribuer.");
        return;
      }

      for (const draft of drafts) {
        const progressId = crypto.randomUUID();
        const update = (change: Partial<UploadProgress>) =>
          setUserUploads((current) =>
            current.map((item) => (item.id === progressId ? { ...item, ...change } : item)),
          );
        setUserUploads((current) => [
          { id: progressId, filename: draft.file.name, progress: 0, status: "uploading" },
          ...current,
        ]);
        try {
          const transfer = startContributionUpload(
            draft.file,
            session.access_token,
            session.user.id,
            { onProgress: (progress) => update({ progress }) },
          );
          await transfer.completed;
          update({ progress: 100, status: "qualifying" });
          const response = await fetch("/api/astrostack/upload", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              ...draft,
              file: undefined,
              storage_path: transfer.path,
              original_filename: draft.file.name,
              file_size_bytes: draft.file.size,
            }),
          });
          const registered = (await response.json()) as { upload?: { id: string }; error?: string };
          if (!response.ok || !registered.upload)
            throw new Error(registered.error ?? "Enregistrement impossible");

          for (let attempt = 0; attempt < 300; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 2_000));
            const statusResponse = await fetch("/api/astrostack/qualify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ upload_id: registered.upload.id }),
            });
            if (!statusResponse.ok) continue;
            const status = (await statusResponse.json()) as {
              upload?: { status: string };
              job?: { status: string; progress: number; error_code?: string };
            };
            update({ progress: status.job?.progress ?? 100 });
            if (status.upload?.status === "approved" || status.upload?.status === "published") {
              update({ status: "qualified", progress: 100 });
              break;
            }
            if (
              ["rejected", "duplicate", "failed"].includes(
                status.upload?.status ?? status.job?.status ?? "",
              )
            ) {
              update({
                status: status.upload?.status === "rejected" ? "rejected" : "error",
                ...(status.job?.error_code ? { rejection_reason: status.job.error_code } : {}),
              });
              break;
            }
          }
        } catch (error) {
          update({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await loadObjects(searchQuery);
      setStatusRefreshKey((current) => current + 1);
    },
    [loadObjects, searchQuery],
  );

  // Lance un stacking pour l'objet sélectionné
  const triggerStacking = useCallback(
    async (objectId: string) => {
      setIsSubmittingStack(true);
      try {
        const res = await fetch("/api/astrostack/stack-trigger", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ object_id: objectId }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            body && typeof body === "object" && "error" in body && typeof body.error === "string"
              ? body.error
              : "Impossible de demander le stacking.";
          throw new Error(message);
        }

        const parsed = stackRequestResponseSchema.safeParse(body);
        if (!parsed.success) throw new Error("Réponse de stacking invalide.");

        switch (parsed.data.job.state) {
          case "queued":
            toast.success("Stacking ajouté à la file scientifique", {
              description: `${parsed.data.job.lights_count} LIGHT validées`,
            });
            break;
          case "active":
            toast.info("Un calcul est déjà en cours.");
            break;
          case "cooldown":
            toast.info("Recalcul récent, veuillez patienter.");
            break;
          case "completed":
            toast.info("Le résultat est déjà disponible.");
            break;
          case "terminal":
            toast.warning("Le calcul précédent est terminé sans résultat publié.");
            break;
        }
      } catch (err) {
        toast.error(`Erreur stacking: ${String(err)}`);
      } finally {
        setIsSubmittingStack(false);
        setStatusRefreshKey((current) => current + 1);
        void loadObjects(searchQuery);
      }
    },
    [loadObjects, searchQuery],
  );

  const selectObject = useCallback((obj: AstroObject) => setSelectedObject(obj), []);

  const refresh = useCallback(() => {
    void loadObjects(searchQuery);
    setStatusRefreshKey((current) => current + 1);
  }, [loadObjects, searchQuery]);

  return {
    objects,
    selectedObject,
    publicStatus,
    isLoadingStatus,
    statusError,
    isStatusStale,
    userUploads,
    isLoadingObjects,
    isSubmittingStack,
    isPipelineActive: astroStackStatusIsActive(publicStatus),
    searchQuery,
    setSearchQuery,
    loadObjects,
    selectObject,
    uploadFrames,
    triggerStacking,
    refresh,
  };
}
