import { describe, expect, it } from "vitest";
import { DEFAULT_HIPS_SURVEY_ID, getHipsSurvey, HIPS_SURVEYS } from "./hips-surveys";

describe("HiPS survey registry", () => {
  it("keeps stable unique public survey identifiers", () => {
    const identifiers = HIPS_SURVEYS.map((survey) => survey.id);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(identifiers).toContain("CDS/P/PanSTARRS/DR1/color-i-r-g");
    expect(identifiers).toContain("CDS/P/Euclid/Q1/color");
    expect(identifiers).toContain("CDS/P/2MASS/color");
    expect(identifiers).toContain("CDS/P/allWISE/color");
  });

  it("falls back to the default survey for unknown identifiers", () => {
    expect(getHipsSurvey("unknown").id).toBe(DEFAULT_HIPS_SURVEY_ID);
  });
});
