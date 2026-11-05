"""Regression: global aggregation waits until source tiles have matching HiPS geometry."""
from __future__ import annotations

import argparse

from sky_worker.hips_geometry import HIPS_PIXEL_GEOMETRY_VERSION
from sky_worker import public_sky_loworder


class FakeGateway:
    def __init__(self, pending: int):
        self.pending = pending
        self.sql_queries = []

    def execute(self, statement, params=None):
        self.sql_queries.append((statement, params))
        return [{"pending": self.pending}]


def test_pending_geometry_query_is_versioned():
    gateway = FakeGateway(288)
    assert public_sky_loworder.pending_geometry_repairs(gateway) == 288
    sql, params = gateway.sql_queries[0]
    assert params == (HIPS_PIXEL_GEOMETRY_VERSION,)
    assert "hips_pixel_geometry_version" in sql
    assert "^sky-ps1-" in sql


def test_aggregate_returns_without_downloads_while_legacy_sources_exist(monkeypatch):
    gateway = FakeGateway(100)
    monkeypatch.setattr(public_sky_loworder.Config, "from_environment", lambda: object())
    monkeypatch.setattr(public_sky_loworder, "CatalogGateway", lambda _config: gateway)
    called = []
    monkeypatch.setattr(
        public_sky_loworder, "rebuild_global_low_order", lambda *_args: called.append("aggregate")
    )
    monkeypatch.setattr(
        public_sky_loworder, "rebuild_global_allsky_from_aggregate",
        lambda *_args: called.append("allsky"),
    )
    assert public_sky_loworder.refresh(argparse.Namespace(filter="r", if_caught_up=True)) == 0
    assert called == []


def test_aggregate_resumes_once_all_sources_are_repaired(monkeypatch):
    gateway = FakeGateway(0)
    monkeypatch.setattr(public_sky_loworder.Config, "from_environment", lambda: object())
    monkeypatch.setattr(public_sky_loworder, "CatalogGateway", lambda _config: gateway)
    called = []
    monkeypatch.setattr(
        public_sky_loworder,
        "rebuild_global_low_order",
        lambda *_args: (called.append("aggregate") or {"generation_id": "new"}),
    )
    monkeypatch.setattr(
        public_sky_loworder,
        "rebuild_global_allsky_from_aggregate",
        lambda *_args: (called.append("allsky") or {"sha256": "test"}),
    )
    assert public_sky_loworder.refresh(argparse.Namespace(filter="r", if_caught_up=True)) == 0
    assert called == ["aggregate", "allsky"]
