from sky_worker.hips import tile_path


def test_tile_paths_are_immutable_and_deterministic():
    assert tile_path("m31-broadband", 3, 8, 12345) == "hips/m31-broadband/3/Norder8/Dir10000/Npix12345.webp"
