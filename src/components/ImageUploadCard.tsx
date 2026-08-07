import { useCallback, useRef, useState } from "react";
import { Upload, Image as ImageIcon, AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useImageUpload } from "@/hooks/useImageUpload";
import type { SkyObject } from "@/lib/sky-objects";

export function ImageUploadCard({ skyObject }: { skyObject: SkyObject }) {
  const { uploadImage, uploadState, reset } = useImageUpload(skyObject.key, skyObject.name);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      uploadImage(file).then((id) => {
        if (!id) {
          URL.revokeObjectURL(objectUrl);
          setPreview(null);
        }
      });
    },
    [uploadImage],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleReset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  const isActive = uploadState.status !== "idle";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="size-4" />
          Partager votre observation de {skyObject.name}
        </CardTitle>
        <CardDescription>
          Votre photo sera analyse par l'IA, puis compare avec celles des autres astronomes pour
          dtecter d'ventuelles dcouvertes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription>
            <strong>Photos uniquement.</strong> Les images gnres par IA sont automatiquement dtectes
            et rejetes.
          </AlertDescription>
        </Alert>

        {uploadState.status === "idle" && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Zone d'upload d'image"
            className={`relative flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Cliquez ou glissez-dposez votre image</p>
              <p className="mt-1 text-sm text-muted-foreground">JPEG, PNG ou WebP max 10 Mo</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleChange}
            />
          </div>
        )}

        {isActive && (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-lg bg-muted">
              {preview && (
                <img
                  src={preview}
                  alt="Aperu de l'image"
                  className="max-h-64 w-full object-contain"
                />
              )}
              {uploadState.status !== "complete" && uploadState.status !== "error" && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-muted-foreground">
                  {uploadState.status === "uploading" && "Envoi en cours"}
                  {uploadState.status === "analyzing" &&
                    "Analyse Vision IA (dtection & astronomie)"}
                  {uploadState.status === "complete" && "Valide et enregistre !"}
                  {uploadState.status === "error" && (uploadState.errorMessage ?? "Erreur")}
                </span>
                <span className="tabular-nums">{uploadState.progress} %</span>
              </div>
              <Progress value={uploadState.progress} />
            </div>

            {uploadState.status === "complete" && (
              <Alert>
                <CheckCircle2 className="size-4" />
                <AlertDescription>
                  Image ajoute la galerie collaborative. Elle sera compare avec les autres
                  observations pour dtecter de nouvelles dcouvertes.
                </AlertDescription>
              </Alert>
            )}

            {(uploadState.status === "complete" || uploadState.status === "error") && (
              <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
                <X className="size-3.5" />
                Uploader une autre image
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
