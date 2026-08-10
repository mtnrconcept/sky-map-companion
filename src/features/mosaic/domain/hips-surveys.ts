export interface HipsSurvey {
  id: string;
  label: string;
  waveband: string;
  maxOrder: number;
  coverage: "all-sky" | "wide" | "targeted";
  description: string;
}

export const HIPS_SURVEYS: readonly HipsSurvey[] = [
  {
    id: "CDS/P/PanSTARRS/DR1/color-i-r-g",
    label: "Pan-STARRS DR1 couleur",
    waveband: "Optique",
    maxOrder: 11,
    coverage: "wide",
    description: "Fond optique haute résolution privilégié pour M31 et le ciel nordique.",
  },
  {
    id: "CDS/P/Euclid/Q1/color",
    label: "Euclid Q1 couleur",
    waveband: "VIS + NISP",
    maxOrder: 13,
    coverage: "targeted",
    description: "Couverture Euclid Q1 très profonde sur les champs publiés.",
  },
  {
    id: "CDS/P/2MASS/color",
    label: "2MASS couleur",
    waveband: "Proche infrarouge",
    maxOrder: 9,
    coverage: "all-sky",
    description: "Vue proche infrarouge tout-ciel J/H/Ks et couverture de secours.",
  },
  {
    id: "CDS/P/allWISE/color",
    label: "AllWISE couleur",
    waveband: "Infrarouge",
    maxOrder: 8,
    coverage: "all-sky",
    description: "Vue infrarouge tout-ciel WISE pour les structures froides et poussiéreuses.",
  },
  {
    id: "CDS/P/GALEXGR6_7/color",
    label: "GALEX GR6/7 couleur",
    waveband: "Ultraviolet",
    maxOrder: 9,
    coverage: "wide",
    description: "Couverture ultraviolet GALEX pour comparer les populations stellaires jeunes.",
  },
] as const;

const DEFAULT_HIPS_SURVEY = HIPS_SURVEYS[0]!;

export const DEFAULT_HIPS_SURVEY_ID = DEFAULT_HIPS_SURVEY.id;

export function getHipsSurvey(id: string): HipsSurvey {
  return HIPS_SURVEYS.find((survey) => survey.id === id) ?? DEFAULT_HIPS_SURVEY;
}
