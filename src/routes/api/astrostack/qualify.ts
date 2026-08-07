import { createServerFileRoute } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  analyzeFrameWithAI,
  computeInstrumentGroup,
  type FrameMetadata,
} from "@/lib/astrostack.server";

/**
 * POST /api/astrostack/qualify
 * Qualifie une frame uploadée : analyse IA, score qualité, groupe instrument.
 * Appelé automatiquement après chaque upload.
 */
export const ServerRoute = createServerFileRoute("/api/astrostack/qualify").methods({
  POST: async ({ request }) => {
 -  const body = await request.json().catch(() => null);
 -  if (!body?.upload_id) {
 -  - return new Response(JSON.stringify({ error: "upload_id requis" }), {
 -  -   status: 400, headers: { "Content-Type": "application/json" },
 -  - });
 -  }

 -  const supabase = createClient<Database>(
 -  - process.env["SUPABASE_URL"]!,
 -  - process.env["SUPABASE_SERVICE_ROLE_KEY"]!
 -  );

 -  // Récupère l'upload
 -  const { data: upload, error: fetchErr } = await supabase
 -  - .from("astro_uploads")
 -  - .select("*")
 -  - .eq("id", body.upload_id)
 -  - .single();

 -  if (fetchErr || !upload) {
 -  - return new Response(JSON.stringify({ error: "Upload introuvable" }), {
 -  -   status: 404, headers: { "Content-Type": "application/json" },
 -  - });
 -  }

 -  // Marque comme en cours de qualification
 -  await supabase
 -  - .from("astro_uploads")
 -  - .update({ status: "qualifying" })
 -  - .eq("id", upload.id);

 -  // Extrait les métadonnées
 -  const meta: FrameMetadata = {
 -  - telescope: upload.telescope ?? undefined,
 -  - camera: upload.camera ?? undefined,
 -  - focal_length_mm: upload.focal_length_mm ?? undefined,
 -  - aperture_mm: upload.aperture_mm ?? undefined,
 -  - exposure_s: upload.exposure_s ?? undefined,
 -  - gain: upload.gain ?? undefined,
 -  - temperature_c: upload.temperature_c ?? undefined,
 -  - filter_name: upload.filter_name ?? undefined,
 -  - binning: upload.binning ?? undefined,
 -  - latitude: upload.latitude ?? undefined,
 -  - longitude: upload.longitude ?? undefined,
 -  };

 -  // Analyse IA
 -  const analysis = await analyzeFrameWithAI(
 -  - upload.object_id ?? "unknown",
 -  - upload.frame_type,
 -  - meta,
 -  - upload.original_filename
 -  );

 -  // Met à jour l'upload avec les résultats
 -  await supabase
 -  - .from("astro_uploads")
 -  - .update({
 -  -   quality_score: analysis.quality_score,
 -  -   fwhm: analysis.fwhm ?? null,
 -  -   eccentricity: analysis.eccentricity ?? null,
 -  -   snr: analysis.snr ?? null,
 -  -   rejected: analysis.rejected,
 -  -   rejection_reason: analysis.rejection_reason ?? null,
 -  -   instrument_group: analysis.instrument_group,
 -  -   ai_analysis: analysis.ai_analysis as import("@supabase/supabase-js").Json,
 -  -   status: analysis.rejected ? "rejected" : "qualified",
 -  - })
 -  - .eq("id", upload.id);

 -  return new Response(JSON.stringify({ success: true, analysis }), {
 -  - status: 200, headers: { "Content-Type": "application/json" },
 -  });
  },
});
