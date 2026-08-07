import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
  const { user } = useAuth();
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
        .select("id, object_id, lights_count, total_exposure_hours, contributors_count, configurations_count, stacking_method, status, result_image_url, ai_pipeline_log, started_at, completed_at")
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

  // Upload d'une ou plusieurs frames
  const uploadFrames = useCallback(
    async (drafts: AstroUploadDraft[]) => {
      if (!user) {
        toast.error("Connectez-vous pour contribuer");
        return;
      }

      for (const draft of drafts) {
        const uploadId = crypto.randomUUID();
        const progress: UploadProgress = {
          id: uploadId,
          filename: draft.file.name,
          progress: 0,
          status: "uploading",
        };
        setUserUploads((prev) => [progress, ...prev]);

        try {
          // Upload vers le bucket Supabase Storage
          const ext = draft.file.name.split(".").pop() ?? "fit";
          const storagePath = `${user.id}/${draft.object_id}/${draft.frame_type}/${Date.now()}_${draft.file.name}`;

          const { error: storageErr } = await supabase.storage
            .from("astro-frames")
            .upload(storagePath, draft.file, { upsert: false });

          if (storageErr) throw new Error(storageErr.message);

          setUserUploads((prev) =>
            prev.map((u) => u.id === uploadId ? { ...u, progress: 60 } : u)
          );

          const { data: publicData } = supabase.storage
            .from("astro-frames")
            .getPublicUrl(storagePath);

          // Insère l'enregistrement en base
          const { data: insertedUpload, error: insertErr } = await supabase
            .from("astro_uploads")
            .insert({
              user_id: user.id,
              object_id: draft.object_id,
              frame_type: draft.frame_type,
              storage_path: storagePath,
              file_url: publicData.publicUrl,
              file_size_bytes: draft.file.size,
              original_filename: draft.file.name,
              telescope: draft.telescope ?? null,
              camera: draft.camera ?? null,
              focal_length_mm: draft.focal_length_mm ?? null,
              aperture_mm: draft.aperture_mm ?? null,
              exposure_s: draft.exposure_s ?? null,
              gain: draft.gain ?? null,
              temperature_c: draft.temperature_c ?? null,
              filter_name: draft.filter_name ?? null,
              binning: draft.binning ?? null,
              latitude: draft.latitude ?? null,
              longitude: draft.longitude ?? null,
              captured_at: draft.captured_at ?? null,
              status: "uploaded",
            })
            .select()
            .single();

          if (insertErr || !insertedUpload) throw new Error(insertErr?.message);

          setUserUploads((prev) =>
            prev.map((u) => u.id === uploadId ? { ...u, progress: 80, status: "qualifying" } : u)
          );

          // Lance la qualification IA en arrière-plan
          fetch("/api/astrostack/qualify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ upload_id: insertedUpload.id }),
          })
            .then((r) => r.json())
            .then((result) => {
              if (result.analysis) {
                setUserUploads((prev) =>
                  prev.map((u) =>
                    u.id === uploadId
                      ? {
                          ...u,
                          progress: 100,
                          status: result.analysis.rejected ? "rejected" : "qualified",
                          quality_score: result.analysis.quality_score,
                          rejection_reason: result.analysis.rejection_reason,
                        }
                      : u
                  )
                );
                if (result.analysis.rejected) {
                  toast.error(`Frame rejetée : ${result.analysis.rejection_reason}`);
                } else {
                  toast.success(
                    `Frame qualifiée — Score: ${Math.round(result.analysis.quality_score * 100)}%`
                  );
                }
              }
            })
            .catch(() => {});

          // Rafraîchit les stats de l'objet
          if (selectedObject?.id === draft.object_id) {
            loadObjectDetail(draft.object_id);
          }
          loadObjects(searchQuery);
        } catch (err) {
          setUserUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, status: "error", error: String(err), progress: 0 }
                : u
            )
          );
          toast.error(`Erreur upload ${draft.file.name}: ${String(err)}`);
        }
      }
    },
    [user, selectedObject, loadObjectDetail, loadObjects, searchQuery]
  );

  // Lance un stacking pour l'objet sélectionné
  const triggerStacking = useCallback(
    async (objectId: string) => {
      setIsStacking(true);
      try {
        const res = await fetch("/api/astrostack/stack-trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ object_id: objectId, min_quality: 0.4 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        toast.success("?? Stacking lancé avec succès !", {
          description: `${data.job.lights_count} frames / ${data.job.contributors_count} contributeurs`,
        });

        await loadObjectDetail(objectId);
        await loadObjects(searchQuery);
      } catch (err) {
        toast.error(`Erreur stacking: ${String(err)}`);
      } finally {
        setIsStacking(false);
      }
    },
    [loadObjectDetail, loadObjects, searchQuery]
  );

  const selectObject = useCallback(
    (obj: AstroObject) => {
      setSelectedObject(obj);
      loadObjectDetail(obj.id);
    },
    [loadObjectDetail]
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
