import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AstroUploadDraft } from "@/hooks/useAstroStack";

interface Props {
  objectId: string;
  onUpload: (drafts: AstroUploadDraft[]) => void;
  disabled?: boolean;
}

const FRAME_TYPES = [
  { value: "light", label: "LIGHT — pose sur l'objet", color: "text-blue-400" },
  { value: "dark", label: "DARK — même temp/gain/durée", color: "text-red-400" },
  { value: "flat", label: "FLAT — calibration optique", color: "text-yellow-400" },
  { value: "bias", label: "BIAS — offset capteur", color: "text-purple-400" },
] as const;

const ACCEPTED =
  ".fit,.fits,.fts,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2,.dng,.tiff,.tif,.png,.jpg,.jpeg";

export function AstroUploadZone({ objectId, onUpload, disabled }: Props) {
  const [frameType, setFrameType] = useState<"light" | "dark" | "flat" | "bias">("light");
  const [isDragOver, setIsDragOver] = useState(false);
  // Instrument
  const [telescope, setTelescope] = useState("");
  const [camera, setCamera] = useState("");
  const [focalLength, setFocalLength] = useState("");
  const [aperture, setAperture] = useState("");
  const [exposure, setExposure] = useState("");
  const [gain, setGain] = useState("");
  const [temperature, setTemperature] = useState("");
  const [filter, setFilter] = useState("");
  const [binning, setBinning] = useState("1");
  const [pixelSize, setPixelSize] = useState("");
  const [licence, setLicence] = useState<"CC-BY-4.0" | "CC-BY-SA-4.0" | "CC0-1.0">("CC-BY-4.0");
  const [licenceAccepted, setLicenceAccepted] = useState(false);

  const buildDraft = useCallback(
    (file: File): AstroUploadDraft => ({
      file,
      object_id: objectId,
      frame_type: frameType,
      ...(telescope ? { telescope } : {}),
      ...(camera ? { camera } : {}),
      ...(focalLength ? { focal_length_mm: Number(focalLength) } : {}),
      ...(aperture ? { aperture_mm: Number(aperture) } : {}),
      ...(exposure ? { exposure_s: Number(exposure) } : {}),
      ...(gain ? { gain: Number(gain) } : {}),
      ...(temperature ? { temperature_c: Number(temperature) } : {}),
      ...(filter ? { filter_name: filter } : {}),
      ...(pixelSize ? { pixel_size_um: Number(pixelSize) } : {}),
      binning: Number(binning),
      licence_code: licence,
    }),
    [
      objectId,
      frameType,
      telescope,
      camera,
      focalLength,
      aperture,
      exposure,
      gain,
      temperature,
      filter,
      binning,
      pixelSize,
      licence,
    ],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || !licenceAccepted) return;
      const drafts = Array.from(files).map(buildDraft);
      onUpload(drafts);
    },
    [buildDraft, onUpload, licenceAccepted],
  );

  return (
    <div className="space-y-4">
      {/* Type de frame */}
      <div className="space-y-1.5">
        <Label>Type de frame *</Label>
        <div className="grid grid-cols-2 gap-2">
          {FRAME_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setFrameType(t.value)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                frameType === t.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              <span className={`font-mono font-bold ${t.color}`}>{t.value.toUpperCase()}</span>
              <br />
              <span className="text-[10px] text-muted-foreground">{t.label.split(" — ")[1]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Zone de drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all ${
          isDragOver
            ? "border-primary bg-primary/10"
            : "border-border bg-muted/20 hover:border-primary/50"
        } ${disabled || !licenceAccepted ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={() =>
          !disabled && licenceAccepted && document.getElementById("astro-file-input")?.click()
        }
      >
        <input
          id="astro-file-input"
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          disabled={disabled || !licenceAccepted}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="text-3xl mb-3">📤</div>
        <p className="text-sm font-medium">Déposez vos frames ici</p>
        <p className="mt-1 text-xs text-muted-foreground">FITS, RAW photo, TIFF, PNG ou JPEG</p>
        <Badge variant="secondary" className="mt-3 text-[10px]">
          {frameType.toUpperCase()} pour {objectId}
        </Badge>
      </div>

      {/* Métadonnées instrument (collapsibles) */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
          + Métadonnées instrument (optionnel — améliore la compatibilité de stacking)
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Télescope</Label>
            <Input
              placeholder="Ex: SW 200/1000"
              value={telescope}
              onChange={(e) => setTelescope(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Taille des pixels (µm)</Label>
            <Input
              type="number"
              min="0.1"
              step="0.01"
              placeholder="4.3"
              value={pixelSize}
              onChange={(e) => setPixelSize(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Caméra</Label>
            <Input
              placeholder="Ex: ASI294MC"
              value={camera}
              onChange={(e) => setCamera(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Focale (mm)</Label>
            <Input
              type="number"
              placeholder="1000"
              value={focalLength}
              onChange={(e) => setFocalLength(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Ouverture (mm)</Label>
            <Input
              type="number"
              placeholder="200"
              value={aperture}
              onChange={(e) => setAperture(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Pose (s)</Label>
            <Input
              type="number"
              placeholder="300"
              value={exposure}
              onChange={(e) => setExposure(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Gain</Label>
            <Input
              type="number"
              placeholder="120"
              value={gain}
              onChange={(e) => setGain(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Temp. capteur (°C)</Label>
            <Input
              type="number"
              placeholder="-10"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Filtre</Label>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Aucun / L" />
              </SelectTrigger>
              <SelectContent>
                {["L", "R", "G", "B", "Ha", "OIII", "SII", "Hbeta", "UV", "IR"].map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Binning</Label>
            <Select value={binning} onValueChange={setBinning}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["1", "2", "3", "4"].map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}×{b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </details>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <Label className="text-xs">Licence de diffusion obligatoire</Label>
        <Select value={licence} onValueChange={(value) => setLicence(value as typeof licence)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CC-BY-4.0">CC BY 4.0 — attribution</SelectItem>
            <SelectItem value="CC-BY-SA-4.0">CC BY-SA 4.0 — attribution et partage</SelectItem>
            <SelectItem value="CC0-1.0">CC0 1.0 — domaine public</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={licenceAccepted}
            onChange={(event) => setLicenceAccepted(event.target.checked)}
            className="mt-0.5"
          />
          Je confirme détenir les droits et autoriser l’intégration des dérivés validés dans la
          mosaïque.
        </label>
      </div>
    </div>
  );
}
