import type { AstroObject, AstroMaster, StackingJob } from "@/hooks/useAstroStack";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  object: AstroObject;
  masters: AstroMaster[];
  recentJobs: StackingJob[];
  onTriggerStack: () => void;
  isStacking: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  galaxy: "🌌",
  nebula: "☁️",
  cluster_open: "✨",
  cluster_globular: "🌟",
  planetary_nebula: "🫧",
  supernova_remnant: "💥",
  double_star: "⭐",
  other: "🔭",
};

function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(1)}h`;
}

function PipelineStep({ name, status, result }: { name: string; status: string; result?: string }) {
  const icon =
    status === "done" ? "✓" : status === "running" ? "⏳" : status === "failed" ? "✕" : "·";
  const color =
    status === "done"
      ? "text-green-400"
      : status === "running"
        ? "text-blue-400 animate-pulse"
        : status === "failed"
          ? "text-red-400"
          : "text-muted-foreground";
  return (
    <div className="flex items-center justify-between py-0.5 text-[11px]">
      <span className="flex items-center gap-1.5">
        <span className={`font-mono font-bold ${color}`}>{icon}</span>
        <span className={status === "done" ? "text-foreground" : "text-muted-foreground"}>
          {name}
        </span>
      </span>
      {result && <span className="text-[10px] text-muted-foreground ml-2">{result}</span>}
    </div>
  );
}

export function AstroObjectMaster({
  object,
  masters,
  recentJobs,
  onTriggerStack,
  isStacking,
}: Props) {
  const currentMaster = masters.find((m) => m.is_current);
  const latestJob = recentJobs[0];
  const pipelineLog = latestJob?.ai_pipeline_log as {
    steps?: Array<{ name: string; status: string; result?: string }>;
  } | null;
  const hasEnoughData = object.total_lights >= 3;
  const stackingAvailable = true;

  // Indicateurs de complétude
  const lightsOk = object.total_lights >= 50;
  const darksOk = object.total_darks >= 30;
  const flatsOk = object.total_flats >= 20;
  const biasOk = object.total_bias >= 10;
  const completeness = [lightsOk, darksOk, flatsOk, biasOk].filter(Boolean).length / 4;

  return (
    <div className="space-y-4">
      {/* Header objet */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card/50 p-4">
        <span className="text-3xl">{TYPE_ICONS[object.type] ?? "🔭"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold">{object.id}</h2>
            {object.common_name && (
              <span className="text-sm text-muted-foreground">— {object.common_name}</span>
            )}
            <Badge variant="outline" className="text-[10px]">
              {object.type.replace("_", " ")}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground font-mono">
            RA {object.ra_deg.toFixed(4)}° · Dec {object.dec_deg.toFixed(4)}°
            {object.magnitude && ` · mag ${object.magnitude}`}
            {object.size_arcmin && ` · ${object.size_arcmin}′`}
          </p>
        </div>
      </div>

      {/* Stats mondiales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "LIGHTS",
            value: object.total_lights.toLocaleString(),
            ok: lightsOk,
            color: "text-blue-400",
          },
          {
            label: "DARKS",
            value: object.total_darks.toLocaleString(),
            ok: darksOk,
            color: "text-red-400",
          },
          {
            label: "FLATS",
            value: object.total_flats.toLocaleString(),
            ok: flatsOk,
            color: "text-yellow-400",
          },
          {
            label: "BIAS",
            value: object.total_bias.toLocaleString(),
            ok: biasOk,
            color: "text-purple-400",
          },
        ].map((s) => (
          <Card
            key={s.label}
            className={`bg-card/50 border ${s.ok ? "border-green-500/20" : "border-border"}`}
          >
            <CardContent className="p-3 text-center">
              <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{s.label}</p>
              {!s.ok && <p className="text-[10px] text-yellow-500 mt-0.5">⚠ à compléter</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Métriques globales */}
      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="rounded-lg border border-border bg-card/30 p-3">
          <p className="text-lg font-bold">{object.total_contributors.toLocaleString()}</p>
          <p className="text-muted-foreground">contributeurs</p>
        </div>
        <div className="rounded-lg border border-border bg-card/30 p-3">
          <p className="text-lg font-bold">{formatHours(object.total_exposure_hours)}</p>
          <p className="text-muted-foreground">de pose totale</p>
        </div>
        <div className="rounded-lg border border-border bg-card/30 p-3">
          <p className="text-lg font-bold">{Math.round(completeness * 100)}%</p>
          <p className="text-muted-foreground">complétude</p>
          <Progress value={completeness * 100} className="mt-1 h-1" />
        </div>
      </div>

      {/* Master actuel */}
      {currentMaster ? (
        <Card className="bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                🌌 Master actuel — Génération {currentMaster.generation}
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                SNR ×{Math.sqrt(currentMaster.lights_stacked).toFixed(1)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <img
              src={currentMaster.image_url}
              alt={`Master ${object.id}`}
              className="w-full rounded-lg object-cover bg-muted"
              style={{ maxHeight: 200 }}
            />
            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              <div>
                <p className="font-semibold">{currentMaster.lights_stacked.toLocaleString()}</p>
                <p className="text-muted-foreground">frames stackées</p>
              </div>
              <div>
                <p className="font-semibold">{formatHours(currentMaster.total_exposure_hours)}</p>
                <p className="text-muted-foreground">pose totale</p>
              </div>
              <div>
                <p className="font-semibold">{currentMaster.contributors_count}</p>
                <p className="text-muted-foreground">contributeurs</p>
              </div>
            </div>
            {currentMaster.notes && (
              <p className="text-[11px] text-muted-foreground italic">{currentMaster.notes}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-4xl mb-3">🌌</p>
          <p className="text-sm font-medium">Aucun master disponible</p>
          <p className="text-xs text-muted-foreground mt-1">
            {!stackingAvailable
              ? "Le worker scientifique n'est pas encore déployé. Aucun master simulé ne sera généré."
              : hasEnoughData
                ? "Cliquez sur « Lancer le stacking » pour générer le premier master."
                : `Il faut au minimum 3 lights pour lancer le stacking (actuellement ${object.total_lights}).`}
          </p>
        </div>
      )}

      {/* Bouton stacking */}
      <Button
        className="w-full"
        onClick={onTriggerStack}
        disabled={!stackingAvailable || !hasEnoughData || isStacking}
        variant={currentMaster ? "outline" : "default"}
      >
        {!stackingAvailable
          ? "Pipeline scientifique à connecter"
          : isStacking
            ? "🚀 Stacking en cours..."
            : currentMaster
              ? "🔄 Recalculer le master"
              : "🚀 Lancer le stacking mondial"}
      </Button>

      {/* Pipeline log */}
      {pipelineLog?.steps && pipelineLog.steps.length > 0 && (
        <Card className="bg-card/30 border-dashed">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-mono">Pipeline log — dernier job</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {pipelineLog.steps.map((step, i) => (
              <PipelineStep
                key={i}
                name={step.name}
                status={step.status}
                {...(step.result !== undefined ? { result: step.result } : {})}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
