from __future__ import annotations

import pytest

from sky_worker.hips_geometry import HIPS_PIXEL_GEOMETRY_VERSION
from sky_worker import public_sky_repair


class GatewayStub:
    def __init__(self):
        self.calls = []

    def execute(self, sql, params):
        self.calls.append((sql, params))
        return [{"slug": "sky-ps1-r-o4-1", "generation": 1}]


def test_only_versioned_legacy_seed_candidates_are_scanned():
    gateway = GatewayStub()
    rows = public_sky_repair.find_legacy_seed_layers(gateway, max_candidates=11)
    assert rows[0]["slug"] == "sky-ps1-r-o4-1"
    sql, params = gateway.calls[0]
    assert "g.recipe->>'hips_pixel_geometry_version'" in sql
    assert "g.status='complete'" in sql
    assert params == (HIPS_PIXEL_GEOMETRY_VERSION, 11)


def test_repair_is_bounded_and_does_not_block_every_other_field(monkeypatch):
    gateway = GatewayStub()
    candidates = [{"slug": f"sky-ps1-r-o4-{i}"} for i in range(5)]
    monkeypatch.setattr(public_sky_repair, "find_legacy_seed_layers", lambda _gateway: candidates)
    processed = []

    def repair(_gateway, source, _workdir):
        processed.append(source["slug"])
        if source["slug"].endswith("-0"):
            raise RuntimeError("missing source FITS")
        return {"slug": source["slug"], "tiles": 25}

    monkeypatch.setattr(public_sky_repair, "repair_legacy_seed_layer", repair)
    results = public_sky_repair.repair_current_seeds(gateway, max_layers=2)
    assert len(results) == 2
    assert processed == ["sky-ps1-r-o4-0", "sky-ps1-r-o4-1", "sky-ps1-r-o4-2"]
    with pytest.raises(ValueError, match="max_layers"):
        public_sky_repair.repair_current_seeds(gateway, max_layers=20)
