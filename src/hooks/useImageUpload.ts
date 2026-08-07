import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type UploadStatus = "idle" | "uploading" | "analyzing" | "complete" | "error";

export interface UploadState {
  progress: number;
  status: UploadStatus;
  imageId?: string;
  errorMessage?: string;
}

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
      const MAX_SIZE = 10 * 1024 * 1024;
      const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

      if (file.size > MAX_SIZE) {
        toast.error("L'image ne doit pas dpasser 10 Mo.");
        return null;
      }
      if (!ALLOWED.includes(file.type)) {
        toast.error("Format non support. Utilisez JPEG, PNG ou WebP.");
        return null;
      }

      try {
        setUploadState({ progress: 10, status: "uploading" });

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          toast.error("Vous devez tre connect pour uploader des images.");
          setUploadState({ progress: 0, status: "error" });
          return null;
        }

        const ext = file.name.split(".").pop() ?? "jpg";
        const storagePath = `${user.id}/${objectId}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("user-images")
          .upload(storagePath, file, { cacheControl: "3600", upsert: false });

        if (uploadError) throw uploadError;

        setUploadState({ progress: 40, status: "uploading" });

        const {
          data: { publicUrl },
        } = supabase.storage.from("user-images").getPublicUrl(storagePath);

        setUploadState({ progress: 55, status: "analyzing" });

        const analysisRes = await fetch("/api/vision/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: publicUrl }),
        });

        if (!analysisRes.ok) throw new Error("chec de l'analyse Vision.");

        const analysis = await analysisRes.json();

        setUploadState({ progress: 80, status: "analyzing" });

        if (analysis.isAiGenerated && analysis.confidence > 0.65) {
          await supabase.storage.from("user-images").remove([storagePath]);
          toast.error(
            `Image rejete : notre IA a dtect qu'elle est gnre par ordinateur (confiance ${Math.round(analysis.confidence * 100)} %). Seules les vraies photographies astronomiques sont acceptes.`,
          );
          setUploadState({
            progress: 0,
            status: "error",
            errorMessage: "Image gnre par IA dtecte",
          });
          return null;
        }

        const { data: imageRow, error: dbError } = await supabase
          .from("user_images")
          .insert({
            user_id: user.id,
            object_id: objectId,
            object_name: objectName,
            image_url: publicUrl,
            storage_path: storagePath,
            file_size: file.size,
            mime_type: file.type,
            is_ai_generated: analysis.isAiGenerated,
            ai_detection_score: analysis.confidence,
            vision_analysis: analysis,
          })
          .select("id")
          .single();

        if (dbError) throw dbError;

        setUploadState({ progress: 100, status: "complete", imageId: imageRow.id });
        toast.success("Image uploade et valide ! Elle enrichit la galerie collaborative.");

        fetch("/api/vision/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectId, newImageId: imageRow.id }),
        }).catch(console.error);

        return imageRow.id;
      } catch (err) {
        console.error("Upload error:", err);
        toast.error("Une erreur est survenue lors de l'upload.");
        setUploadState({ progress: 0, status: "error" });
        return null;
      }
    },
    [objectId, objectName],
  );

  return { uploadImage, uploadState, reset };
}
