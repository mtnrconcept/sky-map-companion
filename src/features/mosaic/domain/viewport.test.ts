import { describe, expect, test } from "vitest";
import { cellsForViewport, orderForViewport } from "./viewport";

describe("mosaic viewport", () => {
  test("reveals finer layers while zooming", () => {
    expect(orderForViewport(120)).toBeNull();
    expect(orderForViewport(60)).toBe(6);
    expect(orderForViewport(7)).toBe(9);
  });

  test("keeps a seam-crossing viewport finite and unique", () => {
    const cells = cellsForViewport(
      { centerRaDeg: 359, centerDecDeg: 0, widthDeg: 10, heightDeg: 5 },
      8,
    );
    expect(cells.length).toBeGreaterThan(0);
    expect(new Set(cells.map((cell) => cell.index)).size).toBe(cells.length);
  });
});
