import type { AstroObject } from "@/hooks/useAstroStack";
import {
  buildProgress,
  qualificationProgress,
  type AstroStackPublicStatus,
} from "@/features/astrostack/domain/public-status";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  object: AstroObject;
  status: AstroStackPublicStatus | null;
  isLoadingStatus: boolean;
  statusError: string | null;
  isStatusStale: boolean;
  onRefreshStatus: () => void;
  onTriggerStack: () => void;
  isSubmittingStack: boolean;
  isPipelineActive: boolean;
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

const RUN_LABELS: Record<string, string> = {
  discovering: "Découverte des fichiers",
  downloading: "Téléchargement des archives",
  qualifying: "Qualification scientifique",
  building: "Construction de la mosaïque",
  complete: "Traitement terminé",
  failed: "Traitement interrompu",
  cancelled: "Traitement annulé",
};

function formatHours(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} h`;
}

function formatFraction(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)} %`;
}

export function AstroObjectMaster({
  object,
  status,
  isLoadingStatus,
  statusError,
  isStatusStale,
  onRefreshStatus,
  onTriggerStack,
  isSubmittingStack,
  isPipelineActive,
}: Props) {
  const qualification = status?.qualification ?? null;
  const build = status?.build ?? null;
  const master = status?.master ?? null;
  const source = status?.source ?? null;
  const isArchive = source?.kind === "public_archive";
  const qualificationPercent = qualificationProgress(qualification);
  const tilePercent = buildProgress(build);
  const sourcePercent =
    build && build.expected_sources > 0
      ? Math.min(100, Math.round((build.contributing_sources / build.expected_sources) * 100))
      : 0;
  const tileCount = status?.tiles.length ?? 0;
  const visibleTiles = status?.tiles.slice(0, 48) ?? [];
  const hasEnoughData = object.total_lights >= 3;

  const lightsOk = object.total_lights >= 50;
  const darksOk = object.total_darks >= 30;
  const flatsOk = object.total_flats >= 20;
  const biasOk = object.total_bias >= 10;
  const calibrationCompleteness = [lightsOk, darksOk, flatsOk, biasOk].filter(Boolean).length / 4;

  const summaryCards = isArchive
    ? [
        {
          label: "CUTOUTS PUBLIÉS",
          value: (qualification?.published ?? object.total_lights).toLocaleString(),
          color: "text-blue-400",
        },
        {
          label: "REJETÉS",
          value: (qualification?.rejected ?? 0).toLocaleString(),
          color: "text-amber-400",
        },
        {
          label: "TUILES WEBP",
          value: build ? `${build.published_tiles}/${build.expected_tiles}` : "—",
          color: "text-cyan-400",
        },
        {
          label: "SOURCES INTÉGRÉES",
          value: build ? `${build.contributing_sources}/${build.expected_sources}` : "—",
          color: "text-green-400",
        },
      ]
    : [
        { label: "LIGHTS", value: object.total_lights.toLocaleString(), color: "text-blue-400" },
        { label: "DARKS", value: object.total_darks.toLocaleString(), color: "text-red-400" },
        { label: "FLATS", value: object.total_flats.toLocaleString(), color: "text-yellow-400" },
        { label: "BIAS", value: object.total_bias.toLocaleString(), color: "text-purple-400" },
      ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card/50 p-4">
        <span className="shrink-0 text-3xl">{TYPE_ICONS[object.type] ?? "🔭"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{object.id}</h2>
            {object.common_name && (
              <span className="text-sm text-muted-foreground">— {object.common_name}</span>
            )}
            <Badge variant="outline" className="text-[10px]">
              {object.type.replace("_", " ")}
            </Badge>
            {isArchive && (
              <Badge variant="secondary" className="text-[10px]">
                Archive publique
                {source.spectral_band ? ` · bande ${source.spectral_band}` : ""}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            RA {object.ra_deg.toFixed(4)}° · Dec {object.dec_deg.toFixed(4)}°
            {object.magnitude !== null && ` · mag ${object.magnitude}`}
            {object.size_arcmin !== null && ` · ${object.size_arcmin}′`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summaryCards.map((item) => (
          <Card key={item.label} className="border-border bg-card/50">
            <CardContent className="p-3 text-center">
              <p className={`text-xl font-bold tabular-nums ${item.color}`}>{item.value}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="rounded-lg border border-border bg-card/30 p-3">
          <p className="text-lg font-bold">{object.total_contributors.toLocaleString()}</p>
          <p className="text-muted-foreground">contributeurs humains</p>
        </div>
        <div className="rounded-lg border border-border bg-card/30 p-3">
          <p className="text-lg font-bold">{formatHours(object.total_exposure_hours)}</p>
          <p className="text-muted-foreground">
            {isArchive ? "somme des expositions" : "de pose totale"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card/30 p-3">
          <p className="text-lg font-bold">
            {isArchive ? `${sourcePercent}%` : `${Math.round(calibrationCompleteness * 100)}%`}
          </p>
          <p className="text-muted-foreground">
            {isArchive ? "sources intégrées" : "complétude calibration"}
          </p>
          <Progress
            value={isArchive ? sourcePercent : calibrationCompleteness * 100}
            className="mt-1 h-1"
            aria-label={isArchive ? "Sources intégrées" : "Complétude de la calibration"}
          />
        </div>
      </div>

      {(isLoadingStatus || status || statusError) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">Suivi scientifique</CardTitle>
              <div className="flex items-center gap-2">
                {isStatusStale && (
                  <Badge variant="outline" className="text-[10px]">
                    Dernières données connues
                  </Badge>
                )}
                {isPipelineActive && (
                  <Badge variant="secondary" className="text-[10px]">
                    Mise à jour automatique
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pb-4" aria-live="polite">
            {isLoadingStatus && !status && (
              <p className="text-xs text-muted-foreground" role="status">
                Chargement de l’état réel du pipeline…
              </p>
            )}

            {qualification && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span>{RUN_LABELS[qualification.status] ?? qualification.status}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {qualification.published} publiés · {qualification.rejected} rejetés
                    {qualification.failed > 0 && ` · ${qualification.failed} échecs`}
                  </span>
                </div>
                <Progress
                  value={qualificationPercent}
                  aria-label="Progression de la qualification scientifique"
                />
              </div>
            )}

            {build && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span>
                    Génération {build.generation ?? "—"} · {build.status}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {build.published_tiles}/{build.expected_tiles} tuiles
                    {build.failed_tiles > 0 && ` · ${build.failed_tiles} échecs`}
                  </span>
                </div>
                <Progress
                  value={tilePercent}
                  aria-label="Progression de la génération des tuiles"
                />
              </div>
            )}

            {statusError && (
              <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
                <p className="text-xs text-destructive">{statusError}</p>
                <Button type="button" size="sm" variant="outline" onClick={onRefreshStatus}>
                  Réessayer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {master ? (
        <Card className="bg-card/50">
          <CardHeader className="pb-2 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">
                🌌 Master actuel — Génération {master.generation}
              </CardTitle>
              <div className="flex flex-wrap gap-1.5">
                {master.partial && (
                  <Badge variant="outline" className="text-[10px]">
                    Mosaïque partielle
                  </Badge>
                )}
                {master.final_snr !== null && (
                  <Badge variant="secondary" className="text-[10px]">
                    S/B mesuré {master.final_snr.toFixed(1)}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pb-4">
            {master.preview_url ? (
              <img
                src={master.preview_url}
                alt={`Aperçu du master ${object.id}, génération ${master.generation}`}
                width={master.width_px ?? 1600}
                height={master.height_px ?? 900}
                className="max-h-[32rem] w-full rounded-lg bg-muted object-contain"
                decoding="async"
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                Aperçu public indisponible pour ce master historique.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <div>
                <p className="font-semibold">{master.source_uploads_count.toLocaleString()}</p>
                <p className="text-muted-foreground">
                  {isArchive ? "cutouts intégrés" : "frames intégrées"}
                </p>
              </div>
              <div>
                <p className="font-semibold">{formatHours(master.total_exposure_hours)}</p>
                <p className="text-muted-foreground">
                  {isArchive ? "expositions cumulées" : "pose totale"}
                </p>
              </div>
              <div>
                <p className="font-semibold">{formatFraction(master.spatial_coverage_fraction)}</p>
                <p className="text-muted-foreground">couverture spatiale</p>
              </div>
              <div>
                <p className="font-semibold">
                  {master.final_fwhm === null ? "—" : `${master.final_fwhm.toFixed(2)}″`}
                </p>
                <p className="text-muted-foreground">FWHM mesurée</p>
              </div>
            </div>
            {isArchive && (
              <p className="text-[11px] text-muted-foreground">
                Ces valeurs décrivent des cutouts spatiaux adjacents de la bande
                {source?.spectral_band ? ` ${source.spectral_band}` : " d’archive"}. La somme des
                expositions ne représente pas une profondeur uniforme sur toute la mosaïque.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {master.download_url && (
                <Button asChild size="sm">
                  <a href={master.download_url} target="_blank" rel="noreferrer">
                    Télécharger le master FITS dérivé
                  </a>
                </Button>
              )}
              {source?.terms_url && (
                <Button asChild size="sm" variant="outline">
                  <a href={source.terms_url} target="_blank" rel="noreferrer">
                    Conditions de l’archive
                  </a>
                </Button>
              )}
            </div>
            {source?.acknowledgement && (
              <p className="text-[10px] text-muted-foreground">Source : {source.acknowledgement}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="mb-3 text-4xl">🌌</p>
          <p className="text-sm font-medium">
            {isPipelineActive ? "Master en construction" : "Aucun master disponible"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isPipelineActive
              ? "La qualification et les tuiles apparaissent progressivement ci-dessus."
              : hasEnoughData
                ? "Les données validées sont prêtes pour une future génération."
                : `Il faut au minimum 3 LIGHTS validées (actuellement ${object.total_lights}).`}
          </p>
        </div>
      )}

      {visibleTiles.length > 0 && (
        <Card className="bg-card/30">
          <CardHeader className="pb-2 pt-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm">Tuiles HEALPix dérivées</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {tileCount} aperçus
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {visibleTiles.map((tile) => (
                <figure key={`${tile.order}:${tile.index}`} className="min-w-0">
                  <img
                    src={tile.url}
                    alt={`Tuile HEALPix ordre ${tile.order}, index ${tile.index}`}
                    width={512}
                    height={512}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full rounded-md bg-muted object-cover"
                  />
                  <figcaption className="mt-1 truncate text-center font-mono text-[9px] text-muted-foreground">
                    O{tile.order} · {tile.index}
                  </figcaption>
                </figure>
              ))}
            </div>
            {tileCount > visibleTiles.length && (
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                {tileCount - visibleTiles.length} autres tuiles disponibles
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!isArchive && (
        <Button
          className="w-full"
          onClick={onTriggerStack}
          disabled={!hasEnoughData || isSubmittingStack || isPipelineActive}
          variant={master ? "outline" : "default"}
        >
          {isSubmittingStack
            ? "Ajout à la file…"
            : isPipelineActive
              ? "Stacking scientifique en cours…"
              : master
                ? "Recalculer le master"
                : "Lancer le stacking mondial"}
        </Button>
      )}
    </div>
  );
}
