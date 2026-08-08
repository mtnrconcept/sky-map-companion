import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authenticateRequest, createAdminClient, noStoreJson } from "@/lib/api-auth.server";

const schema = z.object({
  storage_path: z.string().min(10).max(800),
  original_filename: z.string().min(1).max(255),
  file_size_bytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024 * 1024),
  object_id: z.string().min(1).max(50),
  frame_type: z.enum(["light", "dark", "flat", "bias"]),
  licence_code: z.enum(["CC-BY-4.0", "CC-BY-SA-4.0", "CC0-1.0"]),
  telescope: z.string().max(200).optional(),
  camera: z.string().max(200).optional(),
  focal_length_mm: z.number().positive().max(100_000).optional(),
  aperture_mm: z.number().positive().max(20_000).optional(),
  pixel_size_um: z.number().positive().max(100).optional(),
  exposure_s: z.number().positive().max(86_400).optional(),
  gain: z.number().int().min(0).max(1_000_000).optional(),
  temperature_c: z.number().min(-273.15).max(200).optional(),
  filter_name: z.string().max(80).optional(),
  binning: z.number().int().min(1).max(8).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  captured_at: z.string().datetime().optional(),
});

export const Route = createFileRoute("/api/astrostack/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticateRequest(request);
        if (!user) return noStoreJson({ error: "Authentification requise." }, { status: 401 });
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return noStoreJson(
            { error: "Métadonnées d’upload invalides.", issues: parsed.error.issues },
            { status: 400 },
          );
        }
        const input = parsed.data;
        if (!input.storage_path.startsWith(`${user.id}/`)) {
          return noStoreJson({ error: "Chemin Storage interdit." }, { status: 403 });
        }
        const admin = createAdminClient();
        const [objectResult, existingResult] = await Promise.all([
          admin.from("astro_objects").select("id").eq("id", input.object_id).maybeSingle(),
          admin
            .from("astro_uploads")
            .select("id,status")
            .eq("storage_path", input.storage_path)
            .maybeSingle(),
        ]);
        if (!objectResult.data)
          return noStoreJson({ error: "Objet céleste inconnu." }, { status: 400 });
        if (existingResult.data) {
          return noStoreJson({ upload: existingResult.data, replayed: true }, { status: 200 });
        }

        const slash = input.storage_path.lastIndexOf("/");
        const folder = input.storage_path.slice(0, slash);
        const filename = input.storage_path.slice(slash + 1);
        const { data: objects, error: storageError } = await admin.storage
          .from("astro-raw")
          .list(folder, { search: filename, limit: 10 });
        const stored = objects?.find((object) => object.name === filename);
        const storedSize = Number(stored?.metadata?.["size"] ?? -1);
        if (storageError || !stored || storedSize !== input.file_size_bytes) {
          return noStoreJson(
            { error: "Le fichier privé est absent ou incomplet." },
            { status: 409 },
          );
        }

        const { data: upload, error } = await admin
          .from("astro_uploads")
          .insert({
            user_id: user.id,
            object_id: input.object_id,
            frame_type: input.frame_type,
            storage_path: input.storage_path,
            file_url: `private://astro-raw/${input.storage_path}`,
            file_size_bytes: input.file_size_bytes,
            original_filename: input.original_filename,
            licence_code: input.licence_code,
            licence_accepted_at: new Date().toISOString(),
            telescope: input.telescope ?? null,
            camera: input.camera ?? null,
            focal_length_mm: input.focal_length_mm ?? null,
            aperture_mm: input.aperture_mm ?? null,
            pixel_size_um: input.pixel_size_um ?? null,
            exposure_s: input.exposure_s ?? null,
            gain: input.gain ?? null,
            temperature_c: input.temperature_c ?? null,
            filter_name: input.filter_name ?? null,
            binning: input.binning ?? 1,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            captured_at: input.captured_at ?? null,
            status: "uploaded",
          })
          .select("id,status,uploaded_at")
          .single();
        if (error) {
          return noStoreJson(
            { error: "Impossible d’enregistrer la contribution." },
            { status: 500 },
          );
        }
        return noStoreJson({ upload, replayed: false }, { status: 201 });
      },
    },
  },
});
