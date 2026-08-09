import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type PhenomenonType =
  | "meteor"
  | "fireball"
  | "comet"
  | "supernova"
  | "aurora"
  | "satellite"
  | "atmospheric"
  | "unknown";

export interface CosmosObservation {
  id: string;
  user_id: string | null;
  latitude: number;
  longitude: number;
  altitude_m: number | null;
  azimuth: number | null;
  elevation: number | null;
  phenomenon_type: PhenomenonType;
  description: string;
  image_url: string | null;
  duration_s: number | null;
  magnitude: number | null;
  ai_confidence: number | null;
  status: string;
  event_id: string | null;
  observed_at: string;
}

export interface CosmosEvent {
  id: string;
  phenomenon_type: string;
  title: string;
  description: string | null;
  observation_count: number;
  confidence_score: number | null;
  status: string;
  event_at: string;
  triangulation: unknown;
  ai_analysis: unknown;
}

export interface ObservationDraft {
  phenomenon_type: PhenomenonType;
  description: string;
  azimuth?: number;
  elevation?: number;
  duration_s?: number;
  magnitude?: number;
  image_url?: string;
  evidence_file?: File;
}

export function useCosmosLive() {
  const { user } = useAuth();
  const [observations, setObservations] = useState<CosmosObservation[]>([]);
  const [events, setEvents] = useState<CosmosEvent[]>([]);
  const [userPosition, setUserPosition] = useState<GeolocationCoordinates | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActive, setIsActive] = useState(false);

  // Géolocalisation continue
  useEffect(() => {
    if (!isActive) return;
    if (!navigator.geolocation) {
      setPositionError("La géolocalisation n'est pas supportée par ce navigateur.");
      return;
    }
    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPosition(pos.coords);
        setPositionError(null);
      },
      (err) => setPositionError(err.message),
      { enableHighAccuracy: true, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watcher);
  }, [isActive]);

  // Chargement initial des observations récentes et des événements
  const loadData = useCallback(async () => {
    const response = await fetch("/api/cosmos/feed", { headers: { Accept: "application/json" } });
    if (!response.ok) return;
    const data = (await response.json()) as {
      observations: CosmosObservation[];
      events: CosmosEvent[];
    };
    setObservations(data.observations);
    setEvents(data.events);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Le flux public est une projection privée-safe. Un rafraîchissement court
  // évite de s'abonner directement à la table contenant les coordonnées exactes.
  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(loadData, 10_000);
    return () => window.clearInterval(timer);
  }, [isActive, loadData]);

  // Soumet une observation
  const submitObservation = useCallback(
    async (draft: ObservationDraft): Promise<boolean> => {
      if (!userPosition) {
        toast.error("Position GPS requise. Activez Cosmos Live d'abord.");
        return false;
      }
      if (!user) {
        toast.error("Connectez-vous pour soumettre une observation.");
        return false;
      }
      setIsSubmitting(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("Session absente ou expirée.");
        }
        let evidencePath: string | null = null;
        const evidenceFile = draft.evidence_file;
        if (evidenceFile) {
          if (evidenceFile.size > 100 * 1024 * 1024) throw new Error("La preuve dépasse 100 Mio.");
          const extension = evidenceFile.name.split(".").pop()?.toLowerCase() ?? "bin";
          evidencePath = `${user.id}/${crypto.randomUUID()}/evidence.${extension}`;
          const { error } = await supabase.storage
            .from("cosmos-evidence")
            .upload(evidencePath, evidenceFile, {
              upsert: false,
              contentType: evidenceFile.type || "application/octet-stream",
            });
          if (error) throw error;
        }

        const res = await fetch("/api/cosmos/report", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            latitude: userPosition.latitude,
            longitude: userPosition.longitude,
            altitude_m: userPosition.altitude ?? 0,
            phenomenon_type: draft.phenomenon_type,
            description: draft.description,
            azimuth: draft.azimuth,
            elevation: draft.elevation,
            duration_s: draft.duration_s,
            magnitude: draft.magnitude,
            evidence_path: evidencePath,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success("Observation soumise au pipeline scientifique", {
          description:
            "Les corrélations spatio-temporelles et la triangulation seront calculées côté serveur.",
        });
        return true;
      } catch (err) {
        toast.error("Erreur lors de la soumission", {
          description: String(err),
        });
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [userPosition, user],
  );

  const activate = useCallback(() => setIsActive(true), []);
  const deactivate = useCallback(() => setIsActive(false), []);

  return {
    observations,
    events,
    userPosition,
    positionError,
    isSubmitting,
    isActive,
    isAuthenticated: Boolean(user),
    activate,
    deactivate,
    submitObservation,
    refresh: loadData,
  };
}
