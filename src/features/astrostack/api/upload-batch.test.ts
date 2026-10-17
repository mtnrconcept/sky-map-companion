import { describe, expect, it } from "vitest";
import { forEachWithConcurrency } from "./upload-batch";

describe("forEachWithConcurrency", () => {
  it("transfers several frames without serial waiting while keeping a concurrency cap", async () => {
    let active = 0;
    let peak = 0;
    const processed: number[] = [];

    await forEachWithConcurrency([1, 2, 3, 4, 5], 2, async (frame) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      processed.push(frame);
      active -= 1;
    });

    expect(peak).toBe(2);
    expect(active).toBe(0);
    expect(processed.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("works with an empty upload batch", async () => {
    await expect(forEachWithConcurrency([], 3, async () => undefined)).resolves.toBeUndefined();
  });

  it("rejects invalid concurrency limits", async () => {
    await expect(forEachWithConcurrency([1], 0, async () => undefined)).rejects.toThrow();
  });
});
