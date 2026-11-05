import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_HIPS_SURVEY_ID, getHipsSurvey, HIPS_SURVEYS } from "../domain/hips-surveys";
import { ALADIN_LITE_VERSION, loadAladinLite, type AladinInstance } from "../lib/aladin-lite";
import { GLOBAL_MOSAIC_HIPS_URL } from "../domain/global-hips";
import { createBaseSurveyController } from "../lib/base-survey";
import { SkyOverlayPanel } from "./SkyOverlayPanel";
import { useSkyOverlays, type SkyOverlayConnection } from "../hooks/useSkyOverlays";

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
  const baseSurveyRef = useRef<ReturnType<typeof createBaseSurveyController> | null>(null);
  const [surveyId, setSurveyId] = useState(DEFAULT_HIPS_SURVEY_ID);
  const [connection, setConnection] = useState<SkyOverlayConnection | null>(null);
  const [viewerRetry, setViewerRetry] = useState(0);
  const [surveyRetry, setSurveyRetry] = useState(0);
  const overlays = useSkyOverlays(connection, "sky-map:comparison-overlays:v1");
  const refreshOverlaysRef = useRef(overlays.refreshViewport);
  refreshOverlaysRef.current = overlays.refreshViewport;
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
    setConnection(null);
    setError(null);
    loadAladinLite()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.replaceChildren();
        const aladin = api.aladin(containerRef.current, {
          // A stalled initial CDS request blocks the SDK's entire image queue.
          // Boot on our own all-sky map; preflight the selected survey below.
          survey: new URL(GLOBAL_MOSAIC_HIPS_URL, window.location.origin).href,
          fov: INITIAL_FOV_DEG,
          projection: "SIN",
          cooFrame: "ICRS",
          showReticle: true,
          showCooGridControl: false,
          showCooGrid: false,
          showSimbadPointerControl: false,
          showLayersControl: false,
          showContextMenu: true,
          showFullscreenControl: true,
        });
        aladin.gotoRaDec(M31_RA_DEG, M31_DEC_DEG);
        aladin.on("positionChanged", ({ ra, dec }) => {
          setCenter({ ra, dec });
          refreshOverlaysRef.current();
        });
        aladin.on("zoomChanged", (fov) => {
          refreshOverlaysRef.current();
          if (Number.isFinite(fov)) setFovDeg(fov);
        });
        aladinRef.current = aladin;
        baseSurveyRef.current = createBaseSurveyController(api, aladin);
        setConnection({ api, aladin });
        const initialFov = aladin.getFov();
        const width = Array.isArray(initialFov) ? initialFov[0] : Number.NaN;
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
      baseSurveyRef.current?.dispose();
      baseSurveyRef.current = null;
      aladinRef.current = null;
      element.replaceChildren();
    };
  }, [viewerRetry]);

  useEffect(() => {
    if (!connection) return;
    const controller = new AbortController();
    const baseSurvey = baseSurveyRef.current;
    if (!baseSurvey) return;
    setLoading(true);
    setError(null);
    const loadSurvey = () => baseSurvey.select(surveyId, getHipsSurvey(surveyId).label);
    void loadSurvey()
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      baseSurvey.cancel();
    };
  }, [connection, surveyId, surveyRetry]);

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
              disabled={!connection}
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
            className="h-[68vh] min-h-[360px] w-full bg-black sm:min-h-[480px]"
            aria-label="Atlas céleste HiPS interactif"
          />
          {error && (
            <div className="space-y-2 border-t border-red-400/20 bg-red-950/30 p-3 text-xs text-red-200">
              <p role="alert">{error}</p>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (connection) setSurveyRetry((value) => value + 1);
                  else setViewerRetry((value) => value + 1);
                }}
              >
                Réessayer le fond scientifique
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <SkyOverlayPanel overlays={overlays} />
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
            {survey.coverage !== "all-sky" && (
              <p className="text-xs text-amber-600 dark:text-amber-200">
                Ce relevé couvre seulement certaines régions du ciel. Une zone sans image peut se
                trouver hors de son empreinte ; choisissez DSS2 pour retrouver un fond tout ciel.
              </p>
            )}
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
            <CardTitle className="text-sm">Référence externe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              Ce viewer affiche directement des surveys scientifiques publics. Il sert à comparer
              les détails et les longueurs d’onde avec la mosaïque Sky Map propriétaire.
            </p>
            <p>
              La vue tout-ciel Sky Map située au-dessus reste la carte principale : ses zones rouges
              représentent les cellules encore non couvertes et ses zones photo les tuiles publiées.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
