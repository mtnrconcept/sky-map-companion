import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Eye,
  Filter,
  CalendarClock,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/AppNav";
import { useSky } from "@/lib/sky-store";
import {
  searchSky,
  DEFAULT_FILTERS,
  FAMILY_LABELS,
  constellationOptions,
  type Family,
  type SearchFilters,
} from "@/lib/sky-search";
import { upcomingEvents, EVENT_LABELS, type EventKind } from "@/lib/events";
import { INSTRUMENT_LABELS, type Instrument } from "@/data/catalog";
import { formatTime, formatDegrees, twilight, moonPosition, moonPhaseName } from "@/lib/astro";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/explorer")({
  head: () => ({
    meta: [
      { title: "Explorer le ciel — recherche et événements astronomiques" },
      {
        name: "description",
        content:
          "Recherchez parmi les étoiles, planètes, nébuleuses et galaxies avec des filtres par catégorie, instrument, magnitude et visibilité, et consultez les prochains événements astronomiques.",
      },
      { property: "og:title", content: "Explorer le ciel — recherche et événements" },
      {
        property: "og:description",
        content:
          "Moteur de recherche céleste filtrable et calendrier des prochains événements observables.",
      },
    ],
  }),
  component: ExplorerPage,
});

const FAMILIES = Object.keys(FAMILY_LABELS) as Family[];
const INSTRUMENTS = Object.keys(INSTRUMENT_LABELS) as Instrument[];

function ExplorerPage() {
  const { date, location, select, offsetMinutes, setOffsetMinutes } = useSky();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [eventKinds, setEventKinds] = useState<EventKind[]>([]);
  const [horizon, setHorizon] = useState(90);

  const bucket = Math.floor(date.getTime() / 300000);

  const results = useMemo(
    () => searchSky(filters, date, location),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, bucket, location],
  );

  const events = useMemo(
    () =>
      upcomingEvents(date, horizon).filter(
        (e) => !eventKinds.length || eventKinds.includes(e.kind),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Math.floor(date.getTime() / 3600000), horizon, eventKinds],
  );

  const night = useMemo(() => {
    const tw = twilight(date, location);
    const m = moonPosition(date);
    return { tw, m };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, location]);

  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const openOnMap = (key: string) => {
    select(key);
    navigate({ to: "/" });
  };

  return (
    <main className="min-h-[100dvh] bg-background pb-16">
      <PageHeader
        title="Explorer le ciel"
        subtitle={`${location.name} · nuit noire de ${formatTime(night.tw.astronomicalDusk)} à ${formatTime(night.tw.astronomicalDawn)} · ${moonPhaseName(night.m.phase)} (${Math.round(night.m.illumination * 100)} %)`}
      />

      <div className="mx-auto max-w-6xl px-4 pt-6">
        <Tabs defaultValue="recherche">
          <TabsList>
            <TabsTrigger value="recherche">
              <Search className="size-3.5" /> Recherche
            </TabsTrigger>
            <TabsTrigger value="evenements">
              <CalendarClock className="size-3.5" /> Événements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recherche" className="mt-4">
            <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
              <aside className="space-y-5 rounded-xl border border-border/60 bg-card/40 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Filter className="size-4 text-primary" /> Filtres
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>

                <Input
                  placeholder="Nom, catalogue (M31, Vega…)"
                  value={filters.query}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, query: e.target.value }))
                  }
                />

                <div>
                  <p className="label-caps mb-2 text-muted-foreground">Catégorie</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FAMILIES.map((f) => (
                      <button
                        key={f}
                        onClick={() =>
                          setFilters((s) => ({ ...s, families: toggle(s.families, f) }))
                        }
                      >
                        <Badge
                          variant={filters.families.includes(f) ? "default" : "outline"}
                          className="cursor-pointer"
                        >
                          {FAMILY_LABELS[f]}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="label-caps mb-2 text-muted-foreground">Instrument</p>
                  <div className="flex flex-wrap gap-1.5">
                    {INSTRUMENTS.map((i) => (
                      <button
                        key={i}
                        onClick={() =>
                          setFilters((s) => ({
                            ...s,
                            instruments: toggle(s.instruments, i),
                          }))
                        }
                      >
                        <Badge
                          variant={
                            filters.instruments.includes(i) ? "default" : "outline"
                          }
                          className="cursor-pointer"
                        >
                          {INSTRUMENT_LABELS[i]}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="label-caps mb-2 text-muted-foreground">
                    Magnitude limite · {filters.maxMagnitude.toFixed(1)}
                  </p>
                  <Slider
                    min={-2}
                    max={14}
                    step={0.5}
                    value={[filters.maxMagnitude]}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, maxMagnitude: v[0] ?? 14 }))
                    }
                  />
                </div>

                <div>
                  <p className="label-caps mb-2 text-muted-foreground">
                    Hauteur minimale · {filters.minAltitude}°
                  </p>
                  <Slider
                    min={0}
                    max={80}
                    step={5}
                    value={[filters.minAltitude]}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, minAltitude: v[0] ?? 0 }))
                    }
                  />
                </div>

                <label className="flex items-center justify-between text-sm">
                  Visibles maintenant
                  <Switch
                    checked={filters.onlyVisible}
                    onCheckedChange={(v) =>
                      setFilters((f) => ({ ...f, onlyVisible: v }))
                    }
                  />
                </label>

                <div>
                  <p className="label-caps mb-2 text-muted-foreground">Constellation</p>
                  <Select
                    value={filters.constellation || "toutes"}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        constellation: v === "toutes" ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="toutes">Toutes</SelectItem>
                      {constellationOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="label-caps mb-2 text-muted-foreground">
                    Date d'observation
                  </p>
                  <Slider
                    min={-720}
                    max={4320}
                    step={30}
                    value={[offsetMinutes]}
                    onValueChange={(v) => setOffsetMinutes(v[0] ?? 0)}
                  />
                  <p className="mt-2 font-mono text-xs text-muted-foreground" suppressHydrationWarning>
                    {date.toLocaleString("fr-FR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <div>
                  <p className="label-caps mb-2 text-muted-foreground">Trier par</p>
                  <Select
                    value={filters.sort}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, sort: v as SearchFilters["sort"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hauteur">Hauteur dans le ciel</SelectItem>
                      <SelectItem value="magnitude">Éclat (magnitude)</SelectItem>
                      <SelectItem value="nom">Nom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </aside>

              <section>
                <p className="mb-3 text-sm text-muted-foreground">
                  {results.length} objet{results.length > 1 ? "s" : ""} correspondant
                  {results.length > 1 ? "s" : ""}
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {results.map((r) => (
                    <li key={r.key}>
                      <button
                        onClick={() => openOnMap(r.key)}
                        className="w-full rounded-lg border border-border/60 bg-card/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{r.name}</p>
                            <p className="label-caps text-muted-foreground">
                              {r.typeLabel} · {r.constellation}
                            </p>
                          </div>
                          <Badge variant={r.vis.visible ? "default" : "secondary"}>
                            {r.vis.visible ? formatDegrees(r.vis.altitude) : "sous l'horizon"}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                          <span>mag {r.mag?.toFixed(1) ?? "—"}</span>
                          <span>{r.vis.direction}</span>
                          <span>lever {formatTime(r.vis.rise)}</span>
                          <span>coucher {formatTime(r.vis.set)}</span>
                        </div>
                        <p className="mt-1.5 text-xs text-primary">
                          {INSTRUMENT_LABELS[r.instrument]}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
                {!results.length && (
                  <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Aucun objet ne correspond à ces filtres. Élargissez la magnitude ou
                    désactivez « visibles maintenant ».
                  </p>
                )}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="evenements" className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(EVENT_LABELS) as EventKind[]).map((k) => (
                <button key={k} onClick={() => setEventKinds((s) => toggle(s, k))}>
                  <Badge
                    variant={eventKinds.includes(k) ? "default" : "outline"}
                    className="cursor-pointer"
                  >
                    {EVENT_LABELS[k]}
                  </Badge>
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                Horizon
                {[30, 90, 120].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={horizon === d ? "default" : "ghost"}
                    onClick={() => setHorizon(d)}
                  >
                    {d} j
                  </Button>
                ))}
              </div>
            </div>

            <ol className="mt-5 space-y-2">
              {events.map((e) => (
                <li
                  key={e.id}
                  className="flex gap-4 rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <div className="w-16 shrink-0 text-center">
                    <p className="font-mono text-lg leading-none">{e.date.getDate()}</p>
                    <p className="label-caps text-muted-foreground">
                      {e.date.toLocaleDateString("fr-FR", { month: "short" })}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {e.rank === 1 && <Sparkles className="size-3.5 text-primary" />}
                      {e.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{e.detail}</p>
                    <p className="label-caps mt-1 text-muted-foreground">
                      {EVENT_LABELS[e.kind]} ·{" "}
                      {e.date.toLocaleString("fr-FR", {
                        weekday: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {!events.length && (
              <p className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Aucun événement pour ces catégories sur cette période.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <div className="mx-auto mt-10 max-w-6xl px-4">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
          <Eye className="size-4 text-primary" />
          Cliquez sur un objet pour le retrouver centré sur la carte du ciel.
        </div>
      </div>
    </main>
  );
}
