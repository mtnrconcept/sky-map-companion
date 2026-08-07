import { useQuery } from "@tanstack/react-query";
import { Loader2, ImageOff, Telescope, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface GalleryImage {
  id: string;
  image_url: string;
  object_name: string;
  uploaded_at: string;
  vision_analysis: {
    astronomicalDetails?: {
      objectType?: string;
    };
  } | null;
}

interface Comparison {
  id: string;
  object_id: string;
  discoveries: Array<{ description: string; confidence: number; type: string }> | null;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function CommunityGallery({ objectId }: { objectId?: string }) {
  const { data: images, isLoading } = useQuery({
    queryKey: ["community-gallery", objectId],
    queryFn: async () => {
      let query = supabase
        .from("user_images")
        .select("id, image_url, object_name, uploaded_at, vision_analysis")
        .eq("is_ai_generated", false)
        .order("uploaded_at", { ascending: false })
        .limit(24);

      if (objectId) query = query.eq("object_id", objectId);

      const { data, error } = await query;
      if (error) throw error;
      return data as GalleryImage[];
    },
    staleTime: 60_000,
  });

  const { data: comparisons } = useQuery({
    queryKey: ["image-comparisons", objectId],
    queryFn: async () => {
      let query = supabase
        .from("image_comparisons")
        .select("id, object_id, discoveries, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (objectId) query = query.eq("object_id", objectId);

      const { data, error } = await query;
      if (error) throw error;
      return data as Comparison[];
    },
    staleTime: 120_000,
  });

  const discoveries =
    comparisons
      ?.flatMap((c: Comparison) => c.discoveries ?? [])
      .filter((d: { description: string; confidence: number; type: string }) => d.confidence > 0.5)
      .slice(0, 3) ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {discoveries.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <p className="mb-3 flex items-center gap-2 font-semibold text-primary">
              <FlaskConical className="size-4" />
              Dcouvertes collaboratives rcentes
            </p>
            <ul className="space-y-2">
              {discoveries.map((d: { description: string; confidence: number }, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">
                    {Math.round(d.confidence * 100)} %
                  </Badge>
                  <span>{d.description}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!images || images.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ImageOff className="size-10" />
          <p>Aucune image pour le moment. Soyez le premier partager !</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img: GalleryImage) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-muted"
            >
              <img
                src={img.image_url}
                alt={img.object_name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="truncate text-xs font-medium text-white">{img.object_name}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Telescope className="size-3 text-white/80" />
                  <p className="text-[10px] text-white/80">{timeAgo(img.uploaded_at)}</p>
                </div>
                {img.vision_analysis?.astronomicalDetails?.objectType && (
                  <Badge variant="secondary" className="mt-1 w-fit text-[10px]">
                    {img.vision_analysis.astronomicalDetails.objectType}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
