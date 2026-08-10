import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { GLOBAL_MOSAIC_HIPS_URL } from "../domain/global-hips";
import { ALADIN_LITE_VERSION, loadAladinLite, type AladinInstance } from "../lib/aladin-lite";

const ALL_SKY_RA_DEG = 180;
const ALL_SKY_DEC_DEG = 0;
const ALL_SKY_FOV_DEG = 360;
const LOCAL_FOV_DEG = 120;

type Projection = "AIT" | "SIN";

interface MasterSummary {
  object_id: string;
  source_uploads_count: number;
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

  const totalSources = useMemo(
    () => masters.reduce((sum, master) => sum + (master.source_uploads_count ?? 0), 0),
    [masters],
  );

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
    const element = containerRef.current;
    if (!element) return;

    setLoading(true);
    const globalHipsUrl = new URL(GLOBAL_MOSAIC_HIPS_URL, window.location.origin)
      .toString()
      .replace(/\/$/, "");

    loadAladinLite()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.replaceChildren();
        const aladin = api.aladin(containerRef.current, {
          survey: globalHipsUrl,
          fov: ALL_SKY_FOV_DEG,
          projection: "AIT",
          cooFrame: "ICRS",
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
                  Aucune tuile Sky Map scientifique active n’existe encore pour cette cellule.
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
                  La tuile vient d’une génération Sky Map qualifiée et actuellement publiée.
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
              <p className="text-xs text-muted-foreground">Sources qualifiées</p>
              <p className="text-2xl font-semibold">{totalSources}</p>
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
              Une zone rouge devient photographique dès qu’une génération scientifique la couvre.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
