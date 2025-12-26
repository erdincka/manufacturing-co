# backend/state.py
from typing import Optional, Dict, Any

_PROFILE_CACHE: Optional[Dict[str, Any]] = None


def get_cached_profile() -> Optional[Dict[str, Any]]:
    return _PROFILE_CACHE


def set_cached_profile(profile: Optional[Dict[str, Any]]):
    global _PROFILE_CACHE
    _PROFILE_CACHE = profile


def invalidate_profile_cache():
    global _PROFILE_CACHE
    _PROFILE_CACHE = None
