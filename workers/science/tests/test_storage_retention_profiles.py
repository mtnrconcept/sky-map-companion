from typing import Any

from sky_worker.ivoa_contract import HIPS_DEEP_CURRENT_POINTER, HIPS_DEEP_STORAGE_PREFIX
from sky_worker.storage_retention import prune_ivoa_profile


class EmptyDeepBucket:
    def list(self, prefix: str, options: dict[str, Any]) -> list[dict[str, Any]]:
        assert prefix == HIPS_DEEP_STORAGE_PREFIX
        return []


def test_unpublished_deep_profile_is_a_safe_noop() -> None:
    result = prune_ivoa_profile(EmptyDeepBucket(), "deep", apply=True)

    assert result == {
        "status": "not-published",
        "profile": "deep",
        "storage_prefix": HIPS_DEEP_STORAGE_PREFIX,
        "current_pointer": HIPS_DEEP_CURRENT_POINTER,
        "deleted_objects": 0,
        "deleted_bytes": 0,
    }
