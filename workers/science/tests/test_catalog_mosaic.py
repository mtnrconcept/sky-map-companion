from __future__ import annotations

from sky_worker.catalog_mosaic import _next_object_id, parser


class StubGateway:
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.queries: list[str] = []

    def execute(self, query: str, _parameters: tuple = ()) -> list[dict]:
        self.queries.append(query)
        return self.rows


def test_next_object_uses_database_rotation_order() -> None:
    gateway = StubGateway([{"id": "M42"}])

    assert _next_object_id(gateway) == "M42"
    assert "last_run_at asc nulls first" in gateway.queries[0]
    assert "source_id='mast-ps1'" in gateway.queries[0]


def test_build_parser_requires_explicit_object() -> None:
    args = parser().parse_args(["build", "--object-id", "M51", "--max-files", "3"])

    assert args.object_id == "M51"
    assert args.max_files == 3
    assert args.filter == "r"


def test_build_next_parser_selects_object_later() -> None:
    args = parser().parse_args(["build-next", "--filter", "i"])

    assert args.object_id is None
    assert args.filter == "i"
    assert args.max_files == 4
