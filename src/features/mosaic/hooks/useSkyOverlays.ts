import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSkyOverlaySnapshot,
  sanitizeSkyOverlayPreferences,
  SKY_OVERLAYS,
  type SkyOverlayId,
  type SkyOverlayPreferences,
  type SkyOverlaySnapshot,
} from "../domain/sky-overlays";
import type { AladinApi, AladinInstance } from "../lib/aladin-lite";
import { createSkyOverlays } from "../lib/sky-overlays";

export interface SkyOverlayConnection {
  api: AladinApi;
  aladin: AladinInstance;
}

export interface UseSkyOverlaysResult {
  snapshot: SkyOverlaySnapshot;
  ready: boolean;
  setEnabled(id: SkyOverlayId, enabled: boolean): void;
  retry(id: SkyOverlayId): void;
  setImageSurvey(id: string | null): void;
  setImageOpacity(opacity: number): void;
  refreshViewport(): void;
  ensureImageOnTop(): void;
}

function readPreferences(storageKey: string): SkyOverlayPreferences {
  if (typeof window === "undefined") return {};
  try {
    return sanitizeSkyOverlayPreferences(
      JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"),
    );
  } catch {
    // Private browsing, corrupt preferences or a storage quota must not prevent
    // the atlas and its local catalogues from being used.
    return {};
  }
}

function preferencesForSnapshot(snapshot: SkyOverlaySnapshot): SkyOverlayPreferences {
  return sanitizeSkyOverlayPreferences({
    enabled: Object.fromEntries(SKY_OVERLAYS.map(({ id }) => [id, snapshot.layers[id].enabled])),
    imageSurveyId: snapshot.image.surveyId,
    imageOpacity: snapshot.image.opacity,
  });
}

/** Own one overlay controller per viewer, independently of UI status updates. */
export function useSkyOverlays(
  connection: SkyOverlayConnection | null,
  storageKey: string,
): UseSkyOverlaysResult {
  const api = connection?.api;
  const aladin = connection?.aladin;
  const controllerRef = useRef<ReturnType<typeof createSkyOverlays> | null>(null);
  const [snapshot, setSnapshot] = useState(() => createSkyOverlaySnapshot());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const preferences = readPreferences(storageKey);
    setReady(false);
    setSnapshot(createSkyOverlaySnapshot(preferences));
    if (!api || !aladin) return;

    let active = true;
    let savedPreferences: string | null = null;
    const receiveSnapshot = (next: SkyOverlaySnapshot) => {
      if (!active) return;
      setSnapshot(next);
      const serialized = JSON.stringify(preferencesForSnapshot(next));
      // A layer can report changing load status and source counts. Only user
      // preferences belong in storage; avoid rewriting it for those reports.
      if (serialized === savedPreferences) return;
      savedPreferences = serialized;
      try {
        window.localStorage.setItem(storageKey, serialized);
      } catch {
        // All controls remain available when browser storage is disabled.
      }
    };

    const controller = createSkyOverlays(api, aladin, receiveSnapshot, preferences);
    controllerRef.current = controller;
    receiveSnapshot(controller.getSnapshot());
    setReady(true);

    return () => {
      active = false;
      if (controllerRef.current === controller) controllerRef.current = null;
      controller.dispose();
    };
  }, [api, aladin, storageKey]);

  const setEnabled = useCallback((id: SkyOverlayId, enabled: boolean) => {
    controllerRef.current?.setEnabled(id, enabled);
  }, []);

  const retry = useCallback((id: SkyOverlayId) => {
    controllerRef.current?.retry(id);
  }, []);

  const setImageSurvey = useCallback((id: string | null) => {
    controllerRef.current?.setImageSurvey(id);
  }, []);

  const setImageOpacity = useCallback((opacity: number) => {
    controllerRef.current?.setImageOpacity(opacity);
  }, []);

  const refreshViewport = useCallback(() => {
    controllerRef.current?.refreshViewport();
  }, []);

  const ensureImageOnTop = useCallback(() => {
    controllerRef.current?.ensureImageOnTop();
  }, []);

  return {
    snapshot,
    ready: Boolean(api && aladin && ready),
    setEnabled,
    retry,
    setImageSurvey,
    setImageOpacity,
    refreshViewport,
    ensureImageOnTop,
  };
}
