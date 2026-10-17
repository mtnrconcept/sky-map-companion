import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { analyzeImage } from "@/lib/vision-analysis.server";
import { authenticateRequest, createAdminClient, noStoreJson } from "@/lib/api-auth.server";

const inputSchema = z.object({ storagePath: z.string().min(10).max(500) }).strict();
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export const Route = createFileRoute("/api/vision/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticateRequest(request);
        if (!user) return noStoreJson({ error: "Authentification requise." }, { status: 401 });

        const parsed = inputSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return noStoreJson({ error: "Chemin d’image invalide." }, { status: 400 });
        }
        const path = parsed.data.storagePath;
        const parts = path.split("/");
        if (
          parts.length !== 3 ||
          parts[0] !== user.id ||
          !/^[a-zA-Z0-9_-]{1,50}$/.test(parts[1] ?? "") ||
          !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(parts[2] ?? "")
        ) {
          return noStoreJson({ error: "Image non autorisée." }, { status: 403 });
        }

        const admin = createAdminClient();
        const folder = parts.slice(0, 2).join("/");
        const filename = parts[2]!;
        const { data: objects, error } = await admin.storage
          .from("user-images")
          .list(folder, { search: filename, limit: 5 });
        const item = objects?.find((object) => object.name === filename);
        const size = Number(item?.metadata?.["size"] ?? -1);
        const mimetype = String(item?.metadata?.["mimetype"] ?? "");
        if (
          error ||
          !item ||
          size <= 0 ||
          size > 10 * 1024 * 1024 ||
          (mimetype && !ALLOWED_MIME.has(mimetype))
        ) {
          return noStoreJson({ error: "Image absente ou format incorrect." }, { status: 400 });
        }

        try {
          const { data } = admin.storage.from("user-images").getPublicUrl(path);
          const result = await analyzeImage(data.publicUrl);
          return noStoreJson(result);
        } catch (reason) {
          console.error(
            "[vision/analyze] Analyse indisponible:",
            reason instanceof Error ? reason.message : "unknown error",
          );
          return noStoreJson(
            { error: "Le service d’analyse IA est momentanément indisponible." },
            { status: 503 },
          );
        }
      },
    },
  },
});
