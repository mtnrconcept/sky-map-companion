import { describe, expect, test } from "vitest";
import { canTransition } from "./job-state";

describe("pipeline transitions", () => {
  test("follows approved paths", () => {
    expect(canTransition("uploaded", "extracting")).toBe(true);
    expect(canTransition("tiling", "published")).toBe(true);
  });

  test("rejects skipped publication", () => {
    expect(canTransition("qualifying", "published")).toBe(false);
  });

  test("allows a failed stage to retry", () => {
    expect(canTransition("failed", "extracting")).toBe(true);
  });
});
