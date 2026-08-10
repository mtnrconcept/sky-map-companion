import { describe, expect, test } from "vitest";
import { deepSky } from "@/data/catalog";
import { dsoToSkyObject, starToSkyObject } from "./sky-objects";

describe("sky-object image aliases", () => {
  test("expands compound NGC designations into independently verifiable aliases", () => {
    const veil = deepSky.find((object) => object.id === "C34");
    expect(veil).toBeDefined();

    const object = dsoToSkyObject(veil!);

    expect(object.photoMatchTerms).toEqual(
      expect.arrayContaining(["C34", "NGC 6960", "NGC 6992"]),
    );
  });

  test("does not use a Greek Bayer designation as a media identity", () => {
    const unnamedGreekStar = starToSkyObject(1);
    expect(unnamedGreekStar).not.toBeNull();
    expect(unnamedGreekStar?.photoMatchTerms).toEqual([]);
  });

  test("uses the proper name as the stable media identity for named stars", () => {
    const alpheratz = starToSkyObject(12);
    expect(alpheratz?.name).toBe("Alpheratz");
    expect(alpheratz?.photoMatchTerms).toEqual(["Alpheratz"]);
  });
});
