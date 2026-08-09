import { useState } from "react";
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
import type { ObservationDraft, PhenomenonType } from "@/hooks/useCosmosLive";

const PHENOMENA: Array<{ value: PhenomenonType; label: string; hint: string }> = [
  { value: "meteor", label: "☄️ Météore", hint: "Trainée lumineuse rapide" },
  { value: "fireball", label: "🔥 Bolide", hint: "Météore très brillant, mag < -4" },
  { value: "aurora", label: "🌌 Aurore boréale/australe", hint: "Lumières colorées dans le ciel" },
  { value: "comet", label: "☄️ Comète", hint: "Objet avec queue visible" },
  { value: "supernova", label: "💥 Supernova potentielle", hint: "Nouvelle étoile très brillante" },
  {
    value: "satellite",
    label: "🛰️ Satellite / train Starlink",
    hint: "Point lumineux se déplaçant",
  },
  { value: "atmospheric", label: "🌈 Phénomène atmosphérique", hint: "Halo, arc, nacrés, etc." },
  { value: "unknown", label: "❔ Inconnu", hint: "Phénomène non identifié" },
];

interface Props {
  onSubmit: (draft: ObservationDraft) => Promise<boolean>;
  isSubmitting: boolean;
  disabled?: boolean;
}

export function CosmosReportForm({ onSubmit, isSubmitting, disabled }: Props) {
  const [phenomenon, setPhenomenon] = useState<PhenomenonType>("meteor");
  const [description, setDescription] = useState("");
  const [azimuth, setAzimuth] = useState("");
  const [elevation, setElevation] = useState("");
  const [duration, setDuration] = useState("");
  const [magnitude, setMagnitude] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    const draft: ObservationDraft = {
      phenomenon_type: phenomenon,
      description: description.trim(),
      ...(azimuth ? { azimuth: Number(azimuth) } : {}),
      ...(elevation ? { elevation: Number(elevation) } : {}),
      ...(duration ? { duration_s: Number(duration) } : {}),
      ...(magnitude ? { magnitude: Number(magnitude) } : {}),
      ...(evidence ? { evidence_file: evidence } : {}),
    };

    const ok = await onSubmit(draft);
    if (ok) {
      setDescription("");
      setAzimuth("");
      setElevation("");
      setDuration("");
      setMagnitude("");
      setEvidence(null);
    }
  };

  const selectedHint = PHENOMENA.find((p) => p.value === phenomenon)?.hint;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="phenomenon">Phénomène observé</Label>
        <Select
          value={phenomenon}
          onValueChange={(v) => setPhenomenon(v as PhenomenonType)}
          disabled={disabled ?? false}
        >
          <SelectTrigger id="phenomenon">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PHENOMENA.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedHint && <p className="text-[11px] text-muted-foreground">{selectedHint}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          placeholder="Décrivez précisément ce que vous observez : direction, couleur, durée, intensité..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={disabled}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="azimuth">Azimut (°)</Label>
          <Input
            id="azimuth"
            type="number"
            min={0}
            max={360}
            placeholder="0–360"
            value={azimuth}
            onChange={(e) => setAzimuth(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="elevation">Élévation (°)</Label>
          <Input
            id="elevation"
            type="number"
            min={0}
            max={90}
            placeholder="0–90"
            value={elevation}
            onChange={(e) => setElevation(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="duration">Durée (s)</Label>
          <Input
            id="duration"
            type="number"
            min={0}
            placeholder="en secondes"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="magnitude">Magnitude</Label>
          <Input
            id="magnitude"
            type="number"
            step={0.1}
            placeholder="ex: -3"
            value={magnitude}
            onChange={(e) => setMagnitude(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cosmos-evidence">Photo ou vidéo probante (privée)</Label>
        <Input
          id="cosmos-evidence"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          disabled={disabled}
          onChange={(event) => setEvidence(event.target.files?.[0] ?? null)}
        />
        <p className="text-[10px] text-muted-foreground">
          100 Mio maximum. Le fichier original n’est jamais public.
        </p>
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={disabled || isSubmitting || !description.trim()}
      >
        {isSubmitting ? "Envoi en cours..." : "📡 Signaler l'observation"}
      </Button>
    </form>
  );
}
