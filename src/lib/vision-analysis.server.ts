import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const analysisSchema = z.object({
  isAiGenerated: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).max(30),
  objectType: z.string().nullable(),
  identifiedFeatures: z.array(z.string()).max(30),
  technicalDetails: z.string(),
});

const comparisonSchema = z.object({
  differences: z.array(
    z.object({
      description: z.string(),
      significance: z.enum(["low", "medium", "high"]),
    }),
  ),
  discoveries: z.array(
    z.object({
      description: z.string(),
      confidence: z.number().min(0).max(1),
      type: z.enum(["temporal_change", "equipment_artifact", "celestial_feature", "unknown"]),
    }),
  ),
  overallSimilarity: z.number().min(0).max(1),
  recommendations: z.array(z.string()),
});

export interface VisionAnalysisResult {
  isAiGenerated: boolean;
  confidence: number;
  detectedFeatures: string[];
  astronomicalDetails: {
    objectType: string | null;
    identifiedFeatures: string[];
    technicalDetails: string;
  } | null;
}

export type ImageComparisonResult = z.infer<typeof comparisonSchema>;

function getProvider() {
  // Server-side secret only; never read a VITE_ prefixed value from a client bundle.
  const apiKey = process.env["LOVABLE_API_KEY"]?.trim();
  if (!apiKey) throw new Error("LOVABLE_API_KEY non configurée.");
  return createLovableAiGatewayProvider(apiKey);
}

function parseAiJson(raw: string): unknown {
  const body = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(body) as unknown;
}

export async function analyzeImage(imageUrl: string): Promise<VisionAnalysisResult> {
  const provider = getProvider();
  const { text } = await generateText({
    model: provider("gpt-4o"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Tu es un expert en détection des images générées par IA et en astronomie. Réponds uniquement en JSON valide avec les champs : isAiGenerated (booléen), confidence (0 à 1), reasons (liste de textes), objectType (texte ou null), identifiedFeatures (liste de textes), technicalDetails (texte). Recherche les artefacts de génération, les incohérences physiques et les détails astronomiques vérifiables. N'invente pas de mesure scientifique.",
          },
          { type: "image", image: new URL(imageUrl) },
        ],
      },
    ],
  });
  const parsed = analysisSchema.parse(parseAiJson(text));
  return {
    isAiGenerated: parsed.isAiGenerated,
    confidence: parsed.confidence,
    detectedFeatures: parsed.reasons,
    astronomicalDetails: {
      objectType: parsed.objectType,
      identifiedFeatures: parsed.identifiedFeatures,
      technicalDetails: parsed.technicalDetails,
    },
  };
}

export async function compareImages(
  imageUrls: string[],
  objectId: string,
): Promise<ImageComparisonResult> {
  if (imageUrls.length < 2) {
    throw new Error("Deux images réelles sont nécessaires pour comparer.");
  }
  const provider = getProvider();
  const content = imageUrls.slice(0, 6).map((url) => ({
    type: "image" as const,
    image: new URL(url),
  }));
  const { text } = await generateText({
    model: provider("gpt-4o"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Compare ces photographies vérifiées de l'objet céleste " +
              objectId +
              ". Réponds uniquement en JSON valide : differences (liste de description et significance low/medium/high), discoveries (liste de description, confidence de 0 à 1 et type temporal_change/equipment_artifact/celestial_feature/unknown), overallSimilarity (0 à 1) et recommendations (liste de textes). Distingue soigneusement les phénomènes célestes des artefacts instrumentaux. Aucune découverte non confirmée ne doit être présentée comme un fait.",
          },
          ...content,
        ],
      },
    ],
  });
  // A malformed AI reply is an error, never a fabricated successful comparison.
  return comparisonSchema.parse(parseAiJson(text));
}
