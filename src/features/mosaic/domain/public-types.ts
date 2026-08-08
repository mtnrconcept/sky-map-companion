import type { SkyOrder } from "./types";

export interface MosaicCoverageCell {
  healpix_order: SkyOrder;
  healpix_index: number;
  resolution_class: string;
  coverage_fraction: number;
  moderation_status: "approved" | "disputed";
  claimed_at: string;
  pioneer_name: string;
  pioneer_user_id: string | null;
  anonymous_attribution: boolean;
  tile_url: string | null;
}
