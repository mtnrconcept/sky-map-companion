import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Moon, Clock, LocateFixed, Sparkles } from "lucide-react";
import { SkyCanvas } from "@/components/SkyCanvas";
import { ObjectPanel } from "@/components/ObjectPanel";
import { useSky } from "@/lib/sky-store";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Carte du Ciel — planétarium en direct" },
      {
        name: "description",
        content:
          "Identifiez étoiles, planètes, amas et galaxies au-dessus de vous. Carte du ciel interactive en temps réel, avec heures de lever et conseils d'observation.",
      },
      { property: "og:title", content: "Carte du Ciel — planétarium en direct" },
      {
        property: "og:description",
        content:
          "Le ciel de votre position, en direct : constellations, planètes et objets du ciel profond.",
      },
    ],
  }),
  component: SkyPage,
});

function SkyPage() {
  const {
    location,
    geolocate,
    geoStatus,
    date,
    offsetMinutes,
    setOffsetMinutes,
    resetToNow,
    nightMode,
    toggleNightMode,
  } = useSky();
  const { user } = useAuth();
  const [compass, setCompass] = useState(false);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <SkyCanvas compass={compass} />

      <header className="glass pointer-events-auto absolute inset-x-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
        <h1 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" />
          Carte du Ciel
        </h1>
        <div className="mr-auto">
          <AppNav compact />
        </div>

        <button
          onClick={geolocate}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent"
        >
          <MapPin className="size-3.5" />
          {location.name} {location.latitude.toFixed(2)}°,{" "}
          {location.longitude.toFixed(2)}°
          {geoStatus === "pending" ? " …" : ""}
        </button>
        <Button
          size="sm"
          variant={compass ? "default" : "ghost"}
          onClick={() => setCompass((v) => !v)}
          title="Boussole"
        >
          <LocateFixed className="size-4" />
        </Button>
        <Button
          size="sm"
          variant={nightMode ? "default" : "ghost"}
          onClick={toggleNightMode}
          title="Mode nuit"
        >
          <Moon className="size-4" />
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to="/auth">{user ? "Mon compte" : "Se connecter"}</Link>
        </Button>
      </header>

      <div className="glass pointer-events-auto absolute inset-x-3 bottom-3 z-10 flex items-center gap-3 rounded-xl px-4 py-3 sm:inset-x-auto sm:left-3 sm:w-[360px]">
        <Clock className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm" suppressHydrationWarning>
            {date.toLocaleString("fr-FR", {
              weekday: "short",
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>

          <Slider
            className="mt-2"
            min={-720}
            max={720}
            step={5}
            value={[offsetMinutes]}
            onValueChange={(v) => setOffsetMinutes(v[0] ?? 0)}
          />
        </div>
        {offsetMinutes !== 0 && (
          <Button size="sm" variant="ghost" onClick={resetToNow}>
            Maintenant
          </Button>
        )}
      </div>

      <ObjectPanel />
    </main>
  );
}
