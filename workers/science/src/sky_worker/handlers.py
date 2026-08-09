from __future__ import annotations

from collections import OrderedDict
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any
from uuid import UUID

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
import astropy.units as u
import numpy as np

from .astrometry import solve_astrometry
from .calibration import align_frame, calibrate_light, master_frame, weighted_sigma_stack
from .cosmos import cluster_observations, triangulate
from .extraction import ExtractedFrame, extract_frame
from .footprint import covered_healpix_cells, seam_safe_footprint
from .gateway import Gateway
from .hips import TileArtifact, build_tiles, encode_cell_tile, project_cell, tile_path
from .models import Job, StageOutcome
from .mosaic import (
    MosaicFrame,
    SourceGeometry,
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
from .policy import qualify
from .quality import measure_quality
from .render import webp_preview


class Handlers:
    def __init__(self, gateway: Gateway):
        self.gateway = gateway

    def handle(self, job: Job, workdir: Path) -> StageOutcome:
        if job.status == "failed":
            retry_state = job.payload.get("retry_state")
            if not isinstance(retry_state, str):
                raise ValueError("failed job has no retry state")
            return StageOutcome(retry_state, 0, {"retrying": retry_state})
        if job.job_type == "qualify_upload":
            return self._qualify_upload(job, workdir)
        if job.job_type == "stack_object":
            return self._stack_object(job, workdir)
        if job.job_type in {"cluster_cosmos", "triangulate_cosmos"}:
            return self._cosmos(job)
        if job.job_type == "publish_mosaic":
            return self._publish_generation(job, workdir)
        raise ValueError(f"unsupported job type: {job.job_type}")

    def _load_frame(self, upload_id: UUID, workdir: Path) -> tuple[dict[str, Any], ExtractedFrame]:
        row = self.gateway.fetch_upload(upload_id)
        artifact = self.gateway.download_upload(upload_id, workdir)
        return row, extract_frame(artifact.local_path)

    @staticmethod
    def _has_trusted_archive_wcs(row: dict[str, Any]) -> bool:
        metadata = row.get("metadata") or {}
        provenance = row.get("provenance") or {}
        archive = metadata.get("archive") or {}
        source_ids = (provenance.get("source_id"), archive.get("source_id"))
        record_ids = (
            provenance.get("archive_record_id"),
            archive.get("archive_record_id"),
        )

        def is_sha256(value: Any) -> bool:
            if not isinstance(value, str) or len(value) != 64:
                return False
            try:
                int(value, 16)
            except ValueError:
                return False
            return True

        return (
            row.get("source_kind") == "public_archive"
            and row.get("archive_item_id") is not None
            and "mast-ps1" in source_ids
            and any(is_sha256(value) for value in record_ids)
            and metadata.get("product_type") == "stack-cutout"
        )

    def _qualify_upload(self, job: Job, workdir: Path) -> StageOutcome:
        if job.upload_id is None:
            raise ValueError("qualification job has no upload")
        row, frame = self._load_frame(job.upload_id, workdir)

        if job.status == "uploaded":
            duplicate = self.gateway.execute(
                "select id from public.astro_uploads where content_sha256 = %s and id <> %s and deleted_at is null limit 1",
                (frame.content_sha256, job.upload_id),
            )
            if duplicate:
                self.gateway.execute(
                    "update public.astro_uploads set status='duplicate', rejected=true, rejection_reason='duplicate-upload', updated_at=now() where id=%s",
                    (job.upload_id,),
                )
                return StageOutcome("duplicate", 100, {"reason": "duplicate-upload"})
            self.gateway.execute(
                """
                update public.astro_uploads
                set content_sha256=%s, metadata=coalesce(metadata,'{}'::jsonb) || %s::jsonb,
                    native_width_px=%s, native_height_px=%s, sensor_width_px=coalesce(sensor_width_px,%s),
                    sensor_height_px=coalesce(sensor_height_px,%s), status='extracting', updated_at=now()
                where id=%s
                """,
                (
                    frame.content_sha256,
                    json.dumps(frame.metadata),
                    frame.native_width,
                    frame.native_height,
                    frame.native_width,
                    frame.native_height,
                    job.upload_id,
                ),
            )
            return StageOutcome("extracting", 20, {"metadata_fields": sorted(frame.metadata)})

        trusted_archive = self._has_trusted_archive_wcs(row)
        solution = solve_astrometry(
            Path(workdir) / Path(row["original_filename"]).name,
            frame.header,
            frame.native_width,
            frame.native_height,
            self.gateway.config.astrometry_timeout_seconds,
            trust_existing_wcs=trusted_archive,
        )
        native_scale = solution.pixel_scale_arcsec
        if row.get("pixel_size_um") and row.get("focal_length_mm"):
            native_scale = 206.265 * float(row["pixel_size_um"]) / float(row["focal_length_mm"])

        if job.status == "extracting":
            footprint = seam_safe_footprint(solution.wcs, frame.native_width, frame.native_height)
            self.gateway.execute(
                """
                insert into public.astrometric_solutions(
                  upload_id,pipeline_version,center_ra_deg,center_dec_deg,rotation_deg,
                  pixel_scale_arcsec,native_pixel_scale_arcsec,matched_stars,rms_px,confidence,footprint,wcs_header
                ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)
                on conflict (upload_id,pipeline_version) do update set
                  center_ra_deg=excluded.center_ra_deg, center_dec_deg=excluded.center_dec_deg,
                  rotation_deg=excluded.rotation_deg, pixel_scale_arcsec=excluded.pixel_scale_arcsec,
                  native_pixel_scale_arcsec=excluded.native_pixel_scale_arcsec,
                  matched_stars=excluded.matched_stars, rms_px=excluded.rms_px,
                  confidence=excluded.confidence, footprint=excluded.footprint, wcs_header=excluded.wcs_header,
                  solved_at=now()
                """,
                (
                    job.upload_id,
                    job.pipeline_version,
                    solution.center_ra_deg,
                    solution.center_dec_deg,
                    solution.rotation_deg,
                    solution.pixel_scale_arcsec,
                    native_scale,
                    solution.matched_stars,
                    solution.rms_px,
                    solution.confidence,
                    json.dumps(footprint),
                    json.dumps(
                        {
                            "cards": solution.header.tostring(sep="\n", endcard=True, padding=False),
                            "verification_method": solution.verification_method,
                            "local_catalogue_metrics_available": solution.verification_method
                            != "trusted-public-archive-wcs",
                        }
                    ),
                ),
            )
            self.gateway.execute(
                """
                update public.astro_uploads set status='solving', solved=true,
                  solved_ra_deg=%s, solved_dec_deg=%s, solved_scale_arcsec_px=%s,
                  solved_rotation_deg=%s, updated_at=now() where id=%s
                """,
                (
                    solution.center_ra_deg,
                    solution.center_dec_deg,
                    solution.pixel_scale_arcsec,
                    solution.rotation_deg,
                    job.upload_id,
                ),
            )
            return StageOutcome(
                "solving",
                45,
                {
                    "matched_stars": solution.matched_stars,
                    "wcs_rms_px": solution.rms_px,
                    "verification_method": solution.verification_method,
                },
            )

        metrics, mask = measure_quality(
            frame.data,
            solution.pixel_scale_arcsec,
            calibrated_science_product=trusted_archive,
        )
        decision = qualify(
            {
                "matched_stars": solution.matched_stars,
                "wcs_rms_px": solution.rms_px,
                "trusted_astrometry": solution.verification_method
                == "trusted-public-archive-wcs",
                "calibrated_science_product": trusted_archive,
                "usable_coverage": metrics.usable_coverage,
                "fwhm_arcsec": metrics.fwhm_arcsec,
                "pixel_scale_arcsec": solution.pixel_scale_arcsec,
                "native_pixel_scale_arcsec": native_scale,
                "eccentricity": metrics.eccentricity,
                "saturated_fraction": metrics.saturated_fraction,
                "clipped_black_fraction": metrics.clipped_black_fraction,
                "signal_to_noise": metrics.signal_to_noise,
                "metadata_complete": bool(frame.metadata),
                "licence_accepted": bool(row.get("licence_code")),
                "has_major_tracking_error": metrics.has_major_tracking_error,
                "has_dense_clouds": metrics.has_dense_clouds,
            }
        )

        if job.status == "solving":
            cells = covered_healpix_cells(mask, solution.wcs)
            with self.gateway.connection() as connection, connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into public.astro_quality_metrics(
                      upload_id,pipeline_version,fwhm_arcsec,eccentricity,signal_to_noise,
                      saturated_fraction,clipped_black_fraction,usable_coverage,score,breakdown,
                      blockers,eligible,resolution_class
                    ) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)
                    on conflict (upload_id,pipeline_version) do update set
                      fwhm_arcsec=excluded.fwhm_arcsec,eccentricity=excluded.eccentricity,
                      signal_to_noise=excluded.signal_to_noise,saturated_fraction=excluded.saturated_fraction,
                      clipped_black_fraction=excluded.clipped_black_fraction,usable_coverage=excluded.usable_coverage,
                      score=excluded.score,breakdown=excluded.breakdown,blockers=excluded.blockers,
                      eligible=excluded.eligible,resolution_class=excluded.resolution_class,measured_at=now()
                    """,
                    (
                        job.upload_id,
                        job.pipeline_version,
                        metrics.fwhm_arcsec,
                        metrics.eccentricity,
                        metrics.signal_to_noise,
                        metrics.saturated_fraction,
                        metrics.clipped_black_fraction,
                        metrics.usable_coverage,
                        decision["score"],
                        json.dumps(decision["breakdown"]),
                        decision["blockers"],
                        decision["eligible"],
                        decision["resolution_class"],
                    ),
                )
                cursor.execute(
                    """
                    select id from public.astrometric_solutions
                    where upload_id=%s and pipeline_version=%s
                    """,
                    (job.upload_id, job.pipeline_version),
                )
                solution_row = cursor.fetchone()
                if not solution_row:
                    raise RuntimeError("qualified WCS solution was not persisted")
                cursor.execute("delete from public.astro_upload_cells where upload_id=%s", (job.upload_id,))
                cursor.executemany(
                    """
                    insert into public.astro_upload_cells(
                      upload_id,healpix_order,healpix_index,coverage_fraction,usable_fraction,eligible,
                      astrometric_solution_id
                    ) values (%s,%s,%s,%s,%s,%s,%s)
                    """,
                    [
                        (
                            job.upload_id,
                            cell["healpix_order"],
                            cell["healpix_index"],
                            cell["coverage_fraction"],
                            cell["usable_fraction"],
                            cell["eligible"] and decision["eligible"],
                            solution_row["id"],
                        )
                        for cell in cells
                    ],
                )
                cursor.execute(
                    """
                    update public.astro_uploads set status='qualifying',fwhm=%s,eccentricity=%s,snr=%s,
                      star_count=%s,quality_score=%s,ai_analysis=%s::jsonb,updated_at=now() where id=%s
                    """,
                    (
                        metrics.fwhm_arcsec,
                        metrics.eccentricity,
                        metrics.signal_to_noise,
                        metrics.star_count,
                        decision["score"] / 100,
                        json.dumps({"source": "deterministic-science", **decision}),
                        job.upload_id,
                    ),
                )
            return StageOutcome(
                "qualifying",
                75,
                {
                    "score": decision["score"],
                    "blockers": decision["blockers"],
                    "verification_method": solution.verification_method,
                },
            )

        if job.status == "qualifying":
            final_status = "approved" if decision["eligible"] else "rejected"
            self.gateway.execute(
                """
                update public.astro_uploads set status=%s,rejected=%s,rejection_reason=%s,updated_at=now()
                where id=%s
                """,
                (
                    final_status,
                    not decision["eligible"],
                    None if decision["eligible"] else ",".join(decision["blockers"]),
                    job.upload_id,
                ),
            )
            if decision["eligible"]:
                claim = self.gateway.execute("select private.claim_approved_upload(%s) as result", (job.upload_id,))[0]["result"]
                return StageOutcome("approved", 90, {"decision": decision, "claim": claim})
            return StageOutcome("rejected", 100, {"decision": decision})

        if job.status == "approved":
            preview = webp_preview(frame.data)
            preview_path = f"previews/{job.upload_id}/{hashlib.sha256(preview).hexdigest()}.webp"
            self.gateway.upload_derivative(preview_path, preview, "image/webp")
            self.gateway.execute(
                "update public.astro_uploads set status='published',updated_at=now() where id=%s",
                (job.upload_id,),
            )
            return StageOutcome("published", 100, {"preview_path": preview_path})

        raise ValueError(f"unexpected qualification state: {job.status}")

    def _stack_object(self, job: Job, workdir: Path) -> StageOutcome:
        if not job.object_id or job.status != "approved":
            raise ValueError("stack jobs must start approved with an object")
        stacking_job_id = job.payload.get("stacking_job_id")
        if not stacking_job_id:
            raise ValueError("stacking_job_id is required")
        stack_rows = self.gateway.execute(
            """
            update public.astro_stacking_jobs
            set status='running', started_at=coalesce(started_at,now()), error_message=null
            where id=%s and object_id=%s
            returning light_ids,dark_ids,flat_ids,bias_ids
            """,
            (stacking_job_id, job.object_id),
        )
        if not stack_rows:
            raise LookupError("stacking job not found")
        source_ids = [
            item
            for key in ("light_ids", "dark_ids", "flat_ids", "bias_ids")
            for item in (stack_rows[0].get(key) or [])
        ]
        if not source_ids:
            raise ValueError("stacking job has no source frames")
        rows = self.gateway.execute(
            """
            select id,frame_type,exposure_s,user_id,instrument_group,quality_score
            from public.astro_uploads
            where id=any(%s::uuid[]) and object_id=%s
              and status in ('approved','published','stacked') and rejected=false
            order by quality_score desc, uploaded_at asc limit 256
            """,
            (source_ids, job.object_id),
        )
        lights = [row for row in rows if row["frame_type"] == "light"]
        if len(lights) < 3:
            raise ValueError("at least three approved light frames are required")
        reference_group = lights[0].get("instrument_group")
        lights = [row for row in lights if row.get("instrument_group") == reference_group]
        calibration = {
            kind: [row for row in rows if row["frame_type"] == kind and row.get("instrument_group") == reference_group]
            for kind in ("bias", "dark", "flat")
        }

        def load_many(items: list[dict[str, Any]]) -> list[tuple[dict[str, Any], ExtractedFrame]]:
            output = []
            for index, item in enumerate(items):
                directory = workdir / f"frame-{index}-{item['id']}"
                directory.mkdir()
                output.append((item, self._load_frame(item["id"], directory)[1]))
            return output

        loaded_lights = load_many(lights)
        masters = {kind: master_frame([frame.data for _, frame in load_many(items)]) for kind, items in calibration.items()}
        reference_item, reference = loaded_lights[0]
        reference_solution = solve_astrometry(
            next((workdir / f"frame-0-{reference_item['id']}").iterdir()),
            reference.header,
            reference.native_width,
            reference.native_height,
            self.gateway.config.astrometry_timeout_seconds,
        )
        aligned: list[np.ndarray] = []
        masks: list[np.ndarray] = []
        weights: list[float] = []
        for index, (item, frame) in enumerate(loaded_lights):
            calibrated = calibrate_light(frame.data, masters["bias"], masters["dark"], masters["flat"])
            if index == 0:
                aligned_frame, mask = calibrated, np.isfinite(calibrated)
            else:
                source_path = next((workdir / f"frame-{index}-{item['id']}").iterdir())
                source_solution = solve_astrometry(
                    source_path,
                    frame.header,
                    frame.native_width,
                    frame.native_height,
                    self.gateway.config.astrometry_timeout_seconds,
                )
                aligned_frame, mask = align_frame(
                    calibrated,
                    source_solution.wcs,
                    reference_solution.wcs,
                    (reference.native_height, reference.native_width),
                )
            aligned.append(aligned_frame)
            masks.append(mask)
            weights.append(max(0.01, float(item.get("quality_score") or 0.5)))
        stacked = weighted_sigma_stack(aligned, masks, weights)
        hdu = fits.PrimaryHDU(stacked, header=reference_solution.header)
        fits_path = workdir / "master.fits"
        hdu.writeto(fits_path, overwrite=True, checksum=True)
        fits_bytes = fits_path.read_bytes()
        preview = webp_preview(stacked)
        content_hash = hashlib.sha256(fits_bytes).hexdigest()
        base = f"masters/{job.object_id}/{content_hash}"
        self.gateway.ensure_derivative(f"{base}.fits", fits_bytes, "image/fits")
        self.gateway.ensure_derivative(f"{base}.webp", preview, "image/webp")
        exposure = sum(float(item.get("exposure_s") or 0) for item in lights) / 3600
        contributors = len({item["user_id"] for item in lights})
        public_base = f"{self.gateway.config.supabase_url}/storage/v1/object/public/astro-derived/{base}"
        self.gateway.execute(
            """
            with retired as (
              update public.astro_masters
              set is_current=false
              where object_id=%s and stacking_job_id is distinct from %s
            ), next_generation as (
              select coalesce(max(generation),0)+1 as value
              from public.astro_masters where object_id=%s
            )
            insert into public.astro_masters(
              object_id,stacking_job_id,image_url,thumbnail_url,lights_stacked,total_exposure_hours,
              contributors_count,configurations_count,generation,notes,is_current
            ) select %s,%s,%s,%s,%s,%s,%s,%s,next_generation.value,%s,true
              from next_generation
            on conflict (stacking_job_id) where stacking_job_id is not null do update set
              image_url=excluded.image_url,thumbnail_url=excluded.thumbnail_url,
              lights_stacked=excluded.lights_stacked,total_exposure_hours=excluded.total_exposure_hours,
              contributors_count=excluded.contributors_count,configurations_count=excluded.configurations_count,
              notes=excluded.notes,is_current=true
            """,
            (
                job.object_id,
                stacking_job_id,
                job.object_id,
                job.object_id,
                stacking_job_id,
                f"{public_base}.webp",
                f"{public_base}.webp",
                len(lights),
                exposure,
                contributors,
                1,
                f"Pipeline {job.pipeline_version}; weighted sigma-clipped stack",
            ),
        )
        cell_rows = self.gateway.execute(
            """
            select distinct on (healpix_order,healpix_index)
              healpix_order,healpix_index,max(coverage_fraction) over (partition by healpix_order,healpix_index) as coverage_fraction,
              max(usable_fraction) over (partition by healpix_order,healpix_index) as usable_fraction,true as eligible
            from public.astro_upload_cells
            where upload_id=any(%s::uuid[]) and eligible
            order by healpix_order,healpix_index
            """,
            ([item["id"] for item in lights],),
        )
        layer_slug = f"{job.object_id.lower()}-broadband"
        layer = self.gateway.execute(
            """
            insert into public.mosaic_layers(slug,label,spectral_band)
            values (%s,%s,'broadband') on conflict (slug) do update set label=excluded.label
            returning id
            """,
            (layer_slug, f"{job.object_id} broadband"),
        )[0]
        existing_generation = self.gateway.execute(
            "select id,generation from public.mosaic_generations where source_job_id=%s",
            (job.id,),
        )
        if existing_generation:
            generation_id = existing_generation[0]["id"]
            mosaic_generation = existing_generation[0]["generation"]
        else:
            mosaic_generation = self.gateway.execute(
                "select coalesce(max(generation),0)+1 as value from public.mosaic_generations where layer_id=%s",
                (layer["id"],),
            )[0]["value"]
            generation_id = self.gateway.execute(
                """
                insert into public.mosaic_generations(
                  layer_id,generation,status,pipeline_version,recipe,expected_tiles,source_job_id
                ) values (%s,%s,'building',%s,%s::jsonb,%s,%s) returning id
                """,
                (
                    layer["id"],
                    mosaic_generation,
                    job.pipeline_version,
                    json.dumps({"method": "weighted-sigma", "object_id": job.object_id, "source_master": content_hash}),
                    len(cell_rows),
                    job.id,
                ),
            )[0]["id"]
        tiles = build_tiles(stacked, reference_solution.wcs, cell_rows, layer_slug, mosaic_generation)
        manifest_tiles = []
        for tile in tiles:
            checksum = self.gateway.ensure_derivative(tile.path, tile.content, tile.media_type)
            self.gateway.execute(
                """
                insert into public.mosaic_tiles(
                  generation_id,healpix_order,healpix_index,storage_path,media_type,byte_size,sha256,source_upload_ids
                ) values (%s,%s,%s,%s,%s,%s,%s,%s::uuid[])
                on conflict (generation_id,healpix_order,healpix_index,media_type) do nothing
                """,
                (
                    generation_id,
                    tile.order,
                    tile.index,
                    tile.path,
                    tile.media_type,
                    len(tile.content),
                    checksum,
                    [item["id"] for item in lights],
                ),
            )
            manifest_tiles.append({"order": tile.order, "index": tile.index, "path": tile.path, "sha256": checksum})
        manifest = json.dumps(
            {
                "generation_id": str(generation_id),
                "pipeline_version": job.pipeline_version,
                "layer": layer_slug,
                "tiles": sorted(manifest_tiles, key=lambda value: (value["order"], value["index"])),
                "source_upload_ids": sorted(str(item["id"]) for item in lights),
            },
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
        manifest_path = f"hips/{layer_slug}/{mosaic_generation}/manifest.json"
        manifest_sha = self.gateway.ensure_derivative(manifest_path, manifest, "application/json")
        self.gateway.execute(
            """
            update public.mosaic_generations set status='verifying',published_tiles=%s,
              manifest_path=%s,manifest_sha256=%s where id=%s
            """,
            (len(tiles), manifest_path, manifest_sha, generation_id),
        )
        self.gateway.execute("select private.activate_mosaic_generation(%s)", (generation_id,))
        if stacking_job_id:
            self.gateway.execute(
                """
                update public.astro_stacking_jobs set status='completed',result_image_url=%s,
                  result_thumbnail_url=%s,result_metadata=%s::jsonb,completed_at=now()
                where id=%s
                """,
                (
                    f"{public_base}.fits",
                    f"{public_base}.webp",
                    json.dumps({"mosaic_generation_id": str(generation_id), "manifest_sha256": manifest_sha}),
                    stacking_job_id,
                ),
            )
        return StageOutcome(
            "published",
            100,
            {
                "master_path": f"{base}.fits",
                "lights": len(lights),
                "contributors": contributors,
                "mosaic_generation_id": str(generation_id),
                "tiles": len(tiles),
            },
        )

    def _cosmos(self, job: Job) -> StageOutcome:
        if job.status == "uploaded":
            return StageOutcome("extracting", 25, {})
        if job.status == "extracting":
            return StageOutcome("qualifying", 50, {})
        if job.status == "qualifying":
            return StageOutcome("approved", 75, {})
        if job.status != "approved" or job.cosmos_observation_id is None:
            raise ValueError("invalid Cosmos job state")
        seed_rows = self.gateway.execute(
            "select * from public.cosmos_observations where id=%s",
            (job.cosmos_observation_id,),
        )
        if not seed_rows:
            raise LookupError("Cosmos observation not found")
        seed = seed_rows[0]
        candidates = self.gateway.execute(
            """
            select * from public.cosmos_observations
            where phenomenon_type=%s and observed_at between %s - interval '15 minutes' and %s + interval '15 minutes'
              and status <> 'rejected'
            """,
            (seed["phenomenon_type"], seed["observed_at"], seed["observed_at"]),
        )
        cluster = cluster_observations(seed, candidates)
        distinct_users = {item["user_id"] for item in cluster if item.get("user_id")}
        if len(cluster) < 2 or len(distinct_users) < 2:
            return StageOutcome("published", 100, {"clustered": False, "matching_observations": len(cluster)})
        ids = sorted(str(item["id"]) for item in cluster)
        cluster_key = hashlib.sha256(":".join(ids).encode()).hexdigest()
        solution = triangulate(cluster)
        with self.gateway.connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                insert into public.cosmos_events(
                  phenomenon_type,title,description,event_at,confidence_score,status,triangulation,cluster_key
                ) values (%s,%s,%s,%s,%s,%s,%s::jsonb,%s)
                on conflict (cluster_key) do update set updated_at=now()
                returning id
                """,
                (
                    seed["phenomenon_type"],
                    f"{seed['phenomenon_type'].replace('_',' ').title()} observé par plusieurs témoins",
                    f"Événement corrélé à partir de {len(cluster)} observations indépendantes.",
                    min(item["observed_at"] for item in cluster),
                    min(1.0, len(distinct_users) / 5) * (solution["confidence"] if solution else 0.5),
                    "confirmed" if solution and solution["confidence"] >= 0.6 else "unverified",
                    json.dumps(solution) if solution else None,
                    cluster_key,
                ),
            )
            event_id = cursor.fetchone()["id"]
            cursor.execute(
                "update public.cosmos_observations set event_id=%s,status='clustered' where id=any(%s::uuid[])",
                (event_id, ids),
            )
            if solution:
                cursor.execute(
                    """
                    insert into public.cosmos_triangulations(
                      event_id,observation_ids,estimated_latitude,estimated_longitude,
                      estimated_altitude_km,error_margin_km,method,confidence
                    ) values (%s,%s::uuid[],%s,%s,%s,%s,'geometric',%s)
                    on conflict (event_id) do update set
                      observation_ids=excluded.observation_ids,estimated_latitude=excluded.estimated_latitude,
                      estimated_longitude=excluded.estimated_longitude,estimated_altitude_km=excluded.estimated_altitude_km,
                      error_margin_km=excluded.error_margin_km,confidence=excluded.confidence,computed_at=now()
                    """,
                    (
                        event_id,
                        ids,
                        solution["estimated_latitude"],
                        solution["estimated_longitude"],
                        solution["estimated_altitude_km"],
                        solution["error_margin_km"],
                        solution["confidence"],
                    ),
                )
        return StageOutcome("published", 100, {"clustered": True, "event_id": str(event_id), "triangulated": bool(solution)})

    def _publish_generation(self, job: Job, workdir: Path) -> StageOutcome:
        if job.payload.get("mode") == "build_archive_v9":
            return self._build_archive_generation_v9(job, workdir)
        if job.payload.get("mode") == "build_archive":
            raise ValueError("legacy archive mosaic publication is disabled; submit a v9 rebuild")
        generation_id = job.payload.get("generation_id")
        if not generation_id:
            raise ValueError("generation_id is required")
        result = self.gateway.execute("select private.activate_mosaic_generation(%s) as id", (generation_id,))
        return StageOutcome("published", 100, {"generation_id": str(result[0]["id"])})

    @staticmethod
    def _json_object(value: Any) -> dict[str, Any] | None:
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                decoded = json.loads(value)
            except json.JSONDecodeError:
                return None
            return decoded if isinstance(decoded, dict) else None
        return None

    @classmethod
    def _require_matching_archive_generation_v9(
        cls,
        row: dict[str, Any],
        *,
        job: Job,
        layer_id: Any,
        run_id: Any,
        recipe: dict[str, Any],
        expected_tiles: int,
        expected_sources: int,
        source_inventory_sha256: str,
        worker_tile_plan_sha256: str,
        canvas_plan_sha256: str,
    ) -> None:
        stored_recipe = cls._json_object(row.get("recipe"))
        stored_verification = cls._json_object(row.get("verification"))
        mismatches: list[str] = []
        if str(row.get("source_job_id")) != str(job.id):
            mismatches.append("source_job_id")
        if str(row.get("layer_id")) != str(layer_id):
            mismatches.append("layer_id")
        if str(row.get("archive_ingest_run_id")) != str(run_id):
            mismatches.append("archive_ingest_run_id")
        if row.get("pipeline_version") != job.pipeline_version:
            mismatches.append("pipeline_version")
        if stored_recipe != recipe:
            mismatches.append("recipe")
        if int(row.get("expected_tiles") or 0) != expected_tiles:
            mismatches.append("expected_tiles")
        if int(row.get("planned_tiles") or 0) != expected_tiles:
            mismatches.append("planned_tiles")
        if int(row.get("expected_source_uploads") or 0) != expected_sources:
            mismatches.append("expected_source_uploads")
        if row.get("source_inventory_sha256") != source_inventory_sha256:
            mismatches.append("source_inventory_sha256")
        if stored_verification is None:
            mismatches.append("verification")
        else:
            if stored_verification.get("worker_tile_plan_sha256") != worker_tile_plan_sha256:
                mismatches.append("worker_tile_plan_sha256")
            if stored_verification.get("canvas_plan_sha256") != canvas_plan_sha256:
                mismatches.append("canvas_plan_sha256")
        if row.get("status") == "retired":
            mismatches.append("status")
        try:
            generation = int(row.get("generation"))
        except (TypeError, ValueError):
            generation = 0
        if generation < 1:
            mismatches.append("generation")
        if mismatches:
            raise ValueError(
                "existing archive generation diverges from deterministic v9 preflight: "
                + ",".join(mismatches)
            )

    def _get_or_create_archive_generation_v9(
        self,
        *,
        job: Job,
        object_id: str,
        layer_id: Any,
        run_id: Any,
        recipe: dict[str, Any],
        verification: dict[str, Any],
        expected_tiles: int,
        expected_sources: int,
        source_inventory_sha256: str,
        worker_tile_plan_sha256: str,
        canvas_plan_sha256: str,
    ) -> dict[str, Any]:
        select_generation = """
            select id,generation,layer_id,status,pipeline_version,recipe,expected_tiles,
                   planned_tiles,source_job_id,archive_ingest_run_id,expected_source_uploads,
                   source_inventory_sha256,verification
            from public.mosaic_generations
            where source_job_id=%s
            """
        generation_rows = self.gateway.execute(select_generation, (job.id,))
        if not generation_rows:
            generation_rows = self.gateway.execute(
                """
                insert into public.mosaic_generations(
                  layer_id,generation,status,pipeline_version,recipe,expected_tiles,published_tiles,
                  source_job_id,archive_ingest_run_id,expected_source_uploads,verification
                )
                select %s,greatest(
                         coalesce(max(generation),0),
                         (select coalesce(max(m.generation),0) from public.astro_masters m where m.object_id=%s)
                       )+1,
                       'building',%s,%s::jsonb,%s,0,%s,%s,%s,%s::jsonb
                from public.mosaic_generations where layer_id=%s
                on conflict (source_job_id) do nothing
                returning id,generation,layer_id,status,pipeline_version,recipe,expected_tiles,
                          planned_tiles,source_job_id,archive_ingest_run_id,expected_source_uploads,
                          source_inventory_sha256,verification
                """,
                (
                    layer_id,
                    object_id,
                    job.pipeline_version,
                    json.dumps(recipe),
                    expected_tiles,
                    job.id,
                    run_id,
                    expected_sources,
                    json.dumps(verification),
                    layer_id,
                ),
            )
            if not generation_rows:
                generation_rows = self.gateway.execute(select_generation, (job.id,))
        if len(generation_rows) != 1:
            raise ValueError("archive generation source_job_id did not resolve uniquely")
        generation_row = generation_rows[0]
        self._require_matching_archive_generation_v9(
            generation_row,
            job=job,
            layer_id=layer_id,
            run_id=run_id,
            recipe=recipe,
            expected_tiles=expected_tiles,
            expected_sources=expected_sources,
            source_inventory_sha256=source_inventory_sha256,
            worker_tile_plan_sha256=worker_tile_plan_sha256,
            canvas_plan_sha256=canvas_plan_sha256,
        )
        return generation_row

    @classmethod
    def _require_matching_archive_tile_v9(
        cls,
        rows: list[dict[str, Any]],
        *,
        path: str,
        media_type: str,
        sha256: str,
        source_upload_ids: tuple[str, ...],
        contribution_weights: dict[str, float],
    ) -> None:
        if len(rows) != 1:
            raise ValueError("persisted archive tile does not resolve uniquely")
        row = rows[0]
        stored_source_ids = row.get("source_upload_ids")
        normalized_source_ids = (
            tuple(str(value) for value in stored_source_ids)
            if isinstance(stored_source_ids, (list, tuple))
            else None
        )
        stored_weights = cls._json_object(row.get("contribution_weights"))
        mismatches: list[str] = []
        if row.get("storage_path") != path:
            mismatches.append("storage_path")
        if row.get("media_type") != media_type:
            mismatches.append("media_type")
        if row.get("sha256") != sha256:
            mismatches.append("sha256")
        if normalized_source_ids != source_upload_ids:
            mismatches.append("source_upload_ids")
        if stored_weights != contribution_weights:
            mismatches.append("contribution_weights")
        if mismatches:
            raise ValueError(
                "persisted archive tile diverges from deterministic v9 render: "
                + ",".join(mismatches)
            )

    def _persist_archive_tile_v9(
        self,
        *,
        generation_id: Any,
        tile: Any,
        path: str,
        checksum: str,
    ) -> None:
        select_tile = """
            select storage_path,media_type,sha256,source_upload_ids,contribution_weights
            from public.mosaic_tiles
            where generation_id=%s and healpix_order=%s and healpix_index=%s
            order by media_type
            """
        parameters = (generation_id, tile.order, tile.index)
        rows = self.gateway.execute(select_tile, parameters)
        if not rows:
            self.gateway.execute(
                """
                insert into public.mosaic_tiles(
                  generation_id,healpix_order,healpix_index,storage_path,media_type,byte_size,
                  sha256,source_upload_ids,contribution_weights
                ) values (%s,%s,%s,%s,%s,%s,%s,%s::uuid[],%s::jsonb)
                on conflict do nothing
                """,
                (
                    generation_id,
                    tile.order,
                    tile.index,
                    path,
                    tile.media_type,
                    len(tile.content),
                    checksum,
                    list(tile.source_upload_ids),
                    json.dumps(tile.source_weights),
                ),
            )
            rows = self.gateway.execute(select_tile, parameters)
        self._require_matching_archive_tile_v9(
            rows,
            path=path,
            media_type=tile.media_type,
            sha256=checksum,
            source_upload_ids=tuple(tile.source_upload_ids),
            contribution_weights=tile.source_weights,
        )

    def _build_archive_generation_v9(self, job: Job, workdir: Path) -> StageOutcome:
        run_id = job.payload.get("run_id")
        spectral_band = job.payload.get("spectral_band")
        expected_sources_payload = job.payload.get("expected_sources")
        if not run_id or not job.object_id or spectral_band not in set("grizy"):
            raise ValueError("archive mosaic requires run_id, object_id and a PS1 spectral band")
        if expected_sources_payload is not None and (
            not isinstance(expected_sources_payload, int) or expected_sources_payload < 1
        ):
            raise ValueError("archive mosaic expected_sources must be a positive integer")

        run_rows = self.gateway.execute(
            """
            select r.id,r.status,r.source_id,r.object_id,r.spectral_band,r.query,
                   s.name as source_name,s.acknowledgement,s.terms_url,
                   o.ra_deg,o.dec_deg
            from public.archive_ingest_runs r
            join public.archive_sources s on s.id=r.source_id
            join public.astro_objects o on o.id=r.object_id
            where r.id=%s and r.object_id=%s and r.spectral_band=%s
              and r.source_id='mast-ps1'
            """,
            (run_id, job.object_id, spectral_band),
        )
        if not run_rows:
            raise LookupError("verified archive ingest run not found")
        run = run_rows[0]

        source_rows = self.gateway.execute(
            """
            select u.id,u.quality_score,u.exposure_s,u.source_kind,u.pipeline_version,
                   u.content_sha256,u.original_filename,
                   solution.id as astrometric_solution_id,
                   solution.pipeline_version as solution_pipeline_version,
                   solution.wcs_header
            from public.archive_items i
            join public.astro_uploads u on u.id=i.upload_id
            join lateral (
              select s.id,s.pipeline_version,s.wcs_header,s.solved_at
              from public.astrometric_solutions s
              where s.upload_id=u.id
              order by (s.pipeline_version=%s) desc,s.solved_at desc
              limit 1
            ) solution on true
            where i.ingest_run_id=%s
              and i.source_id='mast-ps1' and i.calibration_level=3
              and u.source_kind='public_archive'
              and u.status in ('approved','published','stacked')
              and u.rejected=false and u.deleted_at is null
            order by u.id
            """,
            (job.pipeline_version, run_id),
        )
        expected_source_count = (
            expected_sources_payload if expected_sources_payload is not None else len(source_rows)
        )
        if len(source_rows) != expected_source_count:
            raise ValueError(
                f"archive mosaic source inventory mismatch: expected {expected_source_count}, "
                f"found {len(source_rows)}"
            )
        if not source_rows:
            raise ValueError("archive run has no qualified source")

        source_root = workdir / "archive-v9-sources"
        source_root.mkdir(parents=True, exist_ok=True)
        local_sources: list[dict[str, Any]] = []
        geometries: list[SourceGeometry] = []
        expected_source_ids = {str(row["id"]) for row in source_rows}
        for row in source_rows:
            source_id = str(row["id"])
            directory = source_root / source_id
            directory.mkdir()
            artifact = self.gateway.download_upload(row["id"], directory)
            frame = extract_frame(artifact.local_path)
            authoritative = load_authoritative_wcs(
                row["wcs_header"] or {},
                frame.data.shape,
                raw_header=frame.header,
            )
            if authoritative.verification_method != "trusted-public-archive-wcs":
                raise ValueError("archive mosaic source lacks trusted public-archive WCS")
            weight = max(0.01, float(row.get("quality_score") or 0.5))
            geometry = SourceGeometry(
                source_id=source_id,
                shape=frame.data.shape,
                wcs=authoritative.wcs,
                weight=weight,
            )
            geometries.append(geometry)
            local_sources.append(
                {
                    "id": source_id,
                    "path": artifact.local_path,
                    "shape": frame.data.shape,
                    "wcs": authoritative.wcs,
                    "weight": weight,
                }
            )
            del frame

        source_inventory_sha256 = hash_source_inventory(expected_source_ids)
        fits_budget = min(
            self.gateway.config.max_derivative_bytes,
            self.gateway.config.max_master_pixels * np.dtype(np.float32).itemsize + 1024 * 1024,
        )
        canvas = plan_mosaic_canvas(
            geometries,
            reference=SkyCoord(float(run["ra_deg"]) * u.deg, float(run["dec_deg"]) * u.deg),
            max_fits_bytes=fits_budget,
            max_scale_factor=self.gateway.config.max_scale_degradation,
        )

        def frames() -> Any:
            for source in local_sources:
                frame = extract_frame(source["path"])
                if frame.data.shape != source["shape"]:
                    raise ValueError("archive source dimensions changed after preflight")
                yield MosaicFrame(
                    source_id=source["id"],
                    data=frame.data,
                    wcs=source["wcs"],
                    weight=source["weight"],
                )

        self.gateway.execute(
            "update public.archive_ingest_runs set status='building',error_detail=null,updated_at=now() where id=%s",
            (run_id,),
        )
        coadd = coadd_streaming(
            frames(),
            canvas,
            workdir / "archive-v9-coadd",
            expected_source_ids=expected_source_ids,
        )
        if set(coadd.contributing_source_ids) != expected_source_ids:
            raise ValueError("archive master did not retain the frozen source inventory")

        run_query = run.get("query") or {}
        width_arcmin = float(run_query.get("width_arcmin") or 0)
        height_arcmin = float(run_query.get("height_arcmin") or 0)
        covered_square_arcmin = (
            coadd.finite_pixels * canvas.output_pixel_scale_arcsec**2 / 3600
        )
        target_square_arcmin = width_arcmin * height_arcmin
        spatial_coverage_fraction = (
            min(1.0, covered_square_arcmin / target_square_arcmin)
            if target_square_arcmin > 0
            else coadd.spatial_coverage_fraction
        )
        grid_positions = int(run_query.get("grid_positions") or expected_source_count)
        is_partial = spatial_coverage_fraction < 0.995 or expected_source_count < grid_positions

        master_fits = write_master_fits(
            coadd,
            canvas,
            workdir / "archive-master-v9.fits",
            object_id=job.object_id,
            spectral_band=spectral_band,
            pipeline_version=job.pipeline_version,
            partial=is_partial,
            source_inventory_sha256=source_inventory_sha256,
            extra_header={"TARGCOV": spatial_coverage_fraction, "ARCHSRC": "MAST-PS1"},
        )
        if master_fits.byte_size > self.gateway.config.max_derivative_bytes:
            raise ValueError("master FITS exceeds the derivative storage limit")
        limits = display_limits(coadd.data)
        master_preview = write_master_preview(
            coadd.data,
            workdir / "archive-master-v9.webp",
            limits=limits,
        )
        tile_plan = derive_healpix_plan_from_master(coadd.data, canvas.wcs)
        tile_contributions = measure_tile_source_contributions(
            frames(),
            tile_plan,
            expected_source_ids=expected_source_ids,
        )
        tiles = render_healpix_tiles(
            coadd.data,
            canvas.wcs,
            tile_plan,
            source_contributions=tile_contributions,
            expected_source_ids=expected_source_ids,
            limits=limits,
        )
        if len(tiles) != tile_plan.expected_tiles:
            raise ValueError("rendered tile count differs from the frozen HEALPix plan")

        layer_slug = f"{job.object_id.lower()}-ps1-{spectral_band}"
        layer = self.gateway.execute(
            """
            insert into public.mosaic_layers(slug,label,spectral_band)
            values (%s,%s,%s)
            on conflict (slug) do update set label=excluded.label,spectral_band=excluded.spectral_band
            returning id
            """,
            (layer_slug, f"{job.object_id} PS1 {spectral_band}", spectral_band),
        )[0]
        verification = {
            "schema_version": 1,
            "method": "quality-weighted-mean-reprojection",
            "healpix_scheme": "nested",
            "fine_order": tile_plan.fine_order,
            "minimum_order": tile_plan.minimum_order,
            "tile_plan": [
                {"order": cell.order, "index": cell.index} for cell in tile_plan.cells
            ],
            "worker_tile_plan_sha256": tile_plan.sha256,
            "canvas_plan_sha256": canvas.sha256,
            "canvas_finite_fraction": coadd.spatial_coverage_fraction,
            "target_spatial_coverage_fraction": spatial_coverage_fraction,
            "is_partial": is_partial,
        }
        recipe = {
            "method": "quality-weighted-mean-reprojection",
            "object_id": job.object_id,
            "archive_source": run["source_id"],
            "spectral_band": spectral_band,
            "partial": is_partial,
        }
        generation_row = self._get_or_create_archive_generation_v9(
            job=job,
            object_id=job.object_id,
            layer_id=layer["id"],
            run_id=run_id,
            recipe=recipe,
            verification=verification,
            expected_tiles=tile_plan.expected_tiles,
            expected_sources=expected_source_count,
            source_inventory_sha256=source_inventory_sha256,
            worker_tile_plan_sha256=tile_plan.sha256,
            canvas_plan_sha256=canvas.sha256,
        )
        generation_id = generation_row["id"]
        generation = int(generation_row["generation"])
        if int(generation_row["planned_tiles"] or 0) != tile_plan.expected_tiles:
            raise ValueError("database preflight changed the frozen tile count")
        if generation_row["source_inventory_sha256"] != source_inventory_sha256:
            raise ValueError("database source inventory differs from worker preflight")
        if int(generation_row["expected_source_uploads"] or 0) != expected_source_count:
            raise ValueError("database source count differs from worker preflight")

        master_prefix = f"masters/{job.object_id.lower()}-ps1-{spectral_band}/{generation}"
        fits_path = f"{master_prefix}/{master_fits.sha256}.fits"
        preview_path = f"{master_prefix}/{master_preview.sha256}.webp"
        fits_sha = self.gateway.ensure_derivative_file(
            fits_path, master_fits.path, master_fits.media_type
        )
        preview_sha = self.gateway.ensure_derivative_file(
            preview_path, master_preview.path, master_preview.media_type
        )
        if fits_sha != master_fits.sha256 or preview_sha != master_preview.sha256:
            raise ValueError("uploaded master checksum differs from local artifact")

        exposure_hours = sum(float(row.get("exposure_s") or 0) for row in source_rows) / 3600
        fits_url = self.gateway.public_derivative_url(fits_path)
        preview_url = self.gateway.public_derivative_url(preview_path)
        master_verification = {
            "schema_version": 1,
            "method": "quality-weighted-mean-reprojection",
            "canvas_plan_sha256": canvas.sha256,
            "worker_tile_plan_sha256": tile_plan.sha256,
            "source_inventory_sha256": source_inventory_sha256,
            "fits_sha256": fits_sha,
            "preview_sha256": preview_sha,
            "validated": True,
        }
        master_rows = self.gateway.execute(
            """
            insert into public.astro_masters(
              object_id,image_url,thumbnail_url,lights_stacked,total_exposure_hours,
              contributors_count,configurations_count,countries_count,generation,notes,is_current,
              mosaic_generation_id,archive_ingest_run_id,
              fits_storage_path,fits_sha256,fits_byte_size,
              preview_storage_path,preview_sha256,preview_byte_size,
              source_uploads_count,spatial_coverage_fraction,is_partial,
              native_pixel_scale_arcsec,output_pixel_scale_arcsec,width_px,height_px,verification
            ) values (
              %s,%s,%s,%s,%s,0,1,0,%s,%s,false,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb
            )
            on conflict (mosaic_generation_id) where mosaic_generation_id is not null do nothing
            returning id,object_id,image_url,thumbnail_url,lights_stacked,total_exposure_hours,
                      generation,mosaic_generation_id,archive_ingest_run_id,
                      fits_storage_path,fits_sha256,fits_byte_size,
                      preview_storage_path,preview_sha256,preview_byte_size,
                      source_uploads_count,spatial_coverage_fraction,is_partial,
                      native_pixel_scale_arcsec,output_pixel_scale_arcsec,width_px,height_px,verification
            """,
            (
                job.object_id,
                fits_url,
                preview_url,
                expected_source_count,
                exposure_hours,
                generation,
                "Master initial/partiel PS1; coadd moyen pondéré reprojeté depuis les WCS qualifiés.",
                generation_id,
                run_id,
                fits_path,
                fits_sha,
                master_fits.byte_size,
                preview_path,
                preview_sha,
                master_preview.byte_size,
                expected_source_count,
                spatial_coverage_fraction,
                is_partial,
                canvas.native_pixel_scale_arcsec,
                canvas.output_pixel_scale_arcsec,
                canvas.shape[1],
                canvas.shape[0],
                json.dumps(master_verification),
            ),
        )
        if not master_rows:
            master_rows = self.gateway.execute(
                """
                select id,object_id,image_url,thumbnail_url,lights_stacked,total_exposure_hours,
                       generation,mosaic_generation_id,archive_ingest_run_id,
                       fits_storage_path,fits_sha256,fits_byte_size,
                       preview_storage_path,preview_sha256,preview_byte_size,
                       source_uploads_count,spatial_coverage_fraction,is_partial,
                       native_pixel_scale_arcsec,output_pixel_scale_arcsec,width_px,height_px,verification
                from public.astro_masters where mosaic_generation_id=%s
                """,
                (generation_id,),
            )
        if len(master_rows) != 1:
            raise ValueError("archive master generation did not resolve uniquely")
        master_row = master_rows[0]
        master_expectations = {
            "object_id": job.object_id,
            "image_url": fits_url,
            "thumbnail_url": preview_url,
            "lights_stacked": expected_source_count,
            "total_exposure_hours": exposure_hours,
            "generation": generation,
            "mosaic_generation_id": str(generation_id),
            "archive_ingest_run_id": str(run_id),
            "fits_storage_path": fits_path,
            "fits_sha256": fits_sha,
            "fits_byte_size": master_fits.byte_size,
            "preview_storage_path": preview_path,
            "preview_sha256": preview_sha,
            "preview_byte_size": master_preview.byte_size,
            "source_uploads_count": expected_source_count,
            "spatial_coverage_fraction": spatial_coverage_fraction,
            "is_partial": is_partial,
            "native_pixel_scale_arcsec": canvas.native_pixel_scale_arcsec,
            "output_pixel_scale_arcsec": canvas.output_pixel_scale_arcsec,
            "width_px": canvas.shape[1],
            "height_px": canvas.shape[0],
        }
        master_mismatches = [
            field
            for field, expected in master_expectations.items()
            if (
                str(master_row.get(field)) != expected
                if field in {"mosaic_generation_id", "archive_ingest_run_id"}
                else master_row.get(field) != expected
            )
        ]
        if self._json_object(master_row.get("verification")) != master_verification:
            master_mismatches.append("verification")
        if master_mismatches:
            raise ValueError(
                "existing archive master diverges from deterministic v9 render: "
                + ",".join(master_mismatches)
            )

        manifest_tiles: list[dict[str, Any]] = []
        for tile in tiles:
            path = tile_path(layer_slug, generation, tile.order, tile.index)
            checksum = self.gateway.ensure_derivative(path, tile.content, tile.media_type)
            if checksum != tile.sha256:
                raise ValueError("uploaded tile checksum differs from rendered artifact")
            self._persist_archive_tile_v9(
                generation_id=generation_id,
                tile=tile,
                path=path,
                checksum=checksum,
            )
            published_count = self.gateway.execute(
                "select count(*)::integer as count from public.mosaic_tiles where generation_id=%s",
                (generation_id,),
            )[0]["count"]
            self.gateway.execute(
                "update public.mosaic_generations set published_tiles=%s,updated_at=now() where id=%s",
                (published_count, generation_id),
            )
            manifest_tiles.append(
                {
                    "order": tile.order,
                    "index": tile.index,
                    "path": path,
                    "sha256": checksum,
                    "coverage_fraction": tile.coverage_fraction,
                }
            )

        actual_tiles = self.gateway.execute(
            "select count(*)::integer as count from public.mosaic_tiles where generation_id=%s",
            (generation_id,),
        )[0]["count"]
        if int(actual_tiles) != tile_plan.expected_tiles:
            raise ValueError("persisted tile count differs from frozen plan")
        manifest = json.dumps(
            {
                "schema_version": 1,
                "pipeline_version": job.pipeline_version,
                "layer": layer_slug,
                "generation": generation,
                "method": "quality-weighted-mean-reprojection",
                "source": {
                    "name": run["source_name"],
                    "acknowledgement": run["acknowledgement"],
                    "terms_url": run["terms_url"],
                    "spectral_band": spectral_band,
                    "source_count": expected_source_count,
                },
                "partial": is_partial,
                "spatial_coverage_fraction": spatial_coverage_fraction,
                "tiles": manifest_tiles,
            },
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
        manifest_path = f"hips/{layer_slug}/{generation}/manifest.json"
        manifest_sha = self.gateway.ensure_derivative(
            manifest_path, manifest, "application/json"
        )
        self.gateway.execute(
            """
            update public.mosaic_generations
            set status='verifying',published_tiles=%s,contributing_source_uploads=%s,
                failed_tiles=0,manifest_path=%s,manifest_sha256=%s,
                verification=verification || %s::jsonb,updated_at=now()
            where id=%s
            """,
            (
                actual_tiles,
                expected_source_count,
                manifest_path,
                manifest_sha,
                json.dumps(
                    {
                        "actual_tiles": actual_tiles,
                        "master_fits_sha256": fits_sha,
                        "master_preview_sha256": preview_sha,
                        "manifest_sha256": manifest_sha,
                        "validated": True,
                    }
                ),
                generation_id,
            ),
        )
        self.gateway.execute(
            "select private.activate_archive_master_generation(%s,%s)",
            (generation_id, master_row["id"]),
        )
        self.gateway.execute(
            """
            update public.archive_ingest_runs
            set status='complete',error_detail=null,completed_at=now(),updated_at=now()
            where id=%s
            """,
            (run_id,),
        )
        return StageOutcome(
            "published",
            100,
            {
                "object_id": job.object_id,
                "generation": generation,
                "tiles": actual_tiles,
                "sources": expected_source_count,
                "partial": is_partial,
                "spatial_coverage_fraction": spatial_coverage_fraction,
            },
        )

    def _build_archive_generation(self, job: Job, workdir: Path) -> StageOutcome:
        run_id = job.payload.get("run_id")
        spectral_band = job.payload.get("spectral_band")
        if not run_id or not job.object_id or spectral_band not in set("grizy"):
            raise ValueError("archive mosaic requires run_id, object_id and a PS1 spectral band")
        run_rows = self.gateway.execute(
            """
            select r.id,r.status,r.source_id,r.object_id,r.spectral_band,s.acknowledgement,s.terms_url
            from public.archive_ingest_runs r
            join public.archive_sources s on s.id=r.source_id
            where r.id=%s and r.object_id=%s and r.spectral_band=%s
            """,
            (run_id, job.object_id, spectral_band),
        )
        if not run_rows:
            raise LookupError("archive ingest run not found")
        run = run_rows[0]
        cell_rows = self.gateway.execute(
            """
            select c.healpix_order,c.healpix_index,
                   array_agg(u.id order by u.quality_score desc,u.uploaded_at) as upload_ids
            from public.archive_items i
            join public.astro_uploads u on u.id=i.upload_id
            join public.astro_upload_cells c on c.upload_id=u.id
            where i.ingest_run_id=%s and u.status in ('approved','published','stacked')
              and u.rejected=false and u.deleted_at is null and c.eligible
            group by c.healpix_order,c.healpix_index
            order by c.healpix_order,c.healpix_index
            """,
            (run_id,),
        )
        if not cell_rows:
            raise ValueError("archive run has no scientifically eligible mosaic cell")

        layer_slug = f"{job.object_id.lower()}-ps1-{spectral_band}"
        layer = self.gateway.execute(
            """
            insert into public.mosaic_layers(slug,label,spectral_band)
            values (%s,%s,%s)
            on conflict (slug) do update set label=excluded.label,spectral_band=excluded.spectral_band
            returning id
            """,
            (layer_slug, f"{job.object_id} PS1 {spectral_band}", spectral_band),
        )[0]
        existing = self.gateway.execute(
            "select id,generation from public.mosaic_generations where source_job_id=%s",
            (job.id,),
        )
        if existing:
            generation_id = existing[0]["id"]
            generation = existing[0]["generation"]
        else:
            generation = self.gateway.execute(
                "select coalesce(max(generation),0)+1 as value from public.mosaic_generations where layer_id=%s",
                (layer["id"],),
            )[0]["value"]
            generation_id = self.gateway.execute(
                """
                insert into public.mosaic_generations(
                  layer_id,generation,status,pipeline_version,recipe,expected_tiles,source_job_id
                ) values (%s,%s,'building',%s,%s::jsonb,0,%s) returning id
                """,
                (
                    layer["id"],
                    generation,
                    job.pipeline_version,
                    json.dumps(
                        {
                            "method": "cell-local-weighted-sigma",
                            "object_id": job.object_id,
                            "archive_source": run["source_id"],
                            "archive_run_id": str(run_id),
                            "spectral_band": spectral_band,
                        }
                    ),
                    job.id,
                ),
            )[0]["id"]

        upload_rows = self.gateway.execute(
            """
            select u.id,u.quality_score,u.original_filename
            from public.archive_items i join public.astro_uploads u on u.id=i.upload_id
            where i.ingest_run_id=%s and u.status in ('approved','published','stacked')
              and u.rejected=false and u.deleted_at is null
            """,
            (run_id,),
        )
        upload_metadata = {row["id"]: row for row in upload_rows}
        cache: OrderedDict[UUID, tuple[ExtractedFrame, WCS]] = OrderedDict()

        def cached_frame(upload_id: UUID) -> tuple[ExtractedFrame, WCS]:
            cached = cache.get(upload_id)
            if cached is not None:
                cache.move_to_end(upload_id)
                return cached
            directory = workdir / f"archive-{upload_id}"
            if directory.exists():
                shutil.rmtree(directory)
            directory.mkdir()
            _row, frame = self._load_frame(upload_id, directory)
            source_wcs = WCS(frame.header)
            if not source_wcs.has_celestial:
                raise ValueError("qualified archive frame has no celestial WCS")
            cache[upload_id] = (frame, source_wcs.celestial)
            cache.move_to_end(upload_id)
            while len(cache) > 8:
                evicted_id, _value = cache.popitem(last=False)
                shutil.rmtree(workdir / f"archive-{evicted_id}", ignore_errors=True)
            return cache[upload_id]

        self.gateway.execute(
            "update public.archive_ingest_runs set status='building',updated_at=now() where id=%s",
            (run_id,),
        )
        existing_count = self.gateway.execute(
            "select count(*)::integer as count from public.mosaic_tiles where generation_id=%s",
            (generation_id,),
        )[0]["count"]
        self.gateway.execute(
            """
            update public.mosaic_generations
            set status='building',expected_tiles=%s,published_tiles=%s
            where id=%s
            """,
            (len(cell_rows), existing_count, generation_id),
        )

        manifest_tiles: list[dict[str, Any]] = []
        for cell in cell_rows:
            frames: list[np.ndarray] = []
            masks: list[np.ndarray] = []
            weights: list[float] = []
            source_ids: list[UUID] = []
            for upload_id in cell["upload_ids"]:
                frame, source_wcs = cached_frame(upload_id)
                projected, mask = project_cell(
                    frame.data,
                    source_wcs,
                    int(cell["healpix_order"]),
                    int(cell["healpix_index"]),
                )
                if not np.any(mask):
                    continue
                frames.append(projected)
                masks.append(mask)
                weights.append(max(0.01, float(upload_metadata[upload_id].get("quality_score") or 0.5)))
                source_ids.append(upload_id)
            if not frames:
                continue
            combined = weighted_sigma_stack(frames, masks, weights)
            content = encode_cell_tile(combined)
            path = tile_path(
                layer_slug,
                int(generation),
                int(cell["healpix_order"]),
                int(cell["healpix_index"]),
            )
            total_weight = sum(weights)
            contribution_weights = {
                str(upload_id): weight / total_weight
                for upload_id, weight in zip(source_ids, weights, strict=True)
            }
            tile = TileArtifact(
                order=int(cell["healpix_order"]),
                index=int(cell["healpix_index"]),
                path=path,
                content=content,
                sha256=hashlib.sha256(content).hexdigest(),
            )
            checksum = self.gateway.ensure_derivative(tile.path, tile.content, tile.media_type)
            self.gateway.execute(
                """
                insert into public.mosaic_tiles(
                  generation_id,healpix_order,healpix_index,storage_path,media_type,byte_size,
                  sha256,source_upload_ids,contribution_weights
                ) values (%s,%s,%s,%s,%s,%s,%s,%s::uuid[],%s::jsonb)
                on conflict (generation_id,healpix_order,healpix_index,media_type) do update set
                  storage_path=excluded.storage_path,byte_size=excluded.byte_size,sha256=excluded.sha256,
                  source_upload_ids=excluded.source_upload_ids,contribution_weights=excluded.contribution_weights
                """,
                (
                    generation_id,
                    tile.order,
                    tile.index,
                    tile.path,
                    tile.media_type,
                    len(tile.content),
                    checksum,
                    source_ids,
                    json.dumps(contribution_weights),
                ),
            )
            published_count = self.gateway.execute(
                "select count(*)::integer as count from public.mosaic_tiles where generation_id=%s",
                (generation_id,),
            )[0]["count"]
            self.gateway.execute(
                "update public.mosaic_generations set published_tiles=%s where id=%s",
                (published_count, generation_id),
            )
            manifest_tiles.append(
                {
                    "order": tile.order,
                    "index": tile.index,
                    "path": tile.path,
                    "sha256": checksum,
                    "source_upload_ids": sorted(str(upload_id) for upload_id in source_ids),
                }
            )
        if not manifest_tiles:
            raise ValueError("archive mosaic projection produced no tile")
        manifest = json.dumps(
            {
                "generation_id": str(generation_id),
                "pipeline_version": job.pipeline_version,
                "layer": layer_slug,
                "archive_source": run["source_id"],
                "archive_run_id": str(run_id),
                "terms_url": run["terms_url"],
                "acknowledgement": run["acknowledgement"],
                "tiles": sorted(manifest_tiles, key=lambda value: (value["order"], value["index"])),
            },
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
        manifest_path = f"hips/{layer_slug}/{generation}/manifest.json"
        manifest_sha = self.gateway.ensure_derivative(manifest_path, manifest, "application/json")
        self.gateway.execute(
            """
            update public.mosaic_generations set status='verifying',expected_tiles=%s,published_tiles=%s,
              manifest_path=%s,manifest_sha256=%s where id=%s
            """,
            (len(manifest_tiles), len(manifest_tiles), manifest_path, manifest_sha, generation_id),
        )
        self.gateway.execute("select private.activate_mosaic_generation(%s)", (generation_id,))
        self.gateway.execute(
            "update public.archive_ingest_runs set status='complete',completed_at=now(),updated_at=now() where id=%s",
            (run_id,),
        )
        return StageOutcome(
            "published",
            100,
            {
                "generation_id": str(generation_id),
                "layer": layer_slug,
                "tiles": len(manifest_tiles),
                "archive_run_id": str(run_id),
                "manifest_sha256": manifest_sha,
            },
        )
