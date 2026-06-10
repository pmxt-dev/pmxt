import json
import re
from typing import Any, Dict, Iterable, List

import httpx
import pytest

import pmxt._hosted_routing as hosted_routing
from pmxt._hosted_errors import MissingWalletAddress, NotSupported
from pmxt._hosted_routing import HOSTED_TRADING_BASE_URL

PMXT_API_KEY = "pmxt_test_key"
WALLET_ADDRESS = "0x0000000000000000000000000000000000000001"
PRIVATE_KEY = "0x" + "1" * 64
MARKET_ID = "market-1"
OUTCOME_ID = "outcome-1"

PRIVATE_KEY_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")
FORBIDDEN_KEY_NAMES = frozenset({"private_key", "privateKey", "apiSecret", "passphrase"})
FORBIDDEN_KEY_NAMES_LOWER = frozenset(key.lower() for key in FORBIDDEN_KEY_NAMES)


class _FakeClient:
    def __init__(
        self,
        *,
        exchange_name: str = "polymarket",
        pmxt_api_key: str | None = PMXT_API_KEY,
        wallet_address: str | None = WALLET_ADDRESS,
        private_key: str | None = None,
    ) -> None:
        self.exchange_name = exchange_name
        self.pmxt_api_key = pmxt_api_key
        self.wallet_address = wallet_address
        self.private_key = private_key


def _hosted_success_payload(request: httpx.Request) -> Dict[str, Any]:
    if request.url.path.endswith("/build-order"):
        return {
            "success": True,
            "data": {
                "exchange": "polymarket",
                "params": {"marketId": MARKET_ID, "outcomeId": OUTCOME_ID},
                "raw": {"built_order_id": "built-1"},
            },
            "exchange": "polymarket",
            "params": {"marketId": MARKET_ID, "outcomeId": OUTCOME_ID},
            "raw": {"built_order_id": "built-1"},
            "built_order_id": "built-1",
            "typed_data": {},
            "resolved": {},
        }
    return {
        "success": True,
        "data": [],
        "balances": [],
        "orders": [],
        "trades": [],
        "positions": [],
    }


def _install_hosted_transport(monkeypatch: pytest.MonkeyPatch, handler) -> List[httpx.Request]:
    captured: List[httpx.Request] = []
    transport = httpx.MockTransport(
        lambda request: captured.append(request) or handler(request)
    )
    original_client = httpx.Client

    def client_factory(*args, **kwargs):
        # Drop any caller-provided transport so the mock transport is used.
        kwargs = {k: v for k, v in kwargs.items() if k != "transport"}
        client_kwargs = {
            "base_url": HOSTED_TRADING_BASE_URL,
            **kwargs,
            "transport": transport,
        }
        return original_client(*args, **client_kwargs)

    monkeypatch.setattr(httpx, "Client", client_factory)
    return captured


def _hosted_response(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=_hosted_success_payload(request), request=request)


def _request_json_body(request: httpx.Request) -> Any:
    if not request.content:
        return None
    return json.loads(request.content.decode("utf-8"))


def _walk_keys(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, nested in value.items():
            yield str(key)
            yield from _walk_keys(nested)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_keys(item)


def _walk_values(value: Any) -> Iterable[Any]:
    if isinstance(value, dict):
        for nested in value.values():
            yield from _walk_values(nested)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_values(item)
    else:
        yield value


@pytest.mark.parametrize("venue", ["polymarket", "opinion"])
def test_hosted_mode_routes_allowlisted_venues_to_trade_base_url(monkeypatch, venue):
    # httpx is imported lazily inside _trading_request, expose it on the module
    # so the monkeypatch on hosted_routing.httpx works.
    import httpx as _httpx
    monkeypatch.setattr(hosted_routing, "httpx", _httpx, raising=False)
    captured = _install_hosted_transport(monkeypatch, _hosted_response)
    client = _FakeClient(exchange_name=venue)
    route = hosted_routing.ensure_hosted_method_supported(client, "fetch_balance")
    address = hosted_routing.resolve_wallet_address(client)
    path = hosted_routing.format_route_path(route, {"address": address})

    hosted_routing._trading_request(client, method=route.method, path=path)

    assert [request.url.host for request in captured] == [
        httpx.URL(HOSTED_TRADING_BASE_URL).host
    ]
    assert captured[0].url.path == f"/v0/user/{WALLET_ADDRESS}/balances"


def test_without_pmxt_api_key_does_not_enforce_hosted_trading_gate(monkeypatch):
    import httpx as _httpx
    monkeypatch.setattr(hosted_routing, "httpx", _httpx, raising=False)
    captured = _install_hosted_transport(monkeypatch, _hosted_response)
    client = _FakeClient(exchange_name="kalshi", pmxt_api_key=None, wallet_address=None)

    route = hosted_routing.ensure_hosted_method_supported(client, "build_order")

    assert route.path == "/v0/trade/build-order"
    assert captured == []


def test_non_allowlisted_hosted_venue_trade_method_raises_not_supported(monkeypatch):
    import httpx as _httpx
    monkeypatch.setattr(hosted_routing, "httpx", _httpx, raising=False)
    captured = _install_hosted_transport(monkeypatch, _hosted_response)
    client = _FakeClient(exchange_name="kalshi")

    with pytest.raises(NotSupported):
        hosted_routing.ensure_hosted_method_supported(client, "build_order")

    assert captured == []


@pytest.mark.parametrize(
    ("method_name", "args", "kwargs"),
    [
        ("fetch_balance", (), {}),
        ("fetch_positions", (), {}),
        ("fetch_open_orders", (), {}),
        ("fetch_my_trades", (), {}),
    ],
)
def test_hosted_read_methods_require_wallet_address_before_network_call(
    monkeypatch,
    method_name,
    args,
    kwargs,
):
    import httpx as _httpx
    monkeypatch.setattr(hosted_routing, "httpx", _httpx, raising=False)
    captured = _install_hosted_transport(monkeypatch, _hosted_response)
    client = _FakeClient(wallet_address=None)

    with pytest.raises(MissingWalletAddress):
        hosted_routing.hosted_route_url(client, method_name)

    assert captured == []


def test_hosted_requests_do_not_send_private_key_material(monkeypatch):
    import httpx as _httpx
    monkeypatch.setattr(hosted_routing, "httpx", _httpx, raising=False)
    captured = _install_hosted_transport(monkeypatch, _hosted_response)
    client = _FakeClient(private_key=PRIVATE_KEY)
    balance_route = hosted_routing.ensure_hosted_method_supported(client, "fetch_balance")
    build_route = hosted_routing.ensure_hosted_method_supported(client, "build_order")

    hosted_routing._trading_request(
        client,
        method=balance_route.method,
        path=hosted_routing.format_route_path(balance_route, {"address": WALLET_ADDRESS}),
    )
    hosted_routing._trading_request(
        client,
        method=build_route.method,
        path=build_route.path,
        body={
            "market_id": MARKET_ID,
            "outcome_id": OUTCOME_ID,
            "side": "buy",
            "order_type": "market",
            "amount": 1.0,
            "denom": "usdc",
            "user_address": WALLET_ADDRESS,
        },
    )

    request_bodies = tuple(_request_json_body(request) for request in captured)
    body_keys = frozenset(
        key.lower()
        for body in request_bodies
        for key in _walk_keys(body)
    )
    header_keys = frozenset(
        key.lower()
        for request in captured
        for key in request.headers.keys()
    )
    body_values = tuple(
        value
        for body in request_bodies
        for value in _walk_values(body)
    )
    header_values = tuple(
        value
        for request in captured
        for value in request.headers.values()
    )

    assert len(captured) == 2
    assert FORBIDDEN_KEY_NAMES_LOWER.isdisjoint(body_keys | header_keys)
    assert not any(
        PRIVATE_KEY_RE.match(value)
        for value in body_values + header_values
        if isinstance(value, str)
    )


def test_hosted_post_transport_does_not_auto_retry_on_connect_error(monkeypatch):
    import httpx as _httpx
    monkeypatch.setattr(hosted_routing, "httpx", _httpx, raising=False)
    attempts = {"post": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["post"] += int(request.method == "POST")
        raise httpx.ConnectError("transient hosted failure", request=request)

    _install_hosted_transport(monkeypatch, handler)
    client = _FakeClient()
    route = hosted_routing.ensure_hosted_method_supported(client, "build_order")

    with pytest.raises(httpx.ConnectError):
        hosted_routing._trading_request(
            client,
            method=route.method,
            path=route.path,
            body={
                "market_id": MARKET_ID,
                "outcome_id": OUTCOME_ID,
                "side": "buy",
                "order_type": "market",
                "amount": 1.0,
                "denom": "usdc",
            },
        )

    assert attempts["post"] == 1
