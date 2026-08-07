import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// ——————————————————————————————————————————
// Types
// ——————————————————————————————————————————

export interface FrameMetadata {
  telescope?: string;
  camera?: string;
  focal_length_mm?: number;
  aperture_mm?: number;
  focal_ratio?: number;
  pixel_size_um?: number;
  sensor_width_px?: number;
  sensor_height_px?: number;
  exposure_s?: number;
  gain?: number;
  offset_int?: number;
  temperature_c?: number;
  filter_name?: string;
  binning?: number;
  latitude?: number;
  longitude?: number;
  captured_at?: string;
  // FITS header raw (optionnel)
  fits_headers?: Record<string, string | number>;
}

export interface QualityAnalysis {
  quality_score: number;       // 0–1
  fwhm?: number;               // arcsec
  eccentricity?: number;       // 0–1
  snr?: number;
  background_gradient?: number; // 0–1 (0 = flat)
  star_count?: number;
  rejected: boolean;
  rejection_reason?: string;
  instrument_group: string;    // hash de compatibilité
  notes: string[];
  recommendations: string[];
  ai_analysis: Record<string, unknown>;
}

export interface StackingCompatibility {
  compatible: boolean;
  reason?: string;
  instrument_group: string;
  normalization_params: {
    scale_factor: number;
    zero_point: number;
    rotation_deg: number;
  };
}

export interface PipelineStep {
  name: string;
  status: "pending" | "running" | "done" | "skipped" | "failed";
  result?: string;
  duration_ms?: number;
}

// ——————————————————————————————————————————
// Helpers
// ——————————————————————————————————————————

function getProvider() {
  const apiKey =
    process.env["LOVABLE_API_KEY"] ?? process.env["VITE_LOVABLE_API_KEY"] ?? "";
  return createLovableAiGatewayProvider(apiKey);
}

/**
 * Génère un identifiant de groupe instrument basé sur les paramètres optiques.
 * Des frames compatibles auront le même group — utile pour le stacking cohérent.
 */
export function computeInstrumentGroup(meta: FrameMetadata): string {
  const fl = meta.focal_length_mm ? Math.round(meta.focal_length_mm / 50) * 50 : 0;
  const px = meta.pixel_size_um ? Math.round(meta.pixel_size_um * 10) : 0;
  const bin = meta.binning ?? 1;
  const cam = (meta.camera ?? "unknown").toLowerCase().replace(/\s+/g, "_").slice(0, 20);
  return `fl${fl}_px${px}_bin${bin}_${cam}`;
}

/**
 * Estimation de la qualité basée sur les métadonnées (sans vraie analyse d'image).
 * Un vrai pipeline utiliserait FITS + traitement d'image serveur.
 */
export function estimateQualityFromMeta(meta: FrameMetadata): Partial<QualityAnalysis> {
  const notes: string[] = [];
  const recommendations: string[] = [];
  let score = 0.7; // score de base

  // Exposures très courtes ou très longues
  if (meta.exposure_s !== undefined) {
    if (meta.exposure_s < 10) { score -= 0.15; notes.push("Exposition très courte (<10s)"); }
    else if (meta.exposure_s > 600) { notes.push("Longue exposition (>600s) — risque de guidage"); }
    else score += 0.05;
  }

  // Temperature calibration des darks
  if (meta.temperature_c !== undefined && meta.temperature_c > 10) {
    notes.push("Température capteur élevée — bruit thermique accru");
    score -= 0.1;
  }

  // Binning élevé = moins de résolution
  if ((meta.binning ?? 1) > 2) {
    notes.push("Binning élevé — résolution réduite");
    score -= 0.05;
    recommendations.push("Préférez bin 1x1 ou 2x2 pour les objets petits");
  }

  // Filtre
  if (meta.filter_name) {
    if (["Ha", "OIII", "SII", "Hbeta"].includes(meta.filter_name)) {
      score += 0.05;
      notes.push(`Filtre narrowband ${meta.filter_name} — excellente rejection de pollution lumineuse`);
    }
  } else {
    recommendations.push("Préciser le filtre utilisé améliore le matching de compatibilité");
  }

  return {
    quality_score: Math.max(0.1, Math.min(0.99, score)),
    instrument_group: computeInstrumentGroup(meta),
    notes,
    recommendations,
    rejected: false,
  };
}

// ——————————————————————————————————————————
// Analyse IA d'une frame via description/metadata
// ——————————————————————————————————————————

export async function analyzeFrameWithAI(
  objectId: string,
  frameType: string,
  meta: FrameMetadata,
  filename: string
): Promise<QualityAnalysis> {
  try {
    const provider = getProvider();

    const metaSummary = [
      `Objet: ${objectId}`,
      `Type: ${frameType}`,
      `Fichier: ${filename}`,
      meta.telescope ? `Télescope: ${meta.telescope}` : null,
      meta.camera ? `Caméra: ${meta.camera}` : null,
      meta.focal_length_mm ? `Focale: ${meta.focal_length_mm}mm` : null,
      meta.aperture_mm ? `Ouverture: f/${(meta.focal_length_mm! / meta.aperture_mm).toFixed(1)}` : null,
      meta.exposure_s ? `Pose: ${meta.exposure_s}s` : null,
      meta.gain !== undefined ? `Gain: ${meta.gain}` : null,
      meta.temperature_c !== undefined ? `Temp: ${meta.temperature_c}°C` : null,
      meta.filter_name ? `Filtre: ${meta.filter_name}` : null,
      meta.binning ? `Binning: ${meta.binning}x${meta.binning}` : null,
      meta.latitude ? `Lieu: ${meta.latitude.toFixed(2)}°, ${meta.longitude?.toFixed(2)}°` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const { text: raw } = await generateText({
      model: provider("gpt-4o"),
      messages: [
        {
          role: "system",
          content: `Tu es un expert en astrophotographie et traitement d'images astronomiques.
Analyse les métadonnées d'une frame astrophotographique et donne une évaluation de sa qualité potentielle pour un stacking collaboratif mondial.
Réponds UNIQUEMENT en JSON valide sans markdown:
{
  "quality_score": 0.0-1.0,
  "fwhm_estimate": nombre_ou_null,
  "snr_estimate": nombre_ou_null,
  "rejected": false,
  "rejection_reason": "raison ou null",
  "compatibility_notes": ["note1", "note2"],
  "improvement_recommendations": ["conseil1"],
  "stacking_value": "description courte de la valeur pour le master mondial",
  "instrument_tier": "amateur_entry|amateur_mid|amateur_advanced|professional"
}`,
        },
        {
          role: "user",
          content: `Évalue cette frame :\n\n${metaSummary}`,
        },
      ],
    });

    const parsed = JSON.parse(raw.trim());
    const baseMeta = estimateQualityFromMeta(meta);

    return {
      quality_score: parsed.quality_score ?? baseMeta.quality_score ?? 0.5,
      fwhm: parsed.fwhm_estimate ?? undefined,
      snr: parsed.snr_estimate ?? undefined,
      rejected: parsed.rejected ?? false,
      rejection_reason: parsed.rejection_reason ?? undefined,
      instrument_group: computeInstrumentGroup(meta),
      notes: [
        ...(baseMeta.notes ?? []),
        ...(parsed.compatibility_notes ?? []),
      ],
      recommendations: [
        ...(baseMeta.recommendations ?? []),
        ...(parsed.improvement_recommendations ?? []),
      ],
      ai_analysis: parsed,
    };
  } catch {
    // Fallback sans IA
    const base = estimateQualityFromMeta(meta);
    return {
      quality_score: base.quality_score ?? 0.5,
      rejected: false,
      instrument_group: computeInstrumentGroup(meta),
      notes: base.notes ?? [],
      recommendations: base.recommendations ?? [],
      ai_analysis: { fallback: true },
    };
  }
}

// ——————————————————————————————————————————
// Simulateur du pipeline de stacking mondial
// (dans un vrai système, ce serait un job async lourd)
// ——————————————————————————————————————————

export async function simulateStackingPipeline(
  objectId: string,
  lightsCount: number,
  totalExposureHours: number,
  contributorsCount: number,
  configurationsCount: number
): Promise<{ steps: PipelineStep[]; summary: string; estimated_snr_gain: number }> {
  const steps: PipelineStep[] = [
    { name: "Metadata normalization", status: "done", result: `${lightsCount} frames analysées` },
    { name: "Object verification", status: "done", result: `Objet ${objectId} confirmé` },
    { name: "Plate solving", status: "done", result: `${Math.round(lightsCount * 0.97)} frames résolues` },
    { name: "Calibration compatibility", status: "done", result: `${configurationsCount} groupes d'instruments` },
    { name: "FWHM analysis", status: "done", result: `Médiane estimée: 2.1"` },
    { name: "PSF analysis", status: "done", result: "PSF gaussienne dominante" },
    { name: "Background analysis", status: "done", result: `${Math.round(lightsCount * 0.05)} frames avec gradient` },
    { name: "Cloud detection", status: "done", result: `${Math.round(lightsCount * 0.03)} frames rejetées` },
    { name: "Gradient detection", status: "done", result: "Correction gradient appliquée" },
    { name: "Satellite / airplane rejection", status: "done", result: `${Math.round(lightsCount * 0.02)} frames rejetées` },
    { name: "Photometric normalization", status: "done", result: `${configurationsCount} calibrations photométriques` },
    { name: "Instrument grouping", status: "done", result: `${configurationsCount} sous-stacks créés` },
    { name: "Sub-pixel registration", status: "done", result: "Précision < 0.1 px" },
    { name: "Weighted integration", status: "done", result: `Pondération par SNR et FWHM` },
    { name: "Multi-resolution fusion", status: "done", result: `${configurationsCount} résolutions fusionnées` },
    { name: `Master ${objectId}`, status: "done", result: "? Master généré" },
  ];

  // Gain SNR théorique : sqrt(N) par rapport à une seule frame
  const snrGain = Math.sqrt(lightsCount);

  const summary = `Master ${objectId} construit à partir de ${lightsCount.toLocaleString()} lights / ${totalExposureHours.toFixed(1)}h de pose / ${contributorsCount} contributeurs / ${configurationsCount} configurations optiques. Gain SNR théorique: ×${snrGain.toFixed(1)}.`;

  return { steps, summary, estimated_snr_gain: snrGain };
}

// ——————————————————————————————————————————
// Recommandation IA : que faut-il photographier ?
// ——————————————————————————————————————————

export async function getAIContributionAdvice(
  objectId: string,
  currentStats: {
    total_lights: number;
    total_darks: number;
    total_flats: number;
    total_contributors: number;
    total_exposure_hours: number;
  },
  userInstrument?: FrameMetadata
): Promise<{ advice: string; priority: "low" | "medium" | "high"; missing: string[] }> {
  try {
    const provider = getProvider();
    const { text: raw } = await generateText({
      model: provider("gpt-4o"),
      messages: [
        {
          role: "system",
          content: `Tu es un expert en astrophotographie collaborative. Analyse les données manquantes d'un objet et donne des conseils précis.
Réponds en JSON: { "advice": "conseil en 2-3 phrases", "priority": "low|medium|high", "missing": ["type_frame manquant"] }`,
        },
        {
          role: "user",
          content: `Objet: ${objectId}
Lights: ${currentStats.total_lights} (${currentStats.total_exposure_hours.toFixed(1)}h)
Darks: ${currentStats.total_darks}
Flats: ${currentStats.total_flats}
Contributeurs: ${currentStats.total_contributors}
${userInstrument?.focal_length_mm ? `Instrument utilisateur: ${userInstrument.focal_length_mm}mm f/${userInstrument.aperture_mm ? (userInstrument.focal_length_mm / userInstrument.aperture_mm).toFixed(1) : "?"}` : ""}

Qu'est-ce qui manque le plus pour améliorer le master mondial de cet objet ?`,
        },
      ],
    });
    return JSON.parse(raw.trim());
  } catch {
    const missing: string[] = [];
    if (currentStats.total_darks < 50) missing.push("darks");
    if (currentStats.total_flats < 50) missing.push("flats");
    if (currentStats.total_lights < 100) missing.push("lights");
    return {
      advice: `${objectId} a besoin de plus de ${missing.join(", ")} pour améliorer son master.`,
      priority: currentStats.total_lights < 50 ? "high" : "medium",
      missing,
    };
  }
}
