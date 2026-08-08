import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const PHENOMENA = new Set([
  "meteor",
  "fireball",
  "comet",
  "supernova",
  "aurora",
  "satellite",
  "atmospheric",
  "unknown",
]);

function optionalNumber(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : Number.NaN;
}

// POST /api/cosmos/report — soumet une observation authentifiée en temps réel
export const Route = createFileRoute("/api/cosmos/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) {
          return Response.json({ error: "Corps JSON invalide." }, { status: 400 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const serviceRoleKey =
          process.env["SUPABASE_SECRET_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
        if (!supabaseUrl || !serviceRoleKey) {
          return Response.json(
            { error: "Service d'observation indisponible.", code: "SERVER_NOT_CONFIGURED" },
            { status: 503 },
          );
        }

        const authorization = request.headers.get("authorization");
        const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
        if (!token) {
          return Response.json({ error: "Authentification requise." }, { status: 401 });
        }

        const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser(token);
        if (authError || !user) {
          return Response.json({ error: "Session invalide ou expirée." }, { status: 401 });
        }

        const latitude = Number(body["latitude"]);
        const longitude = Number(body["longitude"]);
        const altitude = optionalNumber(body["altitude_m"], -500, 10_000);
        const azimuth = optionalNumber(body["azimuth"], 0, 360);
        const elevation = optionalNumber(body["elevation"], -90, 90);
        const duration = optionalNumber(body["duration_s"], 0, 86_400);
        const magnitude = optionalNumber(body["magnitude"], -30, 30);
        const phenomenonType =
          typeof body["phenomenon_type"] === "string" ? body["phenomenon_type"] : "";
        const description =
          typeof body["description"] === "string" ? body["description"].trim() : "";
        const evidencePath =
          typeof body["evidence_path"] === "string" ? body["evidence_path"] : null;

        const invalidOptional = [altitude, azimuth, elevation, duration, magnitude].some(
          Number.isNaN,
        );
        if (
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90 ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180 ||
          invalidOptional ||
          !PHENOMENA.has(phenomenonType) ||
          description.length === 0 ||
          description.length > 2_000
        ) {
          return Response.json({ error: "Données d'observation invalides." }, { status: 400 });
        }

        if (evidencePath && !evidencePath.startsWith(`${user.id}/`)) {
          return Response.json({ error: "Chemin de preuve interdit." }, { status: 403 });
        }
        if (evidencePath) {
          const slash = evidencePath.lastIndexOf("/");
          const folder = evidencePath.slice(0, slash);
          const filename = evidencePath.slice(slash + 1);
          const { data: evidenceObjects, error: evidenceError } = await supabase.storage
            .from("cosmos-evidence")
            .list(folder, { search: filename, limit: 10 });
          if (evidenceError || !evidenceObjects?.some((object) => object.name === filename)) {
            return Response.json({ error: "Preuve privée introuvable." }, { status: 409 });
          }
        }

        const { data: observation, error } = await supabase
          .from("cosmos_observations")
          .insert({
            user_id: user.id,
            latitude,
            longitude,
            altitude_m: altitude,
            azimuth,
            elevation,
            phenomenon_type: phenomenonType,
            description,
            image_url: evidencePath ? `private://cosmos-evidence/${evidencePath}` : null,
            duration_s: duration,
            magnitude,
            observed_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) {
          return Response.json(
            { error: "Impossible d'enregistrer l'observation.", code: "OBSERVATION_INSERT_FAILED" },
            { status: 500 },
          );
        }

        return Response.json({ success: true, observation }, { status: 201 });
      },
    },
  },
});
