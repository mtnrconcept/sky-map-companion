import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, Loader2, X } from "lucide-react";
import { commonsPhotoMatchesObject, isAllowedCommonsAssetUrl } from "@/lib/commons-image-relevance";

export interface CommonsPhoto {
  title: string;
  thumb: string;
  full: string;
  page: string;
  credit: string;
  license: string;
  description: string;
}

interface CommonsSearchPage {
  index?: number;
  title?: string;
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
}

function stripHtml(v: string | undefined) {
  if (!v) return "";
  return v
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    query?: { pages?: Record<string, CommonsSearchPage> };
  };
  const pages = Object.values(data.query?.pages ?? {});
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const ii = p.imageinfo?.[0];
      const meta = ii?.extmetadata ?? {};
      const title = String(p.title ?? "").replace(/^File:/, "");
      const description = stripHtml(
        meta["ImageDescription"]?.value ?? meta["ObjectName"]?.value ?? meta["Categories"]?.value,
      );
      return {
        title,
        thumb: ii?.thumburl ?? "",
        full: ii?.url ?? "",
        page: ii?.descriptionurl ?? "",
        credit: stripHtml(meta["Artist"]?.value) || "Wikimedia Commons",
        license: stripHtml(meta["LicenseShortName"]?.value) || "",
        description,
      };
    })
    .filter(
      (photo) =>
        photo.thumb &&
        photo.full &&
        photo.page &&
        isAllowedCommonsAssetUrl(photo.thumb, "image") &&
        isAllowedCommonsAssetUrl(photo.full, "image") &&
        isAllowedCommonsAssetUrl(photo.page, "page"),
    );
}

const MAX_PHOTOS = 12;

async function fetchPhotos(queries: string[], matchTerms: string[]): Promise<CommonsPhoto[]> {
  if (matchTerms.length === 0) return [];

  const results = await Promise.allSettled(
    queries.filter(Boolean).map((q) => searchCommons(q, 16)),
  );
  const seen = new Set<string>();
  const out: CommonsPhoto[] = [];
  const lists = results
    .filter((r): r is PromiseFulfilledResult<CommonsPhoto[]> => r.status === "fulfilled")
    .map((r) =>
      r.value.filter((photo) =>
        commonsPhotoMatchesObject(photo.title, photo.description, matchTerms),
      ),
    );
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth && out.length < MAX_PHOTOS; i++) {
    for (const list of lists) {
      const photo = list[i];
      if (!photo || seen.has(photo.full)) continue;
      seen.add(photo.full);
      out.push(photo);
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
  matchTerms,
  name,
}: {
  query: string;
  queries?: string[] | undefined;
  matchTerms: string[];
  name: string;
}) {
  const [lightbox, setLightbox] = useState<CommonsPhoto | null>(null);

  const allQueries = useMemo(
    () =>
      Array.from(
        new Set([query, ...(queries ?? [])].map((q) => q?.trim()).filter(Boolean) as string[]),
      ),
    [query, queries],
  );
  const canonicalTerms = useMemo(
    () => Array.from(new Set(matchTerms.map((term) => term.trim()).filter(Boolean))),
    [matchTerms],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ["commons-photos-v2", allQueries, canonicalTerms],
    queryFn: () => fetchPhotos(allQueries, canonicalTerms),
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  useEffect(() => setLightbox(null), [query]);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

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
        Aucune photo vérifiée pour cet objet
      </div>
    );
  }

  return (
    <>
      <div className="mt-4">
        <p className="label-caps mb-2 text-muted-foreground">
          Photographies vérifiées ({data.length})
        </p>
        <div className="grid grid-cols-3 gap-2">
          {data.map((photo) => (
            <button
              key={photo.full}
              onClick={() => setLightbox(photo)}
              className="group relative aspect-square overflow-hidden rounded-lg bg-secondary ring-1 ring-border/60 transition hover:ring-primary"
              title={`Agrandir ${photo.title}`}
            >
              <img
                src={photo.thumb}
                alt={`${name} — ${photo.title}`}
                loading="lazy"
                className="size-full object-cover transition group-hover:scale-105"
              />
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Sources vérifiées : Wikimedia Commons · correspondance par identifiant/alias de l’objet
        </p>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col bg-black/95 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Photographie plein écran de ${name}`}
          onClick={() => setLightbox(null)}
        >
          <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 bg-gradient-to-b from-black/85 to-transparent px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{name}</p>
              <p className="truncate text-xs text-white/70">{lightbox.title}</p>
            </div>
            <button
              onClick={() => setLightbox(null)}
              aria-label="Fermer le plein écran"
              className="rounded-full bg-black/50 p-2 text-white transition hover:bg-white/15"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center p-2 pt-16 pb-20 sm:p-6 sm:pt-20 sm:pb-20">
            <img
              src={lightbox.full}
              alt={`${name} — ${lightbox.title}`}
              className="max-h-full max-w-full cursor-zoom-out object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </div>

          <div
            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 py-4 text-xs text-white/75 sm:px-6"
            onClick={(event) => event.stopPropagation()}
          >
            {lightbox.credit}
            {lightbox.license ? ` · ${lightbox.license}` : ""} ·{" "}
            <a
              href={lightbox.page}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-white underline underline-offset-2"
            >
              source Wikimedia Commons
            </a>
            <span className="ml-3 text-white/50">Échap pour fermer</span>
          </div>
        </div>
      )}
    </>
  );
}
