import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_HIPS_SURVEY_ID,
  getHipsSurvey,
  HIPS_SURVEYS,
} from "../domain/hips-surveys";
import {
  ALADIN_LITE_VERSION,
  loadAladinLite,
  type AladinInstance,
} from "../lib/aladin-lite";

const M31_RA_DEG = 10.6847;
const M31_DEC_DEG = 41.2692;
const INITIAL_FOV_DEG = 5;

function coverageLabel(coverage: "all-sky" | "wide" | "targeted") {
  if (coverage === "all-sky") return "Tout ciel";
  if (coverage === "wide") return "Large couverture";
  return "Champs ciblés";
}

export function MosaicObservatory() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<AladinInstance | null>(null);
  const [surveyId, setSurveyId] = useState(DEFAULT_HIPS_SURVEY_ID);
  const [center, setCenter] = useState({ ra: M31_RA_DEG, dec: M31_DEC_DEG });
  const [fovDeg, setFovDeg] = useState(INITIAL_FOV_DEG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const survey = useMemo(() => getHipsSurvey(surveyId), [surveyId]);

  useEffect(() => {
    let cancelled = false;
    const element = containerRef.current;
    if (!element) return;

    setLoading(true);
    loadAladinLite()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.replaceChildren();
        const aladin = api.aladin(containerRef.current, {
          survey: DEFAULT_HIPS_SURVEY_ID,
          fov: INITIAL_FOV_DEG,
          projection: "SIN",
          cooFrame: "ICRS",
          showReticle: true,
          showCooGridControl: true,
          showCooGrid: false,
          showSimbadPointerControl: true,
          showContextMenu: true,
          showFullscreenControl: true,
        });
        aladin.gotoRaDec(M31_RA_DEG, M31_DEC_DEG);
        aladin.on("positionChanged", ({ ra, dec }) => setCenter({ ra, dec }));
        aladin.on("zoomChanged", (fov) => {
          if (Number.isFinite(fov)) setFovDeg(fov);
        });
        aladinRef.current = aladin;
        const [width] = aladin.getFov();
        if (Number.isFinite(width)) setFovDeg(width);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      const aladin = aladinRef.current;
      aladin?.off("positionChanged");
      aladin?.off("zoomChanged");
      aladinRef.current = null;
      element.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const aladin = aladinRef.current;
    if (!aladin) return;
    setLoading(true);
    Promise.resolve(aladin.setBaseImageLayer(surveyId))
      .then(() => setError(null))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setLoading(false));
  }, [surveyId]);

  const recenterM31 = () => {
    const aladin = aladinRef.current;
    if (!aladin) return;
    aladin.gotoRaDec(M31_RA_DEG, M31_DEC_DEG);
    aladin.setFoV(INITIAL_FOV_DEG);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="overflow-hidden bg-slate-950">
        <CardHeader className="border-b border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto text-sm text-white">
              Observatoire HiPS multi-résolution
            </CardTitle>
            <Badge variant="secondary">Aladin Lite {ALADIN_LITE_VERSION}</Badge>
            {loading && (
              <span className="text-[11px] text-cyan-300" role="status" aria-live="polite">
                Chargement des tuiles…
              </span>
            )}
            <Button size="sm" variant="secondary" onClick={recenterM31}>
              Recentrer M31
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <label htmlFor="hips-survey" className="sr-only">
              Fond scientifique
            </label>
            <select
              id="hips-survey"
              value={surveyId}
              onChange={(event) => setSurveyId(event.target.value)}
              className="h-8 max-w-full rounded-md border border-white/15 bg-slate-900 px-2 text-xs text-white outline-none focus:border-cyan-400"
            >
              {HIPS_SURVEYS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · {item.waveband}
                </option>
              ))}
            </select>
            <span>
              RA {center.ra.toFixed(5)}° · Dec {center.dec.toFixed(5)}° · champ {fovDeg.toFixed(3)}°
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className="h-[68vh] min-h-[480px] w-full bg-black"
            aria-label="Atlas céleste HiPS interactif"
          />
          {error && (
            <p className="border-t border-red-400/20 bg-red-950/30 p-3 text-xs text-red-200" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Couche scientifique</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">{survey.label}</p>
              <p className="text-xs text-muted-foreground">{survey.description}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">{survey.waveband}</Badge>
              <Badge variant="outline">HiPS ordre {survey.maxOrder}</Badge>
              <Badge variant="outline">{coverageLabel(survey.coverage)}</Badge>
            </div>
            <p className="break-all font-mono text-[10px] text-muted-foreground">{survey.id}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Navigation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>Glissez pour vous déplacer librement dans le ciel.</p>
            <p>Molette, trackpad ou pincement pour changer instantanément de niveau HiPS.</p>
            <p>Les coordonnées et le champ sont actualisés pendant le déplacement et le zoom.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sky Map propriétaire</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              Les surveys publics servent de référence immédiate. La couche Sky Map sera publiée au même
              format HiPS, avec provenance par tuile et générations immuables.
            </p>
            <p>
              Les images amateurs qualifiées pourront ensuite améliorer les cellules où leur résolution et
              leur score scientifique dépassent la référence disponible.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
