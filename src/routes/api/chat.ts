import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { searchSky, tonightHighlights, computeVisibility, DEFAULT_FILTERS } from "@/lib/sky-search";
import { upcomingEvents } from "@/lib/events";
import { twilight, moonPosition, moonPhaseName, formatTime, cardinalName } from "@/lib/astro";

interface SkyContext {
  latitude: number;
  longitude: number;
  locationName: string;
  dateISO: string;
  heading: number | null;
  pitch: number | null;
}

function relativeDirection(targetAz: number, heading: number): string {
  const diff = ((targetAz - heading + 540) % 360) - 180;
  const abs = Math.abs(diff);
  if (abs < 10) return "droit devant vous";
  const side = diff > 0 ? "vers la droite" : "vers la gauche";
  if (abs > 150) return "derrière vous (faites demi-tour)";
  return `${Math.round(abs)}° ${side}`;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          messages?: UIMessage[];
          context?: SkyContext;
        };
        const messages = body.messages;
        const ctx = body.context;
        if (!Array.isArray(messages) || !ctx) {
          return new Response("Requête invalide", { status: 400 });
        }
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Clé IA manquante", { status: 500 });

        const date = new Date(ctx.dateISO);
        const pos = { latitude: ctx.latitude, longitude: ctx.longitude };
        const moon = moonPosition(date);
        const tw = twilight(date, pos);

        const gateway = createLovableAiGatewayProvider(apiKey);

        const result = streamText({
          model: gateway("google/gemini-3.6-flash"),
          stopWhen: stepCountIs(50),
          system: `Tu es « Vega », un guide d'observation astronomique embarqué dans l'application Carte du Ciel. Tu réponds en français, avec chaleur et concision (3 à 6 phrases maximum sauf demande explicite), comme un animateur de club d'astronomie sur le terrain.

Contexte d'observation actuel :
- Lieu : ${ctx.locationName} (${ctx.latitude.toFixed(3)}°, ${ctx.longitude.toFixed(3)}°)
- Heure locale : ${date.toLocaleString("fr-FR")}
- Lune : ${moonPhaseName(moon.phase)}, ${Math.round(moon.illumination * 100)} % illuminée
- Coucher du Soleil : ${formatTime(tw.sunset)} · nuit noire : ${formatTime(tw.astronomicalDusk)} → ${formatTime(tw.astronomicalDawn)}
- Orientation du téléphone : ${
            ctx.heading === null
              ? "inconnue (la boussole n'est pas activée)"
              : `azimut ${Math.round(ctx.heading)}° (${cardinalName(ctx.heading)})${
                  ctx.pitch !== null
                    ? `, incliné à ${Math.round(ctx.pitch)}° au-dessus de l'horizon`
                    : ""
                }`
          }

Règles :
- Utilise toujours tes outils pour toute donnée chiffrée (position, heure, visibilité, événements). N'invente jamais une hauteur ou une heure.
- Quand on te demande où se trouve un objet, donne la direction cardinale, la hauteur en degrés, et si la boussole est active, l'indication relative (« tourne 40° vers la droite, puis lève les yeux à 30° »).
- Adapte tes conseils à l'instrument (œil nu, jumelles, télescope) et à la Lune du moment.
- Si un objet est sous l'horizon, dis-le et propose une heure de lever ou une alternative visible maintenant.
- Réponse en texte simple, pas de tableaux lourds. Tu peux utiliser des listes courtes.`,
          messages: await convertToModelMessages(messages),
          tools: {
            localiser_objet: tool({
              description:
                "Trouve un objet céleste par son nom ou son numéro de catalogue et renvoie sa position dans le ciel maintenant.",
              inputSchema: z.object({
                nom: z.string().describe("Nom recherché, ex : Saturne, M31, Vega, Orion"),
              }),
              execute: async ({ nom }) => {
                const results = searchSky(
                  { ...DEFAULT_FILTERS, query: nom, sort: "magnitude" },
                  date,
                  pos,
                );
                if (!results.length) return { trouve: false, nom };
                return {
                  trouve: true,
                  resultats: results.slice(0, 3).map((r) => {
                    const v = computeVisibility(r, date, pos);
                    return {
                      nom: r.name,
                      type: r.typeLabel,
                      constellation: r.constellation,
                      magnitude: r.mag,
                      hauteur_deg: Math.round(v.altitude),
                      azimut_deg: Math.round(v.azimuth),
                      direction: v.direction,
                      visible_maintenant: v.visible,
                      lever: formatTime(v.rise),
                      coucher: formatTime(v.set),
                      hauteur_max_nuit: Math.round(v.maxAltitude),
                      instrument: r.instrument,
                      orientation_relative:
                        ctx.heading === null ? null : relativeDirection(v.azimuth, ctx.heading),
                    };
                  }),
                };
              },
            }),
            objets_visibles: tool({
              description:
                "Liste les meilleurs objets observables maintenant depuis la position de l'utilisateur.",
              inputSchema: z.object({
                limite: z.number().describe("Nombre d'objets souhaités, entre 3 et 15"),
              }),
              execute: async ({ limite }) => ({
                objets: tonightHighlights(date, pos, Math.min(15, Math.max(3, limite))).map(
                  (r) => ({
                    nom: r.name,
                    type: r.typeLabel,
                    magnitude: r.mag,
                    hauteur_deg: Math.round(r.vis.altitude),
                    direction: r.vis.direction,
                    instrument: r.instrument,
                  }),
                ),
              }),
            }),
            evenements: tool({
              description:
                "Événements astronomiques à venir : phases de Lune, oppositions, rapprochements, pluies d'étoiles filantes.",
              inputSchema: z.object({
                jours: z.number().describe("Horizon en jours, entre 7 et 120"),
              }),
              execute: async ({ jours }) => ({
                evenements: upcomingEvents(date, Math.min(120, Math.max(7, jours)))
                  .slice(0, 12)
                  .map((e) => ({
                    date: e.date.toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                    }),
                    titre: e.title,
                    detail: e.detail,
                  })),
              }),
            }),
            ou_je_pointe: tool({
              description:
                "Indique quels objets se trouvent dans la direction où l'utilisateur pointe son téléphone.",
              inputSchema: z.object({
                tolerance_deg: z.number().describe("Rayon de recherche en degrés, 10 à 40"),
              }),
              execute: async ({ tolerance_deg }) => {
                if (ctx.heading === null)
                  return {
                    erreur:
                      "La boussole n'est pas activée. Demande à l'utilisateur d'appuyer sur l'icône boussole.",
                  };
                const tol = Math.min(40, Math.max(10, tolerance_deg));
                const all = searchSky(
                  { ...DEFAULT_FILTERS, onlyVisible: true, maxMagnitude: 7 },
                  date,
                  pos,
                );
                const near = all
                  .filter((r) => {
                    const dAz = Math.abs(((r.vis.azimuth - ctx.heading! + 540) % 360) - 180);
                    const dAlt = ctx.pitch === null ? 0 : Math.abs(r.vis.altitude - ctx.pitch);
                    return dAz < tol && dAlt < tol;
                  })
                  .slice(0, 8);
                return {
                  azimut_vise: Math.round(ctx.heading),
                  direction: cardinalName(ctx.heading),
                  objets: near.map((r) => ({
                    nom: r.name,
                    type: r.typeLabel,
                    magnitude: r.mag,
                    hauteur_deg: Math.round(r.vis.altitude),
                  })),
                };
              },
            }),
          },
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});
