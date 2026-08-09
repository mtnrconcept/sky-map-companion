import type { CelestialCell } from "../domain/types";
import type { MosaicCoverageCell } from "../domain/public-types";

export async function loadCoveredCells(
  cells: CelestialCell[],
  signal?: AbortSignal,
): Promise<MosaicCoverageCell[]> {
  const chunks: CelestialCell[][] = [];
  for (let index = 0; index < cells.length; index += 1_000)
    chunks.push(cells.slice(index, index + 1_000));
  const responses = await Promise.all(
    chunks.map(async (chunk) => {
      const order = chunk[0]?.order;
      if (order === undefined) return [];
      const params = new URLSearchParams({
        order: String(order),
        indices: chunk.map((cell) => cell.index).join(","),
      });
      const response = await fetch(`/api/mosaic/cells?${params}`, signal ? { signal } : undefined);
      if (!response.ok) throw new Error("Impossible de charger les cellules couvertes.");
      return ((await response.json()) as { cells: MosaicCoverageCell[] }).cells;
    }),
  );
  return responses.flat();
}
