import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { startContributionUpload } from "@/features/mosaic/api/resumable-upload";

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

export interface AstroMaster {
  id: string;
  object_id: string;
  image_url: string;
  thumbnail_url: string | null;
  lights_stacked: number;
  total_exposure_hours: number;
  contributors_count: number;
  configurations_count: number;
  countries_count: number;
  final_snr: number | null;
  final_fwhm: number | null;
  generation: number;
  notes: string | null;
  is_current: boolean;
  created_at: string;
}

export interface StackingJob {
  id: string;
  object_id: string;
  lights_count: number;
  total_exposure_hours: number;
  contributors_count: number;
  configurations_count: number;
  stacking_method: string;
  status: string;
  result_image_url: string | null;
  ai_pipeline_log: unknown;
  started_at: string | null;
  completed_at: string | null;
}

// ——————————————————————————————————————————
// Hook principal
// ——————————————————————————————————————————

export function useAstroStack() {
  const [objects, setObjects] = useState<AstroObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<AstroObject | null>(null);
  const [masters, setMasters] = useState<AstroMaster[]>([]);
  const [recentJobs, setRecentJobs] = useState<StackingJob[]>([]);
  const [userUploads, setUserUploads] = useState<UploadProgress[]>([]);
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);
  const [isStacking, setIsStacking] = useState(false);
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

  // Charge les masters et jobs pour un objet
  const loadObjectDetail = useCallback(async (objectId: string) => {
    const [mastersRes, jobsRes] = await Promise.all([
      supabase
        .from("astro_masters")
        .select("*")
        .eq("object_id", objectId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("astro_stacking_jobs")
        .select(
          "id, object_id, lights_count, total_exposure_hours, contributors_count, configurations_count, stacking_method, status, result_image_url, ai_pipeline_log, started_at, completed_at",
        )
        .eq("object_id", objectId)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);
    if (mastersRes.data) setMasters(mastersRes.data as AstroMaster[]);
    if (jobsRes.data) setRecentJobs(jobsRes.data as StackingJob[]);
  }, []);

  useEffect(() => {
    loadObjects(searchQuery);
  }, [loadObjects, searchQuery]);

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
    },
    [loadObjects, searchQuery],
  );

  // Lance un stacking pour l'objet sélectionné
  const triggerStacking = useCallback(
    async (objectId: string) => {
      setIsStacking(true);
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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        toast.success("Stacking ajouté à la file scientifique", {
          description: `${data.job.lights_count} LIGHT validées`,
        });

        await loadObjectDetail(objectId);
        await loadObjects(searchQuery);
      } catch (err) {
        toast.error(`Erreur stacking: ${String(err)}`);
      } finally {
        setIsStacking(false);
      }
    },
    [loadObjectDetail, loadObjects, searchQuery],
  );

  const selectObject = useCallback(
    (obj: AstroObject) => {
      setSelectedObject(obj);
      loadObjectDetail(obj.id);
    },
    [loadObjectDetail],
  );

  return {
    objects,
    selectedObject,
    masters,
    recentJobs,
    userUploads,
    isLoadingObjects,
    isStacking,
    searchQuery,
    setSearchQuery,
    loadObjects,
    selectObject,
    uploadFrames,
    triggerStacking,
    refresh: () => {
      loadObjects(searchQuery);
      if (selectedObject) loadObjectDetail(selectedObject.id);
    },
  };
}
