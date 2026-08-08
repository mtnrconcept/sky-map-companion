import { describe, expect, test } from "vitest";
import { cellBoundary, radecToCell, resolutionForPixelScale } from "./celestial-grid";

describe("celestial grid", () => {
  test("wraps right ascension at 360 degrees", () => {
    expect(radecToCell(8, 0, 10)).toEqual(radecToCell(8, 360, 10));
  });

  test("creates four child cells between adjacent orders", () => {
    const parent = radecToCell(8, 10.6847, 41.2692);
    expect(new Set(Array.from({ length: 4 }, (_, offset) => parent.index * 4 + offset)).size).toBe(
      4,
    );
  });

  test("classifies measured angular sampling", () => {
    expect(resolutionForPixelScale(12)).toBe("discovery");
    expect(resolutionForPixelScale(3)).toBe("detailed");
    expect(resolutionForPixelScale(1.5)).toBe("high-definition");
  });

  test("returns finite cell corners", () => {
    const corners = cellBoundary(radecToCell(8, 10, 41));
    expect(corners).toHaveLength(4);
    expect(
      corners.every(({ raDeg, decDeg }) => Number.isFinite(raDeg) && Number.isFinite(decDeg)),
    ).toBe(true);
  });
});
