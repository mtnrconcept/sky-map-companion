import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  parseCosmosFeed,
  readAnalysisReceipt,
  readSubmissionReceipt,
  validateEvidenceFile,
  type CosmosObservation,
  type CosmosEvent,
  type CosmosProcessing,
  type FeedPeriod,
  type ObservationDraft,
  type ObserverPosition,
  type OwnCosmosObservation,
} from "@/features/cosmos/domain/client-state";
import { requestCosmosJson } from "@/features/cosmos/client/live-feed";

export type {
  CosmosObservation,
  CosmosEvent,
  ObservationDraft,
  ObserverPosition,
  PhenomenonType,
} from "@/features/cosmos/domain/client-state";

interface SubmissionAttempt {
  signature: string;
  file: File | undefined;
  key: string;
  evidencePath: string | null;
  uploaded: boolean;
  payload: Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.";
}

export function useCosmosLive() {
  const { user, loading: isAuthLoading } = useAuth();
  const userId = user?.id ?? null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const [observations, setObservations] = useState<CosmosObservation[]>([]);
  const [events, setEvents] = useState<CosmosEvent[]>([]);
  const [ownObservations, setOwnObservations] = useState<OwnCosmosObservation[]>([]);
  const [processing, setProcessing] = useState<CosmosProcessing>({ status: "unknown" });
  const [sinceMinutes, setSinceMinutes] = useState<FeedPeriod>(120);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const activeRequest = useRef<AbortController | null>(null);

  const [userPosition, setUserPosition] = useState<ObserverPosition | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [positionMode, setPositionMode] = useState<"gps" | "manual">("gps");
  const [gpsAttempt, setGpsAttempt] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const submissionAttempt = useRef<SubmissionAttempt | null>(null);
  const [retryingObservationIds, setRetryingObservationIds] = useState<Set<string>>(new Set());
  const retrying = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Only the explicit GPS action requests location. Reading the public feed never does.
  useEffect(() => {
    if (!isActive || positionMode !== "gps") return;
    let active = true;
    setIsLocating(true);
    if (!navigator.geolocation) {
      setPositionError(
        "Ce navigateur ne propose pas de GPS. Vous pouvez saisir le lieu d’observation.",
      );
      setIsLocating(false);
      return;
    }
    const watcher = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        setUserPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy,
          source: "gps",
          recordedAt: position.timestamp,
        });
        setPositionError(null);
        setIsLocating(false);
      },
      (error) => {
        if (!active) return;
        const message =
          error.code === 1
            ? "L’accès au GPS a été refusé. Autorisez-le dans le navigateur ou saisissez le lieu d’observation."
            : error.code === 3
              ? "Le GPS ne répond pas. Réessayez ou saisissez le lieu d’observation."
              : "La position GPS est indisponible. Vous pouvez saisir le lieu d’observation.";
        setPositionError(message);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(watcher);
    };
  }, [isActive, positionMode, gpsAttempt]);

  const loadData = useCallback(async () => {
    if (activeRequest.current) return;
    if (!navigator.onLine) {
      setIsOnline(false);
      setFeedError("Vous êtes hors ligne. Les dernières données reçues restent affichées.");
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setIsRefreshing(true);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (userId) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token && session.user.id === userId) {
            headers["Authorization"] = "Bearer " + session.access_token;
            setAccountError(null);
          } else {
            setAccountError("Reconnectez-vous pour retrouver vos signalements personnels.");
          }
        } catch {
          setAccountError("Reconnectez-vous pour retrouver vos signalements personnels.");
        }
      }
      if (controller.signal.aborted) return;
      const data = parseCosmosFeed(
        await requestCosmosJson("/api/cosmos/feed?since_minutes=" + sinceMinutes, {
          headers,
          signal: controller.signal,
        }),
      );
      if (!mounted.current || controller.signal.aborted || currentUserId.current !== userId) return;
      setObservations(data.observations);
      setEvents(data.events);
      setOwnObservations(userId ? data.own_observations : []);
      if (userId && data.own_observations_error) setAccountError(data.own_observations_error);
      setProcessing(data.processing);
      setFeedError(null);
      setLastUpdatedAt(Date.now());
      setNow(Date.now());
      setIsOnline(true);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      setFeedError(errorMessage(error));
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        if (mounted.current) {
          setIsRefreshing(false);
          setIsLoading(false);
        }
      }
    }
  }, [userId, sinceMinutes]);
  const latestRefresh = useRef(loadData);
  latestRefresh.current = loadData;

  // Refresh independently of GPS and authentication. Never overlap requests; resume on return.
  useEffect(() => {
    setOwnObservations([]);
    setAccountError(null);
    void loadData();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadData();
    }, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void loadData();
      }
    };
    const onOnline = () => {
      setIsOnline(true);
      void loadData();
    };
    const onOffline = () => {
      setIsOnline(false);
      setFeedError("Vous êtes hors ligne. Les dernières données reçues restent affichées.");
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const changePeriod = useCallback((period: FeedPeriod) => {
    setSinceMinutes(period);
    setObservations([]);
    setEvents([]);
    setLastUpdatedAt(null);
    setFeedError(null);
    setIsLoading(true);
  }, []);

  const activate = useCallback(() => {
    setPositionMode("gps");
    setUserPosition(null);
    setPositionError(null);
    setIsActive(true);
    setGpsAttempt((attempt) => attempt + 1);
  }, []);

  const deactivate = useCallback(() => {
    setIsActive(false);
    setUserPosition(null);
    setPositionError(null);
    setIsLocating(false);
  }, []);

  const applyManualPosition = useCallback((position: ObserverPosition) => {
    setPositionMode("manual");
    setUserPosition(position);
    setPositionError(null);
    setIsLocating(false);
    setIsActive(true);
  }, []);

  const submitObservation = useCallback(
    async (draft: ObservationDraft): Promise<boolean> => {
      if (submitting.current) return false;
      if (!isActive || !userPosition) {
        toast.error("Choisissez le lieu de l’observation avec le GPS ou la saisie manuelle.");
        return false;
      }
      if (!userId) {
        toast.error("Connectez-vous pour soumettre une observation.");
        return false;
      }
      if (userPosition.source === "gps" && Date.now() - userPosition.recordedAt > 5 * 60_000) {
        toast.error(
          "Votre position GPS est ancienne. Actualisez-la ou saisissez le lieu d’observation.",
        );
        return false;
      }
      submitting.current = true;
      setIsSubmitting(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || session.user.id !== userId) {
          throw new Error(
            "Votre session a expiré. Reconnectez-vous avant de renvoyer le signalement.",
          );
        }
        const evidenceFile = draft.evidence_file;
        const evidenceFormat = evidenceFile ? validateEvidenceFile(evidenceFile) : null;
        // Keep the original position, time, proof and key when retrying an interrupted send.
        // GPS drift must not create a second observation.
        const signature = JSON.stringify({
          userId,
          phenomenon: draft.phenomenon_type,
          description: draft.description,
          observedAt: draft.observed_at,
          azimuth: draft.azimuth,
          elevation: draft.elevation,
          duration: draft.duration_s,
          magnitude: draft.magnitude,
          manualPosition:
            userPosition.source === "manual"
              ? [userPosition.latitude, userPosition.longitude, userPosition.altitude]
              : null,
        });
        let attempt = submissionAttempt.current;
        if (!attempt || attempt.signature !== signature || attempt.file !== evidenceFile) {
          const key = crypto.randomUUID();
          const evidencePath = evidenceFormat
            ? userId + "/" + key + "/evidence." + evidenceFormat.extension
            : null;
          attempt = {
            signature,
            file: evidenceFile,
            key,
            evidencePath,
            uploaded: false,
            payload: {
              idempotency_key: key,
              observed_at: draft.observed_at ?? new Date().toISOString(),
              latitude: userPosition.latitude,
              longitude: userPosition.longitude,
              altitude_m: userPosition.altitude,
              phenomenon_type: draft.phenomenon_type,
              description: draft.description,
              azimuth: draft.azimuth ?? null,
              elevation: draft.elevation ?? null,
              duration_s: draft.duration_s ?? null,
              magnitude: draft.magnitude ?? null,
              evidence_path: evidencePath,
            },
          };
          submissionAttempt.current = attempt;
        }
        if (evidenceFile && evidenceFormat && attempt.evidencePath && !attempt.uploaded) {
          const { error } = await supabase.storage
            .from("cosmos-evidence")
            .upload(attempt.evidencePath, evidenceFile, {
              upsert: false,
              contentType: evidenceFormat.mime,
            });
          if (error) {
            // An interrupted request may already have stored this exact immutable File.
            // Verify the private owned object instead of treating any conflict as success.
            let uploadedPreviously = false;
            if (["400", "409"].includes(String(error.statusCode))) {
              const slash = attempt.evidencePath.lastIndexOf("/");
              const filename = attempt.evidencePath.slice(slash + 1);
              const { data: files, error: listError } = await supabase.storage
                .from("cosmos-evidence")
                .list(attempt.evidencePath.slice(0, slash), { search: filename, limit: 10 });
              uploadedPreviously =
                !listError &&
                Boolean(
                  files?.some(
                    (file) =>
                      file.name === filename &&
                      Number(file.metadata?.["size"]) === evidenceFile.size,
                  ),
                );
            }
            if (!uploadedPreviously)
              throw new Error(
                "Le fichier n’a pas pu être envoyé. Vérifiez la connexion puis réessayez.",
              );
          }
          attempt.uploaded = true;
        }
        const receipt = readSubmissionReceipt(
          await requestCosmosJson(
            "/api/cosmos/report",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + session.access_token,
              },
              body: JSON.stringify(attempt.payload),
            },
            30_000,
          ),
        );
        submissionAttempt.current = null;
        if (mounted.current && currentUserId.current === userId) {
          setOwnObservations((items) =>
            [
              receipt.observation,
              ...items.filter((item) => item.id !== receipt.observation.id),
            ].slice(0, 100),
          );
          setProcessing(receipt.processing);
          toast.success("Observation enregistrée", {
            description: receipt.observation.event_id
              ? "Elle a été rapprochée d’autres signalements."
              : "Vous pouvez suivre son analyse dans « Mes signalements ».",
          });
          activeRequest.current?.abort();
          activeRequest.current = null;
          void latestRefresh.current();
        }
        return true;
      } catch (error) {
        if (mounted.current)
          toast.error("Le signalement n’a pas été confirmé", { description: errorMessage(error) });
        return false;
      } finally {
        submitting.current = false;
        if (mounted.current) setIsSubmitting(false);
      }
    },
    [isActive, userPosition, userId],
  );

  const retryAnalysis = useCallback(
    async (observationId: string) => {
      if (!userId || retrying.current.has(observationId)) return;
      retrying.current.add(observationId);
      setRetryingObservationIds(new Set(retrying.current));
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token || session.user.id !== userId)
          throw new Error("Reconnectez-vous pour relancer l’analyse.");
        const receipt = readAnalysisReceipt(
          await requestCosmosJson(
            "/api/cosmos/analyze-cluster",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + session.access_token,
              },
              body: JSON.stringify({ observation_id: observationId }),
            },
            30_000,
          ),
        );
        if (mounted.current && currentUserId.current === userId) {
          setProcessing(receipt.processing);
          setOwnObservations((items) =>
            items.map((item) => (item.id === receipt.observation.id ? receipt.observation : item)),
          );
          if (receipt.processing.status === "ready")
            toast.success("Suivi actualisé", {
              description: "Consultez l’état de votre signalement.",
            });
          else
            toast.info("Analyse encore en attente", {
              description:
                receipt.processing.message ??
                "Le signalement est conservé. Vous pourrez réessayer.",
            });
          activeRequest.current?.abort();
          activeRequest.current = null;
          void latestRefresh.current();
        }
      } catch (error) {
        if (mounted.current)
          toast.error("Analyse indisponible", { description: errorMessage(error) });
      } finally {
        retrying.current.delete(observationId);
        if (mounted.current) setRetryingObservationIds(new Set(retrying.current));
      }
    },
    [userId],
  );

  return {
    observations,
    events,
    ownObservations,
    processing,
    sinceMinutes,
    changePeriod,
    isLoading,
    isRefreshing,
    feedError,
    accountError,
    lastUpdatedAt,
    isOnline,
    isLive: isOnline && !feedError && lastUpdatedAt !== null && now - lastUpdatedAt < 30_000,
    userPosition,
    positionError,
    isLocating,
    isSubmitting,
    isActive,
    isAuthenticated: Boolean(user),
    isAuthLoading,
    activate,
    deactivate,
    applyManualPosition,
    submitObservation,
    retryAnalysis,
    retryingObservationIds,
    refresh: loadData,
  };
}
