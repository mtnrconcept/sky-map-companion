from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import tempfile
from typing import Any, Mapping, Sequence
from uuid import UUID

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
import astropy.units as u
import numpy as np

from .archive import PS1_ACKNOWLEDGEMENT, PS1Archive, target_grid
from .archive_ingest import _update_run, _validate_frame
from .catalog_mosaic import CatalogGateway, _process_qualification_inline
from .config import Config
from .extraction import extract_frame
from .mosaic import (
    HealpixPlan,
    MosaicFrame,
    SourceGeometry,
    TileSourceContribution,
    coadd_streaming,
    derive_healpix_plan_from_master,
    display_limits,
    hash_source_inventory,
    load_authoritative_wcs,
    measure_tile_source_contributions,
    plan_mosaic_canvas,
    render_healpix_tiles,
    write_master_fits,
    write_master_preview,
)
from .public_sky import (
    GLOBAL_ALLSKY_ORDER,
    GLOBAL_ALLSKY_STORAGE_PATH,
    SkySeedTarget,
    build_allsky_webp,
    next_unattempted_seed,
    parent_layer_slug,
    seed_layer_slug,
    tile_storage_path,
)


logger = logging.getLogger("sky_public_sky_mosaic")
TERMINAL_SOURCE_STATUSES = {"approved", "published", "stacked"}


def _json(value: Any) -> str:
    return json.dumps(value, default=str, separators=(",", ":"), sort_keys=True)


def _attempted_seed_indices(gateway: CatalogGateway, order: int, spectral_band: str) -> set[int]:
    rows = gateway.execute(
        """
        select distinct (query->>'seed_healpix_index')::bigint as healpix_index
        from public.archive_ingest_runs
        where source_id='mast-ps1'
          and object_id is null
          and spectral_band=%s
          and query->>'target_mode'='sky_seed'
          and query->>'seed_healpix_order'=%s
          and query->>'seed_healpix_index' ~ '^[0-9]+$'
        """,
        (spectral_band, str(order)),
    )
    return {int(row["healpix_index"]) for row in rows}


def _select_seed_target(
    gateway: CatalogGateway,
    order: int,
    spectral_band: str,
    min_dec_deg: float,
    max_dec_deg: float,
) -> SkySeedTarget:
    return next_unattempted_seed(
        order,
        _attempted_seed_indices(gateway, order, spectral_band),
        min_dec_deg=min_dec_deg,
        max_dec_deg=max_dec_deg,
    )


def _create_seed_run(
    gateway: CatalogGateway,
    target: SkySeedTarget,
    spectral_band: str,
    max_files: int,
    max_bytes: int,
    cutout_size: int,
    width_arcmin: float,
    height_arcmin: float,
) -> dict[str, Any]:
    query = {
        "archive": "MAST PS1",
        "target_mode": "sky_seed",
        "seed_healpix_order": target.order,
        "seed_healpix_index": target.index,
        "target_ra_deg": target.ra_deg,
        "target_dec_deg": target.dec_deg,
        "spectral_band": spectral_band,
        "cutout_size_px": cutout_size,
        "width_arcmin": width_arcmin,
        "height_arcmin": height_arcmin,
    }
    return gateway.execute(
        """
        insert into public.archive_ingest_runs(
          source_id,object_id,spectral_band,status,query,max_files,max_bytes
        ) values ('mast-ps1',null,%s,'discovering',%s::jsonb,%s,%s)
        returning *
        """,
        (spectral_band, _json(query), max_files, max_bytes),
    )[0]


def _reuse_archive_record(
    gateway: CatalogGateway,
    item_id: Any,
    record_id: str,
) -> bool:
    rows = gateway.execute(
        """
        select u.id as upload_id,u.content_sha256,u.file_size_bytes
        from public.archive_items i
        join public.astro_uploads u on u.id=i.upload_id
        where i.source_id='mast-ps1'
          and i.archive_record_id=%s
          and i.id<>%s
          and u.source_kind='public_archive'
          and u.status in ('approved','published','stacked')
          and u.rejected=false
          and u.deleted_at is null
        order by i.created_at
        limit 1
        """,
        (record_id, item_id),
    )
    if not rows:
        return False
    source = rows[0]
    gateway.execute(
        """
        update public.archive_items
        set status='registered',upload_id=%s,content_sha256=%s,byte_size=%s,
            error_detail='reused previously qualified archive record',updated_at=now()
        where id=%s
        """,
        (
            source["upload_id"],
            source["content_sha256"],
            source["file_size_bytes"],
            item_id,
        ),
    )
    return True


def _reuse_archive_checksum(
    gateway: CatalogGateway,
    item_id: Any,
    content_sha256: str,
    byte_size: int,
) -> bool:
    rows = gateway.execute(
        """
        select u.id as upload_id
        from public.astro_uploads u
        join public.archive_items i on i.id=u.archive_item_id
        where u.content_sha256=%s
          and u.source_kind='public_archive'
          and i.source_id='mast-ps1'
          and u.status in ('approved','published','stacked')
          and u.rejected=false
          and u.deleted_at is null
        order by u.uploaded_at
        limit 1
        """,
        (content_sha256,),
    )
    if not rows:
        return False
    gateway.execute(
        """
        update public.archive_items
        set status='registered',upload_id=%s,content_sha256=%s,byte_size=%s,
            error_detail='reused identical qualified public archive content',updated_at=now()
        where id=%s
        """,
        (rows[0]["upload_id"], content_sha256, byte_size, item_id),
    )
    return True


def _ingest_seed(
    gateway: CatalogGateway,
    target: SkySeedTarget,
    spectral_band: str,
    max_files: int,
    max_bytes: int,
    cutout_size: int,
    width_arcmin: float,
    height_arcmin: float,
    request_delay: float,
    timeout_seconds: int,
) -> dict[str, Any]:
    run = _create_seed_run(
        gateway,
        target,
        spectral_band,
        max_files,
        max_bytes,
        cutout_size,
        width_arcmin,
        height_arcmin,
    )
    run_id = run["id"]
    positions = target_grid(
        target.ra_deg,
        target.dec_deg,
        width_arcmin,
        height_arcmin,
        cutout_size,
    )
    archive = PS1Archive(request_delay_seconds=request_delay, timeout_seconds=timeout_seconds)
    registered = 0
    rejected = 0
    downloaded_bytes = 0

    logger.info(
        _json(
            {
                "event": "sky_seed_run_created",
                "run_id": str(run_id),
                "seed_order": target.order,
                "seed_index": target.index,
                "ra_deg": target.ra_deg,
                "dec_deg": target.dec_deg,
            }
        )
    )

    try:
        candidates = archive.discover(
            positions,
            spectral_band,
            cutout_size,
            max_files,
        )
        gateway.execute(
            """
            update public.archive_ingest_runs
            set discovered_files=%s,status='downloading',updated_at=now()
            where id=%s
            """,
            (len(candidates), run_id),
        )
        if not candidates:
            raise RuntimeError("public sky seed returned no Pan-STARRS FITS candidate")

        with tempfile.TemporaryDirectory(prefix=f"sky-seed-{run_id}-") as temporary:
            directory = Path(temporary)
            for candidate in candidates:
                item_rows = gateway.execute(
                    """
                    insert into public.archive_items(
                      ingest_run_id,source_id,object_id,archive_record_id,remote_url,remote_filename,
                      data_rights,calibration_level,spectral_band,metadata,status
                    ) values (%s,'mast-ps1',null,%s,%s,%s,'public',%s,%s,%s::jsonb,'discovered')
                    on conflict (ingest_run_id,source_id,archive_record_id) do nothing
                    returning id
                    """,
                    (
                        run_id,
                        candidate.record_id,
                        candidate.remote_url,
                        candidate.remote_filename,
                        candidate.calibration_level,
                        candidate.spectral_band,
                        _json(
                            {
                                "source_filename": candidate.source_filename,
                                "product_type": candidate.product_type,
                                "requested_ra_deg": candidate.ra_deg,
                                "requested_dec_deg": candidate.dec_deg,
                                "seed_healpix_order": target.order,
                                "seed_healpix_index": target.index,
                                "mjd": candidate.mjd,
                            }
                        ),
                    ),
                )
                if not item_rows:
                    continue
                item_id = item_rows[0]["id"]
                target_path = directory / candidate.remote_filename
                try:
                    if _reuse_archive_record(gateway, item_id, candidate.record_id):
                        registered += 1
                        continue

                    gateway.execute(
                        "update public.archive_items set status='downloading',updated_at=now() where id=%s",
                        (item_id,),
                    )
                    remaining = max_bytes - downloaded_bytes
                    byte_size = archive.download(candidate, target_path, remaining)
                    frame = _validate_frame(
                        target_path,
                        candidate.ra_deg,
                        candidate.dec_deg,
                        max(0.25, cutout_size * 0.25 / 3600),
                    )
                    if _reuse_archive_checksum(
                        gateway,
                        item_id,
                        frame.content_sha256,
                        byte_size,
                    ):
                        registered += 1
                        downloaded_bytes += byte_size
                        continue

                    storage_path = (
                        f"archives/mast-ps1/sky/o{target.order}/{target.index}/"
                        f"{spectral_band}/{candidate.record_id}.fits"
                    )
                    uploaded_sha = gateway.ensure_raw(storage_path, target_path)
                    if uploaded_sha != frame.content_sha256:
                        raise RuntimeError("raw storage checksum mismatch")

                    provenance = {
                        "source_id": "mast-ps1",
                        "archive_record_id": candidate.record_id,
                        "remote_url": candidate.remote_url,
                        "source_filename": candidate.source_filename,
                        "data_rights": "public",
                        "calibration_level": candidate.calibration_level,
                        "retrieved_at": datetime.now(timezone.utc).isoformat(),
                        "terms_url": "https://archive.stsci.edu/publishing/mission-acknowledgements",
                        "acknowledgement": PS1_ACKNOWLEDGEMENT,
                        "sky_seed": {
                            "healpix_order": target.order,
                            "healpix_index": target.index,
                            "center_ra_deg": target.ra_deg,
                            "center_dec_deg": target.dec_deg,
                        },
                    }
                    metadata = {
                        **frame.metadata,
                        "archive": provenance,
                        "requested_ra_deg": candidate.ra_deg,
                        "requested_dec_deg": candidate.dec_deg,
                        "product_type": candidate.product_type,
                    }
                    upload = gateway.execute(
                        """
                        insert into public.astro_uploads(
                          user_id,object_id,frame_type,storage_path,file_url,file_size_bytes,original_filename,
                          metadata,telescope,camera,exposure_s,filter_name,captured_at,instrument_group,
                          status,content_sha256,licence_code,licence_accepted_at,pipeline_version,
                          source_kind,archive_item_id,provenance,rights_uri,attribution_text
                        ) values (
                          null,null,'light',%s,%s,%s,%s,%s::jsonb,'Pan-STARRS1','GPC1',%s,%s,%s,
                          %s,'uploaded',%s,'PUBLIC-ARCHIVE',now(),%s,'public_archive',%s,%s::jsonb,%s,%s
                        ) returning id
                        """,
                        (
                            storage_path,
                            candidate.remote_url,
                            byte_size,
                            candidate.remote_filename,
                            _json(metadata),
                            frame.metadata.get("exposure_s"),
                            spectral_band,
                            frame.metadata.get("captured_at"),
                            f"mast-ps1:gpc1:{spectral_band}:stack",
                            frame.content_sha256,
                            gateway.config.pipeline_version,
                            item_id,
                            _json(provenance),
                            "https://archive.stsci.edu/publishing/mission-acknowledgements",
                            "MAST Pan-STARRS1 Public Archive",
                        ),
                    )[0]
                    gateway.execute(
                        """
                        update public.archive_items
                        set status='registered',upload_id=%s,content_sha256=%s,byte_size=%s,
                            metadata=metadata || %s::jsonb,updated_at=now()
                        where id=%s
                        """,
                        (
                            upload["id"],
                            frame.content_sha256,
                            byte_size,
                            _json({"fits": frame.metadata}),
                            item_id,
                        ),
                    )
                    registered += 1
                    downloaded_bytes += byte_size
                except Exception as error:
                    rejected += 1
                    gateway.execute(
                        """
                        update public.archive_items
                        set status='failed',error_detail=%s,updated_at=now()
                        where id=%s
                        """,
                        (str(error)[:2000], item_id),
                    )
                    logger.warning(
                        _json(
                            {
                                "event": "sky_seed_item_failed",
                                "record_id": candidate.record_id,
                                "error": str(error),
                            }
                        )
                    )
                finally:
                    target_path.unlink(missing_ok=True)
                    gateway.execute(
                        """
                        update public.archive_ingest_runs
                        set registered_files=%s,rejected_files=%s,downloaded_bytes=%s,updated_at=now()
                        where id=%s
                        """,
                        (registered, rejected, downloaded_bytes, run_id),
                    )

        if registered < 1:
            raise RuntimeError("public sky seed registered no reusable or new FITS source")
        _update_run(gateway, run_id, "qualifying")
        return run
    except Exception as error:
        _update_run(gateway, run_id, "failed", str(error))
        raise


def _eligible_rows_for_run(gateway: CatalogGateway, run_id: Any) -> list[dict[str, Any]]:
    return gateway.execute(
        """
        select distinct on (u.id)
          u.id,u.pipeline_version,u.original_filename,u.content_sha256,
          s.wcs_header,q.score
        from public.archive_items i
        join public.astro_uploads u on u.id=i.upload_id
        join public.astrometric_solutions s
          on s.upload_id=u.id and s.pipeline_version=u.pipeline_version
        join public.astro_quality_metrics q
          on q.upload_id=u.id and q.pipeline_version=u.pipeline_version
        where i.ingest_run_id=%s
          and u.status in ('approved','published','stacked')
          and u.rejected=false
          and u.deleted_at is null
          and q.eligible
        order by u.id,s.solved_at desc,q.measured_at desc
        """,
        (run_id,),
    )


def _load_frames(
    gateway: CatalogGateway,
    rows: Sequence[Mapping[str, Any]],
    workdir: Path,
) -> tuple[list[MosaicFrame], list[SourceGeometry]]:
    frames: list[MosaicFrame] = []
    geometries: list[SourceGeometry] = []
    for index, row in enumerate(rows):
        upload_id = UUID(str(row["id"]))
        directory = workdir / f"source-{index}-{upload_id}"
        directory.mkdir(parents=True, exist_ok=True)
        artifact = gateway.download_upload(upload_id, directory)
        extracted = extract_frame(artifact.local_path)
        authoritative = load_authoritative_wcs(
            row["wcs_header"],
            extracted.data.shape,
            raw_header=extracted.header,
        )
        weight = max(0.01, float(row.get("score") or 50) / 100)
        data = np.asarray(extracted.data, dtype=np.float32)
        source_id = str(upload_id)
        frames.append(MosaicFrame(source_id=source_id, data=data, wcs=authoritative.wcs, weight=weight))
        geometries.append(
            SourceGeometry(
                source_id=source_id,
                shape=data.shape,
                wcs=authoritative.wcs,
                weight=weight,
            )
        )
    return frames, geometries


def _create_generation(
    gateway: CatalogGateway,
    layer_slug: str,
    label: str,
    spectral_band: str,
    recipe: dict[str, Any],
    plan: HealpixPlan,
    source_ids: Sequence[str],
) -> tuple[Any, int]:
    layer = gateway.execute(
        """
        insert into public.mosaic_layers(slug,label,spectral_band)
        values (%s,%s,%s)
        on conflict (slug) do update set label=excluded.label
        returning id
        """,
        (layer_slug, label, spectral_band),
    )[0]
    generation = int(
        gateway.execute(
            "select coalesce(max(generation),0)+1 as value from public.mosaic_generations where layer_id=%s",
            (layer["id"],),
        )[0]["value"]
    )
    source_inventory_sha256 = hash_source_inventory(source_ids)
    generation_row = gateway.execute(
        """
        insert into public.mosaic_generations(
          layer_id,generation,status,pipeline_version,recipe,expected_tiles,published_tiles,
          planned_tiles,planned_tiles_sha256,source_inventory_sha256,
          expected_source_uploads,contributing_source_uploads,verification
        ) values (
          %s,%s,'building',%s,%s::jsonb,%s,0,%s,%s,%s,%s,0,%s::jsonb
        ) returning id
        """,
        (
            layer["id"],
            generation,
            gateway.config.pipeline_version,
            _json(recipe),
            plan.expected_tiles,
            plan.expected_tiles,
            plan.sha256,
            source_inventory_sha256,
            len(source_ids),
            _json({"publication_mode": recipe.get("method", "public-sky")}),
        ),
    )[0]
    return generation_row["id"], generation


def _publish_tiles(
    gateway: CatalogGateway,
    generation_id: Any,
    generation: int,
    layer_slug: str,
    tiles: Sequence[Any],
    manifest_extra: dict[str, Any],
    source_ids: Sequence[str],
) -> dict[str, Any]:
    manifest_tiles: list[dict[str, Any]] = []
    for tile in tiles:
        storage_path = tile_storage_path(layer_slug, generation, tile.order, tile.index)
        checksum = gateway.ensure_derivative(storage_path, tile.content, tile.media_type)
        if checksum != tile.sha256:
            raise RuntimeError("published sky tile checksum differs from rendered artifact")
        gateway.execute(
            """
            insert into public.mosaic_tiles(
              generation_id,healpix_order,healpix_index,storage_path,media_type,
              byte_size,sha256,source_upload_ids,contribution_weights
            ) values (%s,%s,%s,%s,%s,%s,%s,%s::uuid[],%s::jsonb)
            on conflict (generation_id,healpix_order,healpix_index,media_type) do nothing
            """,
            (
                generation_id,
                tile.order,
                tile.index,
                storage_path,
                tile.media_type,
                len(tile.content),
                checksum,
                list(tile.source_upload_ids),
                _json(tile.source_weights),
            ),
        )
        manifest_tiles.append(
            {
                "order": tile.order,
                "index": tile.index,
                "path": storage_path,
                "sha256": checksum,
                "source_upload_ids": list(tile.source_upload_ids),
                "contribution_weights": tile.source_weights,
            }
        )

    manifest = {
        "generation_id": str(generation_id),
        "pipeline_version": gateway.config.pipeline_version,
        "layer": layer_slug,
        "source_upload_ids": sorted(source_ids),
        "tiles": sorted(manifest_tiles, key=lambda value: (value["order"], value["index"])),
        **manifest_extra,
    }
    manifest_bytes = _json(manifest).encode()
    manifest_path = f"hips/{layer_slug}/{generation}/manifest.json"
    manifest_sha256 = gateway.ensure_derivative(manifest_path, manifest_bytes, "application/json")
    gateway.execute(
        """
        update public.mosaic_generations
        set status='verifying',published_tiles=%s,manifest_path=%s,manifest_sha256=%s,
            contributing_source_uploads=%s,
            verification=verification || %s::jsonb,updated_at=now()
        where id=%s
        """,
        (
            len(tiles),
            manifest_path,
            manifest_sha256,
            len(source_ids),
            _json(
                {
                    "manifest_sha256": manifest_sha256,
                    "min_order": min(tile.order for tile in tiles),
                    "max_order": max(tile.order for tile in tiles),
                }
            ),
            generation_id,
        ),
    )
    activated = gateway.execute(
        "select private.activate_mosaic_generation(%s) as id",
        (generation_id,),
    )[0]["id"]
    if str(activated) != str(generation_id):
        raise RuntimeError("mosaic activation returned an unexpected generation")
    return {"generation_id": str(generation_id), "manifest_path": manifest_path}


def _publish_seed_run(
    gateway: CatalogGateway,
    run: Mapping[str, Any],
    target: SkySeedTarget,
    spectral_band: str,
    watch_timeout: int,
) -> dict[str, Any]:
    run_id = run["id"]
    _process_qualification_inline(gateway, run_id, watch_timeout)
    rows = _eligible_rows_for_run(gateway, run_id)
    if not rows:
        raise RuntimeError("public sky seed has no scientifically eligible source")

    layer_slug = seed_layer_slug(spectral_band, target.order, target.index)
    existing = gateway.execute(
        """
        select g.id,g.status
        from public.mosaic_layers l
        join public.mosaic_generations g on g.id=l.current_generation_id
        where l.slug=%s and g.recipe->>'seed_run_id'=%s
        limit 1
        """,
        (layer_slug, str(run_id)),
    )
    if existing and existing[0]["status"] == "complete":
        _update_run(gateway, run_id, "complete")
        return {"generation_id": str(existing[0]["id"]), "replayed": True}

    with tempfile.TemporaryDirectory(prefix=f"sky-seed-build-{run_id}-") as temporary:
        workdir = Path(temporary)
        frames, geometries = _load_frames(gateway, rows, workdir)
        source_ids = [frame.source_id for frame in frames]
        source_inventory_sha256 = hash_source_inventory(source_ids)
        canvas = plan_mosaic_canvas(
            geometries,
            reference=SkyCoord(target.ra_deg * u.deg, target.dec_deg * u.deg, frame="icrs"),
            max_fits_bytes=gateway.config.max_derivative_bytes,
            max_scale_factor=2.5,
        )
        coadd = coadd_streaming(
            frames,
            canvas,
            workdir / "coadd",
            expected_source_ids=source_ids,
        )
        limits = display_limits(coadd.data)
        plan = derive_healpix_plan_from_master(
            coadd.data,
            canvas.wcs,
            fine_order=9,
            minimum_order=0,
            minimum_fine_coverage=0.001,
        )
        contributions = measure_tile_source_contributions(
            frames,
            plan,
            expected_source_ids=source_ids,
        )
        tiles = render_healpix_tiles(
            coadd.data,
            canvas.wcs,
            plan,
            source_contributions=contributions,
            expected_source_ids=source_ids,
            limits=limits,
        )
        recipe = {
            "method": "public-sky-seed-v1",
            "source_kind": "public_archive",
            "source_id": "mast-ps1",
            "seed_run_id": str(run_id),
            "seed_healpix_order": target.order,
            "seed_healpix_index": target.index,
            "target_ra_deg": target.ra_deg,
            "target_dec_deg": target.dec_deg,
            "spectral_band": spectral_band,
            "source_inventory_sha256": source_inventory_sha256,
            "canvas_plan_sha256": canvas.sha256,
            "tile_plan_sha256": plan.sha256,
        }
        generation_id, generation = _create_generation(
            gateway,
            layer_slug,
            f"Public PS1 {spectral_band} · O{target.order}/{target.index}",
            spectral_band,
            recipe,
            plan,
            source_ids,
        )

        master_file = write_master_fits(
            coadd,
            canvas,
            workdir / "master.fits",
            object_id=f"SKY-O{target.order}-{target.index}",
            spectral_band=spectral_band,
            pipeline_version=gateway.config.pipeline_version,
            partial=True,
            source_inventory_sha256=source_inventory_sha256,
            extra_header={"SEEDORD": target.order, "SEEDPIX": target.index},
        )
        preview_file = write_master_preview(
            coadd.data,
            workdir / "master.webp",
            limits=limits,
        )
        master_storage_path = f"fields/{layer_slug}/{generation}/master.fits"
        preview_storage_path = f"fields/{layer_slug}/{generation}/master.webp"
        master_sha256 = gateway.ensure_derivative_file(
            master_storage_path,
            master_file.path,
            master_file.media_type,
        )
        preview_sha256 = gateway.ensure_derivative_file(
            preview_storage_path,
            preview_file.path,
            preview_file.media_type,
        )
        publication = _publish_tiles(
            gateway,
            generation_id,
            generation,
            layer_slug,
            tiles,
            {
                "provenance": {
                    "source_id": "mast-ps1",
                    "rights": "public",
                    "acknowledgement": PS1_ACKNOWLEDGEMENT,
                    "archive_ingest_run_id": str(run_id),
                },
                "seed": {
                    "order": target.order,
                    "index": target.index,
                    "ra_deg": target.ra_deg,
                    "dec_deg": target.dec_deg,
                },
                "master": {
                    "path": master_storage_path,
                    "sha256": master_sha256,
                    "preview_path": preview_storage_path,
                    "preview_sha256": preview_sha256,
                    "spatial_coverage_fraction": coadd.spatial_coverage_fraction,
                },
            },
            source_ids,
        )
    _update_run(gateway, run_id, "complete")
    return publication


def _read_master_fits(content: bytes, path: Path) -> tuple[np.ndarray, WCS]:
    path.write_bytes(content)
    with fits.open(path, memmap=False, checksum=True) as hdus:
        for hdu in hdus:
            if hdu.data is None:
                continue
            data = np.asarray(hdu.data)
            if data.ndim != 2:
                continue
            wcs = WCS(hdu.header).celestial
            if not wcs.has_celestial:
                continue
            finite = np.isfinite(data)
            if not np.any(finite):
                continue
            return np.array(data, dtype=np.float32, copy=True), wcs
    raise ValueError("current master FITS has no usable celestial image HDU")


def _parent_contributions_from_children(
    plan: HealpixPlan,
    child_tiles: Sequence[Mapping[str, Any]],
) -> tuple[dict[Any, tuple[TileSourceContribution, ...]], list[str]]:
    source_union: set[str] = set()
    normalized_children: list[tuple[int, int, list[str], dict[str, float]]] = []
    for row in child_tiles:
        order = int(row["healpix_order"])
        index = int(row["healpix_index"])
        sources = [str(value) for value in (row.get("source_upload_ids") or [])]
        weights = {
            str(key): float(value)
            for key, value in (row.get("contribution_weights") or {}).items()
            if float(value) > 0
        }
        if not weights and sources:
            equal = 1 / len(sources)
            weights = {source_id: equal for source_id in sources}
        source_union.update(sources)
        source_union.update(weights)
        normalized_children.append((order, index, sources, weights))
    if not source_union:
        raise RuntimeError("current master generation has no source attribution")

    output: dict[Any, tuple[TileSourceContribution, ...]] = {}
    for cell in plan.cells:
        totals: defaultdict[str, float] = defaultdict(float)
        for child_order, child_index, child_sources, child_weights in normalized_children:
            if child_order < cell.order:
                continue
            ancestor = child_index // (4 ** (child_order - cell.order))
            if ancestor != cell.index:
                continue
            if child_weights:
                for source_id, weight in child_weights.items():
                    totals[source_id] += weight
            elif child_sources:
                equal = 1 / len(child_sources)
                for source_id in child_sources:
                    totals[source_id] += equal
        if not totals:
            for source_id in source_union:
                totals[source_id] = 1
        total_weight = sum(totals.values())
        output[cell] = tuple(
            TileSourceContribution(
                source_id=source_id,
                finite_pixels=1,
                cell_pixels=1,
                coverage_fraction=1.0,
                weighted_pixels=weight,
                normalized_weight=weight / total_weight,
            )
            for source_id, weight in sorted(totals.items())
        )
    return output, sorted(source_union)


def _current_archive_masters(gateway: CatalogGateway) -> list[dict[str, Any]]:
    return gateway.execute(
        """
        select m.id,m.object_id,m.fits_storage_path,m.fits_sha256,m.mosaic_generation_id,
               l.spectral_band
        from public.astro_masters m
        join public.mosaic_generations g on g.id=m.mosaic_generation_id
        join public.mosaic_layers l on l.id=g.layer_id
        where m.is_current
          and m.fits_storage_path is not null
          and m.mosaic_generation_id is not null
          and l.spectral_band = any(array['g','r','i','z','y'])
        order by m.created_at,m.object_id
        """
    )


def _backfill_master_parents(
    gateway: CatalogGateway,
    master: Mapping[str, Any],
    workdir: Path,
) -> dict[str, Any]:
    object_id = str(master["object_id"])
    spectral_band = str(master["spectral_band"])
    layer_slug = parent_layer_slug(object_id, spectral_band)
    current = gateway.execute(
        """
        select g.id,g.recipe
        from public.mosaic_layers l
        join public.mosaic_generations g on g.id=l.current_generation_id
        where l.slug=%s
        limit 1
        """,
        (layer_slug,),
    )
    if current and str((current[0].get("recipe") or {}).get("source_master_id")) == str(master["id"]):
        return {"generation_id": str(current[0]["id"]), "replayed": True, "object_id": object_id}

    master_content = gateway.storage.storage.from_("astro-derived").download(master["fits_storage_path"])
    data, wcs = _read_master_fits(master_content, workdir / f"{object_id}-master.fits")
    plan = derive_healpix_plan_from_master(
        data,
        wcs,
        fine_order=6,
        minimum_order=0,
        minimum_fine_coverage=0.0001,
    )
    child_tiles = gateway.execute(
        """
        select healpix_order,healpix_index,source_upload_ids,contribution_weights
        from public.mosaic_tiles
        where generation_id=%s and healpix_order>=7
        order by healpix_order,healpix_index
        """,
        (master["mosaic_generation_id"],),
    )
    contributions, source_ids = _parent_contributions_from_children(plan, child_tiles)
    tiles = render_healpix_tiles(
        data,
        wcs,
        plan,
        source_contributions=contributions,
        expected_source_ids=source_ids,
        limits=display_limits(data),
    )
    recipe = {
        "method": "derived-parent-pyramid-v1",
        "source_master_id": str(master["id"]),
        "source_master_sha256": master.get("fits_sha256"),
        "source_mosaic_generation_id": str(master["mosaic_generation_id"]),
        "attribution_method": "descendant-weight-aggregation",
        "tile_plan_sha256": plan.sha256,
    }
    generation_id, generation = _create_generation(
        gateway,
        layer_slug,
        f"{object_id} · parents tout-ciel",
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
        tiles,
        {
            "source_master": {
                "id": str(master["id"]),
                "fits_storage_path": master["fits_storage_path"],
                "fits_sha256": master.get("fits_sha256"),
                "mosaic_generation_id": str(master["mosaic_generation_id"]),
            },
            "attribution_method": "descendant-weight-aggregation",
        },
        source_ids,
    )
    return {**publication, "object_id": object_id}


def rebuild_global_allsky(gateway: CatalogGateway) -> dict[str, Any]:
    rows = gateway.execute(
        """
        with ranked as (
          select t.healpix_index,t.storage_path,
                 row_number() over (
                   partition by t.healpix_index
                   order by
                     case
                       when l.spectral_band in ('broadband','rgb','color') then 0
                       when l.spectral_band='r' then 1
                       else 2
                     end,
                     m.output_pixel_scale_arcsec asc nulls last,
                     cardinality(t.source_upload_ids) desc,
                     g.activated_at desc,
                     l.slug
                 ) as rank
          from public.mosaic_layers l
          join public.mosaic_generations g on g.id=l.current_generation_id
          join public.mosaic_tiles t on t.generation_id=g.id
          left join public.astro_masters m
            on m.mosaic_generation_id=g.id and m.is_current
          where g.status='complete'
            and g.activated_at is not null
            and t.healpix_order=%s
            and t.media_type='image/webp'
            and t.storage_path like 'hips/%%'
        )
        select healpix_index,storage_path
        from ranked
        where rank=1
        order by healpix_index
        """,
        (GLOBAL_ALLSKY_ORDER,),
    )
    tiles: dict[int, bytes] = {}
    bucket = gateway.storage.storage.from_("astro-derived")
    for row in rows:
        tiles[int(row["healpix_index"])] = bucket.download(row["storage_path"])
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
    logger.info(
        _json(
            {
                "event": "global_allsky_published",
                "covered_order3_tiles": len(tiles),
                "storage_path": GLOBAL_ALLSKY_STORAGE_PATH,
                "sha256": checksum,
            }
        )
    )
    return {
        "covered_order3_tiles": len(tiles),
        "storage_path": GLOBAL_ALLSKY_STORAGE_PATH,
        "sha256": checksum,
    }


def build_next(args: argparse.Namespace) -> int:
    gateway = CatalogGateway(Config.from_environment())
    target = _select_seed_target(
        gateway,
        args.seed_order,
        args.filter,
        args.min_dec,
        args.max_dec,
    )
    run = _ingest_seed(
        gateway,
        target,
        args.filter,
        args.max_files,
        args.max_bytes,
        args.cutout_size,
        args.width_arcmin,
        args.height_arcmin,
        args.request_delay,
        args.timeout,
    )
    try:
        publication = _publish_seed_run(
            gateway,
            run,
            target,
            args.filter,
            args.watch_timeout,
        )
        allsky = rebuild_global_allsky(gateway)
        logger.info(
            _json(
                {
                    "event": "sky_seed_complete",
                    "run_id": str(run["id"]),
                    "seed_order": target.order,
                    "seed_index": target.index,
                    "publication": publication,
                    "allsky": allsky,
                }
            )
        )
        return 0
    except Exception as error:
        _update_run(gateway, run["id"], "failed", str(error))
        raise


def backfill_current_masters(args: argparse.Namespace) -> int:
    gateway = CatalogGateway(Config.from_environment())
    masters = _current_archive_masters(gateway)[: args.max_masters]
    results: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="sky-parent-backfill-") as temporary:
        root = Path(temporary)
        for index, master in enumerate(masters):
            directory = root / f"master-{index}"
            directory.mkdir(parents=True, exist_ok=True)
            results.append(_backfill_master_parents(gateway, master, directory))
    allsky = rebuild_global_allsky(gateway)
    logger.info(_json({"event": "parent_backfill_complete", "masters": results, "allsky": allsky}))
    return 0


def refresh_allsky(_args: argparse.Namespace) -> int:
    gateway = CatalogGateway(Config.from_environment())
    rebuild_global_allsky(gateway)
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        description="Progressively build a catalogue-independent public all-sky Sky Map mosaic"
    )
    commands = root.add_subparsers(dest="command", required=True)

    build = commands.add_parser("build-next", help="ingest and publish the next unattempted PS1 sky seed")
    build.add_argument("--filter", choices=list("grizy"), default="r")
    build.add_argument("--seed-order", type=int, default=4)
    build.add_argument("--min-dec", type=float, default=-29.0)
    build.add_argument("--max-dec", type=float, default=85.0)
    build.add_argument("--max-files", type=int, default=2)
    build.add_argument("--max-bytes", type=int, default=512 * 1024**2)
    build.add_argument("--cutout-size", type=int, default=2400)
    build.add_argument("--width-arcmin", type=float, default=24.0)
    build.add_argument("--height-arcmin", type=float, default=24.0)
    build.add_argument("--request-delay", type=float, default=0.3)
    build.add_argument("--timeout", type=int, default=120)
    build.add_argument("--watch-timeout", type=int, default=3600)
    build.set_defaults(handler=build_next)

    backfill = commands.add_parser(
        "backfill-current-masters",
        help="publish HEALPix 0-6 parent overlays for current public archive masters",
    )
    backfill.add_argument("--max-masters", type=int, default=20)
    backfill.set_defaults(handler=backfill_current_masters)

    allsky = commands.add_parser("refresh-allsky", help="rebuild the global order-3 Allsky preview")
    allsky.set_defaults(handler=refresh_allsky)
    return root


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    args = parser().parse_args()
    if getattr(args, "max_files", 1) < 1 or getattr(args, "max_files", 1) > 8:
        raise ValueError("max-files must be between 1 and 8")
    if getattr(args, "max_bytes", 1) < 1 or getattr(args, "max_bytes", 1) > 2 * 1024**3:
        raise ValueError("max-bytes must be between 1 byte and 2 GiB")
    if getattr(args, "cutout_size", 2400) < 256 or getattr(args, "cutout_size", 2400) > 4096:
        raise ValueError("cutout-size must be between 256 and 4096 pixels")
    if getattr(args, "seed_order", 4) < 0 or getattr(args, "seed_order", 4) > 8:
        raise ValueError("seed-order must be between 0 and 8")
    raise SystemExit(args.handler(args))


if __name__ == "__main__":
    main()
