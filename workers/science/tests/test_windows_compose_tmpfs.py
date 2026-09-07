from pathlib import Path


def test_windows_compose_keeps_root_read_only_but_mounts_writable_temp_filesystems():
    compose = (Path(__file__).resolve().parents[1] / "compose.windows.yml").read_text(encoding="utf-8")

    assert "read_only: true" in compose
    assert "tmpfs:" in compose
    assert "- /tmp" in compose
    assert "- /var/tmp" in compose
