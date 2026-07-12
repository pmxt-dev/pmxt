"""Hosted trading routing helpers for the Python SDK."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Literal
from urllib.parse import quote, urlencode

from ._hosted_errors import MissingWalletAddress, NotSupported, raise_from_response

HostedBase = Literal["catalog", "trading"]
HttpMethod = Literal["GET", "POST", "PUT", "DELETE"]

HOSTED_CATALOG_BASE_URL = "https://api.pmxt.dev"
HOSTED_TRADING_BASE_URL = "https://trade.pmxt.dev"
HOSTED_TRADING_VENUES: frozenset[str] = frozenset({"polymarket", "opinion", "limitless"})
HTTP_METHODS: frozenset[str] = frozenset({"GET", "POST", "PUT", "DELETE"})
UNSAFE_HTTP_METHODS: frozenset[str] = frozenset({"POST", "PUT", "DELETE"})


@dataclass(frozen=True, slots=True)
class HostedRoute:
    """One hosted-mode SDK method route."""

    method: HttpMethod
    path: str
    base: HostedBase
    requires_wallet_address: bool = False


@dataclass(frozen=True, slots=True)
class HostedRoutingConfig:
    """Resolved hosted routing config.

    Request headers are built from ``api_key`` only. Venue credentials and
    private keys are intentionally absent from this config.
    """

    api_key: str
    catalog_base_url: str = HOSTED_CATALOG_BASE_URL
    trading_base_url: str = HOSTED_TRADING_BASE_URL
    wallet_address: str | None = None


HOSTED_METHOD_ROUTES: Mapping[str, HostedRoute] = MappingProxyType({
    "create_order": HostedRoute(
        method="POST",
        path="/v0/trade/build-order",
        base="trading",
    ),
    "build_order": HostedRoute(
        method="POST",
        path="/v0/trade/build-order",
        base="trading",
    ),
    "submit_order": HostedRoute(
        method="POST",
        path="/v0/trade/submit-order",
        base="trading",
    ),
    "cancel_order_build": HostedRoute(
        method="POST",
        path="/v0/orders/cancel/build",
        base="trading",
    ),
    "cancel_order": HostedRoute(
        method="POST",
        path="/v0/orders/cancel",
        base="trading",
    ),
    "fetch_order": HostedRoute(
        method="GET",
        path="/v0/orders/{order_id}",
        base="trading",
    ),
    "fetch_open_orders": HostedRoute(
        method="GET",
        path="/v0/orders/open",
        base="trading",
        requires_wallet_address=True,
    ),
    "fetch_my_trades": HostedRoute(
        method="GET",
        path="/v0/user/{address}/trades",
        base="trading",
        requires_wallet_address=True,
    ),
    "fetch_balance": HostedRoute(
        method="GET",
        path="/v0/user/{address}/balances",
        base="trading",
        requires_wallet_address=True,
    ),
    "fetch_positions": HostedRoute(
        method="GET",
        path="/v0/user/{address}/positions",
        base="trading",
        requires_wallet_address=True,
    ),
    "escrow_approve_tx": HostedRoute(
        method="POST",
        path="/v0/escrow/approve",
        base="trading",
    ),
    "escrow_deposit_tx": HostedRoute(
        method="POST",
        path="/v0/escrow/deposit",
        base="trading",
    ),
    "escrow_withdraw_tx": HostedRoute(
        method="POST",
        path="/v0/escrow/withdraw",
        base="trading",
    ),
    "escrow_withdrawals": HostedRoute(
        method="GET",
        path="/v0/escrow/{address}/withdrawals",
        base="trading",
        requires_wallet_address=True,
    ),
    "fetch_order_book": HostedRoute(
        method="POST",
        path="/api/{venue}/fetchOrderBook",
        base="catalog",
    ),
    "fetch_order_books": HostedRoute(
        method="POST",
        path="/api/{venue}/fetchOrderBooks",
        base="catalog",
    ),
})

HOSTED_ROUTE_ALIASES: Mapping[str, str] = MappingProxyType({
    "createOrder": "create_order",
    "buildOrder": "build_order",
    "submitOrder": "submit_order",
    "cancelOrder": "cancel_order",
    "fetchOrder": "fetch_order",
    "fetchOpenOrders": "fetch_open_orders",
    "fetchMyTrades": "fetch_my_trades",
    "fetchBalance": "fetch_balance",
    "fetchPositions": "fetch_positions",
    "fetchOrderBook": "fetch_order_book",
    "fetchOrderBooks": "fetch_order_books",
    "fetchClosedOrders": "fetch_closed_orders",
    "fetchAllOrders": "fetch_all_orders",
    "escrow.approve_tx": "escrow_approve_tx",
    "escrow.deposit_tx": "escrow_deposit_tx",
    "escrow.withdraw_tx": "escrow_withdraw_tx",
    "escrow.withdrawals": "escrow_withdrawals",
})

HOSTED_UNSUPPORTED_METHODS: Mapping[str, str] = MappingProxyType({
    "fetch_closed_orders": (
        "Settled orders are modeled as trades; use fetch_my_trades()."
    ),
    "fetch_all_orders": (
        "Use fetch_open_orders() and fetch_my_trades() separately."
    ),
})


def get_hosted_route(method_name: str) -> HostedRoute:
    """Return the hosted route for a Python SDK method name."""
    canonical_name = HOSTED_ROUTE_ALIASES.get(method_name, method_name)
    unsupported_message = HOSTED_UNSUPPORTED_METHODS.get(canonical_name)
    if unsupported_message is not None:
        raise NotSupported(unsupported_message)

    route = HOSTED_METHOD_ROUTES.get(canonical_name)
    if route is None:
        raise NotSupported(
            f"{method_name} is not available in hosted trading mode."
        )
    return route


def hosted_config_for_client(client: Any) -> HostedRoutingConfig:
    """Resolve hosted routing config from a client-like object."""
    return _hosted_config(client)


def hosted_base_url(route: HostedRoute, cfg: HostedRoutingConfig) -> str:
    """Return the base URL selected by a hosted route."""
    if route.base == "trading":
        return cfg.trading_base_url
    return cfg.catalog_base_url


def hosted_route_url(
    client: Any,
    method_name: str,
    *,
    path_params: Mapping[str, Any] | None = None,
    params: Mapping[str, Any] | None = None,
    address: str | None = None,
) -> str:
    """Build the full hosted URL for a routed SDK method."""
    cfg = _hosted_config(client)
    route = ensure_hosted_method_supported(client, method_name)
    prepared_path_params, prepared_params = _prepare_route_parts(
        client=client,
        method_name=method_name,
        route=route,
        path_params=path_params,
        params=params,
        address=address,
    )
    path = format_route_path(route, prepared_path_params)
    return _append_query(
        _join_url(hosted_base_url(route, cfg), path),
        prepared_params,
    )


def format_hosted_path(
    method_name: str,
    path_params: Mapping[str, Any] | None = None,
) -> str:
    """Format a hosted route path from a method name."""
    return format_route_path(get_hosted_route(method_name), path_params)


def format_route_path(
    route: HostedRoute,
    path_params: Mapping[str, Any] | None = None,
) -> str:
    """Format a hosted route path, URL-encoding path parameters."""
    params = path_params or {}
    none_keys = tuple(str(key) for key, value in params.items() if value is None)
    if none_keys:
        raise ValueError(f"path parameter cannot be None: {none_keys[0]}")

    encoded_params = {
        str(key): quote(str(value), safe="")
        for key, value in params.items()
    }
    try:
        return route.path.format(**encoded_params)
    except KeyError as exc:
        raise ValueError(f"missing path parameter: {exc.args[0]}") from None


def ensure_hosted_method_supported(client: Any, method_name: str) -> HostedRoute:
    """Validate route support and hosted trading venue support."""
    route = get_hosted_route(method_name)
    if route.base == "trading":
        ensure_hosted_trading_supported(client)
    return route


def ensure_hosted_trading_supported(client: Any) -> None:
    """Raise if a hosted API key is used with a non-trading venue."""
    if not _client_has_hosted_api_key(client):
        return

    venue = _client_venue(client)
    if venue not in HOSTED_TRADING_VENUES:
        venue_label = venue or "unknown"
        raise NotSupported(
            "Hosted trading is only supported for Polymarket, Opinion, and Limitless; "
            f"{venue_label} is not supported with pmxt_api_key."
        )


def resolve_wallet_address(
    client: Any,
    address_override: str | None = None,
) -> str:
    """Return the wallet address to use for a hosted read or trade.

    Order of precedence: explicit ``address_override`` argument, then
    ``client.wallet_address`` set at construction time. Raises
    :class:`MissingWalletAddress` locally before any network call when
    neither is available.
    """
    if address_override:
        return address_override
    address = getattr(client, "wallet_address", None)
    if address:
        return address
    raise MissingWalletAddress(
        "wallet_address is required for hosted-mode reads and trades; "
        "pass it to the exchange constructor or as the address= argument."
    )


def _trading_request(
    client: Any,
    *,
    method: HttpMethod,
    path: str,
    body: Mapping[str, Any] | None = None,
    params: Mapping[str, Any] | None = None,
) -> Any:
    """Issue a hosted-mode HTTP request and return the parsed JSON.

    Auth is the client's ``api_key`` as a Bearer token. Body and headers
    are built explicitly from arguments -- venue credentials and private
    keys never enter the wire.

    Unsafe methods (POST/PUT/DELETE) MUST NOT auto-retry: the server
    treats ``built_order_id``/``cancel_id`` as single-use, so a replay
    after a lost response would 404 even though the original write
    succeeded. We construct a fresh ``httpx.Client`` with no retry
    transport for these calls; the caller is expected to surface network
    errors and consult read endpoints to determine actual state.
    """
    import httpx

    cfg = hosted_config_for_client(client)
    base = cfg.trading_base_url
    url = base.rstrip("/") + (path if path.startswith("/") else "/" + path)

    headers: dict[str, str] = {"Authorization": f"Bearer {cfg.api_key}"}
    if body is not None:
        headers["Content-Type"] = "application/json"

    request_kwargs: dict[str, Any] = {"headers": headers, "timeout": 120.0}
    if params:
        request_kwargs["params"] = dict(params)
    if body is not None:
        request_kwargs["json"] = json.loads(json.dumps(body, default=str))

    transport = httpx.HTTPTransport(retries=0)
    with httpx.Client(transport=transport) as http:
        resp = http.request(method, url, **request_kwargs)

    raise_from_response(resp)

    if not resp.content:
        return None
    return resp.json()


def _hosted_config(client: Any) -> HostedRoutingConfig:
    api_key = getattr(client, "pmxt_api_key", None)
    if not api_key:
        raise NotSupported("pmxt_api_key is required for hosted trading mode.")
    return HostedRoutingConfig(
        api_key=str(api_key),
        catalog_base_url=str(
            getattr(client, "hosted_catalog_base_url", HOSTED_CATALOG_BASE_URL),
        ),
        trading_base_url=str(
            getattr(client, "hosted_trading_base_url", HOSTED_TRADING_BASE_URL),
        ),
        wallet_address=getattr(client, "wallet_address", None),
    )


def _client_has_hosted_api_key(client: Any) -> bool:
    return bool(getattr(client, "pmxt_api_key", None))


def _client_venue(client: Any) -> str:
    venue = getattr(client, "exchange_name", None) or getattr(client, "name", None)
    return str(venue).lower() if venue else ""


def _prepare_route_parts(
    *,
    client: Any,
    method_name: str,
    route: HostedRoute,
    path_params: Mapping[str, Any] | None = None,
    params: Mapping[str, Any] | None = None,
    address: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    del method_name
    prepared_path_params = dict(path_params or {})
    prepared_params = {
        str(key): value
        for key, value in (params or {}).items()
        if value is not None
    }

    if not route.requires_wallet_address:
        return prepared_path_params, prepared_params

    wallet_address = resolve_wallet_address(client, address)
    if "{address}" in route.path:
        return (
            {**prepared_path_params, "address": prepared_path_params.get("address") or wallet_address},
            prepared_params,
        )
    if "address" in prepared_params:
        return prepared_path_params, prepared_params
    return prepared_path_params, {"address": wallet_address, **prepared_params}


def _join_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def _append_query(url: str, params: Mapping[str, Any] | None = None) -> str:
    if not params:
        return url
    query = urlencode(
        {
            str(key): value
            for key, value in params.items()
            if value is not None
        },
        doseq=True,
    )
    if not query:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{query}"
