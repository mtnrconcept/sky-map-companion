import { describe, expect, it } from "vitest";
import {
  DEFAULT_HIPS_SURVEY_ID,
  FEDERATED_BASE_SURVEY_ID,
  getFederatedReferenceCandidates,
  getFederatedReferenceStack,
  getHipsSurvey,
  HIPS_SURVEYS,
  mocUrlForSurvey,
} from "./hips-surveys";

describe("HiPS survey registry", () => {
  it("keeps stable unique public survey identifiers", () => {
    const identifiers = HIPS_SURVEYS.map((survey) => survey.id);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(identifiers).toContain("CDS/P/DSS2/color");
    expect(identifiers).toContain("CDS/P/PanSTARRS/DR1/color-i-r-g");
    expect(identifiers).toContain("CDS/P/DESI-Legacy-Surveys/DR10/color");
    expect(identifiers).toContain("CDS/P/Euclid/Q1/color");
    expect(identifiers).toContain("CDS/P/HST/color");
    expect(identifiers).toContain("CDS/P/HST/PHAT/color");
    expect(identifiers).toContain("CDS/P/2MASS/color");
  });

  it("preserves the manual default while using optical DSS2 as the federated all-sky base", () => {
    expect(DEFAULT_HIPS_SURVEY_ID).toBe("CDS/P/PanSTARRS/DR1/color-i-r-g");
    expect(FEDERATED_BASE_SURVEY_ID).toBe("CDS/P/DSS2/color");
    expect(getHipsSurvey("unknown").id).toBe(DEFAULT_HIPS_SURVEY_ID);
  });

  it("orders reference candidates from safe fallback to deepest targeted surveys", () => {
    const stack = getFederatedReferenceStack();
    expect(stack[0]?.id).toBe(FEDERATED_BASE_SURVEY_ID);
    expect(stack.map((survey) => survey.id)).toEqual([
      "CDS/P/DSS2/color",
      "CDS/P/DESI-Legacy-Surveys/DR10/color",
      "CDS/P/PanSTARRS/DR1/color-i-r-g",
      "CDS/P/Euclid/Q1/color",
      "CDS/P/HST/color",
      "CDS/P/HST/PHAT/color",
    ]);
    expect(Math.max(...stack.map((survey) => survey.maxOrder))).toBe(14);
  });

  it("does not treat the all-sky base as a MOC-gated candidate", () => {
    expect(
      getFederatedReferenceCandidates().some((survey) => survey.id === FEDERATED_BASE_SURVEY_ID),
    ).toBe(false);
  });

  it("builds a CDS MocServer URL without trusting raw query fragments", () => {
    expect(mocUrlForSurvey("CDS/P/HST/PHAT/color")).toContain(
      "ID=CDS%2FP%2FHST%2FPHAT%2Fcolor&get=smoc",
    );
  });
});
