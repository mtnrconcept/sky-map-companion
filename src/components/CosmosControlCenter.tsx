import { useEffect, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Crosshair,
  Eye,
  Globe2,
  Layers3,
  LocateFixed,
  Map,
  MapPin,
  Menu,
  Orbit,
  Radio,
  RefreshCw,
  Satellite,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Telescope,
  Users,
  X,
  Zap,
} from "lucide-react";
import { CosmosReportForm } from "@/components/CosmosReportForm";
import { CosmosOperationsMap, type CosmosMapMode } from "@/components/CosmosOperationsMap";
import { CosmosTriangulationScene } from "@/components/CosmosTriangulationScene";
import { CosmosTriangulationPanel } from "@/components/CosmosTriangulationPanel";
import { useCosmosLive } from "@/hooks/useCosmosLive";
import {
  PHENOMENA,
  formatCoordinate,
  observationProgress,
  parseManualPosition,
  phenomenonLabel,
  relativeTime,
  type CosmosEvent,
  type CosmosObservation,
  type PhenomenonType,
} from "@/features/cosmos/domain/client-state";
import "./cosmos-control-center.css";

type TableMode = "observations" | "events" | "analysis" | "mine";
type ShowMode = "live" | "demo";

const MOCK_EVENT_ID = "demo-bolide-alpes";
const MOCK_SITES: Array<[string, number, number, number, number]> = [
  ["Genève", 46.2, 6.1, 118.4, 31.9],
  ["Lausanne", 46.5, 6.6, 121.0, 32.7],
  ["Annecy", 45.9, 6.1, 122.6, 33.1],
  ["Lyon", 45.8, 4.8, 120.8, 31.5],
  ["Grenoble", 45.2, 5.7, 123.1, 34.0],
  ["Turin", 45.1, 7.7, 125.3, 35.2],
];

function makeDemoData(now: number): { observations: CosmosObservation[]; events: CosmosEvent[] } {
  const base = now - 4 * 60_000;
  const observations: CosmosObservation[] = MOCK_SITES.map(([place, lat, lon], i) => ({
    id: "demo-" + (i + 1),
    event_id: MOCK_EVENT_ID,
    phenomenon_type: "fireball",
    description: "DÉMO · Bolide lumineux aperçu depuis " + place + " (simulation).",
    latitude: lat,
    longitude: lon,
    duration_s: 14,
    magnitude: null,
    observed_at: new Date(base + i * 2800).toISOString(),
    status: "analyzed",
  }));
  return {
    observations,
    events: [
      {
        id: MOCK_EVENT_ID,
        title: "DÉMO · Bolide observé dans les Alpes",
        description: "Données fictives pour présenter la corrélation entre six observateurs.",
        phenomenon_type: "fireball",
        observation_count: 6,
        status: "provisional",
        event_at: observations[0]?.observed_at ?? new Date(base).toISOString(),
        triangulation: {
          estimated_latitude: 46.62,
          estimated_longitude: 7.89,
          estimated_altitude_km: 78,
          residual_rms_km: 4.3,
          max_residual_km: 7.8,
          observer_count: 6,
          baseline_km: 288.2,
          time_span_seconds: 14,
          method: "demonstration-only",
        },
      },
    ],
  };
}

function shortDate(value: string): string {
  return new Date(value).toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortTime(value: string): string {
  return new Date(value).toLocaleTimeString("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function StatusIcon({ okay }: { okay: boolean }) {
  return okay ? (
    <CheckCircle2 size={15} className="cs-ok" aria-label="Critère rempli" />
  ) : (
    <Clock3 size={15} className="cs-pending" aria-label="À vérifier" />
  );
}

function HeightProfile({ event }: { event: CosmosEvent | null }) {
  const height = event?.triangulation?.estimated_altitude_km ?? null;
  const max = height !== null ? Math.max(100, Math.ceil(height / 25) * 25) : 100;
  const y = height !== null ? 167 - (height / max) * 125 : 0;
  return (
    <div className="cs-height-chart">
      <svg
        viewBox="0 0 500 200"
        role="img"
        aria-label={
          height === null
            ? "Profil d'altitude indisponible"
            : "Altitude estimée unique à " +
              height.toFixed(1) +
              " kilomètres ; trajectoire non calculable"
        }
      >
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const pos = 167 - step * 125;
          return (
            <g key={step}>
              <line
                x1="54"
                y1={pos}
                x2="476"
                y2={pos}
                stroke="#33435f"
                strokeOpacity=".6"
                strokeDasharray="3 5"
              />
              <text x="45" y={pos + 4} textAnchor="end" fill="#91a0b8" fontSize="11">
                {Math.round(step * max)} km
              </text>
            </g>
          );
        })}
        <line x1="54" y1="167" x2="476" y2="167" stroke="#7082a4" strokeOpacity=".8" />
        {height !== null && (
          <>
            <line
              x1="264"
              y1={y}
              x2="264"
              y2="167"
              stroke="#fbbf24"
              strokeDasharray="4 6"
              strokeOpacity=".6"
            />
            <circle cx="264" cy={y} r="10" fill="#f59e0b" fillOpacity=".18" />
            <circle cx="264" cy={y} r="5" fill="#ffcc63" stroke="#fff" strokeWidth="1" />
            <text x="281" y={Math.max(y - 8, 20)} fill="#fcd58b" fontWeight="600" fontSize="13">
              {height.toFixed(1) + " km"}
            </text>
          </>
        )}
        <text x="270" y="190" textAnchor="middle" fill="#8293b2" fontSize="11">
          {height === null
            ? "Aucune mesure géométrique"
            : "Position estimée ponctuelle · pas de trajectoire"}
        </text>
      </svg>
    </div>
  );
}

function SkyIllustration({ hasEvent }: { hasEvent: boolean }) {
  return (
    <div
      className="cs-sky-art"
      role="img"
      aria-label="Illustration astronomique non issue des témoignages"
    >
      <span className="cs-art-stars cs-art-stars-1" />
      <span className="cs-art-stars cs-art-stars-2" />
      <span className="cs-art-nebula" />
      {hasEvent && <span className="cs-meteor-streak" />}
      <span className="cs-mountain cs-mountain-back" />
      <span className="cs-mountain cs-mountain-front" />
      <span className="cs-sky-art-label">ILLUSTRATION · NON PROBANTE</span>
    </div>
  );
}

function PanelTitle({
  icon: Icon,
  children,
  right,
}: {
  icon: typeof Activity;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="cs-panel-title">
      <div>
        <Icon size={17} className="cs-panel-icon" />
        <h2>{children}</h2>
      </div>
      {right}
    </div>
  );
}

export function CosmosControlCenter() {
  const cosmos = useCosmosLive();
  const {
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
    isLive,
    userPosition,
    positionError,
    isLocating,
    isSubmitting,
    isActive,
    isAuthenticated,
    isAuthLoading,
    activate,
    deactivate,
    applyManualPosition,
    submitObservation,
    retryAnalysis,
    retryingObservationIds,
    refresh,
  } = cosmos;
  const [showMode, setShowMode] = useState<ShowMode>("live");
  const [demoAnchor, setDemoAnchor] = useState(0);
  const [mapMode, setMapMode] = useState<CosmosMapMode>("map");
  const [tableMode, setTableMode] = useState<TableMode>("observations");
  const [phenomenonFilter, setPhenomenonFilter] = useState<PhenomenonType | "all">("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [altitude, setAltitude] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [visibleOwnCount, setVisibleOwnCount] = useState(20);

  useEffect(() => {
    changePeriod(1440);
  }, [changePeriod]);
  useEffect(() => {
    if (!reportOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setReportOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reportOpen]);

  const demo = showMode === "demo" ? makeDemoData(demoAnchor) : null;
  const sourceObservations = demo?.observations ?? observations;
  const sourceEvents = demo?.events ?? events;
  const allObservations = sourceObservations.filter(
    (obs) => phenomenonFilter === "all" || obs.phenomenon_type === phenomenonFilter,
  );
  const allEvents = sourceEvents.filter(
    (ev) => phenomenonFilter === "all" || ev.phenomenon_type === phenomenonFilter,
  );
  const featured = allEvents.find((event) => event.id === selectedEventId) ?? allEvents[0] ?? null;
  const tri = featured?.triangulation ?? null;
  const featuredObservations = featured
    ? allObservations.filter((obs) => obs.event_id === featured.id)
    : [];
  const triCount = allEvents.filter((event) => event.triangulation).length;
  const selectedObs = allObservations.find(
    (observation) => observation.id === selectedObservationId,
  );
  const dataReady = showMode === "demo" || !isLoading;
  const validFeed = showMode === "demo" || lastUpdatedAt !== null;

  const geometryChecks = [
    {
      label: "Deux observateurs distincts",
      okay: Boolean(tri && (tri.observer_count ?? featured?.observation_count ?? 0) >= 2),
    },
    {
      label: "Intervalle ≤ 30 secondes",
      okay: Boolean(tri && tri.time_span_seconds !== null && tri.time_span_seconds <= 30),
    },
    {
      label: "Séparation ≥ 1 km",
      okay: Boolean(tri && tri.baseline_km !== null && tri.baseline_km >= 1),
    },
    {
      label: "Écart résiduel ≤ 25 km",
      okay: Boolean(tri && tri.residual_rms_km !== null && tri.residual_rms_km <= 25),
    },
  ];
  const validChecks = geometryChecks.filter((item) => item.okay).length;

  function toggleDemo() {
    setShowMode((current) => {
      if (current === "live") setDemoAnchor(Date.now());
      return current === "live" ? "demo" : "live";
    });
    setSelectedEventId(null);
    setSelectedObservationId(null);
    setPhenomenonFilter("all");
  }
  function chooseObservation(id: string) {
    setSelectedObservationId(id);
    const eventId = sourceObservations.find((obs) => obs.id === id)?.event_id;
    if (eventId) setSelectedEventId(eventId);
  }
  function saveManualLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      applyManualPosition(parseManualPosition(latitude, longitude, altitude));
      setLocationOpen(false);
      setManualError(null);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "Coordonnées invalides.");
    }
  }
  function openTable(mode: TableMode) {
    setTableMode(mode);
    document
      .getElementById("cosmos-observation-table")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const kpis = [
    {
      label: "Observations (24 h)",
      value: dataReady && validFeed ? String(allObservations.length) : "—",
      icon: Radio,
      note: allObservations.length >= 200 ? "200 derniers éléments" : "Signalements affichés",
    },
    {
      label: "Événements détectés",
      value: dataReady && validFeed ? String(allEvents.length) : "—",
      icon: Layers3,
      note: "Rapprochements reçus",
    },
    {
      label: "Événement suivi",
      value: dataReady && validFeed ? (featured ? "1" : "0") : "—",
      icon: Zap,
      note: featured ? "Analyse sélectionnée" : "Aucune sélection",
    },
    { label: "Observateurs actifs", value: "—", icon: Users, note: "Mesure non disponible" },
    { label: "Couverture (pays)", value: "—", icon: Globe2, note: "Mesure non disponible" },
  ];

  return (
    <main className="cosmos-ops">
      <aside
        className={"cs-sidebar" + (showMobileNav ? " cs-sidebar-open" : "")}
        aria-label="Navigation Sky Map Companion"
      >
        <a href="/" className="cs-brand">
          <span className="cs-brand-orbit">
            <Orbit size={29} />
          </span>
          <span>
            Sky Map
            <br />
            Companion
          </span>
        </a>
        <nav className="cs-side-links" aria-label="Navigation principale">
          <a href="/">
            <Map size={19} />
            Accueil
          </a>
          <a href="/cosmos-live" className="cs-active" aria-current="page">
            <Radio size={19} />
            Cosmos Live <i />
          </a>
          <a href="/">
            <Telescope size={19} />
            Carte du ciel
          </a>
          <button type="button" onClick={() => openTable("events")}>
            <Layers3 size={19} />
            Événements
          </button>
          <button type="button" onClick={() => openTable("analysis")}>
            <Activity size={19} />
            Analyses
          </button>
          <a href="/astrostack">
            <Satellite size={19} />
            AstroStack
          </a>
          <a href="/communaute">
            <Users size={19} />
            Communauté
          </a>
        </nav>
        <div className="cs-sidebar-bottom">
          <a href="/ressources">
            <BookOpen size={17} />
            Ressources
          </a>
          <button type="button" onClick={() => setReportOpen(true)}>
            <CircleHelp size={17} />
            Signaler
          </button>
        </div>
      </aside>

      <div className="cs-workspace">
        <header className="cs-topbar">
          <button
            className="cs-mobile-menu"
            type="button"
            aria-label="Afficher le menu"
            aria-expanded={showMobileNav}
            onClick={() => setShowMobileNav((v) => !v)}
          >
            <Menu size={20} />
          </button>
          <div className="cs-heading">
            <div>
              <h1>Cosmos Live</h1>
              <span className="cs-live-pill">
                <span className="cs-pulse-dot" />{" "}
                {showMode === "demo"
                  ? "Simulation"
                  : isLive
                    ? "En temps réel"
                    : isLoading
                      ? "Connexion…"
                      : "Flux en veille"}
              </span>
            </div>
            <p>Observations du ciel · Analyse collective · Localisation · Estimation géométrique</p>
          </div>
          <div className="cs-head-actions">
            <span
              className={
                "cs-system-status " + (processing.status === "ready" ? "cs-status-good" : "")
              }
            >
              <CheckCircle2 size={15} />
              {processing.status === "ready" ? "Système opérationnel" : "Analyse en attente"}
            </span>
            <button
              type="button"
              className={"cs-demo-switch" + (showMode === "demo" ? " is-demo" : "")}
              onClick={toggleDemo}
              aria-pressed={showMode === "demo"}
            >
              <Sparkles size={15} />
              {showMode === "demo" ? "Quitter la démo" : "Mode démo"}
            </button>
            <button type="button" className="cs-report-button" onClick={() => setReportOpen(true)}>
              <Send size={15} /> Signaler
            </button>
          </div>
        </header>

        {showMode === "demo" && (
          <div className="cs-demo-banner" role="status">
            <Sparkles size={16} /> MODE DÉMONSTRATION — tous les chiffres, positions, témoignages et
            événements visibles sont fictifs. Aucun signalement n'est envoyé.
            <button type="button" onClick={toggleDemo}>
              Retour au direct <ChevronRight size={15} />
            </button>
          </div>
        )}
        {feedError && showMode === "live" && (
          <div className="cs-error-banner" role="alert">
            <Bell size={16} />
            <span>
              <strong>Flux momentanément indisponible.</strong> {feedError}
              {lastUpdatedAt !== null && " Dernières données conservées."}
            </span>
            <button type="button" onClick={() => void refresh()}>
              Réessayer
            </button>
          </div>
        )}
        {processing.status !== "ready" && processing.message && showMode === "live" && (
          <div className="cs-error-banner" role="status">
            <ShieldCheck size={16} />
            {processing.message}
          </div>
        )}

        <div className="cs-dashboard-content">
          <section className="cs-kpis" aria-label="Indicateurs Cosmos Live">
            {kpis.map(({ label, value, icon: Icon, note }, i) => (
              <div key={label} className={"cs-kpi" + (i === 2 ? " cs-kpi-focus" : "")}>
                <span className="cs-kpi-icon">
                  <Icon size={24} />
                </span>
                <div className="cs-kpi-content">
                  <span className="cs-kpi-title">{label}</span>
                  <strong>{value}</strong>
                  <small>{note}</small>
                </div>
              </div>
            ))}
          </section>

          <div className="cs-dashboard-grid">
            <section className="cs-panel cs-map-panel" aria-label="Carte en temps réel">
              <div className="cs-tabs cs-map-tabs">
                {(
                  [
                    ["map", "Carte en temps réel"],
                    ["trajectories", "Trajectoires"],
                    ["density", "Densité"],
                    ["network", "Réseau"],
                  ] as Array<[CosmosMapMode, string]>
                ).map(([mode, label]) => (
                  <button
                    type="button"
                    key={mode}
                    className={mapMode === mode ? "cs-tab-active" : ""}
                    aria-pressed={mapMode === mode}
                    onClick={() => setMapMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="cs-map-content">
                <CosmosOperationsMap
                  observations={allObservations}
                  events={allEvents}
                  selectedEventId={featured?.id ?? null}
                  selectedObservationId={selectedObservationId}
                  onSelectObservation={chooseObservation}
                  userPosition={userPosition}
                  mode={mapMode}
                />
              </div>
              <div className="cs-map-foot">
                <span>
                  {allObservations.length} position{allObservations.length !== 1 ? "s" : ""}{" "}
                  publique{allObservations.length !== 1 ? "s" : ""}
                </span>
                <label>
                  Fenêtre
                  <select
                    value={sinceMinutes}
                    onChange={(e) => {
                      changePeriod(Number(e.target.value) as 120 | 1440);
                      setSelectedObservationId(null);
                    }}
                  >
                    <option value={120}>2 h</option>
                    <option value={1440}>24 h</option>
                  </select>
                </label>
                <label>
                  Type
                  <select
                    value={phenomenonFilter}
                    onChange={(e) => {
                      setPhenomenonFilter(e.target.value as PhenomenonType | "all");
                      setSelectedObservationId(null);
                    }}
                  >
                    <option value="all">Tous</option>
                    {PHENOMENA.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="cs-panel cs-feature-panel" aria-labelledby="cs-feature-heading">
              <div className="cs-event-topline">
                <span className="cs-event-tag">
                  <Zap size={15} /> {featured ? "Événement suivi" : "Flux de détection"}
                </span>
                {featured && (
                  <span className="cs-event-ref">#{featured.id.slice(0, 13).toUpperCase()}</span>
                )}
              </div>
              <h2 id="cs-feature-heading">
                {featured ? featured.title : "En attente d’un événement corrélé"}
              </h2>
              <p className="cs-feature-meta">
                <Clock3 size={14} />
                {featured
                  ? shortDate(featured.event_at)
                  : "Aucun rapprochement confirmé par plusieurs témoins"}
                {featured && <> · {featured.observation_count} signalements</>}
              </p>
              <SkyIllustration hasEvent={Boolean(featured)} />
              <div className="cs-feature-action">
                <span>
                  <Eye size={14} />{" "}
                  {featured ? "Analyse collective · à vérifier" : "Surveillance en cours"}
                </span>
                <button
                  type="button"
                  onClick={() => openTable(featured ? "events" : "observations")}
                >
                  {featured ? "Détails" : "Observations"} <ArrowUpRight size={14} />
                </button>
              </div>
            </section>

            <section
              className="cs-panel cs-geo-panel"
              aria-label="Données d'estimation géométrique"
            >
              <PanelTitle icon={Crosshair}>Estimation géométrique</PanelTitle>
              <dl className="cs-geo-list">
                <div>
                  <dt>Position (latitude)</dt>
                  <dd>{tri ? formatCoordinate(tri.estimated_latitude, "latitude", 2) : "—"}</dd>
                </div>
                <div>
                  <dt>Position (longitude)</dt>
                  <dd>{tri ? formatCoordinate(tri.estimated_longitude, "longitude", 2) : "—"}</dd>
                </div>
                <div>
                  <dt>Altitude estimée</dt>
                  <dd>{tri ? tri.estimated_altitude_km.toFixed(1) + " km" : "—"}</dd>
                </div>
                <div>
                  <dt>Écart aux visées (RMS)</dt>
                  <dd>
                    {tri?.residual_rms_km != null ? tri.residual_rms_km.toFixed(2) + " km" : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Base observateurs</dt>
                  <dd>{tri?.baseline_km != null ? tri.baseline_km.toFixed(1) + " km" : "—"}</dd>
                </div>
                <div>
                  <dt>Intervalle</dt>
                  <dd>
                    {tri?.time_span_seconds != null ? tri.time_span_seconds.toFixed(1) + " s" : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Vitesse</dt>
                  <dd className="cs-not-measured">Non calculable</dd>
                </div>
                <div>
                  <dt>Trajectoire / direction</dt>
                  <dd className="cs-not-measured">Non calculable</dd>
                </div>
              </dl>
              <p className="cs-geo-note">
                <ShieldCheck size={13} /> Position estimée, jamais une confirmation scientifique.
              </p>
            </section>

            <section className="cs-panel cs-table-panel" id="cosmos-observation-table">
              <div className="cs-tabs cs-data-tabs">
                <button
                  type="button"
                  onClick={() => setTableMode("observations")}
                  className={tableMode === "observations" ? "cs-tab-active" : ""}
                >
                  Observations ({allObservations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTableMode("events")}
                  className={tableMode === "events" ? "cs-tab-active" : ""}
                >
                  Événements ({allEvents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTableMode("analysis")}
                  className={tableMode === "analysis" ? "cs-tab-active" : ""}
                >
                  Analyses ({triCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTableMode("mine")}
                  className={tableMode === "mine" ? "cs-tab-active" : ""}
                >
                  Mes signalements
                </button>
              </div>
              <div className="cs-data-body">
                {tableMode === "observations" && (
                  <div className="cs-table-scroll">
                    <table className="cs-observations-table">
                      <thead>
                        <tr>
                          <th>Observateur</th>
                          <th>Lieu (approx.)</th>
                          <th>Heure</th>
                          <th>Phénomène</th>
                          <th>Az. / Élé.</th>
                          <th>État</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allObservations.slice(0, visibleCount).map((obs) => (
                          <tr
                            key={obs.id}
                            onClick={() => chooseObservation(obs.id)}
                            className={selectedObservationId === obs.id ? "cs-selected-row" : ""}
                          >
                            <td>
                              <button
                                type="button"
                                onClick={() => chooseObservation(obs.id)}
                                aria-label={"Afficher l'observation " + obs.id}
                                className="cs-observer-id"
                              >
                                <span className="cs-person-icon">
                                  <Users size={13} />
                                </span>
                                {obs.id.startsWith("demo")
                                  ? "DEMO-" + obs.id.slice(-1)
                                  : "OBS-" + obs.id.slice(0, 6).toUpperCase()}
                              </button>
                            </td>
                            <td>
                              <MapPin size={12} className="cs-inline-pin" />{" "}
                              {formatCoordinate(obs.latitude, "latitude", 1)} ·{" "}
                              {formatCoordinate(obs.longitude, "longitude", 1)}
                            </td>
                            <td>
                              <time dateTime={obs.observed_at}>{shortTime(obs.observed_at)}</time>
                            </td>
                            <td>{phenomenonLabel(obs.phenomenon_type)}</td>
                            <td>
                              <span className="cs-muted-value" title="Mesures exactes privées">
                                Privé
                              </span>
                            </td>
                            <td>
                              {obs.event_id ? (
                                <span className="cs-linked-status">
                                  <Check size={12} /> Rapproché
                                </span>
                              ) : (
                                <span className="cs-muted-value">Déclaré</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!allObservations.length && (
                      <div className="cs-table-empty">
                        <Radio size={23} />
                        <strong>Aucun signalement pour ces filtres</strong>
                        <span>
                          La carte et le moteur restent actifs. Vous pouvez être le premier
                          observateur.
                        </span>
                        <button type="button" onClick={() => setReportOpen(true)}>
                          Signaler un phénomène <ChevronRight size={15} />
                        </button>
                      </div>
                    )}
                    {allObservations.length > visibleCount && (
                      <button
                        className="cs-load-more"
                        type="button"
                        onClick={() => setVisibleCount((v) => v + 20)}
                      >
                        Afficher plus ({allObservations.length - visibleCount})
                      </button>
                    )}
                  </div>
                )}
                {tableMode === "events" && (
                  <div className="cs-events-list">
                    {allEvents.map((event) => (
                      <button
                        type="button"
                        key={event.id}
                        className={
                          "cs-event-row" +
                          (featured?.id === event.id ? " cs-event-row-selected" : "")
                        }
                        onClick={() => {
                          setSelectedEventId(event.id);
                          setMapMode("network");
                        }}
                      >
                        <span className="cs-event-dot">
                          <Zap size={17} />
                        </span>
                        <span>
                          <strong>{event.title}</strong>
                          <small>
                            {event.observation_count} signalements · {relativeTime(event.event_at)}{" "}
                            · {event.triangulation ? "Position estimée" : "En attente de géométrie"}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                    {!allEvents.length && (
                      <div className="cs-table-empty">
                        <Layers3 size={23} />
                        <strong>Aucun événement rapproché</strong>
                        <span>Deux témoins indépendants sont nécessaires.</span>
                      </div>
                    )}
                  </div>
                )}
                {tableMode === "analysis" && (
                  <div className="cs-analysis-list">
                    <CosmosTriangulationPanel events={allEvents} />
                  </div>
                )}
                {tableMode === "mine" && (
                  <div className="cs-own-list">
                    {!isAuthenticated ? (
                      <div className="cs-table-empty">
                        <ShieldCheck size={23} />
                        <strong>Suivi personnel</strong>
                        <span>
                          Connectez-vous pour afficher vos analyses et relancer celles qui ont
                          échoué.
                        </span>
                        <a href="/auth" target="_blank" rel="noopener noreferrer">
                          Connexion dans un nouvel onglet <ArrowUpRight size={14} />
                        </a>
                      </div>
                    ) : accountError ? (
                      <p role="alert">{accountError}</p>
                    ) : ownObservations.length === 0 ? (
                      <div className="cs-table-empty">
                        <Compass size={22} />
                        <strong>Aucun signalement personnel</strong>
                      </div>
                    ) : (
                      ownObservations.slice(0, visibleOwnCount).map((obs) => {
                        const canRetry =
                          obs.status !== "rejected" &&
                          obs.job?.status !== "rejected" &&
                          (Boolean(obs.job?.error_code) ||
                            !obs.job ||
                            obs.job.status === "failed" ||
                            obs.job.status === "cancelled" ||
                            (obs.job.status !== "published" &&
                              Boolean(obs.job.updated_at) &&
                              Date.now() - Date.parse(obs.job.updated_at ?? "") > 60000));
                        return (
                          <div className="cs-own-item" key={obs.id}>
                            <div>
                              <strong>{phenomenonLabel(obs.phenomenon_type)}</strong>
                              <small>
                                {shortDate(obs.observed_at)} · {observationProgress(obs)}
                              </small>
                            </div>
                            {canRetry && (
                              <button
                                type="button"
                                disabled={retryingObservationIds.has(obs.id)}
                                onClick={() => void retryAnalysis(obs.id)}
                              >
                                {retryingObservationIds.has(obs.id)
                                  ? "Relance…"
                                  : "Relancer l’analyse"}
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                    {ownObservations.length > visibleOwnCount && (
                      <button
                        type="button"
                        className="cs-load-more"
                        onClick={() => setVisibleOwnCount((v) => v + 20)}
                      >
                        Voir les suivants
                      </button>
                    )}
                  </div>
                )}
              </div>
              {selectedObs && tableMode === "observations" && (
                <div className="cs-selected-detail">
                  <strong>{phenomenonLabel(selectedObs.phenomenon_type)}</strong> —{" "}
                  {selectedObs.description}
                </div>
              )}
            </section>

            <section className="cs-panel cs-triang-panel">
              <PanelTitle icon={Orbit}>Triangulation 3D</PanelTitle>
              <CosmosTriangulationScene event={featured} observations={featuredObservations} />
            </section>

            <section className="cs-panel cs-quality-panel">
              <PanelTitle icon={ShieldCheck}>Qualité géométrique</PanelTitle>
              <div className="cs-quality-layout">
                <div className={"cs-quality-ring" + (tri ? " cs-quality-ready" : "")}>
                  <span>
                    <strong>{tri ? validChecks + "/4" : "—"}</strong>
                    <small>critères</small>
                  </span>
                </div>
                <div className="cs-quality-checks">
                  {geometryChecks.map(({ label, okay }) => (
                    <div key={label}>
                      <StatusIcon okay={okay} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="cs-quality-note">
                Critères de cohérence, pas un pourcentage de certitude.
              </p>
            </section>

            <section className="cs-panel cs-altitude-panel">
              <PanelTitle icon={Activity}>Altitude de l’estimation</PanelTitle>
              <HeightProfile event={featured} />
            </section>

            <section className="cs-panel cs-classify-panel">
              <PanelTitle icon={Sparkles}>Classification (provisoire)</PanelTitle>
              <div className="cs-classify-body">
                <span>Type déclaré</span>
                <strong>
                  {featured ? phenomenonLabel(featured.phenomenon_type) : "Non déterminé"}
                </strong>
                <div className="cs-classification-tags">
                  {PHENOMENA.slice(0, 4).map((type) => (
                    <button
                      type="button"
                      key={type.value}
                      aria-pressed={phenomenonFilter === type.value}
                      className={
                        featured?.phenomenon_type === type.value ? "cs-class-selected" : ""
                      }
                      onClick={() =>
                        setPhenomenonFilter((current) =>
                          current === type.value ? "all" : type.value,
                        )
                      }
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
                <p>
                  <CircleHelp size={14} /> Aucune probabilité IA calculée ; identification à
                  confirmer par des sources indépendantes.
                </p>
              </div>
            </section>
          </div>

          <footer className="cs-live-ticker" aria-live="polite">
            <span className="cs-ticker-label">
              <span className="cs-pulse-dot" /> Flux en direct
            </span>
            {allObservations.length ? (
              allObservations.slice(0, 6).map((obs) => (
                <span className="cs-ticker-item" key={obs.id}>
                  <time dateTime={obs.observed_at}>{shortTime(obs.observed_at)}</time>
                  {phenomenonLabel(obs.phenomenon_type)} ·{" "}
                  {formatCoordinate(obs.latitude, "latitude", 1)}
                </span>
              ))
            ) : (
              <span className="cs-ticker-idle">Surveillance active · aucun événement récent</span>
            )}
            <span className="cs-ticker-end">
              {isRefreshing
                ? "Actualisation…"
                : lastUpdatedAt && showMode === "live"
                  ? "Mise à jour " + new Date(lastUpdatedAt).toLocaleTimeString("fr-CH")
                  : ""}
              <button
                type="button"
                onClick={() => void refresh()}
                aria-label="Actualiser le flux"
                disabled={isRefreshing}
              >
                <RefreshCw size={15} />
              </button>
            </span>
          </footer>
        </div>
      </div>

      {reportOpen && (
        <div
          className="cs-modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setReportOpen(false);
          }}
        >
          <section
            className="cs-report-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cs-report-heading"
          >
            <header>
              <div>
                <span className="cs-event-tag">
                  <Send size={14} /> Observation
                </span>
                <h2 id="cs-report-heading">Signaler un phénomène</h2>
                <p>Le signalement sera analysé après son enregistrement sécurisé.</p>
              </div>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="cs-drawer-close"
                aria-label="Fermer le formulaire"
              >
                <X size={21} />
              </button>
            </header>
            <div className="cs-drawer-scroll">
              {!isAuthLoading && !isAuthenticated && (
                <div className="cs-auth-notice">
                  Préparez votre déclaration puis{" "}
                  <a href="/auth" target="_blank" rel="noopener noreferrer">
                    connectez-vous dans un autre onglet
                  </a>
                  . Le brouillon et le fichier restent dans cette fenêtre.
                </div>
              )}
              <section className="cs-location">
                <h3>
                  <MapPin size={17} /> Lieu d’observation
                </h3>
                {userPosition && (
                  <p className="cs-location-value">
                    <CheckCircle2 size={15} />
                    {formatCoordinate(userPosition.latitude, "latitude", 4)} ·{" "}
                    {formatCoordinate(userPosition.longitude, "longitude", 4)}
                    <small>({userPosition.source === "manual" ? "manuel" : "GPS"})</small>
                  </p>
                )}
                <div className="cs-location-actions">
                  <button type="button" onClick={activate} disabled={isLocating || isSubmitting}>
                    <LocateFixed size={15} />
                    {isLocating ? "Localisation…" : "Utiliser mon GPS"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationOpen((v) => !v)}
                    aria-expanded={locationOpen}
                  >
                    <MapPin size={15} /> Saisie manuelle
                  </button>
                  {isActive && (
                    <button type="button" onClick={deactivate} disabled={isSubmitting}>
                      Arrêter
                    </button>
                  )}
                </div>
                {positionError && (
                  <p role="alert" className="cs-location-error">
                    {positionError}
                  </p>
                )}
                {locationOpen && (
                  <form onSubmit={saveManualLocation} className="cs-manual-fields">
                    <label>
                      Latitude (°)
                      <input
                        required
                        inputMode="decimal"
                        placeholder="46.2044"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                      />
                    </label>
                    <label>
                      Longitude (°)
                      <input
                        required
                        inputMode="decimal"
                        placeholder="6.1432"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                      />
                    </label>
                    <label>
                      Altitude (m, facultatif)
                      <input
                        inputMode="decimal"
                        value={altitude}
                        onChange={(e) => setAltitude(e.target.value)}
                      />
                    </label>
                    {manualError && (
                      <p role="alert" className="cs-location-error">
                        {manualError}
                      </p>
                    )}
                    <button type="submit" disabled={isSubmitting}>
                      Enregistrer la position
                    </button>
                  </form>
                )}
                <p>
                  La position exacte et les pièces jointes restent privées ; seule une position
                  arrondie est publique.
                </p>
              </section>
              <div className="cs-report-form">
                <CosmosReportForm
                  onSubmit={submitObservation}
                  isSubmitting={isSubmitting}
                  disabled={
                    !isActive ||
                    !userPosition ||
                    !isAuthenticated ||
                    !isOnline ||
                    showMode === "demo"
                  }
                />
              </div>
              {showMode === "demo" && (
                <p className="cs-auth-notice">
                  Quittez le mode démo pour envoyer un vrai signalement.
                </p>
              )}
              {!isOnline && (
                <p className="cs-location-error">
                  Connexion Internet nécessaire pour envoyer le signalement.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
