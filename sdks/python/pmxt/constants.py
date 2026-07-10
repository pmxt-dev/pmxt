"""
Shared URL and environment-variable constants for the pmxt SDK.

These are deliberately plain module-level constants (no runtime logic
beyond the small :func:`resolve_pmxt_base_url` helper) so they can be
imported from any submodule without creating import cycles.
"""

from __future__ import annotations

import os
from typing import Mapping, NamedTuple, Optional
from types import SimpleNamespace

#: The hosted pmxt production endpoint.
#:
#: Exchange classes and :class:`pmxt.Router` default to this URL whenever a
#: hosted pmxt API key is supplied (via ``pmxt_api_key`` kwarg or the
#: ``PMXT_API_KEY`` environment variable) AND no explicit ``base_url`` /
#: ``PMXT_BASE_URL`` is configured.
HOSTED_URL: str = "https://api.pmxt.dev"

#: The local sidecar default.
#:
#: This is the URL the SDK uses when no hosted key and no explicit override
#: are present. It matches the port that the pmxt-core sidecar listens on
#: by default.
LOCAL_URL: str = "http://localhost:3847"

#: Environment variable names. Centralised so tests and docs can reference
#: a single source of truth.
ENV = SimpleNamespace(BASE_URL="PMXT_BASE_URL", API_KEY="PMXT_API_KEY")
ENV_BASE_URL = ENV.BASE_URL
ENV_API_KEY = ENV.API_KEY


class ResolvedBaseUrl(NamedTuple):
    """Result of :func:`resolve_pmxt_base_url`."""

    base_url: str
    pmxt_api_key: Optional[str]
    is_hosted: bool


def resolve_pmxt_base_url(
    base_url: Optional[str] = None,
    pmxt_api_key: Optional[str] = None,
    env: Optional[Mapping[str, str]] = None,
) -> ResolvedBaseUrl:
    """Resolve the effective base URL for an SDK client.

    Precedence (highest first):

    1. Explicit ``base_url`` argument.
    2. ``PMXT_BASE_URL`` environment variable.
    3. If a hosted API key is present (argument or ``PMXT_API_KEY`` env),
       default to :data:`HOSTED_URL`.
    4. Otherwise, :data:`LOCAL_URL`.

    The returned ``is_hosted`` flag is ``True`` iff the resolved URL is
    anything other than the local sidecar default.
    """
    environ: Mapping[str, str] = env if env is not None else os.environ
    resolved_key = pmxt_api_key or environ.get(ENV_API_KEY) or None

    if base_url:
        return ResolvedBaseUrl(base_url, resolved_key, base_url != LOCAL_URL)

    env_base = environ.get(ENV_BASE_URL)
    if env_base:
        return ResolvedBaseUrl(env_base, resolved_key, env_base != LOCAL_URL)

    if resolved_key:
        return ResolvedBaseUrl(HOSTED_URL, resolved_key, True)

    return ResolvedBaseUrl(LOCAL_URL, None, False)


#: Known PreFundedEscrow contract addresses on Polygon (chain 137).
#:
#: Hosted typed-data validation accepts these addresses as EIP-712
#: ``verifyingContract`` values.
PREFUNDED_ESCROW_ADDRESSES: frozenset[str] = frozenset({
    "0x3ad326f78b1390b9a5dc5f00e7f62f8632de23e2",
})

#: Known VenueEscrow contract addresses on BSC (chain 56).
VENUE_ESCROW_ADDRESSES: frozenset[str] = frozenset({
    "0x6a273643d84edbb603b808d8a724fb963c7a298a",
})

#: Limitless VenueEscrow on Base (chain 8453).
LIMITLESS_VENUE_ESCROW_ADDRESSES: frozenset[str] = frozenset({
    "0x34c42d01aad6ded00f1a6830d90b0e9204db7855",
})
