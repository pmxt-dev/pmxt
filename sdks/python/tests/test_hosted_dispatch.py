"""Dispatch wiring tests for hosted-mode Polymarket public methods.

These tests verify that ``Polymarket(pmxt_api_key=..., wallet_address=...)``
routes each public SDK method through ``trade.pmxt.dev/v0/*``. They
deliberately mock the lowest reasonable HTTP layer (``httpx.MockTransport``)
so the SDK's real request construction code path is exercised end-to-end
without hitting the network.

Signing validators (typed_data schema, economic match, signature recovery)
are bypassed here because they are covered exhaustively by
``test_hosted_typeddata.py`` and ``test_hosted_signers.py``. The point of
this file is to prove the public-method -> hosted-helper -> URL plumbing.
"""

from __future__ import annotations

import json
from typing import Any, Callable, Dict, List

import httpx
import pytest

from pmxt._hosted_routing import HOSTED_TRADING_BASE_URL
from pmxt._hosted_errors import MissingWalletAddress, NotSupported
from pmxt._exchanges import Hunch, Limitless, Myriad, Polymarket, SuiBets
from pmxt.errors import InvalidSignature
import pmxt.client as client_module
from pmxt.models import BuiltOrder


PMXT_API_KEY = "test_pmxt_key_xxx"
WALLET_ADDRESS = "0x000000000000000000000000000000000000aBc1"
MARKET_ID = "11111111-1111-4111-8111-111111111111"
OUTCOME_ID = "22222222-2222-4222-8222-222222222222"
VENUE_NATIVE_OUTCOME_ID = (
    "0xc704f74e2f9dfae70f770cb253ffadde10768eeab41233098bf5ac67995a94b5"
)


# --------------------------------------------------------------------------- #
# Mock transport helpers
# --------------------------------------------------------------------------- #


def _install_hosted_transport(
    monkeypatch: pytest.MonkeyPatch,
    handler: Callable[[httpx.Request], httpx.Response],
) -> List[httpx.Request]:
    """Install an httpx.MockTransport and capture every outgoing request."""
    captured: List[httpx.Request] = []
    transport = httpx.MockTransport(
        lambda request: captured.append(request) or handler(request)
    )
    original_client = httpx.Client

    def client_factory(*args, **kwargs):
        kwargs = {k: v for k, v in kwargs.items() if k != "transport"}
        client_kwargs = {**kwargs, "transport": transport}
        return original_client(*args, **client_kwargs)

    # Patch httpx.Client at the module that _trading_request will import from.
    monkeypatch.setattr(httpx, "Client", client_factory)
    return captured


def _json_response(payload: Dict[str, Any]) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload, request=request)
    return handler


def _request_body(request: httpx.Request) -> Any:
    if not request.content:
        return None
    return json.loads(request.content.decode("utf-8"))


# --------------------------------------------------------------------------- #
# Mock signer + validator bypass
# --------------------------------------------------------------------------- #


class _MockSigner:
    """Deterministic signer used only to satisfy the ``signer is not None`` gate.

    The actual signature bytes returned here will not pass real EIP-712
    recovery, but ``_install_signing_bypass`` short-circuits the validators
    so dispatch tests can focus on URL routing rather than crypto.
    """

    def __init__(self) -> None:
        self.calls: List[Dict[str, Any]] = []

    def __call__(self, typed_data: Dict[str, Any]) -> str:
        self.calls.append(typed_data)
        # 65 bytes of valid-shape hex so any post-sign length check passes.
        return "0x" + "ab" * 65


def _install_signing_bypass(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bypass typed_data / signature validation for dispatch-level tests."""

    def _noop_validate(*args, **kwargs):
        return None

    def _noop_verify(typed_data, signature, wallet_address):
        return signature

    # ``client.py`` imports these by name, so patch them at the client module.
    monkeypatch.setattr(client_module, "validate_typed_data", _noop_validate)
    monkeypatch.setattr(client_module, "validate_economics", _noop_validate)
    monkeypatch.setattr(client_module, "verify_signature", _noop_verify)


def test_myriad_wallet_address_populates_wallet_slot_not_private_key() -> None:
    client = Myriad(
        wallet_address=WALLET_ADDRESS,
        pmxt_api_key=PMXT_API_KEY,
        auto_start_server=False,
    )

    assert client.wallet_address == WALLET_ADDRESS
    assert client.private_key is None


def _make_polymarket(
    *,
    with_wallet: bool = True,
    with_signer: bool = False,
) -> Polymarket:
    """Construct a hosted-mode Polymarket client without starting a sidecar."""
    kwargs: Dict[str, Any] = {
        "pmxt_api_key": PMXT_API_KEY,
        "auto_start_server": False,
    }
    if with_wallet:
        kwargs["wallet_address"] = WALLET_ADDRESS
    if with_signer:
        kwargs["signer"] = _MockSigner()
    return Polymarket(**kwargs)


def _make_limitless(
    *,
    with_wallet: bool = True,
    with_signer: bool = False,
) -> Limitless:
    """Construct a hosted-mode Limitless client without starting a sidecar."""
    kwargs: Dict[str, Any] = {
        "pmxt_api_key": PMXT_API_KEY,
        "auto_start_server": False,
    }
    if with_wallet:
        kwargs["wallet_address"] = WALLET_ADDRESS
    if with_signer:
        kwargs["signer"] = _MockSigner()
    return Limitless(**kwargs)


def test_hunch_constructor_accepts_wallet_address_for_hosted_mode():
    api = Hunch(
        pmxt_api_key=PMXT_API_KEY,
        wallet_address=WALLET_ADDRESS,
        auto_start_server=False,
    )

    assert api.exchange_name == "hunch"
    assert api.wallet_address == WALLET_ADDRESS


def test_suibets_constructor_accepts_wallet_address_for_hosted_mode() -> None:
    api = SuiBets(
        pmxt_api_key="hosted-key",
        wallet_address=WALLET_ADDRESS,
        auto_start_server=False,
    )

    assert api.wallet_address == WALLET_ADDRESS
    assert api._get_credentials_dict() == {"walletAddress": WALLET_ADDRESS}


# --------------------------------------------------------------------------- #
# Read-method dispatch tests
# --------------------------------------------------------------------------- #


class TestHostedReadDispatch:
    """Confirm read methods route GET to trade.pmxt.dev/v0/*."""

    def test_fetch_balance_routes_to_user_balances(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch,
            _json_response({
                "balances": [
                    {"currency": "USDC", "amount": 12.5},
                ],
            }),
        )
        api = _make_polymarket()

        balances = api.fetch_balance()

        assert len(captured) == 1
        request = captured[0]
        assert request.method == "GET"
        assert str(request.url).startswith(HOSTED_TRADING_BASE_URL + "/v0/")
        assert request.url.path == f"/v0/user/{WALLET_ADDRESS}/balances"
        assert request.headers["Authorization"] == f"Bearer {PMXT_API_KEY}"
        assert len(balances) == 1
        assert balances[0].currency == "USDC"
        assert balances[0].total == 12.5

    def test_fetch_balance_missing_wallet_raises_locally(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response({"balances": []})
        )
        api = _make_polymarket(with_wallet=False)

        with pytest.raises(MissingWalletAddress):
            api.fetch_balance()

        assert captured == []

    def test_fetch_positions_routes_to_user_positions(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch,
            _json_response({
                "positions": [
                    {
                        "market_id": MARKET_ID,
                        "outcome_id": OUTCOME_ID,
                        "shares": 10.0,
                        "entry_price": 0.42,
                        "current_price": 0.55,
                    },
                ],
            }),
        )
        api = _make_polymarket()

        positions = api.fetch_positions()

        assert len(captured) == 1
        assert captured[0].method == "GET"
        assert captured[0].url.path == f"/v0/user/{WALLET_ADDRESS}/positions"
        assert len(positions) == 1
        assert positions[0].size == 10.0
        assert positions[0].entry_price == 0.42

    def test_fetch_positions_address_override(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response({"positions": []})
        )
        api = _make_polymarket()

        other = "0x000000000000000000000000000000000000Beef"
        api.fetch_positions(address=other)

        assert captured[0].url.path == f"/v0/user/{other}/positions"

    def test_fetch_positions_missing_wallet_raises_locally(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response({"positions": []})
        )
        api = _make_polymarket(with_wallet=False)

        with pytest.raises(MissingWalletAddress):
            api.fetch_positions()

        assert captured == []

    def test_fetch_open_orders_routes_with_address_param(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch,
            _json_response({
                "orders": [
                    {
                        "id": "order-1",
                        "market_id": MARKET_ID,
                        "outcome_id": OUTCOME_ID,
                        "side": "buy",
                        "type": "limit",
                        "amount": 5.0,
                        "status": "open",
                        "filled": 0,
                        "remaining": 5.0,
                    },
                ],
            }),
        )
        api = _make_polymarket()

        orders = api.fetch_open_orders()

        assert len(captured) == 1
        request = captured[0]
        assert request.method == "GET"
        assert request.url.path == "/v0/orders/open"
        # address is passed as a query param.
        assert request.url.params.get("address") == WALLET_ADDRESS
        assert orders[0].id == "order-1"

    def test_fetch_open_orders_with_market_filter(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response({"orders": []})
        )
        api = _make_polymarket()

        api.fetch_open_orders(market_id="m-123")

        params = captured[0].url.params
        assert params.get("address") == WALLET_ADDRESS
        assert params.get("market_id") == "m-123"

    def test_fetch_open_orders_missing_wallet_raises_locally(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response({"orders": []})
        )
        api = _make_polymarket(with_wallet=False)

        with pytest.raises(MissingWalletAddress):
            api.fetch_open_orders()

        assert captured == []

    def test_fetch_my_trades_routes_to_user_trades(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch,
            _json_response({
                "trades": [
                    {
                        "id": "trade-1",
                        "timestamp": "2026-01-01T00:00:00Z",
                        "price": 0.5,
                        # The v0 wire sends trade amounts in 6-dec micro-shares;
                        # user_trade_from_v0 normalizes to decimal shares.
                        "amount": 2_000_000,
                        "side": "buy",
                        "order_id": "order-1",
                        "market_id": MARKET_ID,
                        "outcome_id": OUTCOME_ID,
                    }
                ],
            }),
        )
        api = _make_polymarket()

        trades = api.fetch_my_trades()

        assert captured[0].method == "GET"
        assert captured[0].url.path == f"/v0/user/{WALLET_ADDRESS}/trades"
        assert trades[0].id == "trade-1"
        assert trades[0].amount == 2.0

    def test_fetch_my_trades_missing_wallet_raises_locally(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response({"trades": []})
        )
        api = _make_polymarket(with_wallet=False)

        with pytest.raises(MissingWalletAddress):
            api.fetch_my_trades()

        assert captured == []

    def test_fetch_order_routes_to_orders_by_id(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch,
            _json_response({
                "order": {
                    "id": "order-42",
                    "market_id": MARKET_ID,
                    "outcome_id": OUTCOME_ID,
                    "side": "buy",
                    "type": "limit",
                    "amount": 5.0,
                    "status": "filled",
                    "filled": 5.0,
                    "remaining": 0,
                },
            }),
        )
        api = _make_polymarket()

        order = api.fetch_order("order-42")

        assert captured[0].method == "GET"
        assert captured[0].url.path == "/v0/orders/order-42"
        assert order.id == "order-42"


# --------------------------------------------------------------------------- #
# NotSupported dispatch
# --------------------------------------------------------------------------- #


class TestHostedNotSupportedDispatch:
    """Group C methods raise NotSupported without touching the network."""

    def test_fetch_closed_orders_raises_not_supported(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response({"orders": []})
        )
        api = _make_polymarket()

        with pytest.raises(NotSupported) as exc_info:
            api.fetch_closed_orders()

        assert "fetch_my_trades" in str(exc_info.value)
        assert captured == []

    def test_fetch_all_orders_raises_not_supported(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response({"orders": []})
        )
        api = _make_polymarket()

        with pytest.raises(NotSupported) as exc_info:
            api.fetch_all_orders()

        assert "fetch_open_orders" in str(exc_info.value)
        assert captured == []


# --------------------------------------------------------------------------- #
# Write-method dispatch (build/submit/cancel)
# --------------------------------------------------------------------------- #


def _build_response_payload(side: str = "buy") -> Dict[str, Any]:
    """A minimal valid build-order response shape for dispatch tests."""
    return {
        "built_order_id": "built-xyz",
        "side": side,
        "typed_data": {
            "primaryType": "Order",
            "domain": {
                "name": "Polymarket CTF Exchange",
                "version": "1",
                "chainId": 137,
                "verifyingContract": "0x" + "1" * 40,
            },
            "types": {
                "EIP712Domain": [],
                "Order": [{"name": "user", "type": "address"}],
            },
            "message": {
                "user": WALLET_ADDRESS,
                "max_cost_usdc": 1_000_000,
            },
        },
        "quote": {"best_price": 0.5, "tick_size": 0.01},
        "resolved": {
            "venue": "polymarket",
            "token_id": "tok-1",
            "neg_risk": False,
            "tick_size": 0.01,
        },
    }


def _submit_response_payload() -> Dict[str, Any]:
    return {
        "order": {
            "id": "submitted-order-1",
            "market_id": MARKET_ID,
            "outcome_id": OUTCOME_ID,
            "side": "buy",
            "type": "market",
            "amount": 1.0,
            "status": "filled",
            "filled": 1.0,
            "remaining": 0.0,
        }
    }


def _cancel_pull_typed_data_payload() -> Dict[str, Any]:
    return {
        "primaryType": "CancelPull",
        "domain": {
            "name": "VenueEscrow",
            "version": "1",
            "chainId": 8453,
            "verifyingContract": "0x" + "2" * 40,
        },
        "types": {
            "EIP712Domain": [],
            "CancelPull": [{"name": "user", "type": "address"}],
        },
        "message": {"user": WALLET_ADDRESS, "nonce": 2},
    }


def _cancel_build_payload(*, with_pull: bool = False) -> Dict[str, Any]:
    payload = {
        "cancel_id": "cancel-xyz",
        "typed_data": {
            "primaryType": "Cancel",
            "domain": {
                "name": "Polymarket CTF Exchange",
                "version": "1",
                "chainId": 137,
                "verifyingContract": "0x" + "1" * 40,
            },
            "types": {
                "EIP712Domain": [],
                "Cancel": [{"name": "user", "type": "address"}],
            },
            "message": {"user": WALLET_ADDRESS, "nonce": 1},
        },
    }
    if not with_pull:
        return payload
    return {**payload, "pull_typed_data": _cancel_pull_typed_data_payload()}


def _cancel_response_payload() -> Dict[str, Any]:
    return {
        "order": {
            "id": "cancelled-order-1",
            "market_id": MARKET_ID,
            "outcome_id": OUTCOME_ID,
            "side": "buy",
            "type": "limit",
            "amount": 5.0,
            "status": "cancellation_requested",
            "filled": 0.0,
            "remaining": 5.0,
        }
    }


def _multi_response_handler(
    routes: Dict[str, Dict[str, Any]],
) -> Callable[[httpx.Request], httpx.Response]:
    """Return a handler that dispatches by URL path."""
    def handler(request: httpx.Request) -> httpx.Response:
        for path, payload in routes.items():
            if request.url.path == path or request.url.path.startswith(path):
                return httpx.Response(200, json=payload, request=request)
        return httpx.Response(404, json={"detail": "no fixture"}, request=request)
    return handler


class TestHostedWriteDispatch:
    """build_order / submit_order / create_order / cancel_order dispatch."""

    def test_build_order_routes_to_trade_build_order(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response(_build_response_payload()),
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket()

        built = api.build_order(
            market_id=MARKET_ID,
            outcome_id=OUTCOME_ID,
            side="buy",
            order_type="market",
            amount=1.0,
        )

        assert len(captured) == 1
        request = captured[0]
        assert request.method == "POST"
        assert request.url.path == "/v0/trade/build-order"
        assert request.headers["Authorization"] == f"Bearer {PMXT_API_KEY}"
        body = _request_body(request)
        assert body["market_id"] == MARKET_ID
        assert body["outcome_id"] == OUTCOME_ID
        assert body["side"] == "buy"
        assert body["order_type"] == "market"
        assert body["denom"] == "usdc"
        assert body["amount_6dec"] == 1_000_000
        assert body["user_address"] == WALLET_ADDRESS
        assert isinstance(built, BuiltOrder)
        assert built.params["built_order_id"] == "built-xyz"

    def test_submit_order_routes_to_trade_submit_order(self, monkeypatch):
        # First build, then submit; both routes are POST.
        routes = {
            "/v0/trade/build-order": _build_response_payload(),
            "/v0/trade/submit-order": _submit_response_payload(),
        }
        captured = _install_hosted_transport(
            monkeypatch, _multi_response_handler(routes)
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket(with_signer=True)

        built = api.build_order(
            market_id=MARKET_ID,
            outcome_id=OUTCOME_ID,
            side="buy",
            order_type="market",
            amount=1.0,
        )
        order = api.submit_order(built)

        assert len(captured) == 2
        submit_req = captured[1]
        assert submit_req.method == "POST"
        assert submit_req.url.path == "/v0/trade/submit-order"
        body = _request_body(submit_req)
        assert body["built_order_id"] == "built-xyz"
        assert body["signature"].startswith("0x")
        assert order.id == "submitted-order-1"

    def test_submit_order_without_signer_raises_invalid_signature(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response(_build_response_payload())
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket()  # no signer

        built = api.build_order(
            market_id=MARKET_ID,
            outcome_id=OUTCOME_ID,
            side="buy",
            order_type="market",
            amount=1.0,
        )

        with pytest.raises(InvalidSignature):
            api.submit_order(built)

        # Only the build call should have gone out.
        assert len(captured) == 1
        assert captured[0].url.path == "/v0/trade/build-order"

    def test_create_order_runs_full_build_sign_submit_flow(self, monkeypatch):
        routes = {
            "/v0/trade/build-order": _build_response_payload(),
            "/v0/trade/submit-order": _submit_response_payload(),
        }
        captured = _install_hosted_transport(
            monkeypatch, _multi_response_handler(routes)
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket(with_signer=True)

        order = api.create_order(
            market_id=MARKET_ID,
            outcome_id=OUTCOME_ID,
            side="buy",
            order_type="market",
            amount=1.0,
        )

        assert len(captured) == 2
        assert captured[0].url.path == "/v0/trade/build-order"
        assert captured[1].url.path == "/v0/trade/submit-order"
        for req in captured:
            assert str(req.url).startswith(HOSTED_TRADING_BASE_URL + "/v0/")
        assert order.id == "submitted-order-1"

    def test_create_order_without_signer_raises_invalid_signature(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response(_build_response_payload())
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket()  # no signer

        with pytest.raises(InvalidSignature):
            api.create_order(
                market_id=MARKET_ID,
                outcome_id=OUTCOME_ID,
                side="buy",
                order_type="market",
                amount=1.0,
            )

        # Never even built — local check fires first.
        assert captured == []

    def test_build_order_without_market_id_omits_key(self, monkeypatch):
        """outcome_id alone is accepted; the wire body must NOT include market_id."""
        captured = _install_hosted_transport(
            monkeypatch, _json_response(_build_response_payload()),
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket()

        built = api.build_order(
            outcome_id=OUTCOME_ID,
            side="buy",
            order_type="market",
            amount=1.0,
        )

        assert len(captured) == 1
        body = _request_body(captured[0])
        # outcome_id present, market_id absent (not null, not empty string).
        assert body["outcome_id"] == OUTCOME_ID
        assert "market_id" not in body
        assert isinstance(built, BuiltOrder)

    def test_create_order_without_market_id_omits_key(self, monkeypatch):
        routes = {
            "/v0/trade/build-order": _build_response_payload(),
            "/v0/trade/submit-order": _submit_response_payload(),
        }
        captured = _install_hosted_transport(
            monkeypatch, _multi_response_handler(routes)
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket(with_signer=True)

        order = api.create_order(
            outcome_id=OUTCOME_ID,
            side="buy",
            order_type="market",
            amount=1.0,
        )

        assert len(captured) == 2
        build_body = _request_body(captured[0])
        assert build_body["outcome_id"] == OUTCOME_ID
        assert "market_id" not in build_body
        assert order.id == "submitted-order-1"

    def test_build_order_with_market_id_still_sends_it(self, monkeypatch):
        """Backcompat: callers that pass both ids continue to wire both."""
        captured = _install_hosted_transport(
            monkeypatch, _json_response(_build_response_payload()),
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket()

        api.build_order(
            market_id=MARKET_ID,
            outcome_id=OUTCOME_ID,
            side="buy",
            order_type="market",
            amount=1.0,
        )

        body = _request_body(captured[0])
        assert body["market_id"] == MARKET_ID
        assert body["outcome_id"] == OUTCOME_ID

    def test_build_order_with_venue_native_id_sends_venue_pair(self, monkeypatch):
        """Non-UUID outcome ids dispatch as (venue, venue_outcome_id)."""
        captured = _install_hosted_transport(
            monkeypatch, _json_response(_build_response_payload()),
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket()

        api.build_order(
            outcome_id=VENUE_NATIVE_OUTCOME_ID,
            side="buy",
            order_type="market",
            amount=1.0,
        )

        body = _request_body(captured[0])
        assert body["venue"] == "polymarket"
        assert body["venue_outcome_id"] == VENUE_NATIVE_OUTCOME_ID
        assert "outcome_id" not in body
        assert "market_id" not in body

    def test_cancel_order_routes_build_then_cancel(self, monkeypatch):
        routes = {
            "/v0/orders/cancel/build": _cancel_build_payload(),
            "/v0/orders/cancel": _cancel_response_payload(),
        }
        captured = _install_hosted_transport(
            monkeypatch, _multi_response_handler(routes)
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket(with_signer=True)

        order = api.cancel_order("order-to-cancel")

        # Two POSTs: cancel/build then cancel
        assert len(captured) == 2
        assert captured[0].method == "POST"
        assert captured[0].url.path == "/v0/orders/cancel/build"
        body_build = _request_body(captured[0])
        assert body_build["order_id"] == "order-to-cancel"
        assert body_build["user_address"] == WALLET_ADDRESS

        assert captured[1].method == "POST"
        assert captured[1].url.path == "/v0/orders/cancel"
        body_cancel = _request_body(captured[1])
        assert body_cancel["cancel_id"] == "cancel-xyz"
        assert body_cancel["signature"].startswith("0x")
        assert order.id == "cancelled-order-1"

    def test_limitless_cancel_order_routes_build_then_cancel_with_pull_signature(
        self,
        monkeypatch,
    ):
        routes = {
            "/v0/orders/cancel/build": _cancel_build_payload(with_pull=True),
            "/v0/orders/cancel": _cancel_response_payload(),
        }
        captured = _install_hosted_transport(
            monkeypatch, _multi_response_handler(routes)
        )
        _install_signing_bypass(monkeypatch)
        api = _make_limitless(with_signer=True)

        order = api.cancel_order("limitless-order-to-cancel")

        assert len(captured) == 2
        assert captured[0].method == "POST"
        assert captured[0].url.path == "/v0/orders/cancel/build"
        body_build = _request_body(captured[0])
        assert body_build["order_id"] == "limitless-order-to-cancel"
        assert body_build["user_address"] == WALLET_ADDRESS

        assert captured[1].method == "POST"
        assert captured[1].url.path == "/v0/orders/cancel"
        body_cancel = _request_body(captured[1])
        assert body_cancel["cancel_id"] == "cancel-xyz"
        assert body_cancel["signature"].startswith("0x")
        assert body_cancel["pull_signature"].startswith("0x")
        assert order.id == "cancelled-order-1"


# --------------------------------------------------------------------------- #
# Input-side validation (hosted mode)
# --------------------------------------------------------------------------- #


class TestHostedInputValidation:
    """Input-shape checks must fire locally, before any network call."""

    def test_market_buy_with_shares_denom_rejected_locally(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response(_build_response_payload())
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket(with_signer=True)

        from pmxt.errors import InvalidOrder
        with pytest.raises(InvalidOrder):
            api.build_order(
                market_id=MARKET_ID,
                outcome_id=OUTCOME_ID,
                side="buy",
                order_type="market",
                amount=1.0,
                denom="shares",
            )
        assert captured == []

    def test_market_sell_with_usdc_denom_rejected_locally(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response(_build_response_payload())
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket(with_signer=True)

        from pmxt.errors import InvalidOrder
        with pytest.raises(InvalidOrder):
            api.build_order(
                market_id=MARKET_ID,
                outcome_id=OUTCOME_ID,
                side="sell",
                order_type="market",
                amount=1.0,
                denom="usdc",
            )
        assert captured == []

    def test_amount_with_too_many_decimals_rejected_locally(self, monkeypatch):
        captured = _install_hosted_transport(
            monkeypatch, _json_response(_build_response_payload())
        )
        _install_signing_bypass(monkeypatch)
        api = _make_polymarket(with_signer=True)

        from pmxt.errors import InvalidOrder
        with pytest.raises(InvalidOrder):
            api.build_order(
                market_id=MARKET_ID,
                outcome_id=OUTCOME_ID,
                side="buy",
                order_type="market",
                amount=0.1234567,  # 7 decimals - too many
            )
        assert captured == []
