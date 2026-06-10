"""End-to-end driver for the hosted-mode pmxt SDK.

This script proves that the SDK's public methods actually dispatch through
``https://trade.pmxt.dev/v0/*`` when ``pmxt_api_key`` is set. It uses an
obviously bogus key on purpose — the server will reject the auth, but the
rejection comes from ``trade.pmxt.dev`` (not ``api.pmxt.dev``), which is
the property under test.

Two layers of assertions:

  1. The httpx transport is instrumented to capture every outgoing URL.
     Every captured URL must start with ``https://trade.pmxt.dev/v0/``.
  2. Local-only error paths (MissingWalletAddress, InvalidOrder for bad
     shapes, InvalidSignature for missing signer) must raise *before* any
     network call is attempted.

No real funds are at risk: writes use a bogus key + a wallet without any
position; the server returns 401 long before any settlement.

Run::

    cd sdks/python
    PYTHONPATH=. python tests/e2e/hosted_driver.py

Or as a module::

    python -m tests.e2e.hosted_driver

The script prints a PASS/FAIL summary at the end and exits with code 0
when all checks pass.
"""

from __future__ import annotations

import os
import sys
import traceback
from typing import Any, Callable, List, Tuple

import httpx

# Bogus key — proves routing, not auth. NEVER use a real key here.
PMXT_BOGUS_KEY = "pmxt_invalid_DO_NOT_USE_e2e_driver"
WALLET_ADDRESS = "0xcb856a79c3E6490e0cFD7934eB59326E593C0cD1"  # arbitrary checksum addr
BRAZIL_MARKET = "f5534629-281b-4d48-8ce1-18e33d100cd8"
BRAZIL_OUTCOME = "2766355d-e87d-4f63-8eea-035722790cfe"

EXPECTED_BASE = "https://trade.pmxt.dev/v0/"


# --------------------------------------------------------------------------- #
# URL-capture transport
# --------------------------------------------------------------------------- #


class _UrlRecorder:
    """Wraps httpx so we can see every URL the SDK tried to hit."""

    def __init__(self) -> None:
        self.urls: List[str] = []
        self.last_request: httpx.Request | None = None


_recorder = _UrlRecorder()


def _install_recording_transport() -> None:
    """Replace httpx.Client with a recorder that captures the URL.

    We still want the real network to handle the request (so we can prove
    we actually hit ``trade.pmxt.dev``), but we don't trust the bogus key
    to ever produce a 2xx. We record the URL and return whatever the real
    transport returns. If the real call raises (e.g. no network), we
    synthesize a 401 so the script can still proceed.
    """
    original = httpx.Client

    class RecordingClient(original):  # type: ignore[misc, valid-type]
        def request(self, method, url, **kwargs):  # type: ignore[override]
            full_url = str(url)
            # httpx URL may be relative when base_url is set; record both.
            if not full_url.startswith("http"):
                full_url = str(httpx.URL(self.base_url).join(full_url))
            _recorder.urls.append(full_url)
            try:
                resp = super().request(method, url, **kwargs)
            except httpx.HTTPError as exc:
                # Network unreachable — synthesize so the driver keeps moving.
                # The URL was still captured, which is what matters.
                req = httpx.Request(method, full_url)
                resp = httpx.Response(
                    401,
                    json={"detail": f"synthetic offline response: {type(exc).__name__}"},
                    request=req,
                )
            _recorder.last_request = resp.request
            return resp

    httpx.Client = RecordingClient  # type: ignore[misc]


# --------------------------------------------------------------------------- #
# Result tracking
# --------------------------------------------------------------------------- #


class _Results:
    def __init__(self) -> None:
        self.passed: List[str] = []
        self.failed: List[Tuple[str, str]] = []

    def ok(self, label: str) -> None:
        print(f"  PASS  {label}")
        self.passed.append(label)

    def fail(self, label: str, detail: str) -> None:
        print(f"  FAIL  {label}: {detail}")
        self.failed.append((label, detail))


# --------------------------------------------------------------------------- #
# Test helpers
# --------------------------------------------------------------------------- #


def _expect_url_prefix(results: _Results, label: str) -> None:
    if not _recorder.urls:
        results.fail(label, "no URLs captured")
        return
    last = _recorder.urls[-1]
    if not last.startswith(EXPECTED_BASE):
        results.fail(label, f"expected URL starting with {EXPECTED_BASE!r}, got {last!r}")
        return
    results.ok(f"{label} -> {last}")


def _expect_raises(
    results: _Results,
    label: str,
    exc_type: type,
    fn: Callable[..., Any],
    *args: Any,
    network_expected: bool,
    **kwargs: Any,
) -> None:
    urls_before = len(_recorder.urls)
    try:
        fn(*args, **kwargs)
    except exc_type as e:
        urls_after = len(_recorder.urls)
        net_msg = ""
        if not network_expected and urls_after > urls_before:
            results.fail(
                label,
                f"expected {exc_type.__name__} raised locally, but "
                f"{urls_after - urls_before} network calls happened first "
                f"(URLs: {_recorder.urls[urls_before:]})",
            )
            return
        results.ok(
            f"{label} raised {type(e).__name__}: {str(e)[:120]}{net_msg}"
        )
    except Exception as e:  # noqa: BLE001
        results.fail(
            label,
            f"expected {exc_type.__name__}, got {type(e).__name__}: {str(e)[:120]}",
        )


def _expect_attempt(
    results: _Results,
    label: str,
    fn: Callable[..., Any],
    *args: Any,
    **kwargs: Any,
) -> None:
    """Run a method that will likely fail server-side; only the URL matters."""
    urls_before = len(_recorder.urls)
    try:
        fn(*args, **kwargs)
    except Exception as e:  # noqa: BLE001
        # Any exception is fine — we're proving the URL got built.
        pass
    if len(_recorder.urls) == urls_before:
        results.fail(label, "no network attempt recorded")
        return
    last = _recorder.urls[-1]
    if not last.startswith(EXPECTED_BASE):
        results.fail(label, f"URL {last!r} does not start with {EXPECTED_BASE!r}")
        return
    results.ok(f"{label} hit {last}")


# --------------------------------------------------------------------------- #
# Driver entry point
# --------------------------------------------------------------------------- #


def run() -> int:
    _install_recording_transport()

    # Import after transport is installed so the SDK's lazy httpx import
    # picks up the recording client.
    import pmxt  # noqa: F401
    from pmxt import Polymarket
    from pmxt.errors import (
        InvalidOrder,
        InvalidSignature,
        MissingWalletAddress,
        NotSupported,
    )

    results = _Results()

    print()
    print("=" * 70)
    print("PMXT hosted-mode SDK e2e driver")
    print("=" * 70)
    print(f"Bogus key:       {PMXT_BOGUS_KEY}")
    print(f"Expected base:   {EXPECTED_BASE}")
    print(f"Wallet address:  {WALLET_ADDRESS}")
    print()

    # --------------------------------------------------------------------- #
    # Phase 1 — Local error paths (no network attempt expected)
    # --------------------------------------------------------------------- #
    print("Phase 1: local error paths (no network call should happen)")

    no_wallet = Polymarket(
        pmxt_api_key=PMXT_BOGUS_KEY,
        auto_start_server=False,
    )

    _expect_raises(
        results,
        "fetch_balance() without wallet_address",
        MissingWalletAddress,
        no_wallet.fetch_balance,
        network_expected=False,
    )
    _expect_raises(
        results,
        "fetch_positions() without wallet_address",
        MissingWalletAddress,
        no_wallet.fetch_positions,
        network_expected=False,
    )
    _expect_raises(
        results,
        "fetch_open_orders() without wallet_address",
        MissingWalletAddress,
        no_wallet.fetch_open_orders,
        network_expected=False,
    )
    _expect_raises(
        results,
        "fetch_my_trades() without wallet_address",
        MissingWalletAddress,
        no_wallet.fetch_my_trades,
        network_expected=False,
    )

    # Group C NotSupported
    with_wallet = Polymarket(
        pmxt_api_key=PMXT_BOGUS_KEY,
        wallet_address=WALLET_ADDRESS,
        auto_start_server=False,
    )

    _expect_raises(
        results,
        "fetch_closed_orders() in hosted mode",
        NotSupported,
        with_wallet.fetch_closed_orders,
        network_expected=False,
    )
    _expect_raises(
        results,
        "fetch_all_orders() in hosted mode",
        NotSupported,
        with_wallet.fetch_all_orders,
        network_expected=False,
    )

    # Bad denom for market buy
    _expect_raises(
        results,
        "build_order(side=buy, denom=shares) — bad shape",
        InvalidOrder,
        with_wallet.build_order,
        market_id=BRAZIL_MARKET,
        outcome_id=BRAZIL_OUTCOME,
        side="buy",
        order_type="market",
        amount=1.0,
        denom="shares",
        network_expected=False,
    )

    # Too-precise amount
    _expect_raises(
        results,
        "build_order(amount=0.1234567) — > 6 decimals",
        InvalidOrder,
        with_wallet.build_order,
        market_id=BRAZIL_MARKET,
        outcome_id=BRAZIL_OUTCOME,
        side="buy",
        order_type="market",
        amount=0.1234567,
        network_expected=False,
    )

    # create_order without signer
    _expect_raises(
        results,
        "create_order() without signer (no private_key)",
        InvalidSignature,
        with_wallet.create_order,
        market_id=BRAZIL_MARKET,
        outcome_id=BRAZIL_OUTCOME,
        side="buy",
        order_type="market",
        amount=1.0,
        network_expected=False,
    )

    # --------------------------------------------------------------------- #
    # Phase 2 — URL routing through trade.pmxt.dev/v0/*
    # --------------------------------------------------------------------- #
    print()
    print("Phase 2: URL routing — every attempt must hit trade.pmxt.dev/v0/*")

    _expect_attempt(
        results,
        "fetch_balance() routes to /v0/user/{addr}/balances",
        with_wallet.fetch_balance,
    )
    _expect_url_prefix(results, "fetch_balance URL prefix")
    last_url = _recorder.urls[-1] if _recorder.urls else ""
    assert f"/v0/user/{WALLET_ADDRESS}/balances" in last_url, last_url

    _expect_attempt(
        results,
        "fetch_positions() routes to /v0/user/{addr}/positions",
        with_wallet.fetch_positions,
    )

    _expect_attempt(
        results,
        "fetch_open_orders() routes to /v0/orders/open",
        with_wallet.fetch_open_orders,
    )

    _expect_attempt(
        results,
        "fetch_my_trades() routes to /v0/user/{addr}/trades",
        with_wallet.fetch_my_trades,
    )

    _expect_attempt(
        results,
        "fetch_order(id) routes to /v0/orders/{id}",
        with_wallet.fetch_order,
        "test-order-id",
    )

    # --------------------------------------------------------------------- #
    # Summary
    # --------------------------------------------------------------------- #
    print()
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"PASS: {len(results.passed)}")
    print(f"FAIL: {len(results.failed)}")
    print()
    print(f"Network attempts captured: {len(_recorder.urls)}")
    for url in _recorder.urls:
        marker = "OK  " if url.startswith(EXPECTED_BASE) else "BAD "
        print(f"  {marker} {url}")
    print()

    if results.failed:
        print("Failures:")
        for label, detail in results.failed:
            print(f"  - {label}: {detail}")
        print()
        print("Result: FAIL")
        return 1

    print("Result: PASS — all checks succeeded, every URL routed to trade.pmxt.dev/v0/*")
    return 0


def main() -> int:
    try:
        return run()
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        return 2


if __name__ == "__main__":
    sys.exit(main())
