import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommonsThumbnailPage {
  index?: number;
  imageinfo?: Array<{
    thumburl?: string;
  }>;
}

async function fetchThumb(query: string): Promise<string | null> {
  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: "6",
      gsrlimit: "5",
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "640",
      format: "json",
      origin: "*",
    }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error("image indisponible");
  const data = (await res.json()) as {
    query?: { pages?: Record<string, CommonsThumbnailPage> };
  };
  const pages = Object.values(data.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  for (const p of pages) {
    const t = p.imageinfo?.[0]?.thumburl;
    if (t) return t as string;
  }
  return null;
}

/** Vignette illustrative issue de Wikimedia Commons, avec repli graphique. */
export function CommonsImage({
  query,
  alt,
  className,
}: {
  query: string;
  alt: string;
  className?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["commons-thumb", query],
    queryFn: () => fetchThumb(query),
    staleTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-gradient-to-br from-primary/15 via-muted/40 to-background",
        className,
      )}
    >
      {data ? (
        <img
          src={data}
          alt={alt}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          {!isLoading && <Sparkles className="size-5 text-primary/50" />}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
    </div>
  );
}
