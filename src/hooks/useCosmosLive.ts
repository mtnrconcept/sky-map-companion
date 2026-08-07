import { useState, useEffect, useCallback, useRef } from "react";
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
}

export function useCosmosLive() {
  const { user } = useAuth();
  const [observations, setObservations] = useState<CosmosObservation[]>([]);
  const [events, setEvents] = useState<CosmosEvent[]>([]);
  const [userPosition, setUserPosition] = useState<GeolocationCoordinates | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watcher);
  }, [isActive]);

  // Chargement initial des observations récentes et des événements
  const loadData = useCallback(async () => {
    const [obsRes, evtRes] = await Promise.all([
      supabase
        .from("cosmos_observations")
        .select("*")
        .gte("observed_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .order("observed_at", { ascending: false })
        .limit(200),
      supabase
        .from("cosmos_events")
        .select("id, phenomenon_type, title, description, observation_count, confidence_score, status, event_at, triangulation, ai_analysis")
        .gte("event_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .neq("status", "rejected")
        .order("observation_count", { ascending: false })
        .limit(50),
    ]);
    if (obsRes.data) setObservations(obsRes.data as CosmosObservation[]);
    if (evtRes.data) setEvents(evtRes.data as CosmosEvent[]);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime — écoute les nouvelles observations et événements
  useEffect(() => {
    if (!isActive) {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      return;
    }

    const channel = supabase
      .channel("cosmos_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cosmos_observations" },
        (payload) => {
          const newObs = payload.new as CosmosObservation;
          setObservations((prev) => [newObs, ...prev].slice(0, 500));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cosmos_events" },
        (payload) => {
          const newEvt = payload.new as CosmosEvent;
          setEvents((prev) => [newEvt, ...prev]);
          toast.success(`?? Nouvel événement détecté : ${newEvt.title}`, {
            description: `${newEvt.observation_count} observation(s) confirmée(s)`,
            duration: 8000,
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cosmos_events" },
        (payload) => {
          const updated = payload.new as CosmosEvent;
          setEvents((prev) =>
            prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e))
          );
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [isActive]);

  // Soumet une observation
  const submitObservation = useCallback(
    async (draft: ObservationDraft): Promise<boolean> => {
      if (!userPosition) {
        toast.error("Position GPS requise. Activez Cosmos Live d'abord.");
        return false;
      }
      setIsSubmitting(true);
      try {
        const res = await fetch("/api/cosmos/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user?.id ?? null,
            latitude: userPosition.latitude,
            longitude: userPosition.longitude,
            altitude_m: userPosition.altitude ?? 0,
            ...draft,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success("Observation soumise ! L'IA analyse le cluster...", {
          description: "Si d'autres observateurs voient la même chose, un événement sera détecté.",
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
    [userPosition, user]
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
    activate,
    deactivate,
    submitObservation,
    refresh: loadData,
  };
}
