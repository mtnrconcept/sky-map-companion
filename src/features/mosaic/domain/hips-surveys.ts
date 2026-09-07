export type HipsCoverage = "all-sky" | "wide" | "targeted";
export type HipsReferenceRole = "base" | "wide" | "deep" | "spectral";

export interface HipsSurvey {
  id: string;
  label: string;
  provider: string;
  waveband: string;
  maxOrder: number;
  coverage: HipsCoverage;
  referenceRole: HipsReferenceRole;
  /** Higher values win only after the survey MOC covers the complete viewport. */
  federatedReferencePriority?: number;
  description: string;
}

export const HIPS_SURVEYS: readonly HipsSurvey[] = [
  {
    id: "CDS/P/PanSTARRS/DR1/color-i-r-g",
    label: "Pan-STARRS DR1 couleur",
    provider: "CDS / Pan-STARRS",
    waveband: "Optique",
    maxOrder: 11,
    coverage: "wide",
    referenceRole: "wide",
    federatedReferencePriority: 30,
    description:
      "Fond optique profond à large couverture, sélectionné seulement si son MOC couvre tout le champ.",
  },
  {
    id: "CDS/P/DESI-Legacy-Surveys/DR10/color",
    label: "DESI Legacy Surveys DR10",
    provider: "CDS / DESI Legacy Surveys",
    waveband: "Optique g/r/i/z",
    maxOrder: 11,
    coverage: "wide",
    referenceRole: "wide",
    federatedReferencePriority: 20,
    description:
      "Référence optique large utilisée lorsqu'elle couvre intégralement le viewport courant.",
  },
  {
    id: "CDS/P/Euclid/Q1/color",
    label: "Euclid Q1 couleur",
    provider: "CDS / Euclid",
    waveband: "VIS + NISP",
    maxOrder: 13,
    coverage: "targeted",
    referenceRole: "deep",
    federatedReferencePriority: 40,
    description:
      "Couverture Euclid Q1 profonde, activée uniquement à l'intérieur de son empreinte réelle.",
  },
  {
    id: "CDS/P/HST/color",
    label: "HST couleur",
    provider: "CDS / HST",
    waveband: "Optique + proche infrarouge",
    maxOrder: 13,
    coverage: "targeted",
    referenceRole: "deep",
    federatedReferencePriority: 50,
    description:
      "Couverture Hubble haute résolution, sélectionnée uniquement lorsque le champ est entièrement couvert.",
  },
  {
    id: "CDS/P/HST/PHAT/color",
    label: "HST PHAT couleur",
    provider: "CDS / HST PHAT",
    waveband: "UV + optique + proche infrarouge",
    maxOrder: 14,
    coverage: "targeted",
    referenceRole: "deep",
    federatedReferencePriority: 60,
    description:
      "Référence PHAT ultra-détaillée de M31, choisie uniquement à l'intérieur de sa couverture MOC.",
  },
  {
    id: "CDS/P/DSS2/color",
    label: "DSS2 couleur",
    provider: "CDS / DSS2",
    waveband: "Optique",
    maxOrder: 9,
    coverage: "all-sky",
    referenceRole: "base",
    federatedReferencePriority: 10,
    description:
      "Fond optique tout-ciel utilisé lorsque aucun relevé plus profond ne couvre tout le champ.",
  },
  {
    id: "CDS/P/2MASS/color",
    label: "2MASS couleur",
    provider: "CDS / 2MASS",
    waveband: "Proche infrarouge",
    maxOrder: 9,
    coverage: "all-sky",
    referenceRole: "spectral",
    description: "Vue proche infrarouge tout-ciel J/H/Ks disponible pour comparaison spectrale.",
  },
  {
    id: "CDS/P/allWISE/color",
    label: "AllWISE couleur",
    provider: "CDS / WISE",
    waveband: "Infrarouge",
    maxOrder: 8,
    coverage: "all-sky",
    referenceRole: "spectral",
    description: "Vue infrarouge tout-ciel WISE pour les structures froides et poussiéreuses.",
  },
  {
    id: "CDS/P/GALEXGR6_7/color",
    label: "GALEX GR6/7 couleur",
    provider: "CDS / GALEX",
    waveband: "Ultraviolet",
    maxOrder: 9,
    coverage: "wide",
    referenceRole: "spectral",
    description: "Couverture ultraviolet GALEX pour comparer les populations stellaires jeunes.",
  },
] as const;

const DEFAULT_HIPS_SURVEY = HIPS_SURVEYS[0]!;
const FEDERATED_REFERENCE_STACK = HIPS_SURVEYS.filter(
  (survey) => survey.federatedReferencePriority !== undefined,
)
  .slice()
  .sort(
    (left, right) =>
      (left.federatedReferencePriority ?? Number.MAX_SAFE_INTEGER) -
      (right.federatedReferencePriority ?? Number.MAX_SAFE_INTEGER),
  );

const FEDERATED_BASE_SURVEY = FEDERATED_REFERENCE_STACK.find(
  (survey) => survey.referenceRole === "base" && survey.coverage === "all-sky",
);

if (!FEDERATED_BASE_SURVEY) {
  throw new Error("The federated HiPS stack requires an all-sky base survey");
}

export const DEFAULT_HIPS_SURVEY_ID = DEFAULT_HIPS_SURVEY.id;
export const FEDERATED_BASE_SURVEY_ID = FEDERATED_BASE_SURVEY.id;

export function getHipsSurvey(id: string): HipsSurvey {
  return HIPS_SURVEYS.find((survey) => survey.id === id) ?? DEFAULT_HIPS_SURVEY;
}

export function getFederatedReferenceStack(): readonly HipsSurvey[] {
  return FEDERATED_REFERENCE_STACK;
}

export function getFederatedReferenceCandidates(): readonly HipsSurvey[] {
  return FEDERATED_REFERENCE_STACK.filter((survey) => survey.id !== FEDERATED_BASE_SURVEY_ID);
}

export function mocUrlForSurvey(surveyId: string): string {
  return `https://alasky.cds.unistra.fr/MocServer/query?ID=${encodeURIComponent(surveyId)}&get=smoc`;
}
