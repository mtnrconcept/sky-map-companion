import { describe, expect, it } from "vitest";
import { resumableStorageEndpoint } from "./resumable-upload";

describe("resumableStorageEndpoint", () => {
  it("uses the direct storage hostname for hosted Supabase projects", () => {
    expect(resumableStorageEndpoint("https://olnkshywagvxzolndtsg.supabase.co")).toBe(
      "https://olnkshywagvxzolndtsg.storage.supabase.co/storage/v1/upload/resumable",
    );
  });

  it("keeps self-hosted URLs on their configured origin", () => {
    expect(resumableStorageEndpoint("http://127.0.0.1:54321/")).toBe(
      "http://127.0.0.1:54321/storage/v1/upload/resumable",
    );
  });
});
