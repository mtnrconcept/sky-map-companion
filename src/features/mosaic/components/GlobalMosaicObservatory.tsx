import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  IVOA_HIPS_POINTER_PATH,
  IVOA_HIPS_UNCOVERED_BACKGROUND,
  parseIvoaHipsPointer,
  type IvoaHipsPointer,
} from "../domain/ivoa-hips";
import { ALADIN_LITE_VERSION, loadAladinLite, type AladinInstance } from "../lib/aladin-lite";

const ALL_SKY_RA_DEG = 180;
const ALL_SKY_DEC_DEG = 0;
const ALL_SKY_FOV_DEG = 360;
const LOCAL_FOV_DEG = 120;
const DERIVED_BUCKET = "astro-derived";

type Projection = "AIT" | "SIN";

interface MasterSummary {
  object_id: string;
  source_uploads_count: number;
}

function publicDerivativeUrl(path: string): string {
  const { data } = supabase.storage.from(DERIVED_BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;
  if (!publicUrl || !publicUrl.startsWith("https://")) {
    throw new Error("URL publique de la mosaïque indisponible");
  }
  return publicUrl;
}

export function GlobalMosaicObservatory() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<AladinInstance | null>(null);
  const [center, setCenter] = useState({ ra: ALL_SKY_RA_DEG, dec: ALL_SKY_DEC_DEG });
  const [fovDeg, setFovDeg] = useState(ALL_SKY_FOV_DEG);
  const [projection, setProjection] = useState<Projection>("AIT");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [masters, setMasters] = useState<MasterSummary[]>([]);
  const [hipsPointer, setHipsPointer] = useState<IvoaHipsPointer | null>(null);

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
    let cancelled = false;
    const controller = new AbortController();
    const element = containerRef.current;
    if (!element) return;

    const initialize = async () => {
      setLoading(true);
      const pointerResponse = await fetch(publicDerivativeUrl(IVOA_HIPS_POINTER_PATH), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!pointerResponse.ok) {
        throw new Error(`Publication HiPS IVOA indisponible (${pointerResponse.status})`);
      }
      const pointer = parseIvoaHipsPointer(await pointerResponse.json());
      const hipsUrl = publicDerivativeUrl(pointer.root_path).replace(/\/$/, "");
      const api = await loadAladinLite();
      if (cancelled || !containerRef.current) return;

      containerRef.current.replaceChildren();
      const aladin = api.aladin(containerRef.current, {
        survey: hipsUrl,
        fov: ALL_SKY_FOV_DEG,
        projection: "AIT",
        cooFrame: "ICRS",
        backgroundColor: IVOA_HIPS_UNCOVERED_BACKGROUND,
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
      setHipsPointer(pointer);
      setError(null);
    };

    initialize()
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="overflow-hidden border-red-500/20 bg-slate-950">
        <CardHeader className="border-b border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto text-sm text-white">
              Sky Map — mosaïque tout-ciel
            </CardTitle>
            <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
              HiPS IVOA
            </Badge>
            <Badge variant="secondary">Aladin Lite {ALADIN_LITE_VERSION}</Badge>
            {loading && (
              <span className="text-[11px] text-cyan-300" role="status" aria-live="polite">
                Chargement de la sphère céleste…
              </span>
            )}
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
            className="h-[72vh] min-h-[520px] w-full bg-red-950"
            aria-label="Mosaïque céleste tout-ciel Sky Map"
          />
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
                className="mt-0.5 size-4 shrink-0 rounded-sm border border-red-400/60 bg-red-900"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">Rouge · non couvert</p>
                <p className="text-xs text-muted-foreground">
                  Aucune donnée HiPS scientifique active n’existe encore à cette position.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 size-4 shrink-0 rounded-sm border border-white/30 bg-gradient-to-br from-slate-200 via-slate-600 to-black"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">Photo · couvert</p>
                <p className="text-xs text-muted-foreground">
                  Les mêmes coordonnées célestes sont conservées lorsque le niveau de zoom change.
                </p>
              </div>
            </div>
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
              <p className="text-xs text-muted-foreground">Sources HiPS</p>
              <p className="text-2xl font-semibold">{hipsPointer?.source_count ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ordre maximal</p>
              <p className="font-semibold">{hipsPointer ? `N${hipsPointer.hips_order}` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Générateur</p>
              <p className="font-semibold">
                {hipsPointer ? `Hipsgen ${hipsPointer.hipsgen_version}` : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Navigation libre</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>
              Glissez dans n’importe quelle direction : la carte n’est liée à aucun catalogue
              d’objets.
            </p>
            <p>
              Molette, trackpad ou pincement pour passer du ciel entier aux cellules les plus fines.
            </p>
            <p>
              La hiérarchie HiPS native conserve la géométrie céleste lorsque les tuiles parentes
              sont remplacées par leurs enfants.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
