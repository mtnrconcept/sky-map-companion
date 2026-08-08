import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ObservingLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export const DEFAULT_LOCATION: ObservingLocation = {
  name: "Paris",
  latitude: 48.8566,
  longitude: 2.3522,
};

interface SkyState {
  location: ObservingLocation;
  setLocation: (l: ObservingLocation) => void;
  geolocate: () => void;
  geoStatus: "idle" | "pending" | "denied" | "ok";
  date: Date;
  offsetMinutes: number;
  setOffsetMinutes: (m: number) => void;
  live: boolean;
  resetToNow: () => void;
  nightMode: boolean;
  toggleNightMode: () => void;
  selected: string | null;
  select: (id: string | null) => void;
  target: string | null;
  setTarget: (id: string | null) => void;
  showLines: boolean;
  toggleLines: () => void;
  showLabels: boolean;
  toggleLabels: () => void;
}

const SkyContext = createContext<SkyState | null>(null);

const STORAGE_KEY = "carte-du-ciel:prefs";

interface StoredPrefs {
  location?: ObservingLocation;
  nightMode?: boolean;
  showLines?: boolean;
  showLabels?: boolean;
}

function readPrefs(): StoredPrefs {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function SkyProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] =
    useState<ObservingLocation>(DEFAULT_LOCATION);
  const [nightMode, setNightMode] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [offsetMinutes, setOffsetMinutes] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "pending" | "denied" | "ok"
  >("idle");
  const hydrated = useRef(false);

  useEffect(() => {
    const p = readPrefs();
    if (p.location) setLocationState(p.location);
    if (p.nightMode !== undefined) setNightMode(p.nightMode);
    if (p.showLines !== undefined) setShowLines(p.showLines);
    if (p.showLabels !== undefined) setShowLabels(p.showLabels);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ location, nightMode, showLines, showLabels }),
    );
  }, [location, nightMode, showLines, showLabels]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("night", nightMode);
  }, [nightMode]);

  const geolocate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoStatus("denied");
      return;
    }
    setGeoStatus("pending");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocationState({
          name: "Ma position",
          latitude: Number(p.coords.latitude.toFixed(4)),
          longitude: Number(p.coords.longitude.toFixed(4)),
        });
        setGeoStatus("ok");
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }, []);

  const date = useMemo(
    () => new Date(now.getTime() + offsetMinutes * 60000),
    [now, offsetMinutes],
  );

  const value: SkyState = {
    location,
    setLocation: setLocationState,
    geolocate,
    geoStatus,
    date,
    offsetMinutes,
    setOffsetMinutes,
    live: offsetMinutes === 0,
    resetToNow: () => setOffsetMinutes(0),
    nightMode,
    toggleNightMode: () => setNightMode((v) => !v),
    selected,
    select: setSelected,
    target,
    setTarget,
    showLines,
    toggleLines: () => setShowLines((v) => !v),
    showLabels,
    toggleLabels: () => setShowLabels((v) => !v),
  };

  return <SkyContext.Provider value={value}>{children}</SkyContext.Provider>;
}

export function useSky(): SkyState {
  const ctx = useContext(SkyContext);
  if (!ctx) throw new Error("useSky doit être utilisé dans SkyProvider");
  return ctx;
}
