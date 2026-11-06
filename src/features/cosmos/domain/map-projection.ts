export const TILE_SIZE = 256;
export const MAP_MAX_LATITUDE = 85.0511287798066;
export const MAP_MAX_ZOOM = 9;
export interface GeoPoint {
  latitude: number;
  longitude: number;
}
export interface MapView extends GeoPoint {
  zoom: number;
}
export interface MapTile {
  key: string;
  url: string;
  x: number;
  y: number;
}

export function wrapLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

export function projectWorld(point: GeoPoint, zoom: number): { x: number; y: number } {
  const latitude = Math.max(-MAP_MAX_LATITUDE, Math.min(MAP_MAX_LATITUDE, point.latitude));
  const sin = Math.sin((latitude * Math.PI) / 180);
  const size = TILE_SIZE * 2 ** zoom;
  return {
    x: ((wrapLongitude(point.longitude) + 180) / 360) * size,
    y: Math.max(0, Math.min(size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size)),
  };
}

export function unprojectWorld(x: number, y: number, zoom: number): GeoPoint {
  const size = TILE_SIZE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * Math.max(0, Math.min(size, y))) / size;
  return {
    longitude: wrapLongitude((x / size) * 360 - 180),
    latitude: (Math.atan(Math.sinh(n)) * 180) / Math.PI,
  };
}

export function projectViewport(
  point: GeoPoint,
  view: MapView,
  width: number,
  height: number,
): { x: number; y: number } {
  const world = projectWorld(point, view.zoom);
  const center = projectWorld(view, view.zoom);
  const size = TILE_SIZE * 2 ** view.zoom;
  const dx = ((((world.x - center.x + size / 2) % size) + size) % size) - size / 2;
  return { x: width / 2 + dx, y: height / 2 + world.y - center.y };
}

export function panView(view: MapView, dx: number, dy: number): MapView {
  const center = projectWorld(view, view.zoom);
  return { ...unprojectWorld(center.x - dx, center.y - dy, view.zoom), zoom: view.zoom };
}

/** Only visible tiles are requested; longitude wraps while tile rows stay on Earth. */
export function visibleTiles(view: MapView, width: number, height: number): MapTile[] {
  const center = projectWorld(view, view.zoom);
  const count = 2 ** view.zoom;
  const left = center.x - width / 2;
  const top = center.y - height / 2;
  const tiles: MapTile[] = [];
  for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + width - 1) / TILE_SIZE); x++) {
    for (
      let y = Math.max(0, Math.floor(top / TILE_SIZE));
      y <= Math.min(count - 1, Math.floor((top + height - 1) / TILE_SIZE));
      y++
    ) {
      const wrappedX = ((x % count) + count) % count;
      tiles.push({
        key: view.zoom + "/" + x + "/" + y,
        url: "https://tile.openstreetmap.org/" + view.zoom + "/" + wrappedX + "/" + y + ".png",
        x: x * TILE_SIZE - left,
        y: y * TILE_SIZE - top,
      });
    }
  }
  return tiles;
}

/** Fit the shortest longitude arc, including points either side of the date line. */
export function fitMapView(points: GeoPoint[], width: number, height: number): MapView {
  const valid = points.filter(
    (point) =>
      Number.isFinite(point.latitude) &&
      Math.abs(point.latitude) <= 90 &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.longitude) <= 180,
  );
  if (!valid.length) return { latitude: 20, longitude: 0, zoom: 1 };
  const longitudes = valid.map((point) => (point.longitude + 360) % 360).sort((a, b) => a - b);
  let gap = -1;
  let start = longitudes[0] ?? 0;
  for (let index = 0; index < longitudes.length; index++) {
    const current = longitudes[index] ?? 0;
    const next =
      index + 1 < longitudes.length ? (longitudes[index + 1] ?? 0) : (longitudes[0] ?? 0) + 360;
    if (next - current > gap) {
      gap = next - current;
      start = next;
    }
  }
  const span = 360 - gap;
  const longitude = wrapLongitude(start + span / 2);
  const ys = valid.map((point) => projectWorld(point, 0).y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const horizontal = (span / 360) * TILE_SIZE;
  const vertical = maxY - minY;
  const fitScale = Math.min(
    Math.max(100, width - 100) / Math.max(horizontal, 1),
    Math.max(100, height - 100) / Math.max(vertical, 1),
  );
  const zoom = Math.max(1, Math.min(6, Math.floor(Math.log2(fitScale))));
  return { latitude: unprojectWorld(0, (minY + maxY) / 2, 0).latitude, longitude, zoom };
}
