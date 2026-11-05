export interface SkyCoverage {
  contains(ra: number, dec: number): boolean;
}

export interface ReferenceCoverageCandidate {
  id: string;
  priority: number;
  coverage: SkyCoverage;
}

export type SkyPosition = readonly [number, number];

/**
 * Aitoff's full-sky projection has pixels outside the elliptical sky.
 * Aladin may return null (or non-finite coordinates) for those corners.
 * Such positions cannot establish survey coverage.
 */
export function isFiniteSkyPosition(position: unknown): position is SkyPosition {
  return (
    Array.isArray(position) &&
    position.length === 2 &&
    typeof position[0] === "number" &&
    Number.isFinite(position[0]) &&
    typeof position[1] === "number" &&
    Number.isFinite(position[1])
  );
}

export function viewportIsFullyCovered(
  coverage: SkyCoverage,
  viewportPoints: readonly (SkyPosition | null | undefined)[],
  center: SkyPosition,
): boolean {
  if (!isFiniteSkyPosition(center) || viewportPoints.length === 0) return false;
  if (!coverage.contains(center[0], center[1])) return false;
  return viewportPoints.every(
    (position) =>
      isFiniteSkyPosition(position) && coverage.contains(position[0], position[1]),
  );
}

export function selectBestCoveredReference(
  candidates: readonly ReferenceCoverageCandidate[],
  viewportPoints: readonly (SkyPosition | null | undefined)[],
  center: SkyPosition,
): string | null {
  const eligible = candidates
    .filter((candidate) => viewportIsFullyCovered(candidate.coverage, viewportPoints, center))
    .slice()
    .sort((left, right) => right.priority - left.priority);
  return eligible[0]?.id ?? null;
}
