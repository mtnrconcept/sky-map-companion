from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
from typing import Any

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
from astropy_healpix import HEALPix
import astropy.units as u
import numpy as np
from PIL import Image
from reproject import reproject_interp
from reproject.mosaicking import find_optimal_celestial_wcs


DEFAULT_MAX_FITS_BYTES = 500 * 1024 * 1024
DEFAULT_FITS_OVERHEAD_BYTES = 1024 * 1024
MASTER_FITS_COMPRESSION = "HCOMPRESS_1"
MASTER_FITS_QUANTIZE_LEVEL = 16.0
MASTER_FITS_TILE_SHAPE = (256, 256)
# CFITSIO values: subtractive dithering preserves unbiased background flux,
# while a checksum-derived seed makes the compressed artifact reproducible.
MASTER_FITS_QUANTIZE_METHOD = 1
MASTER_FITS_DITHER_SEED = -1
MASTER_FITS_CHECKSUM_COMMENT = "archive-master-v9 deterministic checksum"


class MosaicIntegrityError(RuntimeError):
    """Raised when a mosaic would lose a planned source, cell, or artifact."""


@dataclass(frozen=True)
class AuthoritativeWCS:
    wcs: WCS
    verification_method: str
    pixel_scale_arcsec: float
    max_raw_separation_arcsec: float | None


@dataclass(frozen=True)
class SourceGeometry:
    source_id: str
    shape: tuple[int, int]
    wcs: WCS
    weight: float = 1.0


@dataclass(frozen=True)
class MosaicFrame:
    source_id: str
    data: np.ndarray
    wcs: WCS
    weight: float = 1.0


@dataclass(frozen=True)
class CanvasPlan:
    wcs: WCS
    shape: tuple[int, int]
    native_pixel_scale_arcsec: float
    output_pixel_scale_arcsec: float
    estimated_fits_bytes: int
    adapted: bool
    source_ids: tuple[str, ...]
    sha256: str


@dataclass(frozen=True)
class SourceContribution:
    source_id: str
    input_finite_pixels: int
    output_finite_pixels: int
    weighted_output_pixels: float


@dataclass(frozen=True)
class TileSourceContribution:
    source_id: str
    finite_pixels: int
    cell_pixels: int
    coverage_fraction: float
    weighted_pixels: float
    normalized_weight: float


@dataclass(frozen=True)
class CoaddResult:
    data: np.memmap
    data_path: Path
    contributions: tuple[SourceContribution, ...]
    finite_pixels: int
    spatial_coverage_fraction: float
    mean_depth: float
    max_depth: int

    @property
    def contributing_source_ids(self) -> tuple[str, ...]:
        return tuple(
            contribution.source_id
            for contribution in self.contributions
            if contribution.output_finite_pixels > 0
        )


@dataclass(frozen=True)
class FileArtifact:
    path: Path
    media_type: str
    byte_size: int
    sha256: str


@dataclass(frozen=True, order=True)
class HealpixCell:
    order: int
    index: int


@dataclass(frozen=True)
class HealpixPlan:
    fine_order: int
    minimum_order: int
    cells: tuple[HealpixCell, ...]
    sha256: str

    @property
    def expected_tiles(self) -> int:
        return len(self.cells)

    @property
    def counts_by_order(self) -> dict[int, int]:
        return {
            order: sum(cell.order == order for cell in self.cells)
            for order in range(self.minimum_order, self.fine_order + 1)
        }


@dataclass(frozen=True)
class MosaicTileArtifact:
    order: int
    index: int
    content: bytes
    sha256: str
    coverage_fraction: float
    finite_pixels: int
    cell_pixels: int
    source_contributions: tuple[TileSourceContribution, ...]
    media_type: str = "image/webp"

    @property
    def source_upload_ids(self) -> tuple[str, ...]:
        return tuple(contribution.source_id for contribution in self.source_contributions)

    @property
    def source_weights(self) -> dict[str, float]:
        return {
            contribution.source_id: contribution.normalized_weight
            for contribution in self.source_contributions
        }


def _pixel_scale_arcsec(wcs: WCS) -> float:
    scales = proj_plane_pixel_scales(wcs.celestial)
    if hasattr(scales, "to_value"):
        values = np.asarray(scales.to_value(u.deg), dtype=float)
    else:
        values = np.asarray(scales, dtype=float)
    scale = float(np.mean(np.abs(values)) * 3600)
    if not math.isfinite(scale) or scale <= 0:
        raise ValueError("celestial WCS has an invalid pixel scale")
    return scale


def _validate_shape(shape: tuple[int, int]) -> tuple[int, int]:
    if len(shape) != 2:
        raise ValueError("mosaic sources must be two-dimensional")
    height, width = (int(shape[0]), int(shape[1]))
    if height <= 0 or width <= 0:
        raise ValueError("mosaic source dimensions must be positive")
    return height, width


def load_authoritative_wcs(
    serialized_wcs: Mapping[str, Any],
    shape: tuple[int, int],
    *,
    raw_header: fits.Header | None = None,
    max_raw_disagreement_arcsec: float = 0.5,
) -> AuthoritativeWCS:
    """Load the exact persisted WCS that produced the qualification cells.

    If the immutable source FITS header is supplied, a center/corner grid is
    compared against the persisted solution. A mismatch is terminal rather
    than silently switching geometry during publication.
    """

    height, width = _validate_shape(shape)
    cards = serialized_wcs.get("cards")
    method = serialized_wcs.get("verification_method")
    if not isinstance(cards, str) or not cards.strip():
        raise ValueError("persisted astrometric solution has no FITS cards")
    if not isinstance(method, str) or not method.strip():
        raise ValueError("persisted astrometric solution has no verification method")
    try:
        header = fits.Header.fromstring(cards, sep="\n")
        authoritative = WCS(header).celestial
    except Exception as error:
        raise ValueError("persisted astrometric solution is not a valid celestial WCS") from error
    if not authoritative.has_celestial:
        raise ValueError("persisted astrometric solution has no celestial axes")

    xs = np.asarray([0, (width - 1) / 2, width - 1] * 3, dtype=float)
    ys = np.repeat(np.asarray([0, (height - 1) / 2, height - 1], dtype=float), 3)
    auth_ra, auth_dec = authoritative.pixel_to_world_values(xs, ys)
    if not np.all(np.isfinite(auth_ra)) or not np.all(np.isfinite(auth_dec)):
        raise ValueError("persisted astrometric solution is non-finite over the image")

    disagreement: float | None = None
    if raw_header is not None:
        try:
            raw = WCS(raw_header).celestial
            raw_ra, raw_dec = raw.pixel_to_world_values(xs, ys)
        except Exception as error:
            raise ValueError("source FITS header has no comparable celestial WCS") from error
        if not raw.has_celestial or not np.all(np.isfinite(raw_ra)) or not np.all(np.isfinite(raw_dec)):
            raise ValueError("source FITS header has no comparable celestial WCS")
        authoritative_sky = SkyCoord(auth_ra * u.deg, auth_dec * u.deg, frame="icrs")
        raw_sky = SkyCoord(raw_ra * u.deg, raw_dec * u.deg, frame="icrs")
        disagreement = float(np.max(authoritative_sky.separation(raw_sky).to_value(u.arcsec)))
        if disagreement > max_raw_disagreement_arcsec:
            raise MosaicIntegrityError(
                "source FITS WCS disagrees with the persisted astrometric solution "
                f"by {disagreement:.6f} arcsec"
            )

    return AuthoritativeWCS(
        wcs=authoritative,
        verification_method=method,
        pixel_scale_arcsec=_pixel_scale_arcsec(authoritative),
        max_raw_separation_arcsec=disagreement,
    )


def _canvas_hash(
    wcs: WCS,
    shape: tuple[int, int],
    source_ids: Sequence[str],
    native_scale: float,
    output_scale: float,
) -> str:
    payload = {
        "shape": [int(shape[0]), int(shape[1])],
        "source_ids": sorted(source_ids),
        "native_pixel_scale_arcsec": round(native_scale, 12),
        "output_pixel_scale_arcsec": round(output_scale, 12),
        "wcs": wcs.to_header(relax=True).tostring(sep="\n", endcard=False, padding=False),
    }
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return hashlib.sha256(encoded).hexdigest()


def plan_mosaic_canvas(
    sources: Sequence[SourceGeometry],
    *,
    reference: SkyCoord | None = None,
    max_fits_bytes: int = DEFAULT_MAX_FITS_BYTES,
    fits_overhead_bytes: int = DEFAULT_FITS_OVERHEAD_BYTES,
    allow_adaptive_scale: bool = True,
    max_scale_factor: float = 2.0,
    margin_pixels: int = 8,
) -> CanvasPlan:
    """Plan a north-up TAN canvas covering every authoritative source WCS.

    The native median sampling is retained when it fits. If the dense float32
    FITS would exceed the explicit byte budget, the scale is increased only as
    much as needed and never beyond ``max_scale_factor``.
    """

    if not sources:
        raise ValueError("at least one source geometry is required")
    if max_fits_bytes <= fits_overhead_bytes:
        raise ValueError("FITS byte budget is smaller than its reserved overhead")
    if max_scale_factor < 1:
        raise ValueError("maximum scale factor cannot be below one")
    if margin_pixels < 0:
        raise ValueError("canvas margin cannot be negative")

    identifiers = [source.source_id for source in sources]
    if any(not identifier for identifier in identifiers) or len(set(identifiers)) != len(identifiers):
        raise ValueError("source identifiers must be non-empty and unique")
    for source in sources:
        _validate_shape(source.shape)
        if not math.isfinite(source.weight) or source.weight <= 0:
            raise ValueError("source weights must be finite and positive")
        if not source.wcs.has_celestial:
            raise ValueError(f"source {source.source_id} has no celestial WCS")

    native_scale = float(np.median([_pixel_scale_arcsec(source.wcs) for source in sources]))
    output_scale = native_scale
    available_pixels = (max_fits_bytes - fits_overhead_bytes) / np.dtype(np.float32).itemsize
    specifications = [(source.shape, source.wcs.celestial) for source in sources]

    for _attempt in range(8):
        output_wcs, raw_shape = find_optimal_celestial_wcs(
            specifications,
            frame="icrs",
            auto_rotate=False,
            projection="TAN",
            resolution=output_scale * u.arcsec,
            reference=reference,
            negative_lon_cdelt=True,
        )
        shape = (int(raw_shape[0]) + 2 * margin_pixels, int(raw_shape[1]) + 2 * margin_pixels)
        output_wcs.wcs.crpix = np.asarray(output_wcs.wcs.crpix) + margin_pixels
        pixel_count = shape[0] * shape[1]
        estimated_bytes = pixel_count * np.dtype(np.float32).itemsize + fits_overhead_bytes
        if estimated_bytes <= max_fits_bytes:
            adapted = output_scale > native_scale * (1 + 1e-9)
            return CanvasPlan(
                wcs=output_wcs,
                shape=shape,
                native_pixel_scale_arcsec=native_scale,
                output_pixel_scale_arcsec=output_scale,
                estimated_fits_bytes=int(estimated_bytes),
                adapted=adapted,
                source_ids=tuple(sorted(identifiers)),
                sha256=_canvas_hash(output_wcs, shape, identifiers, native_scale, output_scale),
            )
        if not allow_adaptive_scale:
            raise MosaicIntegrityError(
                f"native mosaic requires {estimated_bytes} bytes, above the {max_fits_bytes} byte limit"
            )
        required_factor = math.sqrt(pixel_count / available_pixels) * 1.01
        output_scale *= max(1.01, required_factor)
        if output_scale > native_scale * max_scale_factor:
            raise MosaicIntegrityError(
                "mosaic would require an output scale beyond the allowed scientific limit"
            )
    raise MosaicIntegrityError("adaptive mosaic planning did not converge within its byte limit")


def _sample_edges(shape: tuple[int, int], samples: int = 32) -> tuple[np.ndarray, np.ndarray]:
    height, width = _validate_shape(shape)
    count = max(4, int(samples))
    horizontal = np.linspace(-0.5, width - 0.5, count)
    vertical = np.linspace(-0.5, height - 0.5, count)
    x = np.concatenate(
        [horizontal, np.full(count, width - 0.5), horizontal[::-1], np.full(count, -0.5)]
    )
    y = np.concatenate(
        [np.full(count, -0.5), vertical, np.full(count, height - 0.5), vertical[::-1]]
    )
    return x, y


def _output_bounds(
    frame: MosaicFrame,
    canvas: CanvasPlan,
    *,
    interpolation_margin: int = 3,
) -> tuple[int, int, int, int] | None:
    x, y = _sample_edges(frame.data.shape)
    sky = frame.wcs.celestial.pixel_to_world(x, y)
    output_x, output_y = canvas.wcs.celestial.world_to_pixel(sky)
    finite = np.isfinite(output_x) & np.isfinite(output_y)
    if not np.any(finite):
        return None
    output_x = output_x[finite]
    output_y = output_y[finite]
    x0 = max(0, int(math.floor(float(np.min(output_x)))) - interpolation_margin)
    x1 = min(canvas.shape[1], int(math.ceil(float(np.max(output_x)))) + interpolation_margin + 1)
    y0 = max(0, int(math.floor(float(np.min(output_y)))) - interpolation_margin)
    y1 = min(canvas.shape[0], int(math.ceil(float(np.max(output_y)))) + interpolation_margin + 1)
    if x1 <= x0 or y1 <= y0:
        return None
    return y0, y1, x0, x1


def _new_memmap(path: Path, dtype: str | np.dtype[Any], shape: tuple[int, int], fill: float) -> np.memmap:
    array = np.memmap(path, mode="w+", dtype=dtype, shape=shape)
    array[:] = fill
    array.flush()
    return array


def coadd_streaming(
    frames: Iterable[MosaicFrame],
    canvas: CanvasPlan,
    workdir: Path,
    *,
    expected_source_ids: Iterable[str] | None = None,
    # Cubic spline prefiltering can spread one NaN across an entire source.
    interpolation_order: str = "bilinear",
    block_size: int = 512,
) -> CoaddResult:
    """Reproject and weighted-coadd frames without allocating a source cube.

    Accumulators and the final master are memory-mapped. Each source is only
    projected into its predicted canvas slice, keeping peak memory proportional
    to one cutout rather than the full master multiplied by the source count.
    """

    if block_size < 16:
        raise ValueError("reprojection block size is too small")
    workdir.mkdir(parents=True, exist_ok=True)
    expected = set(expected_source_ids if expected_source_ids is not None else canvas.source_ids)
    if not expected or any(not source_id for source_id in expected):
        raise ValueError("expected source inventory must be non-empty")

    numerator = _new_memmap(workdir / "mosaic-numerator.dat", np.float64, canvas.shape, 0)
    denominator = _new_memmap(workdir / "mosaic-denominator.dat", np.float32, canvas.shape, 0)
    hit_count = _new_memmap(workdir / "mosaic-hit-count.dat", np.uint16, canvas.shape, 0)
    seen: set[str] = set()
    contributions: list[SourceContribution] = []

    for frame in frames:
        if frame.source_id in seen:
            raise MosaicIntegrityError(f"source {frame.source_id} was supplied more than once")
        if frame.source_id not in expected:
            raise MosaicIntegrityError(f"unexpected source {frame.source_id} is outside the frozen inventory")
        seen.add(frame.source_id)
        data = np.asarray(frame.data, dtype=np.float32)
        _validate_shape(data.shape)
        if not frame.wcs.has_celestial:
            raise ValueError(f"source {frame.source_id} has no celestial WCS")
        if not math.isfinite(frame.weight) or frame.weight <= 0:
            raise ValueError(f"source {frame.source_id} has an invalid weight")
        input_finite = int(np.count_nonzero(np.isfinite(data)))
        if input_finite == 0:
            contributions.append(SourceContribution(frame.source_id, 0, 0, 0))
            continue
        bounds = _output_bounds(MosaicFrame(frame.source_id, data, frame.wcs, frame.weight), canvas)
        if bounds is None:
            contributions.append(SourceContribution(frame.source_id, input_finite, 0, 0))
            continue
        y0, y1, x0, x1 = bounds
        target = canvas.wcs[y0:y1, x0:x1]
        projected, footprint = reproject_interp(
            (data, frame.wcs.celestial),
            target,
            shape_out=(y1 - y0, x1 - x0),
            order=interpolation_order,
            block_size=(block_size, block_size),
            parallel=False,
        )
        valid = np.isfinite(projected) & np.isfinite(footprint) & (footprint > 0)
        projected_count = int(np.count_nonzero(valid))
        if projected_count:
            local_weight = np.where(valid, np.clip(footprint, 0, 1) * frame.weight, 0).astype(
                np.float32
            )
            safe_projected = np.where(valid, projected, 0)
            numerator[y0:y1, x0:x1] += safe_projected * local_weight
            denominator[y0:y1, x0:x1] += local_weight
            hit_count[y0:y1, x0:x1] += valid.astype(np.uint16)
            weighted_pixels = float(np.sum(local_weight, dtype=np.float64))
        else:
            weighted_pixels = 0.0
        contributions.append(
            SourceContribution(
                source_id=frame.source_id,
                input_finite_pixels=input_finite,
                output_finite_pixels=projected_count,
                weighted_output_pixels=weighted_pixels,
            )
        )

    missing = sorted(expected - seen)
    missing.extend(
        sorted(
            contribution.source_id
            for contribution in contributions
            if contribution.output_finite_pixels == 0 and contribution.source_id not in missing
        )
    )
    if missing:
        raise MosaicIntegrityError(
            "mosaic source inventory did not contribute: " + ", ".join(sorted(set(missing)))
        )
    if seen != expected:
        raise MosaicIntegrityError("mosaic source inventory changed during coaddition")

    numerator.flush()
    denominator.flush()
    hit_count.flush()
    master_path = workdir / "mosaic-master-float32.dat"
    master = _new_memmap(master_path, np.float32, canvas.shape, np.nan)
    finite_pixels = 0
    depth_sum = 0
    max_depth = 0
    for y0 in range(0, canvas.shape[0], block_size):
        y1 = min(canvas.shape[0], y0 + block_size)
        local_denominator = denominator[y0:y1]
        valid = local_denominator > 0
        output = master[y0:y1]
        np.divide(
            numerator[y0:y1],
            local_denominator,
            out=output,
            where=valid,
            casting="unsafe",
        )
        local_hits = hit_count[y0:y1]
        finite_pixels += int(np.count_nonzero(valid))
        depth_sum += int(np.sum(local_hits[valid], dtype=np.int64))
        if np.any(valid):
            max_depth = max(max_depth, int(np.max(local_hits[valid])))
    master.flush()
    if finite_pixels == 0:
        raise MosaicIntegrityError("coaddition produced no finite master pixel")

    return CoaddResult(
        data=master,
        data_path=master_path,
        contributions=tuple(sorted(contributions, key=lambda contribution: contribution.source_id)),
        finite_pixels=finite_pixels,
        spatial_coverage_fraction=finite_pixels / (canvas.shape[0] * canvas.shape[1]),
        mean_depth=depth_sum / finite_pixels,
        max_depth=max_depth,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def hash_source_inventory(source_ids: Iterable[str]) -> str:
    """Hash a private source inventory without exposing its identifiers."""

    supplied = list(source_ids)
    identifiers = sorted(set(supplied))
    if not identifiers or any(not identifier for identifier in identifiers):
        raise ValueError("source inventory must contain non-empty identifiers")
    if len(identifiers) != len(supplied):
        raise ValueError("source inventory identifiers must be unique")
    # Newline canonicalization is deliberately simple to reproduce with
    # PostgreSQL string_agg during the activation transaction.
    canonical = ("\n".join(identifiers) + "\n").encode()
    return hashlib.sha256(canonical).hexdigest()


def write_master_fits(
    result: CoaddResult,
    canvas: CanvasPlan,
    path: Path,
    *,
    object_id: str,
    spectral_band: str,
    pipeline_version: str,
    partial: bool,
    source_inventory_sha256: str,
    extra_header: Mapping[str, Any] | None = None,
    overwrite: bool = False,
) -> FileArtifact:
    """Write a checksum-protected scientific master with provenance headers."""

    if tuple(result.data.shape) != canvas.shape:
        raise ValueError("coadd data shape differs from its canvas plan")
    if len(source_inventory_sha256) != 64 or any(
        character not in "0123456789abcdef" for character in source_inventory_sha256.lower()
    ):
        raise ValueError("source inventory hash must be a SHA-256 hexadecimal digest")
    path.parent.mkdir(parents=True, exist_ok=True)
    header = canvas.wcs.to_header(relax=True)
    header["OBJECT"] = object_id
    header["FILTER"] = spectral_band
    header["NCOMBINE"] = len(result.contributing_source_ids)
    header["PIXSCALE"] = (canvas.output_pixel_scale_arcsec, "arcsec/pixel")
    header["COVFRAC"] = (result.spatial_coverage_fraction, "finite fraction of output canvas")
    header["MEANDEP"] = (result.mean_depth, "mean contributing cutouts per finite pixel")
    header["MAXDEPTH"] = (result.max_depth, "maximum contributing cutouts per pixel")
    header["PARTIAL"] = (bool(partial), "does not claim complete object coverage")
    header["PIPEVER"] = pipeline_version
    header["SRCINV"] = source_inventory_sha256.lower()
    if extra_header:
        for key, value in extra_header.items():
            header[str(key).upper()] = value
    primary_header = header.copy()
    primary_header["FZALGOR"] = (MASTER_FITS_COMPRESSION, "tile compression algorithm")
    primary_header["FZQLEVL"] = (
        MASTER_FITS_QUANTIZE_LEVEL,
        "quantization steps per background-noise sigma",
    )
    primary = fits.PrimaryHDU(header=primary_header)
    science = fits.CompImageHDU(
        data=result.data,
        header=header,
        name="SCI",
        compression_type=MASTER_FITS_COMPRESSION,
        quantize_level=MASTER_FITS_QUANTIZE_LEVEL,
        quantize_method=MASTER_FITS_QUANTIZE_METHOD,
        dither_seed=MASTER_FITS_DITHER_SEED,
        tile_shape=MASTER_FITS_TILE_SHAPE,
    )
    fits.HDUList([primary, science]).writeto(
        path, overwrite=overwrite, checksum=False, output_verify="exception"
    )
    # Astropy's default CHECKSUM comments contain wall-clock timestamps, which
    # would give the same scientific render a different content address on
    # every retry. Add both checksums after compression with a fixed comment.
    with fits.open(path, mode="update", memmap=True) as hdus:
        hdus[0].add_checksum(when=MASTER_FITS_CHECKSUM_COMMENT)
        compressed_table = getattr(hdus["SCI"], "_bintable", None)
        if compressed_table is None:
            raise MosaicIntegrityError("written master FITS has no compressed science table")
        compressed_table.add_checksum(when=MASTER_FITS_CHECKSUM_COMMENT)
        hdus.flush(output_verify="exception")
    with fits.open(path, memmap=True, checksum=True) as hdus:
        if hdus[0].verify_checksum() != 1 or hdus[0].verify_datasum() != 1:
            raise MosaicIntegrityError("written master FITS primary checksum verification failed")
        compressed_table = getattr(hdus["SCI"], "_bintable", None)
        if (
            compressed_table is None
            or compressed_table.verify_checksum() != 1
            or compressed_table.verify_datasum() != 1
        ):
            raise MosaicIntegrityError("written master FITS science checksum verification failed")
        science_data = hdus["SCI"].data
        if science_data is None or tuple(science_data.shape) != canvas.shape:
            raise MosaicIntegrityError("written master FITS dimensions changed")
        if int(np.count_nonzero(np.isfinite(science_data))) != result.finite_pixels:
            raise MosaicIntegrityError("written master FITS finite-pixel mask changed")
    return FileArtifact(
        path=path,
        media_type="image/fits",
        byte_size=path.stat().st_size,
        sha256=sha256_file(path),
    )


def display_limits(data: np.ndarray, *, max_samples: int = 2_000_000) -> tuple[float, float]:
    if max_samples < 1:
        raise ValueError("display sampling budget must be positive")
    stride = max(1, int(math.ceil(math.sqrt(data.size / max_samples))))
    sample = np.asarray(data[::stride, ::stride], dtype=np.float32)
    finite = sample[np.isfinite(sample)]
    if finite.size == 0:
        raise MosaicIntegrityError("cannot render a master without finite pixels")
    low, high = np.percentile(finite, (0.5, 99.7))
    if not math.isfinite(float(low)) or not math.isfinite(float(high)):
        raise MosaicIntegrityError("master display limits are non-finite")
    if high <= low:
        high = low + 1
    return float(low), float(high)


def _asinh_uint8(data: np.ndarray, valid: np.ndarray, limits: tuple[float, float]) -> np.ndarray:
    low, high = limits
    normalized = np.zeros(data.shape, dtype=np.float32)
    np.subtract(data, low, out=normalized, where=valid)
    normalized /= high - low
    np.clip(normalized, 0, 1, out=normalized)
    normalized *= 10
    np.arcsinh(normalized, out=normalized)
    normalized *= 255 / np.arcsinh(10)
    return normalized.astype(np.uint8)


def _downsample_finite_mean(data: np.ndarray, max_size: int) -> np.ndarray:
    if max_size < 16:
        raise ValueError("preview size is too small")
    factor = max(1, int(math.ceil(max(data.shape) / max_size)))
    if factor == 1:
        return np.asarray(data, dtype=np.float32)
    output_shape = (
        int(math.ceil(data.shape[0] / factor)),
        int(math.ceil(data.shape[1] / factor)),
    )
    total = np.zeros(output_shape, dtype=np.float64)
    count = np.zeros(output_shape, dtype=np.uint32)
    for y_offset in range(factor):
        for x_offset in range(factor):
            sample = np.asarray(data[y_offset::factor, x_offset::factor], dtype=np.float32)
            height, width = sample.shape
            valid = np.isfinite(sample)
            total[:height, :width] += np.where(valid, sample, 0)
            count[:height, :width] += valid.astype(np.uint32)
    return np.divide(
        total,
        count,
        out=np.full(output_shape, np.nan, dtype=np.float64),
        where=count > 0,
    ).astype(np.float32)


def write_master_preview(
    data: np.ndarray,
    path: Path,
    *,
    max_size: int = 1600,
    quality: int = 90,
    limits: tuple[float, float] | None = None,
    overwrite: bool = False,
) -> FileArtifact:
    """Render a bounded-memory, transparent WebP preview of the master."""

    if path.exists() and not overwrite:
        raise FileExistsError(path)
    preview = _downsample_finite_mean(data, max_size)
    valid = np.isfinite(preview)
    if not np.any(valid):
        raise MosaicIntegrityError("cannot render an empty master preview")
    selected_limits = limits or display_limits(data)
    gray = _asinh_uint8(preview, valid, selected_limits)
    alpha = np.where(valid, 255, 0).astype(np.uint8)
    rgba = np.stack([gray, gray, gray, alpha], axis=-1)
    image = Image.fromarray(rgba, mode="RGBA")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", quality=quality, method=6)
    return FileArtifact(
        path=path,
        media_type="image/webp",
        byte_size=path.stat().st_size,
        sha256=sha256_file(path),
    )


def build_healpix_plan(
    fine_indices: Iterable[int],
    *,
    fine_order: int = 9,
    minimum_order: int = 7,
) -> HealpixPlan:
    """Build a canonical NESTED pyramid and its immutable plan hash."""

    if not 0 <= minimum_order <= fine_order <= 29:
        raise ValueError("invalid HEALPix order range")
    maximum_index = 12 * (1 << fine_order) ** 2
    current = {int(index) for index in fine_indices}
    if not current:
        raise ValueError("at least one fine HEALPix cell is required")
    if any(index < 0 or index >= maximum_index for index in current):
        raise ValueError("fine HEALPix index is outside its order")
    levels: dict[int, set[int]] = {fine_order: current}
    for order in range(fine_order - 1, minimum_order - 1, -1):
        current = {index // 4 for index in current}
        levels[order] = current
    cells = tuple(
        HealpixCell(order, index)
        for order in range(minimum_order, fine_order + 1)
        for index in sorted(levels[order])
    )
    canonical = json.dumps(
        {
            "scheme": "nested",
            "minimum_order": minimum_order,
            "fine_order": fine_order,
            "cells": [[cell.order, cell.index] for cell in cells],
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return HealpixPlan(
        fine_order=fine_order,
        minimum_order=minimum_order,
        cells=cells,
        sha256=hashlib.sha256(canonical).hexdigest(),
    )


def _healpix_cell_wcs(cell: HealpixCell, size: int) -> tuple[WCS, HEALPix]:
    if size < 16:
        raise ValueError("HEALPix tile size is too small")
    hp = HEALPix(nside=1 << cell.order, order="nested", frame="icrs")
    if cell.index < 0 or cell.index >= hp.npix:
        raise ValueError("HEALPix index is outside its order")
    center = hp.healpix_to_skycoord(cell.index)
    boundary = hp.boundaries_skycoord(cell.index, step=16)
    half_size_deg = float(np.max(center.separation(boundary).to_value(u.deg))) * 1.03
    if not math.isfinite(half_size_deg) or half_size_deg <= 0:
        raise MosaicIntegrityError("HEALPix cell has an invalid angular extent")
    target = WCS(naxis=2)
    target.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    target.wcs.cunit = ["deg", "deg"]
    target.wcs.crval = [center.ra.deg, center.dec.deg]
    target.wcs.crpix = [(size + 1) / 2, (size + 1) / 2]
    target.wcs.cdelt = [-(2 * half_size_deg) / size, (2 * half_size_deg) / size]
    return target, hp


def _project_master_cell(
    data: np.ndarray,
    source_wcs: WCS,
    cell: HealpixCell,
    *,
    size: int,
    interpolation_order: str,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    target, hp = _healpix_cell_wcs(cell, size)
    projected, footprint = reproject_interp(
        (data, source_wcs.celestial),
        target,
        shape_out=(size, size),
        order=interpolation_order,
        block_size=(size, size),
        parallel=False,
    )
    y, x = np.mgrid[0:size, 0:size]
    world = target.pixel_to_world(x, y)
    inside = np.asarray(hp.skycoord_to_healpix(world) == cell.index, dtype=bool)
    valid = inside & np.isfinite(projected) & np.isfinite(footprint) & (footprint > 0)
    return np.asarray(projected, dtype=np.float32), valid, inside, np.asarray(footprint)


def measure_tile_source_contributions(
    frames: Iterable[MosaicFrame],
    plan: HealpixPlan,
    *,
    expected_source_ids: Iterable[str],
    sample_size: int = 64,
    interpolation_order: str = "bilinear",
) -> dict[HealpixCell, tuple[TileSourceContribution, ...]]:
    """Measure real source-to-cell attribution with source-bounded memory.

    Frames are consumed one at a time. Coverage is the fraction of sampled
    pixels inside the true HEALPix boundary reached by that source. Relative
    weights include both the reprojection footprint and the frame weight.
    """

    expected = set(expected_source_ids)
    if not expected or any(not source_id for source_id in expected):
        raise ValueError("expected source inventory must be non-empty")
    raw: dict[HealpixCell, list[tuple[str, int, int, float]]] = {
        cell: [] for cell in plan.cells
    }
    seen: set[str] = set()
    contributing: set[str] = set()
    for frame in frames:
        if frame.source_id in seen:
            raise MosaicIntegrityError(f"source {frame.source_id} was supplied more than once")
        if frame.source_id not in expected:
            raise MosaicIntegrityError(
                f"unexpected source {frame.source_id} is outside the frozen inventory"
            )
        if not math.isfinite(frame.weight) or frame.weight <= 0:
            raise ValueError(f"source {frame.source_id} has an invalid weight")
        seen.add(frame.source_id)
        for cell in plan.cells:
            _projected, valid, inside, footprint = _project_master_cell(
                frame.data,
                frame.wcs,
                cell,
                size=sample_size,
                interpolation_order=interpolation_order,
            )
            finite_pixels = int(np.count_nonzero(valid))
            cell_pixels = int(np.count_nonzero(inside))
            if not finite_pixels:
                continue
            weighted_pixels = float(
                np.sum(
                    np.where(valid, np.clip(footprint, 0, 1) * frame.weight, 0),
                    dtype=np.float64,
                )
            )
            if weighted_pixels <= 0:
                continue
            raw[cell].append(
                (frame.source_id, finite_pixels, cell_pixels, weighted_pixels)
            )
            contributing.add(frame.source_id)

    if seen != expected:
        raise MosaicIntegrityError(
            "tile attribution did not receive frozen sources: "
            + ", ".join(sorted(expected - seen))
        )
    if contributing != expected:
        raise MosaicIntegrityError(
            "tile attribution union did not contribute frozen sources: "
            + ", ".join(sorted(expected - contributing))
        )

    measured: dict[HealpixCell, tuple[TileSourceContribution, ...]] = {}
    for cell, entries in raw.items():
        if not entries:
            raise MosaicIntegrityError(
                f"frozen HEALPix cell O{cell.order}/{cell.index} has no source contribution"
            )
        total_weight = sum(entry[3] for entry in entries)
        measured[cell] = tuple(
            TileSourceContribution(
                source_id=source_id,
                finite_pixels=finite_pixels,
                cell_pixels=cell_pixels,
                coverage_fraction=finite_pixels / cell_pixels,
                weighted_pixels=weighted_pixels,
                normalized_weight=weighted_pixels / total_weight,
            )
            for source_id, finite_pixels, cell_pixels, weighted_pixels in sorted(entries)
        )
    return measured


def derive_healpix_plan_from_master(
    data: np.ndarray,
    source_wcs: WCS,
    *,
    fine_order: int = 9,
    minimum_order: int = 7,
    minimum_fine_coverage: float = 0.005,
    sample_size: int = 64,
    max_candidates: int = 4096,
) -> HealpixPlan:
    """Discover fine cells from actual finite master pixels, then add parents."""

    if not 0 <= minimum_fine_coverage <= 1:
        raise ValueError("fine-cell coverage threshold must be between zero and one")
    height, width = _validate_shape(data.shape)
    hp = HEALPix(nside=1 << fine_order, order="nested", frame="icrs")
    center = source_wcs.celestial.pixel_to_world((width - 1) / 2, (height - 1) / 2)
    edge_x, edge_y = _sample_edges((height, width), samples=32)
    boundary = source_wcs.celestial.pixel_to_world(edge_x, edge_y)
    radius = np.max(center.separation(boundary)) + np.sqrt(hp.pixel_area.to_value(u.deg**2)) * u.deg
    candidates = np.asarray(hp.cone_search_skycoord(center, radius), dtype=np.int64)
    if len(candidates) > max_candidates:
        raise MosaicIntegrityError(
            f"HEALPix preflight produced {len(candidates)} candidates, above the {max_candidates} limit"
        )
    selected: list[int] = []
    for index in candidates:
        _projected, valid, inside, _footprint = _project_master_cell(
            data,
            source_wcs,
            HealpixCell(fine_order, int(index)),
            size=sample_size,
            interpolation_order="bilinear",
        )
        cell_pixels = int(np.count_nonzero(inside))
        coverage = int(np.count_nonzero(valid)) / cell_pixels if cell_pixels else 0
        if coverage >= minimum_fine_coverage:
            selected.append(int(index))
    if not selected:
        raise MosaicIntegrityError("master finite mask intersects no HEALPix fine cell")
    return build_healpix_plan(selected, fine_order=fine_order, minimum_order=minimum_order)


def render_healpix_tiles(
    data: np.ndarray,
    source_wcs: WCS,
    plan: HealpixPlan,
    *,
    source_contributions: Mapping[HealpixCell, Sequence[TileSourceContribution]],
    expected_source_ids: Iterable[str],
    size: int = 512,
    quality: int = 90,
    limits: tuple[float, float] | None = None,
    # The master intentionally contains NaNs outside its covered sky footprint.
    interpolation_order: str = "bilinear",
) -> tuple[MosaicTileArtifact, ...]:
    """Render every frozen cell; one empty projection fails the generation."""

    expected = set(expected_source_ids)
    if not expected:
        raise ValueError("expected source inventory must be non-empty")
    planned_cells = set(plan.cells)
    if set(source_contributions) != planned_cells:
        raise MosaicIntegrityError("source attribution cells differ from the frozen tile plan")
    selected_limits = limits or display_limits(data)
    artifacts: list[MosaicTileArtifact] = []
    contributing_union: set[str] = set()
    for cell in plan.cells:
        contributions = tuple(sorted(source_contributions[cell], key=lambda item: item.source_id))
        identifiers = [item.source_id for item in contributions]
        if not contributions or len(set(identifiers)) != len(identifiers):
            raise MosaicIntegrityError(
                f"frozen HEALPix cell O{cell.order}/{cell.index} has invalid source attribution"
            )
        if not set(identifiers) <= expected:
            raise MosaicIntegrityError("tile attribution contains a source outside the frozen inventory")
        normalized_total = sum(item.normalized_weight for item in contributions)
        if not math.isclose(normalized_total, 1.0, rel_tol=1e-6, abs_tol=1e-9):
            raise MosaicIntegrityError("tile source weights do not sum to one")
        contributing_union.update(identifiers)
        projected, valid, inside, _footprint = _project_master_cell(
            data,
            source_wcs,
            cell,
            size=size,
            interpolation_order=interpolation_order,
        )
        finite_pixels = int(np.count_nonzero(valid))
        cell_pixels = int(np.count_nonzero(inside))
        if finite_pixels == 0 or cell_pixels == 0:
            raise MosaicIntegrityError(
                f"frozen HEALPix cell O{cell.order}/{cell.index} has no master projection"
            )
        gray = _asinh_uint8(projected, valid, selected_limits)
        alpha = np.where(valid, 255, 0).astype(np.uint8)
        rgba = np.stack([gray, gray, gray, alpha], axis=-1)
        output = BytesIO()
        Image.fromarray(rgba, mode="RGBA").save(
            output,
            format="WEBP",
            quality=quality,
            method=6,
        )
        content = output.getvalue()
        artifacts.append(
            MosaicTileArtifact(
                order=cell.order,
                index=cell.index,
                content=content,
                sha256=hashlib.sha256(content).hexdigest(),
                coverage_fraction=finite_pixels / cell_pixels,
                finite_pixels=finite_pixels,
                cell_pixels=cell_pixels,
                source_contributions=contributions,
            )
        )
    if len(artifacts) != plan.expected_tiles:
        raise MosaicIntegrityError("rendered HEALPix tile count differs from the frozen plan")
    if contributing_union != expected:
        raise MosaicIntegrityError("rendered tile source union differs from the frozen inventory")
    return tuple(artifacts)
