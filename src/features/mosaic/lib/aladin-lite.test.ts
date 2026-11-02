import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAladinLite } from "./aladin-lite";

const aladin = vi.hoisted(() => ({
  init: Promise.resolve(),
  aladin: vi.fn(),
  MOCFromURL: vi.fn(),
}));

vi.mock("aladin-lite", () => ({ default: aladin }));

afterEach(() => vi.unstubAllGlobals());

describe("loadAladinLite", () => {
  it("loads the bundled module without injecting a remote script", async () => {
    const appendChild = vi.fn();
    vi.stubGlobal("document", { head: { appendChild } });

    const api = await loadAladinLite();

    expect(api).toBe(aladin);
    expect(await loadAladinLite()).toBe(api);
    expect(appendChild).not.toHaveBeenCalled();
  });
});
