import { describe, expect, it } from "vitest";
import {
  IVOA_HIPS_POINTER_SCHEMA,
  IVOA_HIPS_STORAGE_PREFIX,
  parseIvoaHipsPointer,
} from "./ivoa-hips";

const validPointer = {
  schema: IVOA_HIPS_POINTER_SCHEMA,
  root_path: `${IVOA_HIPS_STORAGE_PREFIX}0123456789abcdef0123-o9`,
  manifest_path: `${IVOA_HIPS_STORAGE_PREFIX}0123456789abcdef0123-o9/sky-map-manifest.json`,
  manifest_sha256: "a".repeat(64),
  inventory_sha256: "b".repeat(64),
  source_count: 26,
  hips_order: 9,
  hipsgen_version: "12.646",
  hipsgen_sha256: "c".repeat(64),
  spectral_filter: "r",
};

describe("IVOA HiPS publication pointer", () => {
  it("accepts an immutable publication under the owned storage prefix", () => {
    expect(parseIvoaHipsPointer(validPointer)).toEqual(validPointer);
  });

  it("rejects traversal outside the owned storage prefix", () => {
    expect(() =>
      parseIvoaHipsPointer({
        ...validPointer,
        root_path: `${IVOA_HIPS_STORAGE_PREFIX}../private`,
      }),
    ).toThrow("Chemin de publication");
  });

  it("rejects malformed checksums and impossible orders", () => {
    expect(() => parseIvoaHipsPointer({ ...validPointer, inventory_sha256: "bad" })).toThrow(
      "Empreinte de publication",
    );
    expect(() => parseIvoaHipsPointer({ ...validPointer, hips_order: 30 })).toThrow(
      "Ordre HiPS IVOA",
    );
  });
});
