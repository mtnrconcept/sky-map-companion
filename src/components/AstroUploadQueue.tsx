import type { UploadProgress } from "@/hooks/useAstroStack";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface Props {
  uploads: UploadProgress[];
}

const STATUS_CONFIG = {
  uploading: { label: "Envoi...", color: "text-blue-400", badge: "secondary" as const },
  qualifying: { label: "Analyse IA...", color: "text-yellow-400", badge: "secondary" as const },
  qualified: { label: "Qualifiée", color: "text-green-400", badge: "default" as const },
  rejected: { label: "Rejetée", color: "text-red-400", badge: "destructive" as const },
  error: { label: "Erreur", color: "text-red-400", badge: "destructive" as const },
};

export function AstroUploadQueue({ uploads }: Props) {
  if (uploads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Aucun upload en cours. Déposez des frames pour contribuer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {uploads.slice(0, 20).map((u) => {
        const cfg = STATUS_CONFIG[u.status];
        return (
          <div
            key={u.id}
            className="rounded-lg border border-border bg-card/50 p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono truncate flex-1">{u.filename}</span>
              <Badge variant={cfg.badge} className="text-[10px] shrink-0">
                {cfg.label}
              </Badge>
            </div>

            {(u.status === "uploading" || u.status === "qualifying") && (
              <Progress value={u.progress} className="h-1" />
            )}

            {u.status === "qualified" && u.quality_score !== undefined && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">Score qualité:</span>
                <span
                  className={
                    u.quality_score >= 0.7 ? "text-green-400 font-semibold" :
                    u.quality_score >= 0.5 ? "text-yellow-400 font-semibold" :
                    "text-red-400 font-semibold"
                  }
                >
                  {Math.round(u.quality_score * 100)}%
                </span>
                <Progress
                  value={u.quality_score * 100}
                  className="h-1 flex-1"
                />
              </div>
            )}

            {u.status === "rejected" && u.rejection_reason && (
              <p className="text-[11px] text-red-400">Raison : {u.rejection_reason}</p>
            )}

            {u.status === "error" && u.error && (
              <p className="text-[11px] text-red-400 break-all">{u.error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
