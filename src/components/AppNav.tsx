import { Link, useRouterState } from "@tanstack/react-router";
import { Telescope, Search, Bot, BookOpen, Map, Users, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Ciel", icon: Map },
  { to: "/explorer", label: "Explorer", icon: Search },
  { to: "/cosmos-live", label: "Cosmos Live", icon: Radio },
  { to: "/assistant", label: "Assistant", icon: Bot },
  { to: "/ressources", label: "Ressources", icon: BookOpen },
  { to: "/communaute", label: "Communauté", icon: Users },
] as const;

export function AppNav({ compact = false }: { compact?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => {
        const active = l.to === "/" ? pathname === "/" : pathname.startsWith(l.to);
        return (
          <Link
            key={l.to}
            to={l.to}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <l.icon className="size-3.5" />
            <span className={compact ? "hidden sm:inline" : ""}>{l.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
          <Telescope className="size-4 text-primary" />
          Carte du Ciel
        </Link>
        <div className="ml-auto">
          <AppNav compact />
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </header>
  );
}
