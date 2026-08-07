import { createServerFileRoute } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  analyzeObservationCluster,
  triangulateObservations,
  type CosmosObservationInput,
} from "@/lib/cosmos-live.server";

// POST /api/cosmos/analyze-cluster
// Regroupement et analyse IA des observations récentes du même type
export const ServerRoute = createServerFileRoute("/api/cosmos/analyze-cluster").methods({
  POST: async ({ request }) => {
    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { observation_id, phenomenon_type, latitude, longitude } = body;

    const supabase = createClient<Database>(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!
    );

    // Récupère les observations récentes du même type dans un rayon de 30° et 30 min
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: nearby } = await supabase
      .from("cosmos_observations")
      .select("*")
      .eq("phenomenon_type", phenomenon_type)
      .eq("status", "pending")
      .gte("observed_at", since)
      .gte("latitude", latitude - 30)
      .lte("latitude", latitude + 30)
      .gte("longitude", longitude - 30)
      .lte("longitude", longitude + 30)
      .limit(20);

    if (!nearby || nearby.length < 2) {
      return new Response(JSON.stringify({ message: "Not enough observations to cluster" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const inputs: CosmosObservationInput[] = nearby.map((o) => ({
      latitude: o.latitude,
      longitude: o.longitude,
      altitude_m: o.altitude_m ?? 0,
      azimuth: o.azimuth ?? undefined,
      elevation: o.elevation ?? undefined,
      phenomenon_type: o.phenomenon_type,
      description: o.description,
      observed_at: o.observed_at,
    }));

    // Analyse IA du cluster
    const analysis = await analyzeObservationCluster(inputs);

    if (!analysis.is_same_event || analysis.confidence < 0.5) {
      return new Response(JSON.stringify({ message: "Observations not clustered (low confidence)" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Triangulation si possible
    const tri = analysis.triangulation_possible
      ? triangulateObservations(inputs)
      : null;

    // Crée l'événement
    const { data: event, error: evErr } = await supabase
      .from("cosmos_events")
      .insert({
        phenomenon_type: analysis.phenomenon_confirmed,
        title: analysis.event_title,
        description: analysis.event_description,
        event_at: nearby[0].observed_at,
        confidence_score: analysis.confidence,
        status: analysis.scientific_significance === "exceptional" ? "confirmed" : "unverified",
        ai_analysis: analysis.ai_analysis as unknown as import("@supabase/supabase-js").Json,
        triangulation: tri as unknown as import("@supabase/supabase-js").Json,
        min_latitude: Math.min(...nearby.map((o) => o.latitude)),
        max_latitude: Math.max(...nearby.map((o) => o.latitude)),
        min_longitude: Math.min(...nearby.map((o) => o.longitude)),
        max_longitude: Math.max(...nearby.map((o) => o.longitude)),
      })
      .select()
      .single();

    if (evErr || !event) {
      return new Response(JSON.stringify({ error: evErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Associe les observations à l'événement
    const obsIds = nearby.map((o) => o.id);
    await supabase
      .from("cosmos_observations")
      .update({ event_id: event.id, status: "clustered" })
      .in("id", obsIds);

    // Insère la triangulation si calculée
    if (tri) {
      await supabase.from("cosmos_triangulations").insert({
        event_id: event.id,
        observation_ids: obsIds,
        estimated_latitude: tri.estimated_latitude,
        estimated_longitude: tri.estimated_longitude,
        estimated_altitude_km: tri.estimated_altitude_km,
        estimated_speed_km_s: tri.estimated_speed_km_s,
        trajectory: tri.trajectory as unknown as import("@supabase/supabase-js").Json,
        error_margin_km: tri.error_margin_km,
        confidence: tri.confidence,
        method: tri.method,
      });
    }

    return new Response(JSON.stringify({ success: true, event, triangulation: tri }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});
