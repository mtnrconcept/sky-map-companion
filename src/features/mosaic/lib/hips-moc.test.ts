import { describe, expect, it, vi } from "vitest";
import { HIPS_SURVEYS } from "../domain/hips-surveys";
import type { AladinApi, AladinMoc } from "./aladin-lite";
import { loadSurveyMoc, mocSourcesForSurvey } from "./hips-moc";

describe("optional deep HiPS MOC resolution", () => {
  it("tries official survey-local MOCs before the CDS catalogue endpoint", () => {
    const surveyId = "CDS/P/DESI-Legacy-Surveys/DR10/color";
    const sources = mocSourcesForSurvey(surveyId);
    expect(sources).toHaveLength(3);
    expect(sources[0]).toContain("alasky.cds.unistra.fr/");
    expect(sources[0]).toMatch(/\/Moc\.fits$/);
    expect(sources[1]).toContain("alaskybis.cds.unistra.fr/");
    expect(sources[2]).toContain("/MocServer/query?ID=");
  });

  it("never accepts an arbitrary user-controlled URL as a coverage survey", () => {
    expect(() => mocSourcesForSurvey("https://untrusted.example/Moc.fits")).toThrow();
    for (const survey of HIPS_SURVEYS.filter((entry) => entry.federatedReferencePriority)) {
      expect(mocSourcesForSurvey(survey.id).length).toBeGreaterThan(0);
    }
  });

  it("retries the registered mirror when the first HiPS origin fails", async () => {
    const coverage: AladinMoc = { contains: () => true };
    const MOCFromURL = vi.fn(
      (
        url: string,
        _options: Record<string, unknown>,
        success?: () => void,
        failure?: (error: unknown) => void,
      ) => {
        if (url.includes("alaskybis")) queueMicrotask(() => success?.());
        else queueMicrotask(() => failure?.(new Error("CDS origin offline")));
        return coverage;
      },
    );
    const api = { MOCFromURL } as unknown as AladinApi;
    const moc = await loadSurveyMoc(api, "CDS/P/Euclid/Q1/color");
    expect(moc.moc).toBe(coverage);
    expect(moc.hipsUrl).toContain("alaskybis.cds.unistra.fr/Euclid");
    expect(MOCFromURL).toHaveBeenCalledTimes(2);
  });
});
