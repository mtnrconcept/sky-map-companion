import { createServerFileRoute } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { simulateStackingPipeline } from "@/lib/astrostack.server";

/**
 * POST /api/astrostack/stack-trigger
 * Lance un job de stacking pour un objet donnÃ©.
 * SÃ©lectionne les meilleures frames qualifiÃ©es disponibles.
 */
export const ServerRoute = createServerFileRoute("/api/astrostack/stack-trigger").methods({
  POST: async ({ request }) => {
 const body = await request.json().catch(() => null);
 if (!body?.object_id) {
 return new Response(JSON.stringify({ error: "object_id requis" }), {
   status: 400, headers: { "Content-Type": "application/json" },
 });
 }

 const supabase = createClient<Database>(
 process.env["SUPABASE_URL"]!,
 process.env["SUPABASE_SERVICE_ROLE_KEY"]!
 );

 const { object_id, min_quality = 0.5, max_lights = 1000 } = body;

 // VÃ©rifie que l'objet existe
 const { data: obj } = await supabase
 .from("astro_objects")
 .select("*")
 .eq("id", object_id)
 .single();

 if (!obj) {
 return new Response(JSON.stringify({ error: "Objet inconnu" }), {
   status: 404, headers: { "Content-Type": "application/json" },
 });
 }

 // SÃ©lectionne les meilleures lights qualifiÃ©es
 const { data: lights } = await supabase
 .from("astro_uploads")
 .select("id, quality_score, instrument_group, exposure_s, user_id")
 .eq("object_id", object_id)
 .eq("frame_type", "light")
 .eq("status", "qualified")
 .eq("rejected", false)
 .gte("quality_score", min_quality)
 .order("quality_score", { ascending: false })
 .limit(max_lights);

 const { data: darks } = await supabase
 .from("astro_uploads")
 .select("id")
 .eq("object_id", object_id)
 .eq("frame_type", "dark")
 .eq("rejected", false)
 .limit(500);

 const { data: flats } = await supabase
 .from("astro_uploads")
 .select("id")
 .eq("object_id", object_id)
 .eq("frame_type", "flat")
 .eq("rejected", false)
 .limit(200);

 const { data: bias } = await supabase
 .from("astro_uploads")
 .select("id")
 .eq("object_id", object_id)
 .eq("frame_type", "bias")
 .eq("rejected", false)
 .limit(200);

 if (!lights || lights.length < 3) {
 return new Response(
   JSON.stringify({ error: "Pas assez de lights qualifiÃ©es (minimum 3)" }),
   { status: 422, headers: { "Content-Type": "application/json" } }
 );
 }

 // Calcule les stats
 const totalExposure = lights.reduce((s, l) => s + (l.exposure_s ?? 0), 0) / 3600;
 const contributors = new Set(lights.map((l) => l.user_id)).size;
 const configurations = new Set(lights.map((l) => l.instrument_group)).size;

 // Simule le pipeline (dans un vrai systÃ¨me : job async lourd)
 const pipelineResult = await simulateStackingPipeline(
 object_id,
 lights.length,
 totalExposure,
 contributors,
 configurations
 );

 // CrÃ©e le job de stacking
 const { data: job, error: jobErr } = await supabase
 .from("astro_stacking_jobs")
 .insert({
   object_id,
   light_ids: lights.map((l) => l.id),
   dark_ids: (darks ?? []).map((d) => d.id),
   flat_ids: (flats ?? []).map((f) => f.id),
   bias_ids: (bias ?? []).map((b) => b.id),
   lights_count: lights.length,
   total_exposure_hours: totalExposure,
   contributors_count: contributors,
   configurations_count: configurations,
   status: "running",
   started_at: new Date().toISOString(),
   ai_pipeline_log: pipelineResult as unknown as import("@supabase/supabase-js").Json,
 })
 .select()
 .single();

 if (jobErr || !job) {
 return new Response(JSON.stringify({ error: jobErr?.message }), {
   status: 500, headers: { "Content-Type": "application/json" },
 });
 }

 // Simule la complÃ©tion du job (dans un vrai systÃ¨me : dÃ©lÃ©guÃ© Ã  un worker)
 // CrÃ©e un master placeholder avec une image gÃ©nÃ©rÃ©e
 const masterUrl = `https://via.placeholder.com/1920x1080/0a0a1a/4fc3f7?text=${encodeURIComponent(`${object_id} â€” ${lights.length} frames`)}`;

 const { data: master } = await supabase
 .from("astro_masters")
 .insert({
   object_id,
   stacking_job_id: job.id,
   image_url: masterUrl,
   thumbnail_url: masterUrl,
   lights_stacked: lights.length,
   total_exposure_hours: totalExposure,
   contributors_count: contributors,
   configurations_count: configurations,
   notes: pipelineResult.summary,
   is_current: true,
 })
 .select()
 .single();

 // Marque le job comme complÃ©tÃ©
 await supabase
 .from("astro_stacking_jobs")
 .update({
   status: "completed",
   completed_at: new Date().toISOString(),
   result_image_url: masterUrl,
   result_metadata: { estimated_snr_gain: pipelineResult.estimated_snr_gain } as unknown as import("@supabase/supabase-js").Json,
 })
 .eq("id", job.id);

 // Marque les lights comme stackÃ©es
 await supabase
 .from("astro_uploads")
 .update({ status: "stacked" })
 .in("id", lights.map((l) => l.id));

 return new Response(
 JSON.stringify({ success: true, job, master, pipeline: pipelineResult }),
 { status: 201, headers: { "Content-Type": "application/json" } }
 );
  },
});

