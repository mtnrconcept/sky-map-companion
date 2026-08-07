import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// POST /api/cosmos/report — soumet une observation en temps réel
export const Route = createFileRoute("/api/cosmos/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        if (!body) {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const {
          user_id,
          latitude,
          longitude,
          altitude_m = 0,
          azimuth,
          elevation,
          phenomenon_type,
          description,
          image_url,
          duration_s,
          magnitude,
        } = body;

        if (!latitude || !longitude || !phenomenon_type || !description) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: latitude, longitude, phenomenon_type, description" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const supabase = createClient<Database>(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_SERVICE_ROLE_KEY"]!
        );

        const { data: obs, error } = await supabase
          .from("cosmos_observations")
          .insert({
            user_id: user_id ?? null,
            latitude,
            longitude,
            altitude_m,
            azimuth: azimuth ?? null,
            elevation: elevation ?? null,
            phenomenon_type,
            description,
            image_url: image_url ?? null,
            duration_s: duration_s ?? null,
            magnitude: magnitude ?? null,
            observed_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Déclenche l'analyse de cluster en arrière-plan (sans await)
        const baseUrl = process.env["VITE_SUPABASE_URL"]
          ? `https://${new URL(process.env["VITE_SUPABASE_URL"]!).hostname}`
          : "http://localhost:3000";

        fetch(`${baseUrl}/api/cosmos/analyze-cluster`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            observation_id: obs.id,
            phenomenon_type,
            latitude,
            longitude,
          }),
        }).catch(() => {});

        return new Response(JSON.stringify({ success: true, observation: obs }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
