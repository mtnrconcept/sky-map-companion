import { describe, expect, it } from "vitest";
import {
  selectBestCoveredReference,
  viewportIsFullyCovered,
  type SkyCoverage,
} from "./reference-selection";

const fullCoverage: SkyCoverage = {
  contains: () => true,
};

const northernCoverage: SkyCoverage = {
  contains: (_ra, dec) => dec >= 0,
};

const tinyFieldCoverage: SkyCoverage = {
  contains: (ra, dec) => Math.abs(ra - 10) < 0.2 && Math.abs(dec - 20) < 0.2,
};

const viewport = [
  [9.9, 19.9],
  [10.1, 19.9],
  [10.1, 20.1],
  [9.9, 20.1],
] as const;

describe("federated reference selection", () => {
  it("requires the whole viewport to be covered, not just its center", () => {
    expect(
      viewportIsFullyCovered(
        northernCoverage,
        [
          [10, 1],
          [10, -1],
        ],
        [10, 0],
      ),
    ).toBe(false);
    expect(viewportIsFullyCovered(tinyFieldCoverage, viewport, [10, 20])).toBe(true);
  });

  it("selects one deepest eligible reference instead of stacking surveys", () => {
    const selected = selectBestCoveredReference(
      [
        { id: "base", priority: 10, coverage: fullCoverage },
        { id: "wide", priority: 20, coverage: northernCoverage },
        { id: "deep", priority: 30, coverage: tinyFieldCoverage },
      ],
      viewport,
      [10, 20],
    );

    expect(selected).toBe("deep");
  });

  it("falls back to the all-sky reference when a deeper survey only partially covers the viewport", () => {
    const selected = selectBestCoveredReference(
      [
        { id: "base", priority: 10, coverage: fullCoverage },
        { id: "deep", priority: 30, coverage: tinyFieldCoverage },
      ],
      [
        [9.9, 19.9],
        [10.3, 19.9],
        [10.3, 20.3],
        [9.9, 20.3],
      ],
      [10.1, 20.1],
    );

    expect(selected).toBe("base");
  });
});
