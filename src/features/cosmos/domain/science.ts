/**
 * Conservative correlation and a provisional, static-point ray intersection.
 * Keep these operations in parity with workers/science/src/sky_worker/cosmos.py.
 *
 * None of these gates establish an object's identity or scientific confirmation.
 * A fit residual is not a positional uncertainty: calibrated angular errors and
 * a trajectory model would be needed for that (Vida et al., 2019,
 * https://arxiv.org/abs/1911.02979). No probability/confidence is invented here.
 */
export interface CosmosScienceObservation {
  id: string;
  user_id: string | null;
  phenomenon_type: string;
  observed_at: string;
  latitude: number;
  longitude: number;
  altitude_m?: number | null;
  azimuth?: number | null;
  elevation?: number | null;
  status?: string | null;
  event_id?: string | null;
}

export interface CosmosTriangulation {
  estimated_latitude: number;
  estimated_longitude: number;
  estimated_altitude_km: number;
  /** Legacy name for the RMS fit residual. Do not render as a +/- error bar. */
  error_margin_km: number;
  residual_rms_km: number;
  max_residual_km: number;
  angular_residual_deg: number;
  observation_ids: string[];
  observer_count: number;
  baseline_km: number;
  condition_number: number;
  time_span_seconds: number;
  method: "geometric";
  model: "spherical-earth-rays-v2";
  status: "estimate";
  confidence: null;
}

export const COSMOS_SCIENCE_LIMITS = {
  earthRadiusKm: 6371.0088,
  maxCorrelationMinutes: 15,
  maxCorrelationDistanceKm: 500,
  minStationBaselineKm: 1,
  minCrossingAngleDeg: 3,
  maxTimeSpanSeconds: 30,
  maxConditionNumber: 10_000,
  maxResidualKm: 25,
  maxAngularResidualDeg: 5,
  maxAltitudeKm: 50_000,
} as const;

const POINT_PHENOMENA = new Set(["meteor", "fireball", "satellite", "atmospheric", "unknown"]);
const AXES = [0, 1, 2] as const;
type Vector3 = [number, number, number];
type Matrix3 = [Vector3, Vector3, Vector3];

const radians = (value: number) => (value * Math.PI) / 180;
const degrees = (value: number) => (value * 180) / Math.PI;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));
const finiteInRange = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

function validLocation(item: Pick<CosmosScienceObservation, "latitude" | "longitude">): boolean {
  return finiteInRange(item.latitude, -90, 90) && finiteInRange(item.longitude, -180, 180);
}

function timestamp(item: CosmosScienceObservation): number {
  // A missing timezone must not change the answer with the worker's timezone.
  if (typeof item.observed_at !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(item.observed_at)) {
    return Number.NaN;
  }
  return Date.parse(item.observed_at);
}

function compareObservations(a: CosmosScienceObservation, b: CosmosScienceObservation): number {
  const elapsed = timestamp(a) - timestamp(b);
  return elapsed || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function greatCircleKm(
  a: Pick<CosmosScienceObservation, "latitude" | "longitude">,
  b: Pick<CosmosScienceObservation, "latitude" | "longitude">,
): number {
  if (!validLocation(a) || !validLocation(b)) return Number.POSITIVE_INFINITY;
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const dLat = latitudeB - latitudeA;
  const dLon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(dLon / 2) ** 2;
  return 2 * COSMOS_SCIENCE_LIMITS.earthRadiusKm * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}

/** Possible nearby reports of the same declared type, not confirmed matches. */
export function correlateObservations<T extends CosmosScienceObservation>(
  seed: T,
  candidates: readonly T[],
  options: { maxMinutes?: number; maxDistanceKm?: number } = {},
): T[] {
  const maxMinutes = options.maxMinutes ?? COSMOS_SCIENCE_LIMITS.maxCorrelationMinutes;
  const maxDistanceKm = options.maxDistanceKm ?? COSMOS_SCIENCE_LIMITS.maxCorrelationDistanceKm;
  const seedTime = timestamp(seed);
  if (
    !Number.isFinite(seedTime) ||
    !validLocation(seed) ||
    seed.status === "rejected" ||
    !finiteInRange(maxMinutes, 0, Number.MAX_VALUE) ||
    !finiteInRange(maxDistanceKm, 0, Number.MAX_VALUE)
  ) {
    return [];
  }
  const seen = new Set<string>();
  return candidates
    .filter((item) => {
      const observed = timestamp(item);
      if (
        !item.id ||
        seen.has(item.id) ||
        !Number.isFinite(observed) ||
        item.status === "rejected" ||
        item.phenomenon_type !== seed.phenomenon_type ||
        Math.abs(observed - seedTime) > maxMinutes * 60_000 ||
        greatCircleKm(seed, item) > maxDistanceKm
      ) {
        return false;
      }
      seen.add(item.id);
      return true;
    })
    .sort(compareObservations);
}

export function countIndependentObservers(
  observations: readonly CosmosScienceObservation[],
): number {
  return new Set(observations.map((item) => item.user_id).filter(Boolean)).size;
}

const dot = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vector3) => Math.hypot(...a);
const subtract = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const multiply = (matrix: Matrix3, vector: Vector3): Vector3 => [
  dot(matrix[0], vector),
  dot(matrix[1], vector),
  dot(matrix[2], vector),
];
const matrixNorm = (matrix: Matrix3) =>
  Math.max(...matrix.map((row) => Math.abs(row[0]) + Math.abs(row[1]) + Math.abs(row[2])));

function inverse(matrix: Matrix3): Matrix3 | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  const adjugate: Matrix3 = [
    [e * i - f * h, c * h - b * i, b * f - c * e],
    [f * g - d * i, a * i - c * g, c * d - a * f],
    [d * h - e * g, b * g - a * h, a * e - b * d],
  ];
  const determinant = a * adjugate[0][0] + b * adjugate[1][0] + c * adjugate[2][0];
  if (!Number.isFinite(determinant) || determinant <= 1e-12) return null;
  return adjugate.map((row) => row.map((value) => value / determinant)) as Matrix3;
}

function observerAndRay(observation: CosmosScienceObservation): {
  origin: Vector3;
  direction: Vector3;
} {
  const lat = radians(observation.latitude);
  const lon = radians(observation.longitude);
  const radius = COSMOS_SCIENCE_LIMITS.earthRadiusKm + (observation.altitude_m ?? 0) / 1000;
  const up: Vector3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const origin = up.map((value) => value * radius) as Vector3;
  const east: Vector3 = [-Math.sin(lon), Math.cos(lon), 0];
  const north: Vector3 = [
    -Math.sin(lat) * Math.cos(lon),
    -Math.sin(lat) * Math.sin(lon),
    Math.cos(lat),
  ];
  // Callers validate both bearings before constructing the ray.
  const az = radians(observation.azimuth!);
  const el = radians(observation.elevation!);
  const direction = AXES.map(
    (axis) =>
      Math.cos(el) * Math.sin(az) * east[axis] +
      Math.cos(el) * Math.cos(az) * north[axis] +
      Math.sin(el) * up[axis],
  ) as Vector3;
  const length = norm(direction);
  return { origin, direction: direction.map((value) => value / length) as Vector3 };
}

/**
 * A point estimate from distinct observers/stations, or null when unconstrained.
 * The Earth is modeled as a sphere and the target as static during the readings.
 * Wide/distant sources (aurora/comet/supernova) are intentionally not fitted.
 */
export function triangulate(
  observations: readonly CosmosScienceObservation[],
): CosmosTriangulation | null {
  const valid = observations
    .filter(
      (item) =>
        item.id &&
        item.user_id &&
        item.status !== "rejected" &&
        Number.isFinite(timestamp(item)) &&
        validLocation(item) &&
        (item.altitude_m == null || finiteInRange(item.altitude_m, -500, 10_000)) &&
        finiteInRange(item.azimuth, 0, 360) &&
        finiteInRange(item.elevation, 0, 90) &&
        POINT_PHENOMENA.has(item.phenomenon_type),
    )
    .sort(compareObservations);
  const usable: CosmosScienceObservation[] = [];
  const users = new Set<string>();
  for (const item of valid) {
    if (
      users.has(item.user_id!) ||
      usable.some(
        (station) => greatCircleKm(item, station) < COSMOS_SCIENCE_LIMITS.minStationBaselineKm,
      )
    ) {
      continue;
    }
    users.add(item.user_id!);
    usable.push(item);
  }
  if (usable.length < 2 || new Set(usable.map((item) => item.phenomenon_type)).size !== 1)
    return null;
  const timeSpan = (timestamp(usable[usable.length - 1]!) - timestamp(usable[0]!)) / 1000;
  if (timeSpan > COSMOS_SCIENCE_LIMITS.maxTimeSpanSeconds) return null;

  const rays = usable.map(observerAndRay);
  let crossingAngle = 0;
  let baseline = 0;
  for (let a = 0; a < rays.length; a++) {
    for (let b = a + 1; b < rays.length; b++) {
      const angle = degrees(
        Math.acos(clamp(Math.abs(dot(rays[a]!.direction, rays[b]!.direction)), 0, 1)),
      );
      crossingAngle = Math.max(crossingAngle, angle);
      baseline = Math.max(baseline, greatCircleKm(usable[a]!, usable[b]!));
    }
  }
  if (crossingAngle < COSMOS_SCIENCE_LIMITS.minCrossingAngleDeg) return null;

  const reference = AXES.map(
    (axis) => rays.reduce((sum, ray) => sum + ray.origin[axis], 0) / rays.length,
  ) as Vector3;
  const normal: Matrix3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const rhs: Vector3 = [0, 0, 0];
  for (const { origin, direction } of rays) {
    const delta = subtract(origin, reference);
    for (const row of AXES) {
      for (const column of AXES) {
        const projection = (row === column ? 1 : 0) - direction[row] * direction[column];
        normal[row][column] += projection;
        rhs[row] += projection * delta[column];
      }
    }
  }
  const inverted = inverse(normal);
  if (!inverted) return null;
  const condition = matrixNorm(normal) * matrixNorm(inverted);
  if (!Number.isFinite(condition) || condition > COSMOS_SCIENCE_LIMITS.maxConditionNumber)
    return null;
  const relativePoint = multiply(inverted, rhs);
  const point = AXES.map((axis) => reference[axis] + relativePoint[axis]) as Vector3;
  const radius = norm(point);
  const altitude = radius - COSMOS_SCIENCE_LIMITS.earthRadiusKm;
  if (!finiteInRange(altitude, 0, COSMOS_SCIENCE_LIMITS.maxAltitudeKm)) return null;

  const residuals: number[] = [];
  const angularResiduals: number[] = [];
  for (const { origin, direction } of rays) {
    const delta = subtract(point, origin);
    const distance = norm(delta);
    if (distance <= 0 || dot(delta, direction) <= 0) return null;
    const residual = norm(cross(delta, direction));
    const angle = degrees(Math.asin(clamp(residual / distance, 0, 1)));
    if (angle > COSMOS_SCIENCE_LIMITS.maxAngularResidualDeg) return null;
    residuals.push(residual);
    angularResiduals.push(angle);
  }
  const rms = Math.sqrt(
    residuals.reduce((sum, value) => sum + value * value, 0) / residuals.length,
  );
  if (!finiteInRange(rms, 0, COSMOS_SCIENCE_LIMITS.maxResidualKm)) return null;

  return {
    estimated_latitude: degrees(Math.asin(clamp(point[2] / radius, -1, 1))),
    estimated_longitude: degrees(Math.atan2(point[1], point[0])),
    estimated_altitude_km: altitude,
    error_margin_km: rms,
    residual_rms_km: rms,
    max_residual_km: Math.max(...residuals),
    angular_residual_deg: Math.max(...angularResiduals),
    observation_ids: usable.map((item) => item.id),
    observer_count: usable.length,
    baseline_km: baseline,
    condition_number: condition,
    time_span_seconds: timeSpan,
    method: "geometric",
    model: "spherical-earth-rays-v2",
    status: "estimate",
    confidence: null,
  };
}
