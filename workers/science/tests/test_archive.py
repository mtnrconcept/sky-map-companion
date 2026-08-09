import json
from types import SimpleNamespace
from uuid import uuid4

from sky_worker.archive import PS1Archive, SkyPosition, parse_ps1_filename_table, target_grid
from sky_worker.archive_ingest import (
    ASTROMETRY_PROCESS_ERROR_DETAIL_LIKE,
    FINITE_PIXEL_ERROR_DETAIL,
    JSON_ADAPTER_ERROR_DETAIL_LIKE,
    LEGACY_PS1_REJECTION_REASON,
    _enqueue_and_wait_for_mosaic,
    _prepare_incremental_archive_run,
    _reset_recoverable_archive_failures,
    _wait_for_qualification,
    parser,
)


def test_target_grid_starts_near_center_and_covers_requested_extent():
    positions = target_grid(10.6847, 41.2692, 60, 30, 2400)
    assert len(positions) >= 20
    assert abs(positions[0].ra_deg - 10.6847) < 0.2
    assert abs(positions[0].dec_deg - 41.2692) < 0.2
    assert max(item.dec_deg for item in positions) - min(item.dec_deg for item in positions) >= 0.3


def test_target_grid_handles_ra_wraparound():
    positions = target_grid(359.99, 0, 30, 10, 2400)
    assert all(0 <= item.ra_deg < 360 for item in positions)
    assert any(item.ra_deg < 1 for item in positions)


def test_parse_ps1_filename_table_reads_official_columns():
    body = """projcell subcell ra dec filter mjd type filename shortname
1725 51 10.7 41.2 g 0.0 stack /rings.v3.skycell/1725/051/g.fits g.fits
1725 51 10.7 41.2 r 0.0 stack /rings.v3.skycell/1725/051/r.fits r.fits
"""
    rows = parse_ps1_filename_table(body)
    assert [row["filter"] for row in rows] == ["g", "r"]
    assert rows[1]["filename"].endswith("/r.fits")


def test_ps1_discovery_builds_stable_https_cutout(monkeypatch):
    archive = PS1Archive(request_delay_seconds=0)
    monkeypatch.setattr(
        archive,
        "_text",
        lambda _url: (
            "projcell subcell ra dec filter mjd type filename shortname\n"
            "1725 51 10.7 41.2 r 0.0 stack /rings.v3.skycell/1725/051/r.fits r.fits\n"
        ),
    )
    first = archive.discover([SkyPosition(10.6847, 41.2692)], "r", 2400, 1)[0]
    second = archive.discover([SkyPosition(10.6847, 41.2692)], "r", 2400, 1)[0]
    assert first.record_id == second.record_id
    assert first.remote_url.startswith("https://ps1images.stsci.edu/cgi-bin/fitscut.cgi?")
    assert "format=fits" in first.remote_url
    assert first.calibration_level == 3


def test_ps1_discovery_skips_known_record_and_continues_to_limit(monkeypatch):
    archive = PS1Archive(request_delay_seconds=0)
    monkeypatch.setattr(
        archive,
        "_text",
        lambda _url: (
            "projcell subcell ra dec filter mjd type filename shortname\n"
            "1725 51 10.7 41.2 r 0.0 stack /rings.v3.skycell/1725/051/r.fits r.fits\n"
        ),
    )
    first_position = SkyPosition(10.6847, 41.2692)
    second_position = SkyPosition(10.8, 41.2692)
    known = archive.discover([first_position], "r", 2400, 1)[0]

    candidates = archive.discover(
        [first_position, second_position],
        "r",
        2400,
        1,
        excluded_record_ids={known.record_id},
    )

    assert len(candidates) == 1
    assert candidates[0].ra_deg == second_position.ra_deg
    assert candidates[0].record_id != known.record_id


def test_ps1_discovery_rejects_unknown_filter():
    archive = PS1Archive(request_delay_seconds=0)
    try:
        archive.discover([SkyPosition(10, 20)], "h", 2400, 1)
    except ValueError as error:
        assert "grizy" in str(error)
    else:
        raise AssertionError("unknown filter was accepted")


def test_incremental_run_reuses_qualified_sources_and_skips_all_known_records():
    class Gateway:
        def __init__(self):
            self.executions = []

        def execute(self, query, parameters=()):
            self.executions.append((query, parameters))
            if "select distinct archive_record_id" in query:
                return [
                    {"archive_record_id": "known-published"},
                    {"archive_record_id": "known-rejected"},
                ]
            if "select count(*)::integer as count from inserted" in query:
                return [{"count": 1}]
            raise AssertionError(f"unexpected query: {query}")

    gateway = Gateway()
    run_id = uuid4()
    reused_count, known_record_ids = _prepare_incremental_archive_run(
        gateway,
        run_id,
        "M31",
        "r",
    )

    assert reused_count == 1
    assert known_record_ids == {"known-published", "known-rejected"}
    reuse_query, reuse_parameters = gateway.executions[1]
    assert "u.status in ('approved','published','stacked')" in reuse_query
    assert "u.rejected=false and u.deleted_at is null" in reuse_query
    assert "'reused previously qualified archive record'" in reuse_query
    assert reuse_parameters == ("M31", "r", run_id, run_id)


def test_retry_can_watch_and_build_the_existing_mosaic_run():
    args = parser().parse_args(
        ["retry", "--object-id", "M31", "--filter", "r", "--watch", "--build-mosaic"]
    )

    assert args.command == "retry"
    assert args.object_id == "M31"
    assert args.watch is True
    assert args.build_mosaic is True


def test_rebuild_uses_only_the_existing_qualified_run():
    args = parser().parse_args(
        [
            "rebuild",
            "--object-id",
            "M31",
            "--expected-sources",
            "13",
            "--inline-worker",
        ]
    )

    assert args.command == "rebuild"
    assert args.object_id == "M31"
    assert args.expected_sources == 13
    assert args.inline_worker is True


def test_inline_rebuild_is_isolated_and_can_reopen_its_idempotent_job():
    class Gateway:
        def __init__(self):
            self.config = SimpleNamespace(pipeline_version="science-v1")
            self.executions = []

        def execute(self, query, parameters=()):
            self.executions.append((query, parameters))
            if "insert into public.processing_jobs" in query:
                return [
                    {
                        "id": uuid4(),
                        "status": "published",
                        "completed_at": "2026-08-09T17:00:00Z",
                    }
                ]
            return []

    gateway = Gateway()
    _enqueue_and_wait_for_mosaic(
        gateway,
        uuid4(),
        "M31",
        "r",
        60,
        expected_sources=13,
        inline_worker=True,
    )

    query, parameters = gateway.executions[0]
    payload = json.loads(parameters[1])
    assert payload["lease_scope"] == "inline"
    assert payload["mode"] == "build_archive_v9"
    assert payload["expected_sources"] == 13
    assert "existing.payload->>'retry_state'='approved'" in query
    assert "excluded.payload->>'lease_scope'='inline'" in query
    assert "completed_at=null" in query
    assert "attempts=0" in query
    assert "max_attempts=excluded.max_attempts" in query
    assert "existing.attempts < existing.max_attempts" not in query
    assert "where existing.status='failed'" in query


class RecordingCursor:
    def __init__(self):
        self.executions = []

    def execute(self, query, parameters):
        self.executions.append((query, parameters))

    def fetchone(self):
        return {"count": 23}


def test_retry_parameterizes_all_percent_wildcards_for_psycopg3():
    cursor = RecordingCursor()

    assert _reset_recoverable_archive_failures(cursor, "run-1") == 23
    query, parameters = cursor.executions[0]
    assert "j.error_detail like %s" in query
    assert "j.status='failed' and j.error_code='VALUEERROR'" in query
    assert "j.status='rejected' and u.rejection_reason=%s" in query
    assert "%dict%" not in query
    assert "%solve-field%" not in query
    assert parameters == (
        "run-1",
        JSON_ADAPTER_ERROR_DETAIL_LIKE,
        ASTROMETRY_PROCESS_ERROR_DETAIL_LIKE,
        FINITE_PIXEL_ERROR_DETAIL,
        LEGACY_PS1_REJECTION_REASON,
    )


def test_qualification_watch_fails_fast_after_retry_exhaustion():
    class ExhaustedGateway:
        calls = 0

        def execute(self, _query, _parameters):
            self.calls += 1
            if self.calls == 1:
                return [{"status": "extracting", "count": 23}]
            return [{"count": 23, "error_codes": "CALLEDPROCESSERROR"}]

    try:
        _wait_for_qualification(ExhaustedGateway(), "run-1", 60)
    except RuntimeError as error:
        assert "23 archive qualification jobs exhausted retries" in str(error)
        assert "CALLEDPROCESSERROR" in str(error)
    else:
        raise AssertionError("retry exhaustion did not stop the watcher")
