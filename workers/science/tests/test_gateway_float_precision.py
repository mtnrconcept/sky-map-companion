from types import SimpleNamespace

from psycopg.rows import dict_row

from sky_worker.gateway import Gateway


def test_gateway_connection_forces_round_trip_safe_float_output(monkeypatch):
    captured: dict[str, object] = {}

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

    def fake_connect(database_url, **kwargs):
        captured["database_url"] = database_url
        captured.update(kwargs)
        return FakeConnection()

    monkeypatch.setattr("sky_worker.gateway.psycopg.connect", fake_connect)

    gateway = object.__new__(Gateway)
    gateway.config = SimpleNamespace(database_url="postgresql://example.invalid/postgres")

    with gateway.connection() as connection:
        assert isinstance(connection, FakeConnection)

    assert captured["database_url"] == "postgresql://example.invalid/postgres"
    assert captured["row_factory"] is dict_row
    assert captured["options"] == "-c extra_float_digits=3"
