from __future__ import annotations

from dataclasses import dataclass
from io import StringIO
from pathlib import Path
import csv
import hashlib
import math
import time
from typing import Iterable
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PS1_BASE_URL = "https://ps1images.stsci.edu"
PS1_FILENAME_URL = f"{PS1_BASE_URL}/cgi-bin/ps1filenames.py"
PS1_CUTOUT_URL = f"{PS1_BASE_URL}/cgi-bin/fitscut.cgi"
PS1_PIXEL_SCALE_ARCSEC = 0.25
PS1_ACKNOWLEDGEMENT = (
    "Pan-STARRS1 Surveys (PS1) and the PS1 public science archive; cite "
    "Chambers et al. 2016, Magnier et al. 2016 and Waters et al. 2016 as appropriate."
)


@dataclass(frozen=True)
class SkyPosition:
    ra_deg: float
    dec_deg: float


@dataclass(frozen=True)
class ArchiveCandidate:
    record_id: str
    remote_url: str
    remote_filename: str
    source_filename: str
    ra_deg: float
    dec_deg: float
    spectral_band: str
    calibration_level: int
    product_type: str
    mjd: float | None


def target_grid(
    center_ra_deg: float,
    center_dec_deg: float,
    width_arcmin: float,
    height_arcmin: float,
    cutout_size_px: int,
    overlap_fraction: float = 0.15,
) -> list[SkyPosition]:
    if not (0 <= center_ra_deg < 360 and -90 <= center_dec_deg <= 90):
        raise ValueError("invalid target coordinates")
    if width_arcmin <= 0 or height_arcmin <= 0 or cutout_size_px < 64:
        raise ValueError("invalid target grid dimensions")
    if not 0 <= overlap_fraction < 0.8:
        raise ValueError("invalid overlap fraction")
    cutout_arcmin = cutout_size_px * PS1_PIXEL_SCALE_ARCSEC / 60
    step_arcmin = cutout_arcmin * (1 - overlap_fraction)
    x_count = max(1, math.ceil(width_arcmin / step_arcmin))
    y_count = max(1, math.ceil(height_arcmin / step_arcmin))
    cosine = max(0.1, math.cos(math.radians(center_dec_deg)))
    positions: list[SkyPosition] = []
    for y_index in range(y_count):
        y_arcmin = (y_index - (y_count - 1) / 2) * step_arcmin
        for x_index in range(x_count):
            x_arcmin = (x_index - (x_count - 1) / 2) * step_arcmin
            positions.append(
                SkyPosition(
                    ra_deg=(center_ra_deg + x_arcmin / (60 * cosine)) % 360,
                    dec_deg=center_dec_deg + y_arcmin / 60,
                )
            )
    return sorted(
        positions,
        key=lambda item: (
            (math.cos(math.radians(center_dec_deg)) * ((item.ra_deg - center_ra_deg + 180) % 360 - 180)) ** 2
            + (item.dec_deg - center_dec_deg) ** 2,
            item.dec_deg,
            item.ra_deg,
        ),
    )


def parse_ps1_filename_table(body: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    if not lines:
        return []
    reader = csv.DictReader(StringIO("\n".join(lines)), delimiter=" ", skipinitialspace=True)
    rows = []
    for row in reader:
        cleaned = {key: value for key, value in row.items() if key and value is not None}
        if cleaned.get("filename") and cleaned.get("filter"):
            rows.append(cleaned)
    return rows


class PS1Archive:
    def __init__(self, request_delay_seconds: float = 0.3, timeout_seconds: int = 60):
        self.request_delay_seconds = request_delay_seconds
        self.timeout_seconds = timeout_seconds

    def _text(self, url: str) -> str:
        request = Request(url, headers={"User-Agent": "sky-map-companion/1 public-archive-ingest"})
        with urlopen(request, timeout=self.timeout_seconds) as response:
            if response.url.split("/", 3)[2].lower() != "ps1images.stsci.edu":
                raise ValueError("archive redirected to an untrusted host")
            return response.read(2 * 1024 * 1024).decode("utf-8")

    def discover(
        self,
        positions: Iterable[SkyPosition],
        spectral_band: str,
        cutout_size_px: int,
        max_files: int,
    ) -> list[ArchiveCandidate]:
        if spectral_band not in "grizy":
            raise ValueError("PS1 filter must be one of grizy")
        candidates: list[ArchiveCandidate] = []
        seen: set[str] = set()
        for position in positions:
            query_url = f"{PS1_FILENAME_URL}?{urlencode({'ra': f'{position.ra_deg:.8f}', 'dec': f'{position.dec_deg:.8f}', 'filters': spectral_band, 'type': 'stack'})}"
            rows = parse_ps1_filename_table(self._text(query_url))
            time.sleep(self.request_delay_seconds)
            row = next(
                (
                    item
                    for item in rows
                    if item.get("filter") == spectral_band and item.get("type") == "stack"
                ),
                None,
            )
            if row is None:
                continue
            source_filename = row["filename"]
            identity = (
                f"{source_filename}|{position.ra_deg:.8f}|{position.dec_deg:.8f}|"
                f"{cutout_size_px}|{spectral_band}"
            )
            record_id = hashlib.sha256(identity.encode()).hexdigest()
            if record_id in seen:
                continue
            seen.add(record_id)
            cutout_query = urlencode(
                {
                    "ra": f"{position.ra_deg:.8f}",
                    "dec": f"{position.dec_deg:.8f}",
                    "size": str(cutout_size_px),
                    "format": "fits",
                    "red": source_filename,
                }
            )
            mjd_value = float(row.get("mjd") or 0)
            candidates.append(
                ArchiveCandidate(
                    record_id=record_id,
                    remote_url=f"{PS1_CUTOUT_URL}?{cutout_query}",
                    remote_filename=f"ps1-{spectral_band}-{record_id[:16]}.fits",
                    source_filename=source_filename,
                    ra_deg=position.ra_deg,
                    dec_deg=position.dec_deg,
                    spectral_band=spectral_band,
                    calibration_level=3,
                    product_type="stack-cutout",
                    mjd=mjd_value if mjd_value > 0 else None,
                )
            )
            if len(candidates) >= max_files:
                break
        return candidates

    def download(self, candidate: ArchiveCandidate, target: Path, remaining_bytes: int) -> int:
        if remaining_bytes <= 0:
            raise ValueError("archive byte budget exhausted")
        request = Request(
            candidate.remote_url,
            headers={"User-Agent": "sky-map-companion/1 public-archive-ingest"},
        )
        total = 0
        with urlopen(request, timeout=self.timeout_seconds) as response, target.open("wb") as output:
            if response.url.split("/", 3)[2].lower() != "ps1images.stsci.edu":
                raise ValueError("archive redirected to an untrusted host")
            content_length = int(response.headers.get("Content-Length") or 0)
            if content_length and content_length > remaining_bytes:
                raise ValueError("archive file exceeds remaining byte budget")
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > remaining_bytes:
                    raise ValueError("archive byte budget exceeded")
                output.write(chunk)
        if total < 2880:
            raise ValueError("archive response is too small to be a FITS file")
        with target.open("rb") as source:
            if not source.read(30).startswith(b"SIMPLE  ="):
                raise ValueError("archive response is not a primary FITS image")
        return total
