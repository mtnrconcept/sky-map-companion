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
  /**
   * Increasing order inside the automatic federated stack. Higher values are
   * rendered above lower values and therefore win where both surveys have data.
   * Undefined surveys stay available for manual spectral comparison only.
   */
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
      "Fond optique profond à large couverture, rendu au-dessus de DESI quand disponible.",
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
      "Référence optique très large qui complète Pan-STARRS, notamment hors de sa couverture utile.",
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
    description: "Couverture Euclid Q1 très profonde sur les champs publiés.",
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
      "Couverture Hubble haute résolution utilisée automatiquement lorsqu'un champ HST existe.",
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
    description: "Référence ultra-détaillée du relevé PHAT sur M31, jusqu'à l'ordre HiPS 14.",
  },
  {
    id: "CDS/P/2MASS/color",
    label: "2MASS couleur",
    provider: "CDS / 2MASS",
    waveband: "Proche infrarouge",
    maxOrder: 9,
    coverage: "all-sky",
    referenceRole: "base",
    federatedReferencePriority: 10,
    description:
      "Référence tout-ciel J/H/Ks. Elle garantit un fond visible même sans couverture optique profonde.",
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

export function getFederatedReferenceOverlays(): readonly HipsSurvey[] {
  return FEDERATED_REFERENCE_STACK.filter((survey) => survey.id !== FEDERATED_BASE_SURVEY_ID);
}
