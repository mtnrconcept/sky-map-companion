import { useEffect, useMemo, useState } from "react";
import { loadCoveredCells } from "../api/mosaic-repository";
import { cellsForViewport, orderForViewport, type SkyViewport } from "../domain/viewport";
import type { MosaicCoverageCell } from "../domain/public-types";

export function useMosaicViewport(viewport: SkyViewport) {
  const order = orderForViewport(viewport.widthDeg);
  const proceduralCells = useMemo(
    () => (order ? cellsForViewport(viewport, order) : []),
    [order, viewport],
  );
  const [coveredCells, setCoveredCells] = useState<MosaicCoverageCell[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!order || proceduralCells.length === 0) {
      setCoveredCells([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    loadCoveredCells(proceduralCells, controller.signal)
      .then((cells) => {
        setCoveredCells(cells);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [order, proceduralCells]);

  return { order, proceduralCells, coveredCells, loading, error };
}
