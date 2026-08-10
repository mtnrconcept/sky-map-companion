import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface SkyMapObject {
  id: string;
  common_name: string | null;
  type: string;
  total_lights: number;
  total_exposure_hours: number;
  master_image_url: string | null;
  master_updated_at: string | null;
}

interface SkyMapMaster {
  object_id: string;
  generation: number;
  thumbnail_url: string | null;
  source_uploads_count: number;
  spatial_coverage_fraction: number | null;
  is_partial: boolean;
  output_pixel_scale_arcsec: number | null;
  created_at: string;
}

function formatCoverage(value: number | null) {
  if (value === null) return "—";
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)} %`;
}

function formatScale(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(2)}″/px`;
}

export function SkyMapMasterViewer() {
  const [objects, setObjects] = useState<SkyMapObject[]>([]);
  const [masters, setMasters] = useState<SkyMapMaster[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      supabase
        .from("astro_objects")
        .select(
          "id,common_name,type,total_lights,total_exposure_hours,master_image_url,master_updated_at",
        )
        .order("id", { ascending: true }),
      supabase
        .from("astro_masters")
        .select(
          "object_id,generation,thumbnail_url,source_uploads_count,spatial_coverage_fraction,is_partial,output_pixel_scale_arcsec,created_at",
        )
        .eq("is_current", true)
        .order("created_at", { ascending: false }),
    ])
      .then(([objectResult, masterResult]) => {
        if (cancelled) return;
        if (objectResult.error) throw objectResult.error;
        if (masterResult.error) throw masterResult.error;

        const nextObjects = (objectResult.data ?? []) as SkyMapObject[];
        const nextMasters = (masterResult.data ?? []) as SkyMapMaster[];
        setObjects(nextObjects);
        setMasters(nextMasters);

        const masterIds = new Set(nextMasters.map((master) => master.object_id));
        const preferred =
          nextObjects.find((object) => object.id === "M31" && masterIds.has(object.id)) ??
          nextObjects.find((object) => masterIds.has(object.id)) ??
          nextObjects.find((object) => object.id === "M31") ??
          nextObjects[0];
        if (preferred) setSelectedId((current) => current || preferred.id);
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
    };
  }, []);

  const masterByObject = useMemo(
    () => new Map(masters.map((master) => [master.object_id, master])),
    [masters],
  );
  const selected = objects.find((object) => object.id === selectedId) ?? null;
  const master = selected ? masterByObject.get(selected.id) ?? null : null;
  const imageUrl = master?.thumbnail_url ?? selected?.master_image_url ?? null;

  return (
    <Card className="overflow-hidden border-primary/20 bg-slate-950 text-white">
      <CardHeader className="border-b border-white/10 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="mr-auto">
            <CardTitle className="text-base">Sky Map propriétaire</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Masters réellement produits par AstroStack et publiés depuis les sources qualifiées.
            </p>
          </div>
          <Badge variant="secondary">
            {masters.length} master{masters.length > 1 ? "s" : ""} publié{masters.length > 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="sky-map-object" className="text-xs text-slate-300">
            Objet
          </label>
          <select
            id="sky-map-object"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="h-9 min-w-64 rounded-md border border-white/15 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-400"
          >
            {objects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.id}
                {object.common_name ? ` — ${object.common_name}` : ""}
                {masterByObject.has(object.id) ? " — master disponible" : " — en attente"}
              </option>
            ))}
          </select>
          {master?.is_partial && <Badge variant="outline">Couverture partielle</Badge>}
          {master && <Badge variant="outline">Génération {master.generation}</Badge>}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex min-h-[480px] items-center justify-center text-sm text-slate-400">
            Chargement des masters Sky Map…
          </div>
        ) : error ? (
          <div className="flex min-h-[480px] items-center justify-center p-6 text-sm text-red-300">
            {error}
          </div>
        ) : selected && imageUrl ? (
          <div className="grid xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="flex min-h-[480px] items-center justify-center bg-black p-2">
              <img
                src={imageUrl}
                alt={`Master Sky Map ${selected.id}${selected.common_name ? ` — ${selected.common_name}` : ""}`}
                className="max-h-[72vh] w-full object-contain"
              />
            </div>
            <div className="space-y-4 border-l border-white/10 p-4 text-sm">
              <div>
                <p className="font-semibold">
                  {selected.id}
                  {selected.common_name ? ` — ${selected.common_name}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-400">Master scientifique Sky Map actif</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-white/10 p-3">
                  <p className="text-slate-400">Sources</p>
                  <p className="mt-1 text-lg font-semibold">{master?.source_uploads_count ?? 0}</p>
                </div>
                <div className="rounded-lg border border-white/10 p-3">
                  <p className="text-slate-400">Couverture</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatCoverage(master?.spatial_coverage_fraction ?? null)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 p-3">
                  <p className="text-slate-400">Échelle</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatScale(master?.output_pixel_scale_arcsec ?? null)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 p-3">
                  <p className="text-slate-400">LIGHT</p>
                  <p className="mt-1 text-lg font-semibold">{selected.total_lights}</p>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                Cette image vient de la couche Sky Map produite et stockée par le projet. Aladin Lite
                reste disponible plus bas uniquement comme atlas de référence externe.
              </p>
            </div>
          </div>
        ) : selected ? (
          <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="text-4xl">🔭</span>
            <div>
              <p className="font-semibold">Aucun master Sky Map publié pour {selected.id}</p>
              <p className="mt-1 max-w-lg text-xs text-slate-400">
                L’ingestion catalogue horaire sélectionne progressivement les objets les moins
                récemment traités. Les premières générations peuvent rester partielles pendant que
                de nouveaux FITS sont qualifiés.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[480px] items-center justify-center text-sm text-slate-400">
            Catalogue indisponible.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
