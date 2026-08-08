from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import math
import subprocess
import tempfile

from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_scales
import numpy as np


@dataclass(frozen=True)
class AstrometricSolution:
    wcs: WCS
    header: fits.Header
    center_ra_deg: float
    center_dec_deg: float
    rotation_deg: float
    pixel_scale_arcsec: float
    matched_stars: int
    rms_px: float
    confidence: float


def _valid_celestial_wcs(header: fits.Header) -> WCS | None:
    try:
        wcs = WCS(header)
        if wcs.has_celestial and np.all(np.isfinite(wcs.pixel_scale_matrix)):
            return wcs
    except Exception:
        return None
    return None


def _solution(wcs: WCS, header: fits.Header, width: int, height: int, matches: int, rms: float) -> AstrometricSolution:
    ra, dec = wcs.pixel_to_world_values((width - 1) / 2, (height - 1) / 2)
    scales = proj_plane_pixel_scales(wcs.celestial) * 3600
    scale = float(np.mean(np.abs(scales)))
    matrix = wcs.pixel_scale_matrix
    rotation = math.degrees(math.atan2(matrix[0, 1], matrix[0, 0]))
    confidence = max(0.0, min(1.0, min(matches / 40, 1) * max(0, 1 - rms / 2)))
    return AstrometricSolution(wcs, header, float(ra) % 360, float(dec), rotation, scale, matches, rms, confidence)


def solve_astrometry(path: Path, header: fits.Header, width: int, height: int, timeout_seconds: int = 180) -> AstrometricSolution:
    existing = _valid_celestial_wcs(header)
    if existing is not None and header.get("WCSMATCH", 0) >= 20 and header.get("WCSRMS") is not None:
        return _solution(existing, header, width, height, int(header["WCSMATCH"]), float(header["WCSRMS"]))

    with tempfile.TemporaryDirectory(prefix="sky-solve-") as temp:
        directory = Path(temp).resolve()
        subprocess.run(
            [
                "solve-field", str(path.resolve()), "--dir", str(directory), "--overwrite",
                "--no-plots", "--new-fits", "solved.fits", "--corr", "matches.fits",
                "--cpulimit", str(timeout_seconds),
            ],
            check=True,
            cwd=directory,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_seconds + 15,
        )
        solved_path = directory / "solved.fits"
        if not solved_path.exists():
            raise RuntimeError("astrometry solver produced no solution")
        solved_header = fits.getheader(solved_path)
        solved_wcs = _valid_celestial_wcs(solved_header)
        if solved_wcs is None:
            raise RuntimeError("astrometry solver produced invalid WCS")
        matches, rms = 0, float("inf")
        corr_path = directory / "matches.fits"
        if corr_path.exists():
            table = fits.getdata(corr_path)
            matches = len(table)
            names = {name.lower(): name for name in table.dtype.names or []}
            required = ["field_x", "field_y", "index_x", "index_y"]
            if all(name in names for name in required) and matches:
                dx = table[names["field_x"]] - table[names["index_x"]]
                dy = table[names["field_y"]] - table[names["index_y"]]
                rms = float(np.sqrt(np.mean(dx * dx + dy * dy)))
        if not np.isfinite(rms):
            rms = 2.0
        return _solution(solved_wcs, solved_header, width, height, matches, rms)
