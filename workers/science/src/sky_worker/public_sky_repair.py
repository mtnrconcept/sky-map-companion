"""Non-destructive backfill of legacy Sky Map seed tiles with true HiPS geometry.

The old generations remain immutable for audit and rollback. We always render
from a scientifically calibrated master FITS and activate a new generation only
after every planned tile and manifest has been published successfully.
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
import tempfile
from typing import Any, Mapping

from .catalog_mosaic import CatalogGateway
from .config import Config
from .hips_geometry import HIPS_PIXEL_GEOMETRY_VERSION
from .mosaic import derive_healpix_plan_from_master, display_limits, render_healpix_tiles
from .public_sky_mosaic import (
    _create_generation,
    _parent_contributions_from_children,
    _publish_tiles,
    _read_master_fits,
)

logger = logging.getLogger("sky_hips_geometry_repair")


def find_legacy_seed_layers(gateway: CatalogGateway, *, max_candidates: int = 100) -> list[dict[str, Any]]:
    """Return only activated seed generations built without the exact pixel contract."""
    return gateway.execute(
        """
        select l.slug,l.spectral_band,g.id as generation_id,g.generation,
               g.recipe,g.activated_at
        from public.mosaic_layers l
        join public.mosaic_generations g on g.id=l.current_generation_id
        where l.slug ~ '^sky-ps1-[grizy]-o[0-9]+-[0-9]+$'
          and g.status='complete' and g.activated_at is not null
          and coalesce(g.recipe->>'hips_pixel_geometry_version','') <> %s
        order by g.activated_at desc,l.slug
        limit %s
        """,
        (HIPS_PIXEL_GEOMETRY_VERSION, max_candidates),
    )


def original_scientific_master_path(legacy: Mapping[str, Any]) -> str:
    """Resolve the immutable FITS even when the current generation is v2.

    Geometry-only repair generations do not duplicate the large scientific
    source master. Their recipe carries its original immutable path.
    """
    slug = str(legacy["slug"])
    recipe = legacy.get("recipe") or {}
    path = recipe.get("source_master_fits_path") if isinstance(recipe, Mapping) else None
    if (
        isinstance(path, str)
        and path.startswith(f"fields/{slug}/")
        and path.endswith("/master.fits")
        and ".." not in path
        and "//" not in path
    ):
        return path
    return f"fields/{slug}/{int(legacy['generation'])}/master.fits"


def repair_legacy_seed_layer(
    gateway: CatalogGateway,
    legacy: Mapping[str, Any],
    workdir: Path,
) -> dict[str, Any]:
    """Rebuild a generation using its original, persisted calibrated master FITS."""
    slug = str(legacy["slug"])
    source_generation_id = legacy["generation_id"]
    old_generation = int(legacy["generation"])
    master_path = original_scientific_master_path(legacy)

    raw = gateway.storage.storage.from_("astro-derived").download(master_path)
    data, wcs = _read_master_fits(raw, workdir / "original-master.fits")
    plan = derive_healpix_plan_from_master(
        data,
        wcs,
        fine_order=9,
        minimum_order=0,
        minimum_fine_coverage=0.001,
    )
    old_tiles = gateway.execute(
        """
        select healpix_order,healpix_index,source_upload_ids,contribution_weights
        from public.mosaic_tiles
        where generation_id=%s and healpix_order>=7
        order by healpix_order,healpix_index
        """,
        (source_generation_id,),
    )
    contributions, source_ids = _parent_contributions_from_children(plan, old_tiles)
    tiles = render_healpix_tiles(
        data,
        wcs,
        plan,
        source_contributions=contributions,
        expected_source_ids=source_ids,
        limits=display_limits(data),
    )
    recipe = {
        "method": "legacy-seed-hips-geometry-repair-v3",
        "hips_pixel_geometry_version": HIPS_PIXEL_GEOMETRY_VERSION,
        "source_mosaic_generation_id": str(source_generation_id),
        "source_master_fits_path": master_path,
        "old_generation": old_generation,
        "tile_plan_sha256": plan.sha256,
        "publication_policy": "immutable-new-generation",
    }
    generation_id, generation = _create_generation(
        gateway, slug, f"Sky Map · {slug} · HiPS registration v3",
        str(legacy["spectral_band"]), recipe, plan, source_ids,
    )
    result = _publish_tiles(
        gateway, generation_id, generation, slug, tiles,
        {
            "geometry_version": HIPS_PIXEL_GEOMETRY_VERSION,
            "source_mosaic_generation_id": str(source_generation_id),
            "scientific_master": master_path,
        },
        source_ids,
    )
    return {**result, "slug": slug, "tiles": len(tiles)}


def repair_current_seeds(gateway: CatalogGateway, *, max_layers: int = 4) -> list[dict[str, Any]]:
    if not 1 <= max_layers <= 10:
        raise ValueError("max_layers must be between 1 and 10")
    repaired: list[dict[str, Any]] = []
    for legacy in find_legacy_seed_layers(gateway):
        if len(repaired) >= max_layers:
            break
        try:
            with tempfile.TemporaryDirectory(prefix="sky-hips-register-") as temp:
                result = repair_legacy_seed_layer(gateway, legacy, Path(temp))
            logger.info("repaired HiPS geometry: %s", result)
            repaired.append(result)
        except Exception:
            # The failed building generation is never activated: the old
            # immutable one stays current and can be retried on another run.
            logger.exception("legacy HiPS geometry repair failed for %s", legacy["slug"])
    return repaired


def main() -> None:
    parser = argparse.ArgumentParser(description="Safely backfill misaligned legacy HiPS tiles.")
    parser.add_argument("--max-layers", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    gateway = CatalogGateway(Config.from_environment())
    if args.dry_run:
        candidates = find_legacy_seed_layers(gateway)
        logger.info("%d legacy layers await astrometric repair", len(candidates))
        return
    rebuilt = repair_current_seeds(gateway, max_layers=args.max_layers)
    logger.info("rebuilt %d source layers", len(rebuilt))


if __name__ == "__main__":
    main()
