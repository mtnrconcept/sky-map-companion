export const PIPELINE_STATES = [
  "uploaded",
  "extracting",
  "solving",
  "qualifying",
  "awaiting_review",
  "approved",
  "calibrating",
  "aligning",
  "stacking",
  "tiling",
  "published",
  "rejected",
  "duplicate",
  "cancelled",
  "failed",
] as const;

export type PipelineState = (typeof PIPELINE_STATES)[number];

const transitions: Record<PipelineState, ReadonlySet<PipelineState>> = {
  uploaded: new Set(["extracting", "cancelled", "failed"]),
  extracting: new Set(["solving", "qualifying", "rejected", "failed"]),
  solving: new Set(["qualifying", "rejected", "failed"]),
  qualifying: new Set(["awaiting_review", "approved", "rejected", "duplicate", "failed"]),
  awaiting_review: new Set(["approved", "rejected", "cancelled"]),
  approved: new Set(["calibrating", "tiling", "published", "failed"]),
  calibrating: new Set(["aligning", "failed"]),
  aligning: new Set(["stacking", "failed"]),
  stacking: new Set(["tiling", "published", "failed"]),
  tiling: new Set(["published", "failed"]),
  published: new Set(),
  rejected: new Set(["awaiting_review"]),
  duplicate: new Set(),
  cancelled: new Set(["uploaded"]),
  failed: new Set([
    "extracting",
    "solving",
    "qualifying",
    "calibrating",
    "aligning",
    "stacking",
    "tiling",
  ]),
};

export function canTransition(from: PipelineState, to: PipelineState): boolean {
  return transitions[from].has(to);
}
