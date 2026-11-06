import { describe, expect, it } from "vitest";
import {
  fitMapView,
  MAP_MAX_LATITUDE,
  panView,
  projectViewport,
  projectWorld,
  unprojectWorld,
  visibleTiles,
} from "./map-projection";

describe("geographic Cosmos map", () => {
  it("centres a single real location without inserting a phantom point at zero", () => {
    const view = fitMapView([{ latitude: 46.2, longitude: 6.14 }], 800, 420);
    expect(view.latitude).toBeCloseTo(46.2);
    expect(view.longitude).toBeCloseTo(6.14);
    expect(projectViewport({ latitude: 46.2, longitude: 6.14 }, view, 800, 420)).toMatchObject({
      x: 400,
    });
    expect(view.zoom).toBe(6);
  });

  it("fits points across the date line next to each other instead of spanning the whole planet", () => {
    const points = [
      { latitude: 0, longitude: 179 },
      { latitude: 0, longitude: -179 },
    ];
    const view = fitMapView(points, 800, 420);
    expect(Math.abs(view.longitude)).toBe(180);
    expect(view.zoom).toBeGreaterThan(4);
    const a = projectViewport(points[0]!, view, 800, 420);
    const b = projectViewport(points[1]!, view, 800, 420);
    expect(Math.abs(a.x - b.x)).toBeLessThan(200);
  });

  it("uses finite Mercator limits at both poles and round-trips the equator", () => {
    for (const latitude of [-90, 90]) {
      const projected = projectWorld({ latitude, longitude: 0 }, 4);
      expect(Number.isFinite(projected.y)).toBe(true);
      expect(unprojectWorld(projected.x, projected.y, 4).latitude).toBeCloseTo(
        Math.sign(latitude) * MAP_MAX_LATITUDE,
      );
    }
    const origin = projectWorld({ latitude: 0, longitude: 0 }, 2);
    expect(origin).toEqual({ x: 512, y: 512 });
    expect(unprojectWorld(origin.x, origin.y, 2)).toEqual({ latitude: 0, longitude: 0 });
  });

  it("requests only a bounded visible viewport with valid wrapped tile indexes", () => {
    for (const longitude of [-179, 0, 179]) {
      const tiles = visibleTiles({ latitude: 80, longitude, zoom: 4 }, 800, 420);
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.length).toBeLessThanOrEqual(15);
      for (const tile of tiles) {
        const url = new URL(tile.url);
        expect(url.origin).toBe("https://tile.openstreetmap.org");
        expect(url.search).toBe("");
        const [, zoom, x, y] = url.pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/) ?? [];
        expect(Number(zoom)).toBe(4);
        expect(Number(x)).toBeGreaterThanOrEqual(0);
        expect(Number(x)).toBeLessThan(16);
        expect(Number(y)).toBeGreaterThanOrEqual(0);
        expect(Number(y)).toBeLessThan(16);
      }
    }
  });

  it("pans across the date line and clamps vertically without invalid coordinates", () => {
    const view = panView({ latitude: 0, longitude: 179, zoom: 3 }, -100, 100000);
    expect(view.longitude).toBeGreaterThanOrEqual(-180);
    expect(view.longitude).toBeLessThan(180);
    expect(view.latitude).toBeCloseTo(MAP_MAX_LATITUDE);
    expect(fitMapView([], 800, 420)).toEqual({ latitude: 20, longitude: 0, zoom: 1 });
  });
});
