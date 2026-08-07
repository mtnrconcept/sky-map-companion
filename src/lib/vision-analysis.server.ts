import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

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

export interface ImageComparisonResult {
  differences: Array<{
    description: string;
    significance: "low" | "medium" | "high";
  }>;
  discoveries: Array<{
    description: string;
    confidence: number;
    type: "temporal_change" | "equipment_artifact" | "celestial_feature" | "unknown";
  }>;
  overallSimilarity: number;
  recommendations: string[];
}

function getProvider() {
  const apiKey = process.env["LOVABLE_API_KEY"] ?? process.env["VITE_LOVABLE_API_KEY"] ?? "";
  return createLovableAiGatewayProvider(apiKey);
}

export async function analyzeImage(imageUrl: string): Promise<VisionAnalysisResult> {
  try {
    const provider = getProvider();

    const { text: raw } = await generateText({
      model: provider("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Tu es un expert en dtection d'images gnres par IA et en astronomie.
Analyse cette image et rponds UNIQUEMENT en JSON valide (sans markdown) avec ce format exact :
{"isAiGenerated":boolean,"confidence":number,"reasons":string[],"objectType":string|null,"identifiedFeatures":string[],"technicalDetails":string}
Pour isAiGenerated : cherche textures trop lisses, toiles trop uniformes, artefacts de diffusion, patterns rptitifs, incohrences physiques de la lumire.`,
            },
            { type: "image", image: new URL(imageUrl) },
          ],
        },
      ],
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      return {
        isAiGenerated: false,
        confidence: 0.5,
        detectedFeatures: [],
        astronomicalDetails: null,
      };
    }

    return {
      isAiGenerated: Boolean(parsed["isAiGenerated"]),
      confidence: Number(parsed["confidence"] ?? 0.5),
      detectedFeatures: Array.isArray(parsed["reasons"]) ? (parsed["reasons"] as string[]) : [],
      astronomicalDetails: {
        objectType:
          typeof parsed["objectType"] === "string" ? (parsed["objectType"] as string) : null,
        identifiedFeatures: Array.isArray(parsed["identifiedFeatures"])
          ? (parsed["identifiedFeatures"] as string[])
          : [],
        technicalDetails:
          typeof parsed["technicalDetails"] === "string"
            ? (parsed["technicalDetails"] as string)
            : "",
      },
    };
  } catch (error) {
    console.error("Vision analysis error:", error);
    return {
      isAiGenerated: false,
      confidence: 0.5,
      detectedFeatures: [],
      astronomicalDetails: null,
    };
  }
}

export async function compareImages(
  imageUrls: string[],
  objectId: string,
): Promise<ImageComparisonResult> {
  if (imageUrls.length < 2) {
    return { differences: [], discoveries: [], overallSimilarity: 1, recommendations: [] };
  }

  try {
    const provider = getProvider();
    const imagesContent = imageUrls.slice(0, 6).map((url) => ({
      type: "image" as const,
      image: new URL(url),
    }));

    const { text: raw } = await generateText({
      model: provider("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Tu es un astronome expert. Compare ces ${imagesContent.length} images du mme objet cleste (${objectId}).
Rponds UNIQUEMENT en JSON valide (sans markdown) avec ce format exact :
{"differences":[{"description":string,"significance":"low"|"medium"|"high"}],"discoveries":[{"description":string,"confidence":number,"type":"temporal_change"|"equipment_artifact"|"celestial_feature"|"unknown"}],"overallSimilarity":number,"recommendations":string[]}
Identifie les vraies variations clestes vs artefacts. Signale toute dcouverte potentielle.`,
            },
            ...imagesContent,
          ],
        },
      ],
    });

    try {
      return JSON.parse(raw.trim()) as ImageComparisonResult;
    } catch {
      return { differences: [], discoveries: [], overallSimilarity: 0.8, recommendations: [] };
    }
  } catch (error) {
    console.error("Image comparison error:", error);
    return { differences: [], discoveries: [], overallSimilarity: 0.8, recommendations: [] };
  }
}
