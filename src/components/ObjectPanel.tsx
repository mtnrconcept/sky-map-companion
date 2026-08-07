import { useMemo } from "react";
import { Heart, X, Compass } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useSky } from "@/lib/sky-store";
import { findSkyObject, instrumentLabel } from "@/lib/sky-objects";
import {
  equatorialToHorizontal,
  localSiderealTime,
  riseSetTimes,
  formatTime,
  formatDegrees,
  cardinalName,
} from "@/lib/astro";
import { useFavorites } from "@/hooks/useFavorites";
import { Button } from "@/components/ui/button";
import { ObjectGallery } from "@/components/ObjectGallery";

export function ObjectPanel() {
  const { selected, select, date, location } = useSky();
  const { user, isFavorite, toggle } = useFavorites();

  const object = useMemo(
    () => (selected ? findSkyObject(selected, date) : null),
    [selected, date],
  );

  const info = useMemo(() => {
    if (!object) return null;
    const lst = localSiderealTime(date, location.longitude);
    const hz = equatorialToHorizontal(
      { ra: object.ra, dec: object.dec },
      lst,
      location.latitude,
    );
    const rs = riseSetTimes({ ra: object.ra, dec: object.dec }, date, {
      latitude: location.latitude,
      longitude: location.longitude,
    });
    return { hz, rs };
  }, [object, date, location]);

  if (!object || !info) return null;

  const visible = info.hz.alt > 0;

  return (
    <div className="glass pointer-events-auto absolute inset-x-3 bottom-3 z-20 max-h-[58vh] overflow-y-auto rounded-xl p-4 sm:inset-x-auto sm:right-3 sm:top-20 sm:bottom-auto sm:w-[340px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-caps text-primary">{object.subtitle}</p>
          <h2 className="mt-1 text-xl font-semibold leading-tight">
            {object.name}
          </h2>
        </div>
        <button
          onClick={() => select(null)}
          aria-label="Fermer"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </div>

      <div
        className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
          visible
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <Compass className="size-3.5" />
        {visible
          ? `Visible — ${formatDegrees(info.hz.alt)} au-dessus de l'horizon, vers le ${cardinalName(info.hz.az)}`
          : "Sous l'horizon en ce moment"}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
        <Row label="Magnitude" value={object.mag?.toFixed(1) ?? "—"} />
        <Row label="Constellation" value={object.constellation} />
        <Row label="Lever" value={formatTime(info.rs.rise)} />
        <Row label="Coucher" value={formatTime(info.rs.set)} />
        <Row label="Culmination" value={formatTime(info.rs.transit)} />
        <Row
          label="Hauteur max"
          value={formatDegrees(info.rs.maxAltitude)}
        />
      </dl>

      <ObjectGallery
        query={object.photoQuery}
        queries={object.photoQueries}
        name={object.name}
      />

      <p className="mt-4 rounded-lg bg-secondary/60 p-3 text-sm leading-relaxed text-foreground/85">
        {object.description}
      </p>
      <p className="label-caps mt-3 text-muted-foreground">
        Observation conseillée : {instrumentLabel(object.instrument)}
        {object.extra ? ` · ${object.extra}` : ""}
      </p>


      <div className="mt-4">
        {user ? (
          <Button
            variant={isFavorite(object.key) ? "secondary" : "default"}
            size="sm"
            className="w-full"
            onClick={() =>
              toggle.mutate(object.key, {
                onSuccess: (r) =>
                  toast.success(
                    r === "added"
                      ? "Ajouté à vos favoris"
                      : "Retiré de vos favoris",
                  ),
                onError: () => toast.error("Action impossible"),
              })
            }
          >
            <Heart
              className={`size-4 ${isFavorite(object.key) ? "fill-current" : ""}`}
            />
            {isFavorite(object.key) ? "Dans mes favoris" : "Ajouter aux favoris"}
          </Button>
        ) : (
          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link to="/auth">Se connecter pour enregistrer</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-caps text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm">{value}</dd>
    </div>
  );
}
