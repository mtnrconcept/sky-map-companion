import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  FEDERATED_BASE_SURVEY_ID,
  getFederatedReferenceOverlays,
  getFederatedReferenceStack,
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
import { ALADIN_LITE_VERSION, loadAladinLite, type AladinInstance } from "../lib/aladin-lite";

const ALL_SKY_RA_DEG = 180;
const ALL_SKY_DEC_DEG = 0;
const ALL_SKY_FOV_DEG = 360;
const LOCAL_FOV_DEG = 120;
const DERIVED_BUCKET = "astro-derived";
const SKY_MAP_STANDARD_LAYER = "sky-map-refinement-standard";
const SKY_MAP_DEEP_LAYER = "sky-map-refinement-deep";
const REFERENCE_LAYER_PREFIX = "reference:";
const FEDERATED_REFERENCE_STACK = getFederatedReferenceStack();
const FEDERATED_REFERENCE_OVERLAYS = getFederatedReferenceOverlays();
const MAX_REFERENCE_ORDER = Math.max(
  ...FEDERATED_REFERENCE_STACK.map((survey) => survey.maxOrder),
);

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

function referenceLayerName(surveyId: string): string {
  return `${REFERENCE_LAYER_PREFIX}${surveyId}`;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
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
  const [error, setError] = useState<string | null>(null);
  const [skyWarning, setSkyWarning] = useState<string | null>(null);
  const [referenceWarning, setReferenceWarning] = useState<string | null>(null);
  const [masters, setMasters] = useState<MasterSummary[]>([]);
  const [hipsPointer, setHipsPointer] = useState<IvoaHipsPointer | null>(null);
  const [deepHipsPointer, setDeepHipsPointer] = useState<IvoaHipsPointer | null>(null);
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
  }, [skyLayerVisible, hipsPointer, deepHipsPointer]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const element = containerRef.current;
    if (!element) return;

    const initialize = async () => {
      setLoading(true);
      setError(null);
      setSkyWarning(null);
      setReferenceWarning(null);
      setHipsPointer(null);
      setDeepHipsPointer(null);

      const api = await loadAladinLite();
      if (cancelled || !containerRef.current) return;

      containerRef.current.replaceChildren();
      const aladin = api.aladin(containerRef.current, {
        survey: FEDERATED_BASE_SURVEY_ID,
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
      aladin.on("positionChanged", ({ ra, dec }) => setCenter({ ra, dec }));
      aladin.on("zoomChanged", (fov) => {
        if (Number.isFinite(fov)) setFovDeg(fov);
      });
      aladinRef.current = aladin;
      const [width] = aladin.getFov();
      if (Number.isFinite(width)) setFovDeg(width);

      const unavailableReferences: string[] = [];
      for (const survey of FEDERATED_REFERENCE_OVERLAYS) {
        if (cancelled) return;
        try {
          await Promise.resolve(
            aladin.setOverlayImageLayer(survey.id, referenceLayerName(survey.id)),
          );
        } catch (reason) {
          unavailableReferences.push(survey.label);
          console.warn("[global-mosaic] reference HiPS unavailable", survey.id, reason);
        }
      }
      if (!cancelled && unavailableReferences.length > 0) {
        setReferenceWarning(
          `Référence temporairement indisponible : ${unavailableReferences.join(", ")}. Les couches restantes continuent de fonctionner.`,
        );
      }

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
        setSkyWarning(
          `Le fond public haute définition reste disponible, mais le raffinement Sky Map n'a pas pu être chargé : ${errorMessage(reason)}`,
        );
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
      const aladin = aladinRef.current;
      aladin?.off("positionChanged");
      aladin?.off("zoomChanged");
      aladinRef.current = null;
      element.replaceChildren();
    };
  }, []);

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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="overflow-hidden border-cyan-500/20 bg-slate-950">
        <CardHeader className="border-b border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto text-sm text-white">
              Sky Map — mosaïque fédérée haute définition
            </CardTitle>
            <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
              Référence jusqu'à N{MAX_REFERENCE_ORDER}
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
              disabled={!hipsPointer}
              onClick={() => setSkyLayerVisible((visible) => !visible)}
            >
              {skyLayerVisible ? "Masquer Sky Map" : "Afficher Sky Map"}
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
          <div
            ref={containerRef}
            className="h-[72vh] min-h-[520px] w-full bg-slate-950"
            aria-label="Mosaïque céleste fédérée haute définition Sky Map"
          />
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
                <p className="font-medium">Fond · références publiques</p>
                <p className="text-xs text-muted-foreground">
                  2MASS garantit le tout-ciel. DESI, Pan-STARRS, Euclid et HST prennent
                  automatiquement le dessus là où leurs tuiles plus profondes existent.
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
                  La mosaïque standard couvre les données validées. La pyramide Deep, lorsqu'elle
                  existe, passe encore au-dessus uniquement sur les FITS à très haute résolution.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Références automatiques</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {[...FEDERATED_REFERENCE_STACK].reverse().map((survey) => (
              <div key={survey.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{survey.label}</p>
                  <p className="truncate text-muted-foreground">{survey.provider}</p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  N{survey.maxOrder}
                </Badge>
              </div>
            ))}
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
              La couche externe la plus profonde disponible remplace naturellement sa référence
              moins détaillée au fur et à mesure du zoom.
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
