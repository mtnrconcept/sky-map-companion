/**
 * Moteur astronomique : temps sidéral, conversions de coordonnées,
 * positions du Soleil, de la Lune et des planètes (éléments orbitaux
 * keplériens, méthode de Paul Schlyter), phases lunaires, levers/couchers.
 * Précision typique : quelques minutes d'arc — largement suffisant pour
 * pointer un instrument amateur.
 */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export interface GeoPosition {
  latitude: number;
  longitude: number;
}

export interface Equatorial {
  ra: number; // degrés
  dec: number; // degrés
}

export interface Horizontal {
  alt: number; // degrés au-dessus de l'horizon
  az: number; // degrés depuis le nord, sens horaire
}

const rev = (x: number) => ((x % 360) + 360) % 360;
const sind = (x: number) => Math.sin(x * DEG);
const cosd = (x: number) => Math.cos(x * DEG);
const tand = (x: number) => Math.tan(x * DEG);
const asind = (x: number) => Math.asin(Math.max(-1, Math.min(1, x))) * RAD;
const atan2d = (y: number, x: number) => Math.atan2(y, x) * RAD;

/** Nombre de jours depuis le 0.0 janvier 2000 (échelle de Schlyter). */
export function dayNumber(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const ut =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000;
  const t =
    367 * y -
    Math.floor((7 * (y + Math.floor((m + 9) / 12))) / 4) +
    Math.floor((275 * m) / 9) +
    d -
    730530;
  return t + ut / 24;
}

export function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Obliquité de l'écliptique en degrés. */
export function obliquity(d: number): number {
  return 23.4393 - 3.563e-7 * d;
}

/** Temps sidéral local en degrés. */
export function localSiderealTime(date: Date, longitude: number): number {
  const d = dayNumber(date);
  const w = 282.9404 + 4.70935e-5 * d;
  const M = 356.047 + 0.9856002585 * d;
  const gmst0 = rev(w + M + 180);
  const ut =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  return rev(gmst0 + ut * 15.04107 + longitude);
}

export function equatorialToHorizontal(
  eq: Equatorial,
  lst: number,
  latitude: number,
): Horizontal {
  const ha = rev(lst - eq.ra);
  const sinAlt =
    sind(eq.dec) * sind(latitude) + cosd(eq.dec) * cosd(latitude) * cosd(ha);
  const alt = asind(sinAlt);
  const az = rev(
    atan2d(
      -sind(ha) * cosd(eq.dec),
      sind(eq.dec) * cosd(latitude) - cosd(eq.dec) * sind(latitude) * cosd(ha),
    ),
  );
  return { alt, az };
}

/** Réfraction atmosphérique approchée (degrés) pour une altitude apparente. */
export function refraction(altitude: number): number {
  if (altitude < -1) return 0;
  return 0.0167 / tand(altitude + 7.31 / (altitude + 4.4));
}

function eclipticToEquatorial(
  lon: number,
  lat: number,
  r: number,
  ecl: number,
): Equatorial & { distance: number } {
  const x = r * cosd(lon) * cosd(lat);
  const y = r * sind(lon) * cosd(lat);
  const z = r * sind(lat);
  const xe = x;
  const ye = y * cosd(ecl) - z * sind(ecl);
  const ze = y * sind(ecl) + z * cosd(ecl);
  return {
    ra: rev(atan2d(ye, xe)),
    dec: asind(ze / Math.sqrt(xe * xe + ye * ye + ze * ze)),
    distance: r,
  };
}

interface Elements {
  N: number;
  i: number;
  w: number;
  a: number;
  e: number;
  M: number;
}

const PLANET_ELEMENTS: Record<string, (d: number) => Elements> = {
  mercure: (d) => ({
    N: 48.3313 + 3.24587e-5 * d,
    i: 7.0047 + 5.0e-8 * d,
    w: 29.1241 + 1.01444e-5 * d,
    a: 0.387098,
    e: 0.205635 + 5.59e-10 * d,
    M: 168.6562 + 4.0923344368 * d,
  }),
  venus: (d) => ({
    N: 76.6799 + 2.4659e-5 * d,
    i: 3.3946 + 2.75e-8 * d,
    w: 54.891 + 1.38374e-5 * d,
    a: 0.72333,
    e: 0.006773 - 1.302e-9 * d,
    M: 48.0052 + 1.6021302244 * d,
  }),
  mars: (d) => ({
    N: 49.5574 + 2.11081e-5 * d,
    i: 1.8497 - 1.78e-8 * d,
    w: 286.5016 + 2.92961e-5 * d,
    a: 1.523688,
    e: 0.093405 + 2.516e-9 * d,
    M: 18.6021 + 0.5240207766 * d,
  }),
  jupiter: (d) => ({
    N: 100.4542 + 2.76854e-5 * d,
    i: 1.303 - 1.557e-7 * d,
    w: 273.8777 + 1.64505e-5 * d,
    a: 5.20256,
    e: 0.048498 + 4.469e-9 * d,
    M: 19.895 + 0.0830853001 * d,
  }),
  saturne: (d) => ({
    N: 113.6634 + 2.3898e-5 * d,
    i: 2.4886 - 1.081e-7 * d,
    w: 339.3939 + 2.97661e-5 * d,
    a: 9.55475,
    e: 0.055546 - 9.499e-9 * d,
    M: 316.967 + 0.0334442282 * d,
  }),
  uranus: (d) => ({
    N: 74.0005 + 1.3978e-5 * d,
    i: 0.7733 + 1.9e-8 * d,
    w: 96.6612 + 3.0565e-5 * d,
    a: 19.18171 - 1.55e-8 * d,
    e: 0.047318 + 7.45e-9 * d,
    M: 142.5905 + 0.011725806 * d,
  }),
  neptune: (d) => ({
    N: 131.7806 + 3.0173e-5 * d,
    i: 1.77 - 2.55e-7 * d,
    w: 272.8461 - 6.027e-6 * d,
    a: 30.05826 + 3.313e-8 * d,
    e: 0.008606 + 2.15e-9 * d,
    M: 260.2471 + 0.005995147 * d,
  }),
};

function eccentricAnomaly(M: number, e: number): number {
  let E = M + RAD * e * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 12; k++) {
    const dE = (E - RAD * e * sind(E) - M) / (1 - e * cosd(E));
    E -= dE;
    if (Math.abs(dE) < 1e-8) break;
  }
  return E;
}

function heliocentric(el: Elements) {
  const E = eccentricAnomaly(rev(el.M), el.e);
  const xv = el.a * (cosd(E) - el.e);
  const yv = el.a * (Math.sqrt(1 - el.e * el.e) * sind(E));
  const v = atan2d(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const lon = v + el.w;
  const x =
    r * (cosd(el.N) * cosd(lon) - sind(el.N) * sind(lon) * cosd(el.i));
  const y =
    r * (sind(el.N) * cosd(lon) + cosd(el.N) * sind(lon) * cosd(el.i));
  const z = r * sind(lon) * sind(el.i);
  return { x, y, z, r };
}

export function sunPosition(date: Date): Equatorial & {
  distance: number;
  lon: number;
  x: number;
  y: number;
} {
  const d = dayNumber(date);
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = rev(356.047 + 0.9856002585 * d);
  const E = M + RAD * e * sind(M) * (1 + e * cosd(M));
  const xv = cosd(E) - e;
  const yv = Math.sqrt(1 - e * e) * sind(E);
  const v = atan2d(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const lon = rev(v + w);
  const ecl = obliquity(d);
  const eq = eclipticToEquatorial(lon, 0, r, ecl);
  return {
    ...eq,
    lon,
    x: r * cosd(lon),
    y: r * sind(lon),
  };
}

export function moonPosition(date: Date): Equatorial & {
  distance: number;
  phase: number; // 0 = nouvelle lune, 0.5 = pleine lune
  illumination: number; // 0 → 1
} {
  const d = dayNumber(date);
  const N = rev(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = rev(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.0549;
  const M = rev(115.3654 + 13.0649929509 * d);
  const { x, y, z } = heliocentric({ N, i, w, a, e, M });
  let lon = rev(atan2d(y, x));
  let lat = asind(z / Math.sqrt(x * x + y * y + z * z));
  let r = Math.sqrt(x * x + y * y + z * z);

  // Perturbations principales
  const sun = sunPosition(date);
  const Ms = rev(356.047 + 0.9856002585 * d);
  const Ls = rev(sun.lon);
  const Lm = rev(N + w + M);
  const D = rev(Lm - Ls);
  const F = rev(Lm - N);

  lon +=
    -1.274 * sind(M - 2 * D) +
    0.658 * sind(2 * D) -
    0.186 * sind(Ms) -
    0.059 * sind(2 * M - 2 * D) -
    0.057 * sind(M - 2 * D + Ms) +
    0.053 * sind(M + 2 * D) +
    0.046 * sind(2 * D - Ms) +
    0.041 * sind(M - Ms) -
    0.035 * sind(D) -
    0.031 * sind(M + Ms) -
    0.015 * sind(2 * F - 2 * D) +
    0.011 * sind(M - 4 * D);
  lat +=
    -0.173 * sind(F - 2 * D) -
    0.055 * sind(M - F - 2 * D) -
    0.046 * sind(M + F - 2 * D) +
    0.033 * sind(F + 2 * D) +
    0.017 * sind(2 * M + F);
  r += -0.58 * cosd(M - 2 * D) - 0.46 * cosd(2 * D);

  const ecl = obliquity(d);
  const eq = eclipticToEquatorial(rev(lon), lat, r, ecl);
  const elong = rev(lon - Ls);
  const phaseAngle = 180 - elong;
  const illumination = (1 + cosd(phaseAngle)) / 2;
  return {
    ra: eq.ra,
    dec: eq.dec,
    distance: r * 6371, // km approx (rayons terrestres → km)
    phase: rev(elong) / 360,
    illumination,
  };
}

export function planetPosition(
  name: keyof typeof PLANET_ELEMENTS,
  date: Date,
): Equatorial & { distance: number; magnitude: number } {
  const d = dayNumber(date);
  const el = PLANET_ELEMENTS[name]!(d);
  const p = heliocentric({ ...el, M: rev(el.M) });
  const sun = sunPosition(date);
  const x = p.x + sun.x;
  const y = p.y + sun.y;
  const z = p.z;
  const r = Math.sqrt(x * x + y * y + z * z);
  const lon = rev(atan2d(y, x));
  const lat = asind(z / r);
  const ecl = obliquity(d);
  const eq = eclipticToEquatorial(lon, lat, r, ecl);
  return {
    ra: eq.ra,
    dec: eq.dec,
    distance: r,
    magnitude: approxMagnitude(name, p.r, r, sun.distance),
  };
}

function approxMagnitude(
  name: string,
  helioDist: number,
  geoDist: number,
  sunDist: number,
): number {
  const base: Record<string, number> = {
    mercure: -0.36,
    venus: -4.34,
    mars: -1.51,
    jupiter: -9.25,
    saturne: -9.0,
    uranus: -7.15,
    neptune: -6.9,
  };
  const cosPhase =
    (helioDist * helioDist + geoDist * geoDist - sunDist * sunDist) /
    (2 * helioDist * geoDist);
  const phaseAngle = Math.acos(Math.max(-1, Math.min(1, cosPhase))) * RAD;
  return (
    (base[name] ?? 0) +
    5 * Math.log10(helioDist * geoDist) +
    0.013 * phaseAngle
  );
}

export const PLANET_NAMES = [
  "mercure",
  "venus",
  "mars",
  "jupiter",
  "saturne",
  "uranus",
  "neptune",
] as const;

export type PlanetName = (typeof PLANET_NAMES)[number];

/** Altitude d'un objet fixe à un instant donné. */
export function altitudeAt(
  eq: Equatorial,
  date: Date,
  pos: GeoPosition,
): number {
  const lst = localSiderealTime(date, pos.longitude);
  return equatorialToHorizontal(eq, lst, pos.latitude).alt;
}

export interface RiseSet {
  rise: Date | null;
  set: Date | null;
  transit: Date | null;
  maxAltitude: number;
  alwaysUp: boolean;
  neverUp: boolean;
}

/**
 * Lever / coucher / passage au méridien par échantillonnage sur 24 h
 * autour de la date fournie.
 */
export function riseSetTimes(
  eq: Equatorial | ((d: Date) => Equatorial),
  date: Date,
  pos: GeoPosition,
  horizon = -0.583,
): RiseSet {
  const at = (d: Date) => (typeof eq === "function" ? eq(d) : eq);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const stepMin = 5;
  let prevAlt = altitudeAt(at(start), start, pos);
  let rise: Date | null = null;
  let set: Date | null = null;
  let transit: Date | null = null;
  let maxAltitude = prevAlt;
  let minAltitude = prevAlt;

  for (let m = stepMin; m <= 24 * 60; m += stepMin) {
    const t = new Date(start.getTime() + m * 60000);
    const alt = altitudeAt(at(t), t, pos);
    if (alt > maxAltitude) {
      maxAltitude = alt;
      transit = t;
    }
    if (alt < minAltitude) minAltitude = alt;
    if (prevAlt < horizon && alt >= horizon && !rise) {
      rise = interpolate(start, m - stepMin, m, prevAlt, alt, horizon, at, pos);
    }
    if (prevAlt >= horizon && alt < horizon && !set) {
      set = interpolate(start, m - stepMin, m, prevAlt, alt, horizon, at, pos);
    }
    prevAlt = alt;
  }

  return {
    rise,
    set,
    transit,
    maxAltitude,
    alwaysUp: minAltitude > horizon,
    neverUp: maxAltitude < horizon,
  };
}

function interpolate(
  start: Date,
  m0: number,
  m1: number,
  a0: number,
  a1: number,
  horizon: number,
  at: (d: Date) => Equatorial,
  pos: GeoPosition,
): Date {
  let lo = m0;
  let hi = m1;
  let loAlt = a0;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    const t = new Date(start.getTime() + mid * 60000);
    const alt = altitudeAt(at(t), t, pos);
    if ((loAlt < horizon) === (alt < horizon)) {
      lo = mid;
      loAlt = alt;
    } else {
      hi = mid;
    }
  }
  return new Date(start.getTime() + ((lo + hi) / 2) * 60000);
}

export interface TwilightInfo {
  sunset: Date | null;
  sunrise: Date | null;
  nauticalDusk: Date | null;
  astronomicalDusk: Date | null;
  astronomicalDawn: Date | null;
}

export function twilight(date: Date, pos: GeoPosition): TwilightInfo {
  const sunEq = (d: Date) => {
    const s = sunPosition(d);
    return { ra: s.ra, dec: s.dec };
  };
  const day = riseSetTimes(sunEq, date, pos, -0.833);
  const nautical = riseSetTimes(sunEq, date, pos, -12);
  const astro = riseSetTimes(sunEq, date, pos, -18);
  return {
    sunset: day.set,
    sunrise: day.rise,
    nauticalDusk: nautical.set,
    astronomicalDusk: astro.set,
    astronomicalDawn: astro.rise,
  };
}

export function moonPhaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return "Nouvelle lune";
  if (p < 0.22) return "Premier croissant";
  if (p < 0.28) return "Premier quartier";
  if (p < 0.47) return "Gibbeuse croissante";
  if (p < 0.53) return "Pleine lune";
  if (p < 0.72) return "Gibbeuse décroissante";
  if (p < 0.78) return "Dernier quartier";
  return "Dernier croissant";
}

export function formatTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDegrees(v: number): string {
  return `${v >= 0 ? "" : "−"}${Math.abs(v).toFixed(1)}°`;
}

export function cardinalName(az: number): string {
  const names = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSO",
    "SO",
    "OSO",
    "O",
    "ONO",
    "NO",
    "NNO",
  ];
  return names[Math.round(rev(az) / 22.5) % 16]!;
}
