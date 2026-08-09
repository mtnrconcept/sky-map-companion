import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { CelestialCell } from "../domain/types";
import type { MosaicCoverageCell } from "../domain/public-types";

export function MosaicCellPanel({
  cell,
  coverage,
}: {
  cell: CelestialCell | null;
  coverage: MosaicCoverageCell | null;
}) {
  if (!cell) {
    return (
      <p className="text-sm text-muted-foreground">
        Sélectionnez une cellule pour consulter son état.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        <p className="font-mono text-xs text-muted-foreground">HEALPix NESTED</p>
        <p className="text-lg font-semibold">
          Ordre {cell.order} · cellule {cell.index}
        </p>
      </div>
      {coverage ? (
        <>
          {coverage.tile_url && (
            <img
              src={coverage.tile_url}
              alt={`Tuile astronomique ${cell.index}`}
              className="aspect-square w-full rounded-lg border border-border object-cover"
            />
          )}
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Résolution</dt>
              <dd>{coverage.resolution_class}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Couverture utile</dt>
              <dd>{Math.round(coverage.coverage_fraction * 100)}%</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Pionnier</dt>
              <dd>{coverage.pioneer_name}</dd>
            </div>
          </dl>
          <p className="text-[11px] text-muted-foreground">
            Attribuée le {new Date(coverage.claimed_at).toLocaleDateString("fr-CH")}
          </p>
        </>
      ) : (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
          <p className="text-sm">
            Cette cellule n’a encore aucune contribution validée à ce niveau.
          </p>
          <Button asChild size="sm">
            <Link to="/astrostack">Devenir pionnier</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
