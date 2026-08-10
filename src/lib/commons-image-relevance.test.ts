import { describe, expect, test } from "vitest";
import {
  commonsPhotoMatchesObject,
  isAllowedCommonsAssetUrl,
} from "./commons-image-relevance";

describe("Wikimedia object image relevance", () => {
  test("accepts compact and spaced catalog identifiers", () => {
    expect(
      commonsPhotoMatchesObject("Veil Nebula - NGC6960.jpg", "Western Veil Nebula", [
        "C34",
        "NGC 6960",
      ]),
    ).toBe(true);
    expect(commonsPhotoMatchesObject("M31 Andromeda Galaxy.jpg", "", ["M31", "NGC 224"])).toBe(
      true,
    );
  });

  test("rejects an unrelated astronomical image", () => {
    expect(
      commonsPhotoMatchesObject("Orion Nebula M42.jpg", "Deep-sky photograph", [
        "NGC 6960",
        "C34",
      ]),
    ).toBe(false);
  });

  test("rejects charts and diagrams even when the identifier matches", () => {
    expect(
      commonsPhotoMatchesObject("NGC 6960 finder chart.png", "Star chart", ["NGC 6960"]),
    ).toBe(false);
  });

  test("requires official Wikimedia Commons asset origins", () => {
    expect(isAllowedCommonsAssetUrl("https://upload.wikimedia.org/example.jpg", "image")).toBe(true);
    expect(isAllowedCommonsAssetUrl("https://commons.wikimedia.org/wiki/File:Example.jpg", "page")).toBe(
      true,
    );
    expect(isAllowedCommonsAssetUrl("https://example.com/example.jpg", "image")).toBe(false);
    expect(isAllowedCommonsAssetUrl("javascript:alert(1)", "page")).toBe(false);
  });
});
