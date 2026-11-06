import { useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PHENOMENA,
  validateEvidenceFile,
  type ObservationDraft,
  type PhenomenonType,
} from "@/features/cosmos/domain/client-state";

interface Props {
  onSubmit: (draft: ObservationDraft) => Promise<boolean>;
  isSubmitting: boolean;
  disabled?: boolean;
}

export function CosmosReportForm({ onSubmit, isSubmitting, disabled }: Props) {
  const [phenomenon, setPhenomenon] = useState<PhenomenonType>("meteor");
  const [description, setDescription] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [azimuth, setAzimuth] = useState("");
  const [elevation, setElevation] = useState("");
  const [duration, setDuration] = useState("");
  const [magnitude, setMagnitude] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || isSubmitting || disabled) return;
    setError(null);
    if (!description.trim()) {
      setError("Décrivez ce que vous avez observé.");
      return;
    }
    const date = observedAt ? new Date(observedAt) : null;
    if (
      date &&
      (!Number.isFinite(date.getTime()) ||
        date.getTime() < Date.now() - 24 * 3600_000 ||
        date.getTime() > Date.now() + 5 * 60_000)
    ) {
      setError("Choisissez un moment situé dans les dernières 24 heures.");
      return;
    }
    try {
      if (evidence) validateEvidenceFile(evidence);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Ce fichier ne peut pas être envoyé.",
      );
      return;
    }
    const draft: ObservationDraft = {
      phenomenon_type: phenomenon,
      description: description.trim(),
      ...(date ? { observed_at: date.toISOString() } : {}),
      ...(azimuth !== "" ? { azimuth: Number(azimuth) } : {}),
      ...(elevation !== "" ? { elevation: Number(elevation) } : {}),
      ...(duration !== "" ? { duration_s: Number(duration) } : {}),
      ...(magnitude !== "" ? { magnitude: Number(magnitude) } : {}),
      ...(evidence ? { evidence_file: evidence } : {}),
    };
    submitting.current = true;
    try {
      const success = await onSubmit(draft);
      if (success) {
        setDescription("");
        setObservedAt("");
        setAzimuth("");
        setElevation("");
        setDuration("");
        setMagnitude("");
        setEvidence(null);
        if (fileInput.current) fileInput.current.value = "";
      } else {
        setError(
          "L’envoi n’a pas été confirmé. Vos champs et votre fichier sont conservés ; vous pouvez réessayer.",
        );
      }
    } catch {
      setError("L’envoi a été interrompu. Votre signalement est conservé dans le formulaire.");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Signaler une observation">
      <fieldset disabled={isSubmitting} className="min-w-0 space-y-4">
        <legend className="sr-only">Détails du phénomène observé</legend>
        <div className="space-y-1.5">
          <Label htmlFor="cosmos-phenomenon">Phénomène observé</Label>
          <Select
            value={phenomenon}
            onValueChange={(value) => setPhenomenon(value as PhenomenonType)}
            disabled={isSubmitting}
          >
            <SelectTrigger id="cosmos-phenomenon">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHENOMENA.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.icon + " " + item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {PHENOMENA.find((item) => item.value === phenomenon)?.hint}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cosmos-description">Description *</Label>
          <Textarea
            id="cosmos-description"
            placeholder="Direction, couleur, déplacement, durée, intensité… Décrivez ce que vous avez vu."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            maxLength={2000}
            required
            aria-describedby="cosmos-description-help"
          />
          <div
            id="cosmos-description-help"
            className="flex justify-between gap-2 text-[11px] text-muted-foreground"
          >
            <span>La description sera publique.</span>
            <span className="shrink-0">{description.length}/2 000</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cosmos-observed-at">Date et heure de l’observation</Label>
          <Input
            id="cosmos-observed-at"
            type="datetime-local"
            step={1}
            value={observedAt}
            onChange={(event) => setObservedAt(event.target.value)}
            aria-describedby="cosmos-observed-at-help"
            className="min-w-0"
          />
          <p id="cosmos-observed-at-help" className="text-[11px] text-muted-foreground">
            Laissez vide pour maintenant. Sinon, indiquez l’heure locale, dans les dernières 24 h.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cosmos-azimuth">Azimut (°)</Label>
            <Input
              id="cosmos-azimuth"
              type="number"
              min={0}
              max={360}
              step="any"
              placeholder="0 à 360"
              value={azimuth}
              onChange={(event) => setAzimuth(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cosmos-elevation">Élévation (°)</Label>
            <Input
              id="cosmos-elevation"
              type="number"
              min={-90}
              max={90}
              step="any"
              placeholder="0 à l’horizon"
              value={elevation}
              onChange={(event) => setElevation(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cosmos-duration">Durée (s)</Label>
            <Input
              id="cosmos-duration"
              type="number"
              min={0}
              max={86400}
              step="any"
              placeholder="En secondes"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cosmos-magnitude">Magnitude</Label>
            <Input
              id="cosmos-magnitude"
              type="number"
              min={-30}
              max={30}
              step="any"
              placeholder="Si connue"
              value={magnitude}
              onChange={(event) => setMagnitude(event.target.value)}
            />
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Mesures facultatives : laissez vide ce que vous ne connaissez pas. Azimut : nord 0°, est
          90°, sud 180°, ouest 270°. Élévation : horizon 0°, zénith 90°.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="cosmos-evidence">Photo ou vidéo privée</Label>
          <Input
            ref={fileInput}
            id="cosmos-evidence"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.jpg,.jpeg,.png,.webp,.mp4,.mov"
            aria-describedby="cosmos-evidence-help"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setEvidence(file);
              setError(null);
              if (file) {
                try {
                  validateEvidenceFile(file);
                } catch (validationError) {
                  setError(
                    validationError instanceof Error
                      ? validationError.message
                      : "Fichier incompatible.",
                  );
                }
              }
            }}
          />
          <p id="cosmos-evidence-help" className="text-[11px] text-muted-foreground">
            JPEG, PNG, WebP, MP4 ou MOV · 100 Mio maximum. Le fichier original reste privé.
          </p>
          {evidence && (
            <p className="break-all text-[11px] text-muted-foreground">
              {evidence.name} · {(evidence.size / 1024 / 1024).toFixed(1)} Mio
            </p>
          )}
        </div>
      </fieldset>

      {error && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={disabled || isSubmitting || !description.trim()}
      >
        <Send className="mr-2 size-4" aria-hidden="true" />
        {isSubmitting ? "Envoi en cours…" : "Envoyer le signalement"}
      </Button>
    </form>
  );
}
