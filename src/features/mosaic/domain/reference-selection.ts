export interface SkyCoverage {
  contains(ra: number, dec: number): boolean;
}

export interface ReferenceCoverageCandidate {
  id: string;
  priority: number;
  coverage: SkyCoverage;
}

export type SkyPosition = readonly [number, number];

export function viewportIsFullyCovered(
  coverage: SkyCoverage,
  viewportPoints: readonly SkyPosition[],
  center: SkyPosition,
): boolean {
  if (!coverage.contains(center[0], center[1])) return false;
  return viewportPoints.every(([ra, dec]) => coverage.contains(ra, dec));
}

export function selectBestCoveredReference(
  candidates: readonly ReferenceCoverageCandidate[],
  viewportPoints: readonly SkyPosition[],
  center: SkyPosition,
): string | null {
  const eligible = candidates
    .filter((candidate) => viewportIsFullyCovered(candidate.coverage, viewportPoints, center))
    .slice()
    .sort((left, right) => right.priority - left.priority);
  return eligible[0]?.id ?? null;
}
