import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { GLOBAL_MOSAIC_HIPS_URL, GLOBAL_MOSAIC_MAX_ORDER } from "../domain/global-hips";
import {
  FEDERATED_BASE_SURVEY_ID,
  getFederatedReferenceCandidates,
  getFederatedReferenceStack,
  getHipsSurvey,
  mocUrlForSurvey,
} from "../domain/hips-surveys";
import {
  hipsPixelScaleArcsec,
  IVOA_HIPS_DEEP_POINTER_PATH,
  IVOA_HIPS_DEEP_STORAGE_PREFIX,
  IVOA_HIPS_POINTER_PATH,
  IVOA_HIPS_STORAGE_PREFIX,
  parseIvoaHipsPointer,
  type IvoaHipsPointer,
} from "../domain/ivoa-hips";
import {
  selectBestCoveredReference,
  type ReferenceCoverageCandidate,
  type SkyCoverage,
} from "../domain/reference-selection";
import {
  ALADIN_LITE_VERSION,
  loadAladinLite,
  type AladinApi,
  type AladinInstance,
  type AladinMoc,
} from "../lib/aladin-lite";
import { resolveHealthyDss2Mirror } from "../lib/hips-health";

const ALL_SKY_RA_DEG = 180;
const ALL_SKY_DEC_DEG = 0;
const ALL_SKY_FOV_DEG = 360;
const LOCAL_FOV_DEG = 120;
const DERIVED_BUCKET = "astro-derived";
const SKY_MAP_STANDARD_LAYER = "sky-map-refinement-standard";
const SKY_MAP_DEEP_LAYER = "sky-map-refinement-deep";
const SKY_MAP_GLOBAL_LAYER = "sky-map-global";
const FEDERATED_REFERENCE_STACK = getFederatedReferenceStack();
const FEDERATED_REFERENCE_CANDIDATES = getFederatedReferenceCandidates();
const MAX_REFERENCE_ORDER = Math.max(...FEDERATED_REFERENCE_STACK.map((survey) => survey.maxOrder));
const ALL_SKY_COVERAGE: SkyCoverage = { contains: () => true };
const DEFAULT_REFERENCE_ID = GLOBAL_MOSAIC_HIPS_URL;

function fullSkyHipsUrl(): string {
  return new URL(GLOBAL_MOSAIC_HIPS_URL, window.location.origin).href;
}

type Projection = "AIT" | "SIN";

interface MasterSummary {
  object_id: string;
  source_uploads_count: number;
}

interface PublishedSkyLayer {
  pointer: IvoaHipsPointer;
  hipsUrl: string;
}

function publicDerivativeUrl(path: string): string {
  const { data } = supabase.storage.from(DERIVED_BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;
  if (!publicUrl || !publicUrl.startsWith("https://")) {
    throw new Error("URL publique de la mosaïque indisponible");
  }
  return publicUrl;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function loadSurveyMoc(api: AladinApi, surveyId: string): Promise<AladinMoc> {
  return new Promise<AladinMoc>((resolve, reject) => {
    let settled = false;
    const settle = (failure?: unknown, moc?: AladinMoc) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (failure) reject(failure);
      else if (moc) resolve(moc);
      else reject(new Error("MOC non retourné"));
    };
    // Coverage is optional; one unreachable MOC must never block the entire viewer.
    const timer = window.setTimeout(
      () => settle(new Error(`Délai MOC dépassé pour ${surveyId}`)),
      7_000,
    );
    try {
      const moc = api.MOCFromURL(
        mocUrlForSurvey(surveyId),
        { name: `coverage:${surveyId}`, fill: false, perimeter: false, edge: false },
        () => settle(undefined, moc),
        (reason) => settle(reason),
      );
    } catch (reason) {
      settle(reason);
    }
  });
}

async function fetchPublishedSkyLayer(
  pointerPath: string,
  storagePrefix: string,
  signal: AbortSignal,
  optional: boolean,
): Promise<PublishedSkyLayer | null> {
  const response = await fetch(publicDerivativeUrl(pointerPath), {
    cache: "no-store",
    signal,
  });
  if (optional && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`publication Sky Map indisponible (${response.status})`);
  }
  const pointer = parseIvoaHipsPointer(await response.json(), storagePrefix);
  return {
    pointer,
    hipsUrl: publicDerivativeUrl(pointer.root_path).replace(/\/$/, ""),
  };
}

function setSkyLayerOpacity(aladin: AladinInstance | null, visible: boolean): void {
  const opacity = visible ? 1 : 0;
  aladin?.getOverlayImageLayer(SKY_MAP_GLOBAL_LAYER)?.setOpacity(opacity);
  aladin?.getOverlayImageLayer(SKY_MAP_STANDARD_LAYER)?.setOpacity(opacity);
  aladin?.getOverlayImageLayer(SKY_MAP_DEEP_LAYER)?.setOpacity(opacity);
}

export function GlobalMosaicObservatory() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<AladinInstance | null>(null);
  const skyLayerVisibleRef = useRef(true);
  const [center, setCenter] = useState({ ra: ALL_SKY_RA_DEG, dec: ALL_SKY_DEC_DEG });
  const [fovDeg, setFovDeg] = useState(ALL_SKY_FOV_DEG);
  const [projection, setProjection] = useState<Projection>("AIT");
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [skyWarning, setSkyWarning] = useState<string | null>(null);
  const [referenceWarning, setReferenceWarning] = useState<string | null>(null);
  const [activeReferenceId, setActiveReferenceId] = useState(DEFAULT_REFERENCE_ID);
  const [masters, setMasters] = useState<MasterSummary[]>([]);
  const [hipsPointer, setHipsPointer] = useState<IvoaHipsPointer | null>(null);
  const [deepHipsPointer, setDeepHipsPointer] = useState<IvoaHipsPointer | null>(null);
  const [globalLayerAvailable, setGlobalLayerAvailable] = useState(false);
  const [mirrorHost, setMirrorHost] = useState<string | null>(null);
  const [skyLayerVisible, setSkyLayerVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("astro_masters")
      .select("object_id,source_uploads_count")
      .eq("is_current", true)
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          console.warn("[global-mosaic] master summary unavailable", queryError.message);
          return;
        }
        setMasters((data ?? []) as MasterSummary[]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    skyLayerVisibleRef.current = skyLayerVisible;
    setSkyLayerOpacity(aladinRef.current, skyLayerVisible);
    aladinRef.current
      ?.getOverlayImageLayer(SKY_MAP_GLOBAL_LAYER)
      ?.setOpacity(skyLayerVisible && activeReferenceId === DEFAULT_REFERENCE_ID ? 1 : 0);
  }, [skyLayerVisible, hipsPointer, deepHipsPointer, activeReferenceId]);

  useEffect(() => {
    let cancelled = false;
    let referenceTimer: number | null = null;
    let activeReference = DEFAULT_REFERENCE_ID;
    const controller = new AbortController();
    const element = containerRef.current;
    if (!element) return;

    const initialize = async () => {
      setLoading(true);
      setError(null);
      setSkyWarning(null);
      setReferenceWarning(null);
      setActiveReferenceId(DEFAULT_REFERENCE_ID);
      setHipsPointer(null);
      setDeepHipsPointer(null);
      setGlobalLayerAvailable(false);
      setMirrorHost(null);

      const api = await loadAladinLite();
      if (cancelled || !containerRef.current) return;

      containerRef.current.replaceChildren();
      const aladin = api.aladin(containerRef.current, {
        survey: fullSkyHipsUrl(),
        fov: ALL_SKY_FOV_DEG,
        projection: "AIT",
        cooFrame: "ICRS",
        backgroundColor: "rgb(2, 6, 23)",
        showReticle: true,
        showCooGridControl: true,
        showCooGrid: false,
        showSimbadPointerControl: true,
        showContextMenu: true,
        showFullscreenControl: true,
      });
      aladin.gotoRaDec(ALL_SKY_RA_DEG, ALL_SKY_DEC_DEG);
      aladinRef.current = aladin;
      // Base map is now usable. The optional Sky Map and MOC requests run separately.
      if (!cancelled) setLoading(false);
      const initialFov = aladin.getFov();
      const width = Array.isArray(initialFov) ? initialFov[0] : Number.NaN;
      if (Number.isFinite(width)) setFovDeg(width);

      // Paint Sky Map immediately, then upgrade to a verified photographic
      // DSS2 background if available. A failed mirror must leave the red
      // first-party all-sky mosaic usable rather than making the canvas black.
      void resolveHealthyDss2Mirror(controller.signal)
        .then(async (mirror) => {
          if (!mirror.verified || cancelled || !skyLayerVisibleRef.current) return;
          const visibleFov = aladin.getFov();
          const visibleWidth = Array.isArray(visibleFov) ? visibleFov[0] : Number.NaN;
          if (!Number.isFinite(visibleWidth) || visibleWidth < 160) return;
          await Promise.resolve(aladin.setBaseImageLayer(mirror.url));
          if (cancelled || !skyLayerVisibleRef.current) return;
          activeReference = FEDERATED_BASE_SURVEY_ID;
          setActiveReferenceId(FEDERATED_BASE_SURVEY_ID);
          setMirrorHost(new URL(mirror.url).hostname);
          setSkyLayerVisible(false);
          aladin.getOverlayImageLayer(SKY_MAP_GLOBAL_LAYER)?.setOpacity(0);
        })
        .catch((reason: unknown) => {
          if (!cancelled && !controller.signal.aborted) {
            console.warn("[global-mosaic] photographic fallback unavailable", reason);
          }
        });

      // First-party HiPS is always requested before optional archive surveys.
      // A failed external CDS service must not leave the first canvas empty.
      const globalLayerReady = Promise.resolve()
        .then(() => aladin.setOverlayImageLayer(fullSkyHipsUrl(), SKY_MAP_GLOBAL_LAYER))
        .then(() => {
          if (cancelled) return false;
          setGlobalLayerAvailable(true);
          setSkyLayerOpacity(aladin, skyLayerVisibleRef.current);
          return true;
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            console.warn("[global-mosaic] first-party all-sky tiles unavailable", reason);
            setSkyWarning(`Mosaïque Sky Map indisponible : ${errorMessage(reason)}`);
          }
          return false;
        });

      const loadedCoverages = new Map<string, AladinMoc>();
      let coverageStarted = false;
      const requestReferenceCoverage = () => {
        if (coverageStarted || cancelled) return;
        coverageStarted = true;
        // A full-sky Aitoff view never needs MOC requests; ask only on zoom.
        void Promise.allSettled(
          FEDERATED_REFERENCE_CANDIDATES.map(async (survey) => {
            const moc = await loadSurveyMoc(api, survey.id);
            return { survey, moc };
          }),
        ).then((results) => {
          if (cancelled) return;
          const unavailableReferences: string[] = [];
          for (const [index, result] of results.entries()) {
            const survey = FEDERATED_REFERENCE_CANDIDATES[index]!;
            if (result.status === "fulfilled") {
              loadedCoverages.set(survey.id, result.value.moc);
            } else {
              unavailableReferences.push(survey.label);
              console.warn("[global-mosaic] reference MOC unavailable", survey.id, result.reason);
            }
          }
          if (unavailableReferences.length > 0) {
            setReferenceWarning(
              `Couverture indisponible pour : ${unavailableReferences.join(", ")}. Le fond Sky Map reste actif.`,
            );
          }
          scheduleReferenceRefresh();
        });
      };

      const refreshReferenceBase = async () => {
        if (cancelled) return;
        // Full-sky Aitoff projects the celestial sphere inside an ellipse. Pixels
        // at the rectangle corners can have no RA/Dec; do not ask MOCs to cover
        // those invalid coordinates, and never let an optional survey kill the map.
        let viewportPoints: ReturnType<AladinInstance["getFoVCorners"]> = [];
        let centerPoint: ReturnType<AladinInstance["getRaDec"]> = [ALL_SKY_RA_DEG, ALL_SKY_DEC_DEG];
        try {
          const fov = aladin.getFov();
          const width = Array.isArray(fov) ? fov[0] : Number.NaN;
          if (Number.isFinite(width) && width < 160) {
            viewportPoints = aladin.getFoVCorners(3, "ICRS");
            centerPoint = aladin.getRaDec();
          }
        } catch (reason) {
          console.warn("[global-mosaic] invalid viewport corners; keeping all-sky base", reason);
        }

        const candidates: ReferenceCoverageCandidate[] = [
          {
            id: DEFAULT_REFERENCE_ID,
            priority: 10,
            coverage: ALL_SKY_COVERAGE,
          },
          ...FEDERATED_REFERENCE_CANDIDATES.flatMap((survey) => {
            const coverage = loadedCoverages.get(survey.id);
            if (!coverage) return [];
            return [
              {
                id: survey.id,
                priority: survey.federatedReferencePriority ?? 0,
                coverage,
              },
            ];
          }),
        ];
        const selected =
          selectBestCoveredReference(candidates, viewportPoints, centerPoint) ??
          DEFAULT_REFERENCE_ID;
        if (selected === activeReference || !skyLayerVisibleRef.current) return;
        await Promise.resolve(
          aladin.setBaseImageLayer(selected === DEFAULT_REFERENCE_ID ? fullSkyHipsUrl() : selected),
        );
        if (cancelled) return;
        activeReference = selected;
        setActiveReferenceId(selected);
        // The red global coverage must not hide a deeper fully-covered public survey.
        aladin
          .getOverlayImageLayer(SKY_MAP_GLOBAL_LAYER)
          ?.setOpacity(selected === DEFAULT_REFERENCE_ID ? 1 : 0);
      };

      const scheduleReferenceRefresh = () => {
        if (referenceTimer !== null) window.clearTimeout(referenceTimer);
        referenceTimer = window.setTimeout(() => {
          referenceTimer = null;
          void refreshReferenceBase().catch((reason) => {
            console.warn("[global-mosaic] reference selection failed", reason);
          });
        }, 120);
      };

      aladin.on("positionChanged", ({ ra, dec }) => {
        setCenter({ ra, dec });
        scheduleReferenceRefresh();
      });
      aladin.on("zoomChanged", (fov) => {
        if (Number.isFinite(fov)) {
          setFovDeg(fov);
          if (fov < 160) requestReferenceCoverage();
        }
        scheduleReferenceRefresh();
      });
      // Automatic high-resolution reference selection is best-effort. A
      // projection/coverage problem must not abort the base HiPS canvas.
      try {
        await refreshReferenceBase();
      } catch (reason) {
        console.warn("[global-mosaic] initial survey selection unavailable", reason);
      }

      const globalLoaded = await globalLayerReady;
      if (cancelled) return;
      try {
        const standard = await fetchPublishedSkyLayer(
          IVOA_HIPS_POINTER_PATH,
          IVOA_HIPS_STORAGE_PREFIX,
          controller.signal,
          false,
        );
        if (!standard || cancelled) return;
        await Promise.resolve(
          aladin.setOverlayImageLayer(standard.hipsUrl, SKY_MAP_STANDARD_LAYER),
        );
        setHipsPointer(standard.pointer);

        try {
          const deep = await fetchPublishedSkyLayer(
            IVOA_HIPS_DEEP_POINTER_PATH,
            IVOA_HIPS_DEEP_STORAGE_PREFIX,
            controller.signal,
            true,
          );
          if (deep && !cancelled) {
            await Promise.resolve(aladin.setOverlayImageLayer(deep.hipsUrl, SKY_MAP_DEEP_LAYER));
            setDeepHipsPointer(deep.pointer);
          }
        } catch (reason) {
          if (!controller.signal.aborted && !cancelled) {
            console.warn("[global-mosaic] deep Sky Map refinement unavailable", reason);
          }
        }

        setSkyLayerOpacity(aladin, skyLayerVisibleRef.current);
        if (!cancelled) setSkyWarning(null);
      } catch (reason) {
        if (controller.signal.aborted || cancelled) return;
        console.warn("[global-mosaic] Sky Map refinement unavailable", reason);
        if (!globalLoaded) {
          setSkyWarning(`Aucune couche Sky Map publiée n'est disponible : ${errorMessage(reason)}`);
        }
      }
    };

    initialize()
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (referenceTimer !== null) window.clearTimeout(referenceTimer);
      const aladin = aladinRef.current;
      aladin?.off("positionChanged");
      aladin?.off("zoomChanged");
      aladinRef.current = null;
      element.replaceChildren();
    };
  }, [retryCount]);

  const showAllSky = () => {
    const aladin = aladinRef.current;
    if (!aladin) return;
    aladin.setProjection("AIT");
    aladin.gotoRaDec(ALL_SKY_RA_DEG, ALL_SKY_DEC_DEG);
    aladin.setFoV(ALL_SKY_FOV_DEG);
    setProjection("AIT");
  };

  const changeProjection = (nextProjection: Projection) => {
    setProjection(nextProjection);
    const aladin = aladinRef.current;
    if (!aladin) return;
    aladin.setProjection(nextProjection);
    if (nextProjection === "SIN" && fovDeg > 160) aladin.setFoV(LOCAL_FOV_DEG);
  };

  const changeSkyLayerVisibility = () => {
    const aladin = aladinRef.current;
    if (!aladin) return;
    if (!skyLayerVisible) {
      void Promise.resolve(aladin.setBaseImageLayer(fullSkyHipsUrl()))
        .then(() => {
          setSkyLayerVisible(true);
          setActiveReferenceId(DEFAULT_REFERENCE_ID);
          setMirrorHost(null);
        })
        .catch((reason: unknown) => {
          setReferenceWarning(`Impossible de rétablir le fond Sky Map : ${errorMessage(reason)}`);
        });
      return;
    }

    // An external comparison should only replace the guaranteed first-party
    // all-sky background after a real DSS2 tile has passed the health check.
    void resolveHealthyDss2Mirror()
      .then(async (mirror) => {
        if (!mirror.verified) {
          setReferenceWarning(
            "Aucun miroir DSS2 n'est disponible actuellement. Sky Map reste affiché.",
          );
          return;
        }
        await Promise.resolve(aladin.setBaseImageLayer(mirror.url));
        setMirrorHost(new URL(mirror.url).hostname);
        setSkyLayerVisible(false);
        setActiveReferenceId(FEDERATED_BASE_SURVEY_ID);
        setReferenceWarning(null);
      })
      .catch((reason: unknown) => {
        setReferenceWarning(`Comparaison DSS2 indisponible : ${errorMessage(reason)}`);
      });
  };

  const activeReference =
    activeReferenceId === DEFAULT_REFERENCE_ID
      ? {
          label: "Sky Map — couverture 360°",
          provider: "Sky Map / HiPS global",
          maxOrder: GLOBAL_MOSAIC_MAX_ORDER,
        }
      : getHipsSurvey(activeReferenceId);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden border-cyan-500/20 bg-slate-950">
        <CardHeader className="border-b border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto text-sm text-white">
              Sky Map — mosaïque fédérée haute définition
            </CardTitle>
            <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
              Fond : {activeReference.label} · N{activeReference.maxOrder}
            </Badge>
            <Badge variant="outline" className="border-violet-400/30 text-violet-200">
              Sky Map HiPS
            </Badge>
            {deepHipsPointer && (
              <Badge variant="outline" className="border-fuchsia-400/30 text-fuchsia-200">
                Deep N{deepHipsPointer.hips_order}
              </Badge>
            )}
            <Badge variant="secondary">Aladin Lite {ALADIN_LITE_VERSION}</Badge>
            {loading && (
              <span className="text-[11px] text-cyan-300" role="status" aria-live="polite">
                Chargement des couches célestes…
              </span>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={!globalLayerAvailable && !hipsPointer}
              onClick={changeSkyLayerVisibility}
            >
              {skyLayerVisible ? "Voir le ciel en photo" : "Voir la mosaïque Sky Map"}
            </Button>
            <Button size="sm" variant="secondary" onClick={showAllSky}>
              Vue tout ciel
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <label htmlFor="sky-map-projection">Projection</label>
            <select
              id="sky-map-projection"
              value={projection}
              onChange={(event) => changeProjection(event.target.value as Projection)}
              className="h-8 rounded-md border border-white/15 bg-slate-900 px-2 text-xs text-white outline-none focus:border-cyan-400"
            >
              <option value="AIT">Aitoff — tout ciel</option>
              <option value="SIN">SIN — exploration locale</option>
            </select>
            <span>
              RA {center.ra.toFixed(5)}° · Dec {center.dec.toFixed(5)}° · champ {fovDeg.toFixed(3)}°
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="relative">
            <div
              ref={containerRef}
              className="h-[72vh] min-h-[520px] w-full bg-slate-950"
              aria-label="Mosaïque céleste fédérée haute définition Sky Map"
            />
            {(loading || error) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/95 px-6 text-center">
                <p className="text-sm font-medium text-white" role={error ? "alert" : "status"}>
                  {error ? "Impossible d'afficher le ciel" : "Connexion à l'atlas céleste…"}
                </p>
                <p className="max-w-xl text-xs leading-relaxed text-slate-300">
                  {error ??
                    "Chargement du moteur Aladin Lite. Des sources de secours sont essayées si un serveur ne répond pas."}
                </p>
                {error && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRetryCount((count) => count + 1)}
                  >
                    Réessayer le chargement
                  </Button>
                )}
              </div>
            )}
          </div>
          {referenceWarning && (
            <p
              className="border-t border-amber-400/20 bg-amber-950/20 p-3 text-xs text-amber-100"
              role="status"
            >
              {referenceWarning}
            </p>
          )}
          {skyWarning && (
            <p
              className="border-t border-amber-400/20 bg-amber-950/20 p-3 text-xs text-amber-100"
              role="status"
            >
              {skyWarning}
            </p>
          )}
          {error && (
            <p
              className="border-t border-red-400/20 bg-red-950/30 p-3 text-xs text-red-200"
              role="alert"
            >
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lecture de la carte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 size-4 shrink-0 rounded-sm border border-blue-300/50 bg-gradient-to-br from-blue-100 via-indigo-500 to-slate-950"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">Fond public unique</p>
                <p className="text-xs text-muted-foreground">
                  Le HiPS Sky Map couvre les 360° du ciel : en rouge les régions non publiées, en
                  photographie les cellules validées. Les relevés publics peuvent enrichir la vue au
                  zoom.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 size-4 shrink-0 rounded-sm border border-cyan-300/60 bg-gradient-to-br from-cyan-100 via-cyan-500 to-slate-950"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">Dessus · raffinement Sky Map</p>
                <p className="text-xs text-muted-foreground">
                  Les publications Sky Map standard et Deep complètent le fond global. Les relevés
                  externes ne sont sélectionnés que lorsque leur couverture est confirmée.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Référence active</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{activeReference.label}</p>
                <p className="truncate text-muted-foreground">{activeReference.provider}</p>
                {mirrorHost && activeReferenceId === FEDERATED_BASE_SURVEY_ID && (
                  <p className="truncate text-muted-foreground">Miroir : {mirrorHost}</p>
                )}
              </div>
              <Badge variant="outline" className="shrink-0">
                N{activeReference.maxOrder}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Le sélecteur réévalue automatiquement la couverture après pan ou zoom.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">État Sky Map</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Masters actifs</p>
              <p className="text-2xl font-semibold">{masters.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sources standard</p>
              <p className="text-2xl font-semibold">{hipsPointer?.source_count ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ordre standard</p>
              <p className="font-semibold">{hipsPointer ? `N${hipsPointer.hips_order}` : "—"}</p>
              {hipsPointer && (
                <p className="text-[11px] text-muted-foreground">
                  ≈ {hipsPixelScaleArcsec(hipsPointer.hips_order).toFixed(3)}″/px
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ordre Deep</p>
              <p className="font-semibold">
                {deepHipsPointer ? `N${deepHipsPointer.hips_order}` : "en attente de sources"}
              </p>
              {deepHipsPointer && (
                <p className="text-[11px] text-muted-foreground">
                  ≈ {hipsPixelScaleArcsec(deepHipsPointer.hips_order).toFixed(3)}″/px
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Zoom progressif</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              Le fond passe à DESI, Pan-STARRS, Euclid ou HST uniquement lorsque le champ affiché
              est réellement contenu dans leur couverture MOC.
            </p>
            <p>
              Sky Map publie séparément une pyramide Deep N10–N14, calculée uniquement avec les
              sources dont la résolution astrométrique native justifie ce niveau de détail.
            </p>
            <p>
              Les données de bandes incompatibles restent des produits séparés ; leur combinaison
              visuelle n'altère jamais les FITS scientifiques sources.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
