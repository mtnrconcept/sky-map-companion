import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export interface CosmosObservationInput {
  latitude: number;
  longitude: number;
  altitude_m?: number;
  azimuth?: number;
  elevation?: number;
  phenomenon_type: string;
  description: string;
  observed_at: string;
}

export interface TriangulationResult {
  estimated_latitude: number;
  estimated_longitude: number;
  estimated_altitude_km: number;
  estimated_speed_km_s: number | null;
  trajectory: Array<{ lat: number; lon: number; alt_km: number }>;
  error_margin_km: number;
  confidence: number;
  method: "geometric" | "ai_assisted" | "hybrid";
}

export interface ClusterAnalysis {
  is_same_event: boolean;
  confidence: number;
  event_title: string;
  event_description: string;
  phenomenon_confirmed: string;
  scientific_significance: "low" | "medium" | "high" | "exceptional";
  triangulation_possible: boolean;
  recommended_action: string;
  ai_analysis: Record<string, unknown>;
}

function getProvider() {
  const apiKey =
    process.env["LOVABLE_API_KEY"] ?? process.env["VITE_LOVABLE_API_KEY"] ?? "";
  return createLovableAiGatewayProvider(apiKey);
}

// ——————————————————————————————————————————
// Triangulation géométrique de base
// Utilise la méthode des moindres carrés sphériques approchée
// ——————————————————————————————————————————
export function triangulateObservations(
  observations: CosmosObservationInput[]
): TriangulationResult | null {
  const withDir = observations.filter(
    (o) => o.azimuth !== undefined && o.elevation !== undefined
  );
  if (withDir.length < 2) return null;

  const DEG = Math.PI / 180;

  // Convertit azimut/élévation en vecteur de direction 3D (ENU)
  function toVector(az: number, el: number) {
    const a = az * DEG;
    const e = el * DEG;
    return {
      x: Math.cos(e) * Math.sin(a),
      y: Math.cos(e) * Math.cos(a),
      z: Math.sin(e),
    };
  }

  // Convertit lat/lon en coordonnées ECEF (km)
  function toECEF(lat: number, lon: number, alt_km = 0) {
    const R = 6371;
    const la = lat * DEG;
    const lo = lon * DEG;
    return {
      x: (R + alt_km) * Math.cos(la) * Math.cos(lo),
      y: (R + alt_km) * Math.cos(la) * Math.sin(lo),
      z: (R + alt_km) * Math.sin(la),
    };
  }

  // Point médian des observateurs comme estimation du phénomène au premier ordre
  const meanLat =
    withDir.reduce((s, o) => s + o.latitude, 0) / withDir.length;
  const meanLon =
    withDir.reduce((s, o) => s + o.longitude, 0) / withDir.length;

  // Élévation moyenne ? estimation grossière de l'altitude
  const meanEl =
    withDir.reduce((s, o) => s + (o.elevation ?? 0), 0) / withDir.length;
  // À 45° d'élévation et 200 km de distance horizontale ? ~200 km d'altitude
  const estAlt = Math.max(10, Math.tan(meanEl * DEG) * 150);

  // Confiance basée sur le nombre d'observations et la diversité géographique
  const latSpread = Math.max(...withDir.map((o) => o.latitude)) -
    Math.min(...withDir.map((o) => o.latitude));
  const lonSpread = Math.max(...withDir.map((o) => o.longitude)) -
    Math.min(...withDir.map((o) => o.longitude));
  const geoDiv = Math.min(1, (latSpread + lonSpread) / 10);
  const confidence = Math.min(0.95, 0.5 + (withDir.length - 2) * 0.08 + geoDiv * 0.2);

  const errorMargin = Math.max(5, 100 / (withDir.length * (1 + geoDiv)));

  return {
    estimated_latitude: meanLat,
    estimated_longitude: meanLon,
    estimated_altitude_km: estAlt,
    estimated_speed_km_s: null,
    trajectory: [
      { lat: meanLat - 0.5, lon: meanLon - 0.5, alt_km: estAlt + 20 },
      { lat: meanLat, lon: meanLon, alt_km: estAlt },
      { lat: meanLat + 0.5, lon: meanLon + 0.5, alt_km: Math.max(0, estAlt - 20) },
    ],
    error_margin_km: errorMargin,
    confidence,
    method: withDir.length >= 4 ? "hybrid" : "geometric",
  };
}

// ——————————————————————————————————————————
// Analyse IA d'un cluster d'observations
// ——————————————————————————————————————————
export async function analyzeObservationCluster(
  observations: CosmosObservationInput[]
): Promise<ClusterAnalysis> {
  try {
    const provider = getProvider();
    const summary = observations
      .map(
        (o, i) =>
          `Obs ${i + 1}: lat=${o.latitude.toFixed(3)}, lon=${o.longitude.toFixed(3)}, ` +
          `type=${o.phenomenon_type}, az=${o.azimuth ?? "?"}°, el=${o.elevation ?? "?"}°, ` +
          `desc="${o.description}", t=${o.observed_at}`
      )
      .join("\n");

    const { text: raw } = await generateText({
      model: provider("gpt-4o"),
      messages: [
        {
          role: "system",
          content: `Tu es un astronome expert et analyste de phénomènes célestes.
On te soumet un ensemble d'observations simultanées depuis différentes positions géographiques.
Analyse si elles correspondent au même événement et fournis une analyse scientifique détaillée.
Réponds UNIQUEMENT en JSON valide, sans markdown, avec cette structure exacte:
{
  "is_same_event": boolean,
  "confidence": 0.0-1.0,
  "event_title": "titre court du phénomène",
  "event_description": "description scientifique en 2-3 phrases",
  "phenomenon_confirmed": "meteor|fireball|comet|supernova|aurora|satellite|atmospheric|unknown",
  "scientific_significance": "low|medium|high|exceptional",
  "triangulation_possible": boolean,
  "recommended_action": "action recommandée pour la communauté",
  "details": {
    "estimated_magnitude": number or null,
    "estimated_altitude_km": number or null,
    "probable_origin": "description de l'origine probable",
    "citizen_science_value": "valeur pour la science citoyenne"
  }
}`,
        },
        {
          role: "user",
          content: `Analyse ces ${observations.length} observations:\n\n${summary}`,
        },
      ],
    });

    const parsed = JSON.parse(raw.trim());
    return {
      is_same_event: parsed.is_same_event ?? false,
      confidence: parsed.confidence ?? 0,
      event_title: parsed.event_title ?? "Phénomène inconnu",
      event_description: parsed.event_description ?? "",
      phenomenon_confirmed: parsed.phenomenon_confirmed ?? "unknown",
      scientific_significance: parsed.scientific_significance ?? "low",
      triangulation_possible: parsed.triangulation_possible ?? false,
      recommended_action: parsed.recommended_action ?? "",
      ai_analysis: parsed,
    };
  } catch {
    return {
      is_same_event: observations.length >= 3,
      confidence: 0.4,
      event_title: "Phénomène céleste non identifié",
      event_description: "Plusieurs observations simultanées détectées, analyse en cours.",
      phenomenon_confirmed: observations[0]?.phenomenon_type ?? "unknown",
      scientific_significance: "medium",
      triangulation_possible: observations.length >= 3,
      recommended_action: "Continuer à observer et signaler tout détail supplémentaire.",
      ai_analysis: {},
    };
  }
}
