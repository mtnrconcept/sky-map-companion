from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import hashlib
import subprocess
import tempfile
from typing import Any

from astropy.io import fits
import numpy as np
from PIL import Image


MAX_PIXELS = 200_000_000
RAW_EXTENSIONS = {".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".rw2", ".dng"}
RASTER_EXTENSIONS = {".tif", ".tiff", ".png", ".jpg", ".jpeg"}


@dataclass(frozen=True)
class ExtractedFrame:
    data: np.ndarray
    header: fits.Header
    metadata: dict[str, Any]
    content_sha256: str
    native_width: int
    native_height: int


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _normalize(data: np.ndarray) -> np.ndarray:
    array = np.asarray(data, dtype=np.float32)
    if array.ndim == 3:
        array = np.nanmean(array, axis=0) if array.shape[0] <= 4 else np.nanmean(array, axis=2)
    if array.ndim != 2 or array.size == 0 or array.size > MAX_PIXELS:
        raise ValueError("unsupported image dimensions")
    if not np.isfinite(array).any():
        raise ValueError("image contains no finite pixels")
    return array


def _fits_frame(path: Path) -> tuple[np.ndarray, fits.Header]:
    with fits.open(path, memmap=True, do_not_scale_image_data=False, ignore_missing_end=False) as hdus:
        image_hdus = [hdu for hdu in hdus if getattr(hdu, "data", None) is not None]
        if not image_hdus:
            raise ValueError("FITS contains no image HDU")
        hdu = image_hdus[0]
        return _normalize(hdu.data), hdu.header.copy()


def _raw_frame(path: Path) -> tuple[np.ndarray, fits.Header]:
    with tempfile.TemporaryDirectory(prefix="sky-raw-") as temp_dir:
        output = Path(temp_dir) / "decoded.tiff"
        subprocess.run(
            ["dcraw_emu", "-T", "-4", "-D", "-W", "-o", "0", "-c", str(path)],
            check=True,
            stdout=output.open("wb"),
            stderr=subprocess.PIPE,
            timeout=120,
        )
        with Image.open(output) as image:
            return _normalize(np.asarray(image)), fits.Header()


def _raster_frame(path: Path) -> tuple[np.ndarray, fits.Header]:
    with Image.open(path) as image:
        return _normalize(np.asarray(image)), fits.Header()


def extract_frame(path: Path) -> ExtractedFrame:
    if not path.is_file():
        raise FileNotFoundError(path)
    suffix = path.suffix.lower()
    if suffix in RAW_EXTENSIONS:
        data, header = _raw_frame(path)
    elif suffix in RASTER_EXTENSIONS:
        data, header = _raster_frame(path)
    else:
        data, header = _fits_frame(path)
    height, width = data.shape
    metadata = {
        "exposure_s": header.get("EXPTIME") or header.get("EXPOSURE"),
        "filter": header.get("FILTER"),
        "captured_at": header.get("DATE-OBS"),
        "camera": header.get("INSTRUME"),
        "telescope": header.get("TELESCOP"),
        "gain": header.get("GAIN"),
        "temperature_c": header.get("CCD-TEMP"),
    }
    return ExtractedFrame(
        data=data,
        header=header,
        metadata={key: value for key, value in metadata.items() if value is not None},
        content_sha256=_sha256(path),
        native_width=width,
        native_height=height,
    )
