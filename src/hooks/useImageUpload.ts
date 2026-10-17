import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { VisionAnalysisResult } from "@/lib/vision-analysis.server";
import type { Json } from "@/integrations/supabase/types";

export type UploadStatus = "idle" | "uploading" | "analyzing" | "complete" | "error";

export interface UploadState {
  progress: number;
  status: UploadStatus;
  imageId?: string;
  errorMessage?: string;
}

const MAX_SIZE = 10 * 1024 * 1024;
const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function useImageUpload(objectId: string, objectName: string) {
  const [uploadState, setUploadState] = useState<UploadState>({
    progress: 0,
    status: "idle",
  });

  const reset = useCallback(() => {
    setUploadState({ progress: 0, status: "idle" });
  }, []);

  const uploadImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (file.size <= 0 || file.size > MAX_SIZE) {
        toast.error("L’image doit peser entre 1 octet et 10 Mo.");
        return null;
      }
      const extension = MIME_EXTENSION[file.type];
      if (!extension) {
        toast.error("Format non pris en charge. Utilisez JPEG, PNG ou WebP.");
        return null;
      }

      let pendingStoragePath: string | null = null;
      try {
        setUploadState({ progress: 10, status: "uploading" });
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user || !session.access_token) {
          throw new Error("Connectez-vous pour téléverser une image.");
        }

        const safeObject = objectId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);
        if (!safeObject) throw new Error("Objet céleste invalide.");
        const storagePath =
          session.user.id + "/" + safeObject + "/" + crypto.randomUUID() + "." + extension;

        const { error: uploadError } = await supabase.storage
          .from("user-images")
          .upload(storagePath, file, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        pendingStoragePath = storagePath;

        setUploadState({ progress: 55, status: "analyzing" });
        const { data: urlData } = supabase.storage.from("user-images").getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;
        if (!publicUrl.startsWith("https://")) {
          throw new Error("L’URL publique de l’image est indisponible.");
        }

        const analysisResponse = await fetch("/api/vision/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + session.access_token,
          },
          body: JSON.stringify({ storagePath }),
        });
        let analysis: VisionAnalysisResult | null = null;
        if (analysisResponse.ok) {
          const parsed: unknown = await analysisResponse.json();
          if (
            !parsed ||
            typeof parsed !== "object" ||
            !("isAiGenerated" in parsed) ||
            typeof parsed.isAiGenerated !== "boolean" ||
            !("confidence" in parsed) ||
            typeof parsed.confidence !== "number" ||
            !Number.isFinite(parsed.confidence) ||
            parsed.confidence < 0 ||
            parsed.confidence > 1
          ) {
            throw new Error("Réponse de validation IA invalide.");
          }
          analysis = parsed as VisionAnalysisResult;
        } else if (analysisResponse.status !== 503) {
          throw new Error("Validation des images impossible.");
        }

        if (analysis?.isAiGenerated && analysis.confidence > 0.65) {
          await supabase.storage.from("user-images").remove([storagePath]);
          pendingStoragePath = null;
          setUploadState({
            progress: 0,
            status: "error",
            errorMessage: "Image générée par IA détectée.",
          });
          toast.error("Image rejetée : des caractéristiques de génération IA ont été détectées.");
          return null;
        }

        // If the AI service is unavailable or uncertain, never claim a verified
        // photograph. A pending image cannot enter the public verified gallery.
        const verified = analysis !== null && !analysis.isAiGenerated;
        const { data: image, error: dbError } = await supabase
          .from("user_images")
          .insert({
            user_id: session.user.id,
            object_id: objectId,
            object_name: objectName,
            image_url: publicUrl,
            storage_path: storagePath,
            file_size: file.size,
            mime_type: file.type,
            is_ai_generated: verified ? false : null,
            ai_detection_score: analysis?.confidence ?? null,
            vision_analysis: (analysis ?? {
              status: "pending",
              reason: "Analyse IA indisponible ou résultat incertain.",
            }) as unknown as Json,
          })
          .select("id")
          .single();
        if (dbError) throw dbError;
        pendingStoragePath = null;

        setUploadState({ progress: 100, status: "complete", imageId: image.id });
        if (!verified) {
          toast.warning("Image enregistrée, en attente de vérification avant publication.");
        } else {
          toast.success("Image enregistrée et analysée. Elle enrichit la galerie collaborative.");
          void fetch("/api/vision/compare", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + session.access_token,
            },
            body: JSON.stringify({ objectId, newImageId: image.id }),
          })
            .then((response) => {
              if (!response.ok) console.warn("[vision] Comparaison différée indisponible.");
            })
            .catch((error: unknown) => console.warn("[vision] Comparaison différée:", error));
        }
        return image.id;
      } catch (error) {
        if (pendingStoragePath) {
          await supabase.storage.from("user-images").remove([pendingStoragePath]);
        }
        const message = error instanceof Error ? error.message : "Erreur inconnue.";
        console.error("[gallery/upload] Échec de l’upload:", message);
        toast.error(message);
        setUploadState({ progress: 0, status: "error", errorMessage: message });
        return null;
      }
    },
    [objectId, objectName],
  );

  return { uploadImage, uploadState, reset };
}
