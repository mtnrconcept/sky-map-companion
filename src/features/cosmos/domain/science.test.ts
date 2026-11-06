import { describe, expect, test } from "vitest";
import {
  correlateObservations,
  countIndependentObservers,
  greatCircleKm,
  triangulate,
  type CosmosScienceObservation,
} from "./science";

const NOW = "2026-11-06T20:00:00Z";
const report = (
  id = "a",
  changes: Partial<CosmosScienceObservation> = {},
): CosmosScienceObservation => ({
  id,
  user_id: `observer-${id}`,
  latitude: 46,
  longitude: 6,
  altitude_m: 400,
  phenomenon_type: "meteor",
  observed_at: NOW,
  status: "pending",
  ...changes,
});

// Synthetic forward rays through the known point (46.2, 6.5, 85 km).
// The fixed bearings also appear in the Python regression tests.
const sightLines = () => [
  report("a", { azimuth: 59.840841892510944, elevation: 61.89406483036314 }),
  report("b", { longitude: 7, azimuth: 300.1591581074891, elevation: 61.894064830363156 }),
  report("c", {
    latitude: 46.5,
    longitude: 6.2,
    azimuth: 145.27594578867829,
    elevation: 64.06818363048849,
  }),
];

describe("Cosmos candidate correlations", () => {
  test("matches time, location and declared type while excluding rejected reports", () => {
    const seed = report();
    const near = report("b", { latitude: 46.3 });
    expect(
      correlateObservations(seed, [
        near,
        report("c", { phenomenon_type: "aurora" }),
        report("d", { latitude: -30 }),
        report("e", { observed_at: "2026-11-06T19:44:00Z" }),
        report("f", { status: "rejected" }),
      ]),
    ).toEqual([near]);
  });

  test("deduplicates IDs and has deterministic ordering", () => {
    const seed = report();
    const second = report("b");
    expect(correlateObservations(seed, [second, seed, second])).toEqual([seed, second]);
    expect(correlateObservations(seed, [seed, second])).toEqual([seed, second]);
  });

  test("includes the boundary and compares absolute times across timezones", () => {
    const seed = report("a", { observed_at: "2026-11-06T21:00:00+01:00" });
    const boundary = report("b", { observed_at: "2026-11-06T19:45:00Z" });
    expect(correlateObservations(seed, [boundary])).toEqual([boundary]);
    expect(
      correlateObservations(seed, [report("c", { observed_at: "2026-11-06T20:00:00" })]),
    ).toEqual([]);
  });

  test("matches across the date line and stays finite for antipodes", () => {
    const seed = report("a", { latitude: 0, longitude: 179.5 });
    const across = report("b", { latitude: 0, longitude: -179.5 });
    expect(greatCircleKm(seed, across)).toBeCloseTo(111.1950802335329, 8);
    expect(correlateObservations(seed, [across])).toEqual([across]);
    expect(
      Number.isFinite(
        greatCircleKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }),
      ),
    ).toBe(true);
  });

  test.each<Partial<CosmosScienceObservation>>([
    { latitude: Number.NaN },
    { longitude: Number.POSITIVE_INFINITY },
    { latitude: 91 },
    { observed_at: "garbage" },
    { status: "rejected" },
  ])("ignores invalid input %o", (changes) => {
    const valid = report();
    const invalid = report("b", changes);
    expect(correlateObservations(valid, [invalid])).toEqual([]);
    expect(correlateObservations(invalid, [valid])).toEqual([]);
  });

  test("reports from one account do not count as independent witnesses", () => {
    expect(
      countIndependentObservers([
        report(),
        report("b", { user_id: "observer-a" }),
        report("c", { user_id: null }),
      ]),
    ).toBe(1);
  });
});

describe("Cosmos provisional geometric estimates", () => {
  test("recovers a known synthetic point with parity to the Python solution", () => {
    const result = triangulate(sightLines());
    expect(result).not.toBeNull();
    expect(result!.estimated_latitude).toBeCloseTo(46.2, 8);
    expect(result!.estimated_longitude).toBeCloseTo(6.5, 8);
    expect(result!.estimated_altitude_km).toBeCloseTo(85, 6);
    expect(result!.residual_rms_km).toBeLessThan(1e-8);
    expect(result!.error_margin_km).toBe(result!.residual_rms_km);
    expect(result!.condition_number).toBeCloseTo(6.147396076652111, 8);
    expect(result).toMatchObject({
      status: "estimate",
      confidence: null,
      method: "geometric",
      model: "spherical-earth-rays-v2",
      observer_count: 3,
      observation_ids: ["a", "b", "c"],
    });
    expect(result).not.toHaveProperty("estimated_speed_km_s");
  });

  test("two independent stations are sufficient for a provisional point", () => {
    const result = triangulate(sightLines().slice(0, 2));
    expect(result?.observer_count).toBe(2);
    expect(result?.estimated_altitude_km).toBeCloseTo(85, 6);
  });

  test("supports zero coordinates and sea-level stations", () => {
    const result = triangulate([
      report("a", {
        latitude: 0,
        longitude: -0.5,
        altitude_m: 0,
        azimuth: 90,
        elevation: 60.486246472913656,
      }),
      report("b", {
        latitude: 0,
        longitude: 0.5,
        altitude_m: 0,
        azimuth: 270,
        elevation: 60.486246472913656,
      }),
    ]);
    expect(result?.estimated_latitude).toBeCloseTo(0, 8);
    expect(result?.estimated_longitude).toBeCloseTo(0, 8);
    expect(result?.estimated_altitude_km).toBeCloseTo(100, 6);
  });

  test("can estimate a point across the date line", () => {
    const result = triangulate([
      report("a", {
        latitude: 0,
        longitude: 179.5,
        altitude_m: 0,
        azimuth: 90,
        elevation: 60.48624647291393,
      }),
      report("b", {
        latitude: 0,
        longitude: -179.5,
        altitude_m: 0,
        azimuth: 270,
        elevation: 60.486246472913244,
      }),
    ]);
    expect(Math.abs(result!.estimated_longitude)).toBeCloseTo(180, 8);
    expect(result?.estimated_altitude_km).toBeCloseTo(100, 6);
  });

  test("deduplicates repeated reports from the same observer", () => {
    const [first, second] = sightLines();
    expect(triangulate([first!, { ...second!, user_id: first!.user_id }])).toBeNull();
    const result = triangulate([{ ...first!, id: "z", azimuth: 0 }, second!, first!]);
    expect(result?.observation_ids).toEqual(["a", "b"]);
    expect(result?.estimated_altitude_km).toBeCloseTo(85, 6);
  });

  test("does not count colocated users as separate stations", () => {
    const first = sightLines()[0]!;
    expect(
      triangulate([first, { ...first, id: "b", user_id: "observer-b", azimuth: 90 }]),
    ).toBeNull();
  });

  test.each<Partial<CosmosScienceObservation>>([
    { user_id: null },
    { id: "" },
    { status: "rejected" },
    { azimuth: null },
    { elevation: null },
    { azimuth: Number.NaN },
    { elevation: -1 },
    { azimuth: 361 },
    { altitude_m: Number.POSITIVE_INFINITY },
    { altitude_m: -501 },
    { observed_at: "invalid" },
    { phenomenon_type: "aurora" },
  ])("does not treat an unusable second ray as a measurement: %o", (changes) => {
    const [first, second] = sightLines();
    expect(triangulate([first!, { ...second!, ...changes }])).toBeNull();
  });

  test.each(["aurora", "comet", "supernova"])(
    "does not point-triangulate %s",
    (phenomenon_type) => {
      expect(triangulate(sightLines().map((item) => ({ ...item, phenomenon_type })))).toBeNull();
    },
  );

  test("requires readings close in time", () => {
    const [first, second] = sightLines();
    expect(triangulate([first!, { ...second!, observed_at: "2026-11-06T20:00:31Z" }])).toBeNull();
  });

  test("rejects parallel lines without an artificial intersection", () => {
    expect(
      triangulate([
        report("a", { latitude: 0, longitude: -0.5, altitude_m: 0, azimuth: 90, elevation: 89.5 }),
        report("b", { latitude: 0, longitude: 0.5, altitude_m: 0, azimuth: 270, elevation: 89.5 }),
      ]),
    ).toBeNull();
  });

  test("rejects diverging lines and subterranean solutions", () => {
    expect(
      triangulate([
        report("a", {
          latitude: 0,
          longitude: -0.5,
          altitude_m: 0,
          azimuth: 270,
          elevation: 60.486246472913656,
        }),
        report("b", {
          latitude: 0,
          longitude: 0.5,
          altitude_m: 0,
          azimuth: 90,
          elevation: 60.486246472913656,
        }),
      ]),
    ).toBeNull();
  });

  test("rejects inconsistent extra rays instead of confidently averaging them", () => {
    const [first, second, third] = sightLines();
    expect(triangulate([first!, second!, { ...third!, azimuth: 0, elevation: 10 }])).toBeNull();
  });

  test("does not change the estimate when candidate order changes", () => {
    expect(triangulate(sightLines().reverse())).toEqual(triangulate(sightLines()));
  });
});
