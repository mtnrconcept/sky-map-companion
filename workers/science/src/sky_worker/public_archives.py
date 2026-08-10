from __future__ import annotations

from dataclasses import dataclass, replace
from io import BytesIO
import hashlib
import json
from pathlib import PurePosixPath
import time
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import Request, urlopen

from astropy.io.votable import parse_single_table


@dataclass(frozen=True)
class ProviderPolicy:
    provider_id: str
    label: str
    base_url: str
    terms_url: str
    attribution_text: str
    rights_class: str
    allowed_hosts: tuple[str, ...]


@dataclass(frozen=True)
class PublicArchiveCandidate:
    provider_id: str
    collection_id: str
    provider_record_id: str
    access_url: str
    access_format: str | None
    data_rights: str | None
    rights_uri: str
    attribution_text: str
    redistribution_allowed: bool
    dataproduct_type: str
    calibration_level: int | None
    ra_deg: float | None
    dec_deg: float | None
    spatial_resolution_arcsec: float | None
    em_min_m: float | None
    em_max_m: float | None
    observed_mjd: float | None
    exposure_s: float | None
    facility: str | None
    instrument: str | None
    target_name: str | None
    source_filename: str
    metadata: dict[str, Any]

    @property
    def stable_record_hash(self) -> str:
        return hashlib.sha256(
            f"{self.provider_id}:{self.provider_record_id}".encode("utf-8")
        ).hexdigest()


PROVIDERS: dict[str, ProviderPolicy] = {
    "eso": ProviderPolicy(
        provider_id="eso",
        label="ESO Science Archive",
        base_url="https://archive.eso.org",
        terms_url="https://archive.eso.org/cms/eso-data-access-policy.html",
        attribution_text="ESO Science Archive",
        rights_class="public-with-attribution",
        allowed_hosts=("archive.eso.org", "dataportal.eso.org"),
    ),
    "mast": ProviderPolicy(
        provider_id="mast",
        label="MAST",
        base_url="https://mast.stsci.edu",
        terms_url="https://archive.stsci.edu/publishing/data-use",
        attribution_text="MAST / Space Telescope Science Institute",
        rights_class="public-domain",
        allowed_hosts=("mast.stsci.edu", "archive.stsci.edu"),
    ),
    "irsa": ProviderPolicy(
        provider_id="irsa",
        label="NASA/IPAC IRSA",
        base_url="https://irsa.ipac.caltech.edu",
        terms_url="https://irsa.ipac.caltech.edu/data_use_terms.html",
        attribution_text="NASA/IPAC Infrared Science Archive",
        rights_class="dataset-specific",
        allowed_hosts=("irsa.ipac.caltech.edu",),
    ),
    "noirlab": ProviderPolicy(
        provider_id="noirlab",
        label="NOIRLab Astro Data Lab",
        base_url="https://datalab.noirlab.edu",
        terms_url="https://datalab.noirlab.edu/docs/",
        attribution_text="NSF NOIRLab Astro Data Lab",
        rights_class="dataset-specific",
        allowed_hosts=("datalab.noirlab.edu",),
    ),
}

COPYRIGHTED_COLLECTION_MARKERS = ("dss", "digitized sky survey", "gsc", "guide star")
PUBLIC_RIGHTS = {"public", "released", "open", "unrestricted"}
PRIVATE_RIGHTS = {"proprietary", "exclusive", "embargoed", "private", "restricted"}
_MAST_INVOKE_URL = "https://mast.stsci.edu/api/v0/invoke"
_MAST_DOWNLOAD_URL = "https://mast.stsci.edu/api/v0.1/Download/file"
_MAST_PREFERRED_SUBGROUPS = {"DRC": 0, "DRZ": 1, "DLC": 2, "FLC": 3, "FLT": 4}


def _clean_scalar(value: Any) -> Any:
    if value is None:
        return None
    if getattr(value, "mask", False) is True:
        return None
    if hasattr(value, "item"):
        try:
            value = value.item()
        except (ValueError, TypeError):
            pass
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _rows_from_votable(body: bytes) -> list[dict[str, Any]]:
    table = parse_single_table(BytesIO(body)).to_table(use_names_over_ids=True)
    rows: list[dict[str, Any]] = []
    for table_row in table:
        rows.append({name: _clean_scalar(table_row[name]) for name in table.colnames})
    return rows


def _pick(row: dict[str, Any], *names: str) -> Any:
    lower = {key.lower(): value for key, value in row.items()}
    for name in names:
        value = lower.get(name.lower())
        if value is not None and str(value).strip() != "":
            return value
    return None


def _as_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _https_get(url: str, timeout_seconds: int) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("public archive URL must use HTTPS")
    request = Request(
        url,
        headers={
            "Accept": "application/x-votable+xml, application/xml;q=0.9, */*;q=0.1",
            "User-Agent": "sky-map-companion/1 public-archive-ivoa",
        },
    )
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                return response.read(32 * 1024 * 1024)
        except TimeoutError as error:
            last_error = error
            if attempt == 0:
                time.sleep(2)
    assert last_error is not None
    raise last_error


def _mast_invoke(
    service: str,
    params: dict[str, Any],
    *,
    pagesize: int,
    timeout_seconds: int,
) -> list[dict[str, Any]]:
    payload = {
        "service": service,
        "params": params,
        "format": "json",
        "pagesize": pagesize,
        "page": 1,
        "removenullcolumns": True,
    }
    encoded = urlencode(
        {"request": json.dumps(payload, separators=(",", ":"), sort_keys=True)}
    ).encode("utf-8")
    last_error: Exception | None = None
    for attempt in range(6):
        request = Request(
            _MAST_INVOKE_URL,
            data=encoded,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "sky-map-companion/1 public-archive-mast-caom",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=timeout_seconds) as response:
                result = json.loads(response.read(16 * 1024 * 1024))
        except TimeoutError as error:
            last_error = error
            if attempt < 5:
                time.sleep(2)
                continue
            raise
        if not isinstance(result, dict):
            raise ValueError("MAST API returned a non-object payload")
        status = str(result.get("status") or "COMPLETE").upper()
        if status == "COMPLETE":
            data = result.get("data") or []
            if not isinstance(data, list):
                raise ValueError("MAST API returned invalid data rows")
            return [row for row in data if isinstance(row, dict)]
        if status in {"EXECUTING", "PENDING"}:
            time.sleep(1)
            continue
        raise RuntimeError(str(result.get("msg") or f"MAST API query failed: {status}"))
    if last_error is not None:
        raise last_error
    raise TimeoutError("MAST API query did not complete")


def _copyrighted_collection(collection: str) -> bool:
    lowered = collection.lower()
    return any(marker in lowered for marker in COPYRIGHTED_COLLECTION_MARKERS)


def _is_public_rights(value: str | None) -> bool:
    if value is None:
        return False
    lowered = value.strip().lower()
    if any(marker in lowered for marker in PRIVATE_RIGHTS):
        return False
    return lowered in PUBLIC_RIGHTS or lowered.startswith("public")


def _redistribution_allowed(
    provider_id: str,
    collection: str,
    data_rights: str | None,
) -> bool:
    if _copyrighted_collection(collection):
        return False
    if provider_id == "eso":
        return _is_public_rights(data_rights)
    if provider_id == "mast":
        return _is_public_rights(data_rights)
    if provider_id == "irsa":
        if data_rights is None:
            return True
        return _is_public_rights(data_rights)
    return False


def _source_filename(access_url: str, record_id: str) -> str:
    path = PurePosixPath(urlparse(access_url).path)
    name = path.name
    if name and "." in name:
        return name[:240]
    digest = hashlib.sha256(record_id.encode("utf-8")).hexdigest()[:20]
    return f"archive-{digest}.fits"


def _normalize_row(provider_id: str, row: dict[str, Any]) -> PublicArchiveCandidate | None:
    policy = PROVIDERS[provider_id]
    access_url = _as_text(
        _pick(row, "access_url", "accessreference", "access_reference", "url", "accessurl")
    )
    if not access_url:
        return None
    collection = _as_text(
        _pick(row, "obs_collection", "collection", "survey", "archive", "proctype")
    ) or provider_id
    record_id = _as_text(
        _pick(
            row,
            "obs_publisher_did",
            "publisherid",
            "obs_id",
            "dp_id",
            "dataset",
            "imageid",
            "title",
        )
    )
    if not record_id:
        record_id = hashlib.sha256(access_url.encode("utf-8")).hexdigest()
    data_rights = _as_text(_pick(row, "data_rights", "rights", "dataRights"))
    access_format = _as_text(
        _pick(row, "access_format", "format", "accessformat", "content_type")
    )
    dataproduct_type = _as_text(
        _pick(row, "dataproduct_type", "product_type", "proctype", "type")
    ) or "image"
    calibration_level = _as_int(
        _pick(row, "calib_level", "calibration_level", "calib", "calibLevel")
    )
    return PublicArchiveCandidate(
        provider_id=provider_id,
        collection_id=collection,
        provider_record_id=record_id,
        access_url=access_url,
        access_format=access_format,
        data_rights=data_rights,
        rights_uri=policy.terms_url,
        attribution_text=policy.attribution_text,
        redistribution_allowed=_redistribution_allowed(provider_id, collection, data_rights),
        dataproduct_type=dataproduct_type,
        calibration_level=calibration_level,
        ra_deg=_as_float(_pick(row, "s_ra", "ra", "ra_obs", "ra2000")),
        dec_deg=_as_float(_pick(row, "s_dec", "dec", "dec_obs", "dec2000")),
        spatial_resolution_arcsec=_as_float(
            _pick(row, "s_resolution", "spatial_resolution", "spatreso")
        ),
        em_min_m=_as_float(_pick(row, "em_min", "em_min_m")),
        em_max_m=_as_float(_pick(row, "em_max", "em_max_m")),
        observed_mjd=_as_float(_pick(row, "t_min", "mjd_obs", "mjd", "mjdobs")),
        exposure_s=_as_float(_pick(row, "t_exptime", "exptime", "exposure", "exposure_s")),
        facility=_as_text(_pick(row, "facility_name", "facility", "telescope")),
        instrument=_as_text(_pick(row, "instrument_name", "instrument", "instrume")),
        target_name=_as_text(_pick(row, "target_name", "target", "object")),
        source_filename=_source_filename(access_url, record_id),
        metadata={key: _clean_scalar(value) for key, value in row.items()},
    )


def _irsa_ibe_cutout_candidate(
    candidate: PublicArchiveCandidate,
    target_ra_deg: float,
    target_dec_deg: float,
    radius_deg: float,
) -> PublicArchiveCandidate:
    parsed = urlparse(candidate.access_url)
    if parsed.hostname != "irsa.ipac.caltech.edu" or "/ibe/data/" not in parsed.path:
        return candidate

    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    full_size_deg = min(2.0, max(0.01, radius_deg * 2.0))
    params.update(
        {
            "center": f"{target_ra_deg:.10f},{target_dec_deg:.10f}deg",
            "size": f"{full_size_deg:.10f}deg",
            "gzip": "false",
        }
    )
    cutout_url = urlunparse(parsed._replace(query=urlencode(params)))
    metadata = {
        **candidate.metadata,
        "sky_map_cutout": {
            "parent_access_url": candidate.access_url,
            "center_ra_deg": target_ra_deg,
            "center_dec_deg": target_dec_deg,
            "size_deg": full_size_deg,
            "service": "irsa-ibe",
        },
    }
    return replace(candidate, access_url=cutout_url, metadata=metadata)


def _mast_product_candidate(
    observation: dict[str, Any],
    product: dict[str, Any],
) -> PublicArchiveCandidate | None:
    data_uri = _as_text(_pick(product, "dataURI", "data_uri"))
    filename = _as_text(_pick(product, "productFilename", "product_filename"))
    if not data_uri or not filename:
        return None
    lowered_filename = filename.lower()
    if not lowered_filename.endswith((".fits", ".fits.fz", ".fz")):
        return None
    product_type = (_as_text(_pick(product, "productType", "product_type")) or "").upper()
    if product_type != "SCIENCE":
        return None
    collection = _as_text(_pick(product, "obs_collection")) or _as_text(
        _pick(observation, "obs_collection")
    ) or "MAST"
    rights = _as_text(_pick(product, "dataRights", "data_rights")) or _as_text(
        _pick(observation, "dataRights", "data_rights")
    )
    calibration_level = _as_int(_pick(product, "calib_level", "calibLevel"))
    if calibration_level is None:
        calibration_level = _as_int(_pick(observation, "calib_level", "calibLevel"))
    if calibration_level is not None and calibration_level < 2:
        return None
    access_url = _MAST_DOWNLOAD_URL + "?" + urlencode({"uri": data_uri})
    policy = PROVIDERS["mast"]
    metadata = {
        "mast_observation": {key: _clean_scalar(value) for key, value in observation.items()},
        "mast_product": {key: _clean_scalar(value) for key, value in product.items()},
    }
    return PublicArchiveCandidate(
        provider_id="mast",
        collection_id=collection,
        provider_record_id=data_uri,
        access_url=access_url,
        access_format="image/fits",
        data_rights=rights,
        rights_uri=policy.terms_url,
        attribution_text=policy.attribution_text,
        redistribution_allowed=_redistribution_allowed("mast", collection, rights),
        dataproduct_type="image",
        calibration_level=calibration_level,
        ra_deg=_as_float(_pick(observation, "s_ra", "ra")),
        dec_deg=_as_float(_pick(observation, "s_dec", "dec")),
        spatial_resolution_arcsec=_as_float(_pick(observation, "s_resolution")),
        em_min_m=_as_float(_pick(observation, "em_min")),
        em_max_m=_as_float(_pick(observation, "em_max")),
        observed_mjd=_as_float(_pick(observation, "t_min")),
        exposure_s=_as_float(_pick(observation, "t_exptime")),
        facility=_as_text(_pick(observation, "facility_name")) or "HST",
        instrument=_as_text(_pick(observation, "instrument_name")),
        target_name=_as_text(_pick(observation, "target_name")),
        source_filename=filename[:240],
        metadata=metadata,
    )


def _mast_product_sort_key(product: dict[str, Any]) -> tuple[int, int, str]:
    subgroup = (_as_text(_pick(product, "productSubGroupDescription")) or "").upper()
    subgroup_rank = _MAST_PREFERRED_SUBGROUPS.get(subgroup, 50)
    calibration_level = _as_int(_pick(product, "calib_level", "calibLevel")) or 0
    filename = _as_text(_pick(product, "productFilename")) or ""
    return (subgroup_rank, -calibration_level, filename)


def _discover_mast_caom(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float,
    max_records: int,
    collection: str | None,
    timeout_seconds: int,
) -> list[PublicArchiveCandidate]:
    selected_collection = collection or "HST"
    filters = [
        {"paramName": "obs_collection", "values": [selected_collection]},
        {"paramName": "dataproduct_type", "values": ["image"]},
        {"paramName": "dataRights", "values": ["PUBLIC"]},
    ]
    observations = _mast_invoke(
        "Mast.Caom.Filtered.Position",
        {
            "columns": (
                "obsid,obs_collection,obs_id,dataproduct_type,calib_level,dataRights,"
                "s_ra,s_dec,s_resolution,em_min,em_max,t_min,t_exptime,facility_name,"
                "instrument_name,target_name"
            ),
            "filters": filters,
            "position": f"{ra_deg:.10f}, {dec_deg:.10f}, {radius_deg:.10f}",
        },
        pagesize=min(64, max(8, max_records * 4)),
        timeout_seconds=timeout_seconds,
    )
    observations.sort(
        key=lambda row: (
            -(_as_int(_pick(row, "calib_level", "calibLevel")) or 0),
            _as_float(_pick(row, "s_resolution")) or float("inf"),
            str(_pick(row, "obsid") or ""),
        )
    )

    candidates: list[PublicArchiveCandidate] = []
    seen: set[str] = set()
    for observation in observations:
        obsid = _as_text(_pick(observation, "obsid"))
        if not obsid:
            continue
        products = _mast_invoke(
            "Mast.Caom.Products",
            {"obsid": obsid},
            pagesize=128,
            timeout_seconds=timeout_seconds,
        )
        for product in sorted(products, key=_mast_product_sort_key):
            candidate = _mast_product_candidate(observation, product)
            if candidate is None or not candidate.redistribution_allowed:
                continue
            if candidate.provider_record_id in seen:
                continue
            seen.add(candidate.provider_record_id)
            candidates.append(candidate)
            if len(candidates) >= max_records:
                return candidates
    return candidates


def _eso_url(ra_deg: float, dec_deg: float, radius_deg: float, max_records: int) -> str:
    query = f"""
SELECT TOP {max_records}
  obs_publisher_did,obs_collection,obs_id,access_url,access_format,data_rights,
  dataproduct_type,calib_level,s_ra,s_dec,s_resolution,em_min,em_max,
  t_min,t_max,t_exptime,facility_name,instrument_name,target_name
FROM ivoa.ObsCore
WHERE dataproduct_type='image'
  AND data_rights='public'
  AND 1=CONTAINS(
    POINT('ICRS',s_ra,s_dec),
    CIRCLE('ICRS',{ra_deg:.10f},{dec_deg:.10f},{radius_deg:.10f})
  )
ORDER BY calib_level DESC, s_resolution ASC
""".strip()
    return "https://archive.eso.org/tap_obs/sync?" + urlencode(
        {
            "REQUEST": "doQuery",
            "LANG": "ADQL",
            "FORMAT": "votable",
            "MAXREC": str(max_records),
            "QUERY": query,
        }
    )


def _mast_url(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float,
    max_records: int,
    collection: str | None,
) -> str:
    parameters: dict[str, str] = {
        "MAXREC": str(max_records),
        "POS": f"CIRCLE {ra_deg:.10f} {dec_deg:.10f} {radius_deg:.10f}",
        "FORMAT": "image/fits",
    }
    if collection:
        parameters["COLLECTION"] = collection
    return "https://mast.stsci.edu/vo-sia/api/v0.1/query?" + urlencode(parameters)


def _irsa_url(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float,
    max_records: int,
    collection: str | None,
) -> str:
    parameters: dict[str, str] = {
        "MAXREC": str(max_records),
        "POS": f"CIRCLE {ra_deg:.10f} {dec_deg:.10f} {radius_deg:.10f}",
        "DPTYPE": "image",
        "FORMAT": "image/fits",
    }
    if collection:
        parameters["COLLECTION"] = collection
    return "https://irsa.ipac.caltech.edu/SIA?" + urlencode(parameters)


def _noirlab_url(
    ra_deg: float,
    dec_deg: float,
    radius_deg: float,
    max_records: int,
    collection: str | None,
) -> str:
    endpoint = collection or "calibrated_all"
    if not endpoint.replace("_", "").replace("-", "").isalnum():
        raise ValueError("invalid NOIRLab SIA collection")
    return f"https://datalab.noirlab.edu/sia/{endpoint}?" + urlencode(
        {
            "POS": f"{ra_deg:.10f},{dec_deg:.10f}",
            "SIZE": f"{radius_deg * 2:.10f}",
            "FORMAT": "ALL",
            "MAXREC": str(max_records),
        }
    )


def discovery_url(
    provider_id: str,
    ra_deg: float,
    dec_deg: float,
    radius_deg: float,
    max_records: int,
    collection: str | None = None,
) -> str:
    if provider_id not in PROVIDERS:
        raise ValueError(f"unknown public archive provider: {provider_id}")
    if not (0 <= ra_deg < 360 and -90 <= dec_deg <= 90 and 0 < radius_deg <= 10):
        raise ValueError("invalid public archive cone search")
    if not 1 <= max_records <= 1000:
        raise ValueError("max_records must be between 1 and 1000")
    if provider_id == "eso":
        return _eso_url(ra_deg, dec_deg, radius_deg, max_records)
    if provider_id == "mast":
        return _mast_url(ra_deg, dec_deg, radius_deg, max_records, collection)
    if provider_id == "irsa":
        return _irsa_url(ra_deg, dec_deg, radius_deg, max_records, collection)
    return _noirlab_url(ra_deg, dec_deg, radius_deg, max_records, collection)


def discover_public_archive(
    provider_id: str,
    ra_deg: float,
    dec_deg: float,
    radius_deg: float,
    max_records: int,
    *,
    collection: str | None = None,
    timeout_seconds: int = 60,
) -> list[PublicArchiveCandidate]:
    if provider_id not in PROVIDERS:
        raise ValueError(f"unknown public archive provider: {provider_id}")
    if not (0 <= ra_deg < 360 and -90 <= dec_deg <= 90 and 0 < radius_deg <= 10):
        raise ValueError("invalid public archive cone search")
    if not 1 <= max_records <= 1000:
        raise ValueError("max_records must be between 1 and 1000")
    if provider_id == "mast":
        return _discover_mast_caom(
            ra_deg,
            dec_deg,
            radius_deg,
            max_records,
            collection,
            timeout_seconds,
        )

    url = discovery_url(
        provider_id,
        ra_deg,
        dec_deg,
        radius_deg,
        max_records,
        collection,
    )
    rows = _rows_from_votable(_https_get(url, timeout_seconds))
    candidates: list[PublicArchiveCandidate] = []
    seen: set[str] = set()
    for row in rows:
        candidate = _normalize_row(provider_id, row)
        if candidate is None:
            continue
        if provider_id == "irsa":
            candidate = _irsa_ibe_cutout_candidate(candidate, ra_deg, dec_deg, radius_deg)
        identity = f"{candidate.provider_id}:{candidate.provider_record_id}"
        if identity in seen:
            continue
        seen.add(identity)
        candidates.append(candidate)
        if len(candidates) >= max_records:
            break
    return candidates


def _resolve_eso_datalink(candidate: PublicArchiveCandidate, timeout_seconds: int) -> str:
    rows = _rows_from_votable(_https_get(candidate.access_url, timeout_seconds))
    for row in rows:
        semantics = (_as_text(_pick(row, "semantics")) or "").lower()
        content_type = (_as_text(_pick(row, "content_type", "contenttype")) or "").lower()
        access_url = _as_text(_pick(row, "access_url", "accessurl"))
        if access_url and semantics.endswith("#this") and (
            "fits" in content_type or access_url.lower().endswith((".fits", ".fits.gz", ".fz"))
        ):
            return access_url
    raise ValueError("ESO DataLink response has no downloadable FITS science file")


def resolved_download_url(
    candidate: PublicArchiveCandidate,
    *,
    timeout_seconds: int = 60,
) -> str:
    if not candidate.redistribution_allowed:
        raise PermissionError("archive candidate is not approved for redistribution")
    url = candidate.access_url
    access_format = (candidate.access_format or "").lower()
    if candidate.provider_id == "eso" and "datalink" in access_format:
        url = _resolve_eso_datalink(candidate, timeout_seconds)
    parsed = urlparse(url)
    policy = PROVIDERS[candidate.provider_id]
    if parsed.scheme != "https" or parsed.hostname not in policy.allowed_hosts:
        raise ValueError("archive download redirected outside the provider allowlist")
    return url


def candidate_as_json(candidate: PublicArchiveCandidate) -> str:
    return json.dumps(
        {
            "provider_id": candidate.provider_id,
            "collection_id": candidate.collection_id,
            "provider_record_id": candidate.provider_record_id,
            "access_url": candidate.access_url,
            "access_format": candidate.access_format,
            "data_rights": candidate.data_rights,
            "rights_uri": candidate.rights_uri,
            "attribution_text": candidate.attribution_text,
            "redistribution_allowed": candidate.redistribution_allowed,
            "dataproduct_type": candidate.dataproduct_type,
            "calibration_level": candidate.calibration_level,
            "ra_deg": candidate.ra_deg,
            "dec_deg": candidate.dec_deg,
            "spatial_resolution_arcsec": candidate.spatial_resolution_arcsec,
            "em_min_m": candidate.em_min_m,
            "em_max_m": candidate.em_max_m,
            "observed_mjd": candidate.observed_mjd,
            "exposure_s": candidate.exposure_s,
            "facility": candidate.facility,
            "instrument": candidate.instrument,
            "target_name": candidate.target_name,
            "source_filename": candidate.source_filename,
        },
        separators=(",", ":"),
        sort_keys=True,
    )


def provider_ids() -> Iterable[str]:
    return PROVIDERS.keys()
