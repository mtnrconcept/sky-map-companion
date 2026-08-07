import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { CommonsImage } from "@/components/CommonsImage";
import { CATEGORIES, imageQuery, type LinkItem } from "@/data/resources";

export function ResourceBreadcrumb({ current }: { current: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-xs">
      <Link
        to="/ressources"
        className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Ressources
      </Link>
      <span className="text-muted-foreground/50">/</span>
      <span className="rounded-md bg-primary/15 px-2 py-1 font-medium text-primary">
        {current}
      </span>
      <span className="ml-auto flex flex-wrap gap-1">
        {CATEGORIES.filter((c) => c.title !== current).map((c) => (
          <Link
            key={c.slug}
            to={c.to}
            className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {c.title}
          </Link>
        ))}
      </span>
    </nav>
  );
}

export function LinkGrid({ items }: { items: readonly LinkItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <a
          key={i.url}
          href={i.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-colors hover:border-primary/50 hover:bg-accent/40"
        >
          <CommonsImage
            query={imageQuery(i.name, i.desc)}
            alt={i.name}
            className="h-32 w-full"
          />
          <div className="p-4">
            <p className="flex items-center gap-1.5 font-medium">
              {i.name}
              <ExternalLink className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{i.desc}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
