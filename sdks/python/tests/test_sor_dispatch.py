"""Dispatch wiring tests for the hosted SOR order escape path.

These tests verify that ``create_order`` on a hosted
``Exchange(exchange_name="sor")`` client forwards the caller-supplied
market/outcome identifiers into the ``/api/sor/buildOrder`` request body for
every call shape (explicit ``market_id``/``outcome_id`` and the ``outcome=``
``MarketOutcome`` shorthand). They deliberately mock the lowest reasonable
HTTP layer for this code path (the ``requests`` calls made inside
``_execute_sor_order`` and ``_discover_hosted_account``) so the SDK's real
request construction runs end-to-end without hitting the network.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

import pytest
import requests

from pmxt.client import Exchange
from pmxt.models import MarketOutcome


PMXT_API_KEY = "test_pmxt_key_xxx"
PRIVATE_KEY = "0x" + "aa" * 32
MARKET_ID = "663583"
OUTCOME_ID = (
    "109918491002757971128382877245540674222904658464100708363625306033376633332"
)


class _FakeResponse:
    """Minimal stand-in for a ``requests.Response``."""

    def __init__(self, payload: Dict[str, Any], status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.ok = status_code < 400
        self.text = json.dumps(payload)

    def json(self) -> Dict[str, Any]:
        return self._payload


def _install_sor_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> List[Tuple[str, Dict[str, Any]]]:
    """Patch ``requests.get``/``requests.post`` and capture every POST body."""
    captured: List[Tuple[str, Dict[str, Any]]] = []

    def fake_get(url: str, **kwargs: Any) -> _FakeResponse:
        # Hosted account discovery: no deposit wallet configured.
        return _FakeResponse({}, status_code=503)

    def fake_post(url: str, **kwargs: Any) -> _FakeResponse:
        captured.append((url, kwargs["json"]))
        if url.endswith("/api/sor/buildOrder"):
            return _FakeResponse({
                "data": {"orderId": "sor-order-1", "legs": []},
            })
        return _FakeResponse({
            "data": {
                "id": "sor-order-1",
                "status": "filled",
                "filled_shares": 5.0,
                "average_price": 0.55,
                "fee_amount": 0,
            },
        })

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(requests, "post", fake_post)
    return captured


def _make_sor_exchange(monkeypatch: pytest.MonkeyPatch) -> Exchange:
    """Construct a hosted sor-mode client with a private key, no sidecar."""
    monkeypatch.delenv("PMXT_API_KEY", raising=False)
    monkeypatch.delenv("PMXT_BASE_URL", raising=False)
    return Exchange(
        exchange_name="sor",
        pmxt_api_key=PMXT_API_KEY,
        private_key=PRIVATE_KEY,
        # Stub signer satisfies the hosted signer gate without eth-account.
        signer=object(),
        auto_start_server=False,
    )


class TestSorCreateOrderDispatch:
    """create_order must forward the outcome identifier on every call shape."""

    def test_explicit_market_and_outcome_ids_reach_build_order(self, monkeypatch):
        captured = _install_sor_transport(monkeypatch)
        api = _make_sor_exchange(monkeypatch)

        api.create_order(
            market_id=MARKET_ID,
            outcome_id=OUTCOME_ID,
            side="buy",
            order_type="limit",
            amount=5,
            price=0.55,
        )

        assert len(captured) == 2
        build_url, build_body = captured[0]
        assert build_url.endswith("/api/sor/buildOrder")
        args = build_body["args"][0]
        assert args["outcomeId"] == OUTCOME_ID
        assert args["marketId"] == MARKET_ID
        assert args["side"] == "buy"
        assert args["shares"] == 5
        assert args["price"] == 0.55

    def test_outcome_shorthand_still_reaches_build_order(self, monkeypatch):
        captured = _install_sor_transport(monkeypatch)
        api = _make_sor_exchange(monkeypatch)

        api.create_order(
            outcome=MarketOutcome(
                outcome_id=OUTCOME_ID,
                label="Yes",
                price=0.55,
                market_id=MARKET_ID,
            ),
            side="buy",
            order_type="market",
            amount=5,
        )

        assert len(captured) == 2
        build_url, build_body = captured[0]
        assert build_url.endswith("/api/sor/buildOrder")
        args = build_body["args"][0]
        assert args["outcomeId"] == OUTCOME_ID
        assert args["marketId"] == MARKET_ID
