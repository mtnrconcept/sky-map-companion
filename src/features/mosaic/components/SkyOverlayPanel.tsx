import { useId } from "react";
import { Layers, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HIPS_SURVEYS } from "../domain/hips-surveys";
import { SKY_OVERLAYS, type SkyOverlayLayerState } from "../domain/sky-overlays";
import type { UseSkyOverlaysResult } from "../hooks/useSkyOverlays";

const OVERLAY_GROUPS = [...new Set(SKY_OVERLAYS.map((layer) => layer.group))];

function layerStatusLabel(layer: SkyOverlayLayerState) {
  if (!layer.enabled) return "Masqué";
  if (layer.state === "loading") return "Chargement…";
  if (layer.state === "error") return layer.message ?? "Source temporairement indisponible";
  if (layer.message) return layer.message;
  if (layer.count !== undefined) {
    return `${layer.count.toLocaleString("fr-CH")} repère${layer.count > 1 ? "s" : ""} chargé${layer.count > 1 ? "s" : ""}`;
  }
  return "Actif";
}

export function SkyOverlayPanel({ overlays }: { overlays: UseSkyOverlaysResult }) {
  const panelId = useId();
  const { snapshot, ready, setEnabled, retry, setImageSurvey, setImageOpacity } = overlays;
  const image = snapshot.image;
  const activeCount =
    SKY_OVERLAYS.filter(({ id }) => snapshot.layers[id].enabled).length + (image.surveyId ? 1 : 0);
  const imageSurvey = HIPS_SURVEYS.find((survey) => survey.id === image.surveyId);
  const opacityPercent = Math.round(image.opacity * 100);

  return (
    <Card className="border-cyan-500/20" data-testid="sky-overlay-panel">
      <CardHeader className="space-y-2 p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="size-4 text-cyan-400" aria-hidden="true" />
            Couches du ciel
          </CardTitle>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {activeCount} activée{activeCount > 1 ? "s" : ""}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Superposez les catalogues et les repères sur la même carte. Cliquez sur un objet pour
          consulter ses informations.
        </p>
        {!ready && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            En attente de la carte…
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4 p-4 pt-0">
        <div className="max-h-[32rem] space-y-4 overflow-y-auto overscroll-contain pr-1">
          {OVERLAY_GROUPS.map((group) => (
            <fieldset key={group} disabled={!ready} className="min-w-0 space-y-1">
              <legend className="mb-2 text-xs font-semibold text-foreground">{group}</legend>
              {SKY_OVERLAYS.filter((layer) => layer.group === group).map((layer) => {
                const status = snapshot.layers[layer.id];
                const inputId = `${panelId}-${layer.id}`;
                return (
                  <div
                    key={layer.id}
                    className={`rounded-lg border px-2.5 py-2 transition-colors ${
                      status.enabled ? "border-cyan-500/20 bg-cyan-500/5" : "border-transparent"
                    }`}
                  >
                    <label htmlFor={inputId} className="flex cursor-pointer items-start gap-2.5">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={status.enabled}
                        onChange={(event) => setEnabled(layer.id, event.target.checked)}
                        aria-describedby={`${inputId}-description ${inputId}-status`}
                        className="mt-0.5 size-4 shrink-0 accent-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 disabled:cursor-wait"
                        data-testid={`overlay-toggle-${layer.id}`}
                      />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-center gap-1.5 text-xs font-medium">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: layer.color }}
                            aria-hidden="true"
                          />
                          {layer.label}
                        </span>
                        <span
                          id={`${inputId}-description`}
                          className="block text-[11px] leading-relaxed text-muted-foreground"
                        >
                          {layer.description}
                        </span>
                      </span>
                    </label>
                    <div className="ml-[26px] mt-1 flex flex-wrap items-center gap-1.5">
                      {status.enabled && status.state === "loading" && ready && (
                        <Loader2 className="size-3 animate-spin text-cyan-400" aria-hidden="true" />
                      )}
                      <span
                        id={`${inputId}-status`}
                        className={`text-[10px] leading-relaxed ${
                          status.state === "error" ? "text-amber-500" : "text-muted-foreground"
                        }`}
                        role={status.enabled ? "status" : undefined}
                      >
                        {!ready && status.enabled ? "En attente" : layerStatusLabel(status)}
                      </span>
                      {status.enabled && status.state === "error" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[10px]"
                          type="button"
                          onClick={() => retry(layer.id)}
                          aria-label={`Réessayer ${layer.label}`}
                        >
                          <RefreshCw className="size-3" aria-hidden="true" />
                          Réessayer
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>

        <p className="rounded-lg bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Gaia charge progressivement les étoiles cataloguées selon le zoom. Les étoiles brillantes
          locales restent disponibles même si un service distant ne répond pas.
        </p>

        <fieldset disabled={!ready} className="min-w-0 space-y-3 border-t border-border pt-3">
          <legend className="px-1 text-xs font-semibold">Comparaison d’images</legend>
          <div className="space-y-1.5">
            <label htmlFor={`${panelId}-image`} className="block text-xs text-muted-foreground">
              Image à superposer
            </label>
            <select
              id={`${panelId}-image`}
              value={image.surveyId ?? ""}
              onChange={(event) => setImageSurvey(event.target.value || null)}
              className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-60"
              data-testid="overlay-image-survey"
            >
              <option value="">Aucune superposition</option>
              {HIPS_SURVEYS.map((survey) => (
                <option key={survey.id} value={survey.id}>
                  {survey.label} · {survey.waveband}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <label htmlFor={`${panelId}-opacity`} className="text-muted-foreground">
                Opacité
              </label>
              <output htmlFor={`${panelId}-opacity`}>{opacityPercent} %</output>
            </div>
            <input
              id={`${panelId}-opacity`}
              type="range"
              min="0"
              max="100"
              step="5"
              value={opacityPercent}
              onChange={(event) => setImageOpacity(event.target.valueAsNumber / 100)}
              disabled={!image.surveyId}
              aria-valuetext={`${opacityPercent} %`}
              className="h-6 w-full accent-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-40"
              data-testid="overlay-image-opacity"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Fond seul</span>
              <span>Image seule</span>
            </div>
          </div>

          {image.state === "loading" && (
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground" role="status">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Chargement de la superposition…
            </p>
          )}
          {image.state === "ready" && imageSurvey && (
            <p className="text-[11px] text-muted-foreground" role="status">
              Superposition active · {imageSurvey.provider}
            </p>
          )}
          {image.state === "error" && (
            <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
              <p className="text-[11px] leading-relaxed text-amber-500" role="status">
                {image.message ?? "Cette image est temporairement indisponible."}
              </p>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setImageSurvey(image.surveyId)}
                aria-label="Réessayer la superposition d’image"
              >
                <RefreshCw className="size-3" aria-hidden="true" />
                Réessayer
              </Button>
            </div>
          )}
          {imageSurvey && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {imageSurvey.coverage === "all-sky"
                ? "Relevé tout ciel. La transparence permet de comparer les longueurs d’onde."
                : imageSurvey.coverage === "targeted"
                  ? "Relevé de champs ciblés : les zones hors couverture restent transparentes. Déplacez-vous vers un champ observé pour voir ses images."
                  : "Relevé à large couverture : certaines régions du ciel ne sont pas observées et restent transparentes."}
            </p>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}
