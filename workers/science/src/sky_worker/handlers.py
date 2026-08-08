from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any
from uuid import UUID

from astropy.io import fits
import numpy as np

from .astrometry import solve_astrometry
from .calibration import align_frame, calibrate_light, master_frame, weighted_sigma_stack
from .cosmos import cluster_observations, triangulate
from .extraction import ExtractedFrame, extract_frame
from .footprint import covered_healpix_cells, seam_safe_footprint
from .gateway import Gateway
from .hips import build_tiles
from .models import Job, StageOutcome
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
            return self._publish_generation(job)
        raise ValueError(f"unsupported job type: {job.job_type}")

    def _load_frame(self, upload_id: UUID, workdir: Path) -> tuple[dict[str, Any], ExtractedFrame]:
        row = self.gateway.fetch_upload(upload_id)
        artifact = self.gateway.download_upload(upload_id, workdir)
        return row, extract_frame(artifact.local_path)

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

        solution = solve_astrometry(
            Path(workdir) / Path(row["original_filename"]).name,
            frame.header,
            frame.native_width,
            frame.native_height,
            self.gateway.config.astrometry_timeout_seconds,
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
                    json.dumps({"cards": solution.header.tostring(sep="\n", endcard=True, padding=False)}),
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
                {"matched_stars": solution.matched_stars, "wcs_rms_px": solution.rms_px},
            )

        metrics, mask = measure_quality(frame.data, solution.pixel_scale_arcsec)
        decision = qualify(
            {
                "matched_stars": solution.matched_stars,
                "wcs_rms_px": solution.rms_px,
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
                cursor.execute("delete from public.astro_upload_cells where upload_id=%s", (job.upload_id,))
                cursor.executemany(
                    """
                    insert into public.astro_upload_cells(
                      upload_id,healpix_order,healpix_index,coverage_fraction,usable_fraction,eligible
                    ) values (%s,%s,%s,%s,%s,%s)
                    """,
                    [
                        (
                            job.upload_id,
                            cell["healpix_order"],
                            cell["healpix_index"],
                            cell["coverage_fraction"],
                            cell["usable_fraction"],
                            cell["eligible"] and decision["eligible"],
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
            return StageOutcome("qualifying", 75, {"score": decision["score"], "blockers": decision["blockers"]})

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

    def _publish_generation(self, job: Job) -> StageOutcome:
        generation_id = job.payload.get("generation_id")
        if not generation_id:
            raise ValueError("generation_id is required")
        result = self.gateway.execute("select private.activate_mosaic_generation(%s) as id", (generation_id,))
        return StageOutcome("published", 100, {"generation_id": str(result[0]["id"])})
