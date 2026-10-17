from pathlib import Path
import subprocess

from astropy.io import fits
import pytest

from sky_worker.astrometry import solve_astrometry


def test_catalogue_hints_and_downsampling(monkeypatch):
    commands = []

    def fake_solver(command, **kwargs):
        commands.append((command, kwargs))
        return subprocess.CompletedProcess(command, 1, stdout=b"", stderr=b"no matching stars")

    monkeypatch.setattr(subprocess, "run", fake_solver)
    with pytest.raises(RuntimeError, match="no matching stars"):
        solve_astrometry(
            Path("source.jpg"), fits.Header(), 6500, 4300,
            hint_ra_deg=10.6847, hint_dec_deg=41.2692,
        )
    command, options = commands[0]
    assert command[command.index("--ra") + 1] == "10.6847"
    assert command[command.index("--dec") + 1] == "41.2692"
    assert command[command.index("--radius") + 1] == "5.0"
    assert command[command.index("--downsample") + 1] == "4"
    assert options["timeout"] == 195


@pytest.mark.parametrize("ra,dec,radius", [
    (10.0, None, 5.0),
    (float("nan"), 41.0, 5.0),
    (361.0, 41.0, 5.0),
    (10.0, 91.0, 5.0),
    (10.0, 41.0, 0.0),
])
def test_invalid_hints_fail_closed(monkeypatch, ra, dec, radius):
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("solver must not run")),
    )
    with pytest.raises(ValueError):
        solve_astrometry(
            Path("unverified.jpg"), fits.Header(), 6000, 4000,
            hint_ra_deg=ra, hint_dec_deg=dec, hint_radius_deg=radius,
        )
