import type { AstroObject } from "@/hooks/useAstroStack";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  objects: AstroObject[];
  selected: AstroObject | null;
  onSelect: (o: AstroObject) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  isLoading: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  galaxy: "??",
  nebula: "???",
  cluster_open: "?",
  cluster_globular: "?",
  planetary_nebula: "??",
  supernova_remnant: "??",
  double_star: "?",
  other: "??",
};

function shortExposure(h: number) {
  if (h < 0.1) return "";
  if (h < 1) return `${Math.round(h * 60)}min`;
  return `${h.toFixed(0)}h`;
}

export function AstroObjectList({ objects, selected, onSelect, searchQuery, onSearch, isLoading }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <Input
          placeholder="Rechercher M31, NGC224, Andromède…"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Chargement…
          </div>
        ) : objects.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Aucun objet trouvé
          </div>
        ) : (
          objects.map((obj) => (
            <button
              key={obj.id}
              type="button"
              onClick={() => onSelect(obj)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs transition-colors border-b border-border/50",
                selected?.id === obj.id
                  ? "bg-primary/10 border-l-2 border-l-primary"
                  : "hover:bg-muted/50"
              )}
            >
              <span className="text-xl shrink-0">{TYPE_ICONS[obj.type] ?? "??"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold">{obj.id}</span>
                  {obj.master_image_url && (
                    <span className="text-[9px] text-green-400">? master</span>
                  )}
                </div>
                {obj.common_name && (
                  <p className="text-[11px] text-muted-foreground truncate">{obj.common_name}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {obj.total_lights > 0 && (
                    <span className="text-[10px] text-blue-400">
                      {obj.total_lights.toLocaleString()} L
                    </span>
                  )}
                  {obj.total_contributors > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {obj.total_contributors} contrib.
                    </span>
                  )}
                  {obj.total_exposure_hours > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {shortExposure(obj.total_exposure_hours)}
                    </span>
                  )}
                </div>
              </div>
              {obj.total_lights === 0 && (
                <Badge variant="outline" className="text-[9px] shrink-0">vide</Badge>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
