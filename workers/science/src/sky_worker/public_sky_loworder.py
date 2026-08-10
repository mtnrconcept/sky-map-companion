from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import logging
from typing import Any

from .catalog_mosaic import CatalogGateway
from .config import Config
from .mosaic import HealpixCell, HealpixPlan, MosaicTileArtifact, TileSourceContribution
from .public_sky import (
    GLOBAL_ALLSKY_ORDER,
    GLOBAL_ALLSKY_STORAGE_PATH,
    build_allsky_webp,
    composite_transparent_webp,
    global_low_order_layer_slug,
)
from .public_sky_mosaic import _create_generation, _publish_tiles


logger = logging.getLogger("sky_public_sky_loworder")
GLOBAL_LOW_ORDER_MAX = 6


def _json(value: Any) -> str:
    return json.dumps(value, default=str, separators=(",", ":"), sort_keys=True)


def _component_rows(gateway: CatalogGateway, spectral_band: str) -> list[dict[str, Any]]:
    aggregate_slug = global_low_order_layer_slug(spectral_band)
    return gateway.execute(
        """
        select l.slug,g.id as generation_id,g.generation,t.healpix_order,t.healpix_index,
               t.storage_path,t.sha256,t.source_upload_ids,t.contribution_weights
        from public.mosaic_layers l
        join public.mosaic_generations g on g.id=l.current_generation_id
        join public.mosaic_tiles t on t.generation_id=g.id
        where g.status='complete'
          and g.activated_at is not null
          and l.spectral_band=%s
          and l.slug like 'sky-ps1-%%'
          and l.slug<>%s
          and t.healpix_order between 0 and %s
          and t.media_type='image/webp'
          and t.storage_path like 'hips/%%'
        order by t.healpix_order,t.healpix_index,l.slug,g.generation,t.storage_path
        """,
        (spectral_band, aggregate_slug, GLOBAL_LOW_ORDER_MAX),
    )


def _component_inventory_sha256(rows: list[dict[str, Any]]) -> str:
    payload = [
        [
            str(row["generation_id"]),
            int(row["healpix_order"]),
            int(row["healpix_index"]),
            str(row["storage_path"]),
            str(row["sha256"]),
        ]
        for row in rows
    ]
    return hashlib.sha256(_json(payload).encode()).hexdigest()


def _source_weights(rows: list[dict[str, Any]]) -> tuple[list[str], dict[str, float]]:
    totals: defaultdict[str, float] = defaultdict(float)
    for row in rows:
        sources = [str(value) for value in (row.get("source_upload_ids") or [])]
        weights = {
            str(key): float(value)
            for key, value in (row.get("contribution_weights") or {}).items()
            if float(value) > 0
        }
        if weights:
            for source_id, weight in weights.items():
                totals[source_id] += weight
        elif sources:
            equal = 1 / len(sources)
            for source_id in sources:
                totals[source_id] += equal
    if not totals:
        raise RuntimeError("public low-order components contain no source attribution")
    total = sum(totals.values())
    return sorted(totals), {source_id: weight / total for source_id, weight in totals.items()}


def _plan(cells: list[HealpixCell]) -> HealpixPlan:
    if not cells:
        raise RuntimeError("no public low-order cells are available to aggregate")
    canonical = _json([[cell.order, cell.index] for cell in cells]).encode()
    return HealpixPlan(
        fine_order=max(cell.order for cell in cells),
        minimum_order=min(cell.order for cell in cells),
        cells=tuple(cells),
        sha256=hashlib.sha256(canonical).hexdigest(),
    )


def rebuild_global_low_order(
    gateway: CatalogGateway,
    spectral_band: str = "r",
) -> dict[str, Any]:
    rows = _component_rows(gateway, spectral_band)
    if not rows:
        raise RuntimeError("no activated public low-order component tile exists")
    inventory_sha256 = _component_inventory_sha256(rows)
    layer_slug = global_low_order_layer_slug(spectral_band)

    current = gateway.execute(
        """
        select g.id,g.recipe
        from public.mosaic_layers l
        join public.mosaic_generations g on g.id=l.current_generation_id
        where l.slug=%s and g.status='complete'
        limit 1
        """,
        (layer_slug,),
    )
    if current and (current[0].get("recipe") or {}).get("component_inventory_sha256") == inventory_sha256:
        return {
            "generation_id": str(current[0]["id"]),
            "component_inventory_sha256": inventory_sha256,
            "replayed": True,
        }

    grouped: defaultdict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[(int(row["healpix_order"]), int(row["healpix_index"]))].append(row)

    bucket = gateway.storage.storage.from_("astro-derived")
    artifacts: list[MosaicTileArtifact] = []
    global_source_ids: set[str] = set()
    for (order, index), components in sorted(grouped.items()):
        contents = [bucket.download(row["storage_path"]) for row in components]
        content = composite_transparent_webp(contents, size=512)
        source_ids, weights = _source_weights(components)
        global_source_ids.update(source_ids)
        contributions = tuple(
            TileSourceContribution(
                source_id=source_id,
                finite_pixels=1,
                cell_pixels=1,
                coverage_fraction=1.0,
                weighted_pixels=weight,
                normalized_weight=weight,
            )
            for source_id, weight in sorted(weights.items())
        )
        artifacts.append(
            MosaicTileArtifact(
                order=order,
                index=index,
                content=content,
                sha256=hashlib.sha256(content).hexdigest(),
                coverage_fraction=1.0,
                finite_pixels=1,
                cell_pixels=1,
                source_contributions=contributions,
            )
        )

    cells = [HealpixCell(tile.order, tile.index) for tile in artifacts]
    plan = _plan(cells)
    source_ids = sorted(global_source_ids)
    recipe = {
        "method": "public-loworder-visual-aggregate-v1",
        "spectral_band": spectral_band,
        "minimum_order": plan.minimum_order,
        "maximum_order": plan.fine_order,
        "component_tile_count": len(rows),
        "component_inventory_sha256": inventory_sha256,
        "scientific_values": "not-applicable-derived-visual-layer",
    }
    generation_id, generation = _create_generation(
        gateway,
        layer_slug,
        f"Sky Map public {spectral_band} · agrégat tout-ciel",
        spectral_band,
        recipe,
        plan,
        source_ids,
    )
    publication = _publish_tiles(
        gateway,
        generation_id,
        generation,
        layer_slug,
        artifacts,
        {
            "component_inventory_sha256": inventory_sha256,
            "component_tile_count": len(rows),
            "derived_visual_only": True,
        },
        source_ids,
    )
    logger.info(
        _json(
            {
                "event": "global_low_order_published",
                "generation_id": publication["generation_id"],
                "tiles": len(artifacts),
                "sources": len(source_ids),
                "components": len(rows),
            }
        )
    )
    return {
        **publication,
        "tiles": len(artifacts),
        "sources": len(source_ids),
        "component_inventory_sha256": inventory_sha256,
    }


def rebuild_global_allsky_from_aggregate(
    gateway: CatalogGateway,
    spectral_band: str = "r",
) -> dict[str, Any]:
    layer_slug = global_low_order_layer_slug(spectral_band)
    rows = gateway.execute(
        """
        select t.healpix_index,t.storage_path
        from public.mosaic_layers l
        join public.mosaic_generations g on g.id=l.current_generation_id
        join public.mosaic_tiles t on t.generation_id=g.id
        where l.slug=%s
          and g.status='complete'
          and g.activated_at is not null
          and t.healpix_order=%s
          and t.media_type='image/webp'
        order by t.healpix_index
        """,
        (layer_slug, GLOBAL_ALLSKY_ORDER),
    )
    bucket = gateway.storage.storage.from_("astro-derived")
    tiles = {int(row["healpix_index"]): bucket.download(row["storage_path"]) for row in rows}
    content = build_allsky_webp(tiles)
    checksum = hashlib.sha256(content).hexdigest()
    response = bucket.upload(
        GLOBAL_ALLSKY_STORAGE_PATH,
        content,
        {
            "content-type": "image/webp",
            "cache-control": "300",
            "upsert": "true",
        },
    )
    if not response:
        raise RuntimeError("global Allsky upload failed")
    return {
        "covered_order3_tiles": len(tiles),
        "storage_path": GLOBAL_ALLSKY_STORAGE_PATH,
        "sha256": checksum,
    }


def refresh(args: argparse.Namespace) -> int:
    gateway = CatalogGateway(Config.from_environment())
    low_order = rebuild_global_low_order(gateway, args.filter)
    allsky = rebuild_global_allsky_from_aggregate(gateway, args.filter)
    logger.info(_json({"event": "global_low_order_refresh_complete", "low_order": low_order, "allsky": allsky}))
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        description="Aggregate every activated public PS1 low-order tile into one all-sky viewer layer"
    )
    root.add_argument("--filter", choices=list("grizy"), default="r")
    root.set_defaults(handler=refresh)
    return root


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = parser().parse_args()
    raise SystemExit(args.handler(args))


if __name__ == "__main__":
    main()
