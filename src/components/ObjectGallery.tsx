import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Loader2, X } from "lucide-react";

export interface CommonsPhoto {
  title: string;
  thumb: string;
  full: string;
  page: string;
  credit: string;
  license: string;
}

function stripHtml(v: string | undefined) {
  if (!v) return "";
  return v.replace(/<[^>]*>/g, "").trim();
}

async function searchCommons(query: string, limit: number): Promise<CommonsPhoto[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: "6",
      gsrlimit: String(limit),
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "800",
      format: "json",
      origin: "*",
    }).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error("Images indisponibles");
  const data = (await res.json()) as {
    query?: { pages?: Record<string, any> };
  };
  const pages = Object.values(data.query?.pages ?? {});
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const ii = p.imageinfo?.[0];
      const meta = ii?.extmetadata ?? {};
      return {
        title: String(p.title ?? "").replace(/^File:/, ""),
        thumb: ii?.thumburl ?? "",
        full: ii?.url ?? "",
        page: ii?.descriptionurl ?? "",
        credit: stripHtml(meta.Artist?.value) || "Wikimedia Commons",
        license: stripHtml(meta.LicenseShortName?.value) || "",
      };
    })
    .filter((p) => p.thumb);
}

const MAX_PHOTOS = 12;

async function fetchPhotos(queries: string[]): Promise<CommonsPhoto[]> {
  const results = await Promise.allSettled(
    queries.filter(Boolean).map((q) => searchCommons(q, 12)),
  );
  const seen = new Set<string>();
  const out: CommonsPhoto[] = [];
  // entrelace les résultats pour varier les sources
  const lists = results
    .filter((r): r is PromiseFulfilledResult<CommonsPhoto[]> => r.status === "fulfilled")
    .map((r) => r.value);
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth && out.length < MAX_PHOTOS; i++) {
    for (const list of lists) {
      const p = list[i];
      if (!p || seen.has(p.title)) continue;
      seen.add(p.title);
      out.push(p);
      if (out.length >= MAX_PHOTOS) break;
    }
  }
  if (out.length === 0 && results.every((r) => r.status === "rejected")) {
    throw new Error("Images indisponibles");
  }
  return out;
}

export function ObjectGallery({
  query,
  queries,
  name,
}: {
  query: string;
  queries?: string[];
  name: string;
}) {
  const [lightbox, setLightbox] = useState<CommonsPhoto | null>(null);

  const allQueries = Array.from(
    new Set([query, ...(queries ?? [])].map((q) => q?.trim()).filter(Boolean) as string[]),
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["commons-photos", allQueries],
    queryFn: () => fetchPhotos(allQueries),
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  useEffect(() => setLightbox(null), [query]);

  if (isLoading) {
    return (
      <div className="mt-4 flex h-24 items-center justify-center rounded-lg bg-secondary/50 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (isError || !data || data.length === 0) {
    return (
      <div className="mt-4 flex h-16 items-center justify-center gap-2 rounded-lg bg-secondary/50 text-xs text-muted-foreground">
        <ImageOff className="size-3.5" />
        Aucune photo trouvée
      </div>
    );
  }

  return (
    <>
      <div className="mt-4">
        <p className="label-caps mb-2 text-muted-foreground">
          Photographies ({data.length})
        </p>
        <div className="grid grid-cols-3 gap-2">
          {data.map((p) => (
            <button
              key={p.title}
              onClick={() => setLightbox(p)}
              className="group relative aspect-square overflow-hidden rounded-lg bg-secondary ring-1 ring-border/60 transition hover:ring-primary"
              title={p.title}
            >
              <img
                src={p.thumb}
                alt={`${name} — ${p.title}`}
                loading="lazy"
                className="size-full object-cover transition group-hover:scale-105"
              />
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Images : Wikimedia Commons
        </p>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <div
            className="max-h-full w-full max-w-3xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{lightbox.title}</p>
              <button
                onClick={() => setLightbox(null)}
                aria-label="Fermer"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="size-4" />
              </button>
            </div>
            <img
              src={lightbox.full}
              alt={`${name} — ${lightbox.title}`}
              className="mt-3 w-full rounded-xl"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {lightbox.credit}
              {lightbox.license ? ` · ${lightbox.license}` : ""} ·{" "}
              <a
                href={lightbox.page}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                source
              </a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
