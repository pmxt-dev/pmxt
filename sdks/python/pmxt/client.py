"""
Exchange client implementations.

This module provides clean, Pythonic wrappers around the auto-generated
OpenAPI client, matching the JavaScript API exactly.
"""

import json
import os
import sys
from abc import ABC
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal, Union

# Add generated client to path
_GENERATED_PATH = os.path.join(os.path.dirname(__file__), "..", "generated")
if _GENERATED_PATH not in sys.path:
    sys.path.insert(0, _GENERATED_PATH)

from pmxt_internal import ApiClient, Configuration
from pmxt_internal.api.default_api import DefaultApi
from pmxt_internal.exceptions import ApiException
from pmxt_internal import models as internal_models

from .models import (
    UnifiedMarket,
    UnifiedEvent,
    MarketOutcome,
    MarketList,
    PriceCandle,
    OrderBook,
    OrderLevel,
    Trade,
    UserTrade,
    PaginatedMarketsResult,
    Order,
    BuiltOrder,
    Position,
    Balance,
    ExecutionPriceResult,
    MarketFilterCriteria,
    MarketFilterFunction,
    EventFilterCriteria,
    EventFilterFunction,
    SubscribedAddressSnapshot,
)
from .errors import PmxtError, from_server_error
from .server_manager import ServerManager


def _resolve_outcome_id(value: Union[str, "MarketOutcome"]) -> str:
    """Extract outcome_id string from a MarketOutcome or pass through a string."""
    if isinstance(value, str):
        return value
    return value.outcome_id


def _convert_outcome(raw: Dict[str, Any]) -> MarketOutcome:
    """Convert raw API response to MarketOutcome."""
    return MarketOutcome(
        outcome_id=raw.get("outcomeId"),
        label=raw.get("label"),
        price=raw.get("price"),
        price_change_24h=raw.get("priceChange24h"),
        metadata=raw.get("metadata"),
        market_id=raw.get("marketId"),
    )


def _convert_market(raw: Dict[str, Any]) -> UnifiedMarket:
    """Convert raw API response to UnifiedMarket."""
    outcomes = [_convert_outcome(o) for o in raw.get("outcomes", [])]

    # Handle resolution date (could be str or datetime)
    res_date_raw = raw.get("resolutionDate")
    res_date = None

    if res_date_raw:
        if isinstance(res_date_raw, str):
            try:
                res_date = datetime.fromisoformat(res_date_raw.replace("Z", "+00:00"))
            except ValueError:
                pass # Keep as None if parsing fails
        elif isinstance(res_date_raw, datetime):
            res_date = res_date_raw

    return UnifiedMarket(
        market_id=raw.get("marketId"),
        title=raw.get("title"),
        outcomes=outcomes,
        volume_24h=raw.get("volume24h", 0),
        liquidity=raw.get("liquidity", 0),
        url=raw.get("url"),
        description=raw.get("description"),
        resolution_date=res_date,
        volume=raw.get("volume"),
        open_interest=raw.get("openInterest"),
        image=raw.get("image"),
        category=raw.get("category"),
        tags=raw.get("tags"),
        yes=_convert_outcome(raw["yes"]) if raw.get("yes") else None,
        no=_convert_outcome(raw["no"]) if raw.get("no") else None,
        up=_convert_outcome(raw["up"]) if raw.get("up") else None,
        down=_convert_outcome(raw["down"]) if raw.get("down") else None,
    )


def _convert_event(raw: Dict[str, Any]) -> UnifiedEvent:
    """Convert raw API response to UnifiedEvent."""
    markets = MarketList(_convert_market(m) for m in raw.get("markets", []))

    return UnifiedEvent(
        id=raw.get("id"),
        title=raw.get("title"),
        description=raw.get("description"),
        slug=raw.get("slug"),
        markets=markets,
        url=raw.get("url"),
        image=raw.get("image"),
        category=raw.get("category"),
        tags=raw.get("tags"),
    )


def _convert_candle(raw: Dict[str, Any]) -> PriceCandle:
    """Convert raw API response to PriceCandle."""
    return PriceCandle(
        timestamp=raw.get("timestamp"),
        open=raw.get("open"),
        high=raw.get("high"),
        low=raw.get("low"),
        close=raw.get("close"),
        volume=raw.get("volume"),
    )


def _convert_order_book(raw: Dict[str, Any]) -> OrderBook:
    """Convert raw API response to OrderBook."""
    bids = [OrderLevel(price=b.get("price"), size=b.get("size")) for b in raw.get("bids", [])]
    asks = [OrderLevel(price=a.get("price"), size=a.get("size")) for a in raw.get("asks", [])]

    return OrderBook(
        bids=bids,
        asks=asks,
        timestamp=raw.get("timestamp"),
    )


def _convert_trade(raw: Dict[str, Any]) -> Trade:
    """Convert raw API response to Trade."""
    return Trade(
        id=raw.get("id"),
        timestamp=raw.get("timestamp"),
        price=raw.get("price"),
        amount=raw.get("amount"),
        side=raw.get("side", "unknown"),
    )


def _convert_user_trade(raw: Dict[str, Any]) -> UserTrade:
    """Convert raw API response to UserTrade."""
    return UserTrade(
        id=raw.get("id"),
        timestamp=raw.get("timestamp"),
        price=raw.get("price"),
        amount=raw.get("amount"),
        side=raw.get("side", "unknown"),
        order_id=raw.get("orderId"),
    )


def _convert_order(raw: Dict[str, Any]) -> Order:
    """Convert raw API response to Order."""
    return Order(
        id=raw.get("id"),
        market_id=raw.get("marketId"),
        outcome_id=raw.get("outcomeId"),
        side=raw.get("side"),
        type=raw.get("type"),
        amount=raw.get("amount"),
        status=raw.get("status"),
        filled=raw.get("filled"),
        remaining=raw.get("remaining"),
        timestamp=raw.get("timestamp"),
        price=raw.get("price"),
        fee=raw.get("fee"),
    )


def _convert_built_order(raw: Dict[str, Any]) -> BuiltOrder:
    """Convert raw API response to BuiltOrder."""
    return BuiltOrder(
        exchange=raw.get("exchange", ""),
        params=raw.get("params", {}),
        raw=raw.get("raw"),
        signed_order=raw.get("signedOrder"),
        tx=raw.get("tx"),
    )


def _convert_position(raw: Dict[str, Any]) -> Position:
    """Convert raw API response to Position."""
    return Position(
        market_id=raw.get("marketId"),
        outcome_id=raw.get("outcomeId"),
        outcome_label=raw.get("outcomeLabel"),
        size=raw.get("size"),
        entry_price=raw.get("entryPrice"),
        current_price=raw.get("currentPrice"),
        unrealized_pnl=raw.get("unrealizedPnL"),
        realized_pnl=raw.get("realizedPnL"),
    )


def _convert_balance(raw: Dict[str, Any]) -> Balance:
    """Convert raw API response to Balance."""
    return Balance(
        currency=raw.get("currency"),
        total=raw.get("total"),
        available=raw.get("available"),
        locked=raw.get("locked"),
    )


def _convert_execution_result(raw: Dict[str, Any]) -> ExecutionPriceResult:
    """Convert raw API response to ExecutionPriceResult."""
    return ExecutionPriceResult(
        price=raw.get("price", 0),
        filled_amount=raw.get("filledAmount", 0),
        fully_filled=raw.get("fullyFilled", False),
    )


def _convert_subscription_snapshot(raw: Dict[str, Any]) -> SubscribedAddressSnapshot:
    """Convert raw API response to SubscribedAddressSnapshot."""
    raw_trades = raw.get("trades")
    raw_positions = raw.get("positions")
    raw_balances = raw.get("balances")
    return SubscribedAddressSnapshot(
        address=raw.get("address"),
        trades=[_convert_trade(t) for t in raw_trades] if raw_trades else None,
        positions=[_convert_position(p) for p in raw_positions] if raw_positions else None,
        balances=[_convert_balance(b) for b in raw_balances] if raw_balances else None,
        timestamp=raw.get("timestamp"),
    )


class Exchange(ABC):
    """
    Base class for prediction market exchanges.

    This provides a unified interface for interacting with different
    prediction market platforms (Polymarket, Kalshi, etc.).
    """

    def __init__(
        self,
        exchange_name: str,
        api_key: Optional[str] = None,
        private_key: Optional[str] = None,
        api_token: Optional[str] = None,
        base_url: str = "http://localhost:3847",
        auto_start_server: bool = True,
        proxy_address: Optional[str] = None,
        signature_type: Optional[Any] = None,
    ):
        """
        Initialize an exchange client.

        Args:
            exchange_name: Name of the exchange ("polymarket" or "kalshi")
            api_key: API key for authentication (optional)
            private_key: Private key for authentication (optional)
            api_token: Metaculus-style bearer token (optional)
            base_url: Base URL of the PMXT sidecar server
            auto_start_server: Automatically start server if not running (default: True)
        """
        self.exchange_name = exchange_name.lower()
        self.api_key = api_key
        self.private_key = private_key
        self.api_token = api_token
        self.proxy_address = proxy_address
        self.signature_type = signature_type
        self.markets: Dict[str, "UnifiedMarket"] = {}
        self.markets_by_slug: Dict[str, "UnifiedMarket"] = {}
        self._loaded_markets: bool = False

        # Initialize server manager
        self._server_manager = ServerManager(base_url)

        # Ensure server is running (unless disabled)
        if auto_start_server:
            try:
                self._server_manager.ensure_server_running()

                # Get the actual port the server is running on
                # (may differ from default if default port was busy)
                actual_port = self._server_manager.get_running_port()
                base_url = f"http://localhost:{actual_port}"

            except Exception as e:
                raise Exception(
                    f"Failed to start PMXT server: {e}\n\n"
                    f"Please ensure 'pmxtjs' is installed: npm install -g pmxtjs\n"
                    f"Or start the server manually: pmxt-server"
                )

        # Configure the API client with the actual base URL
        config = Configuration(host=base_url)
        self._api_client = ApiClient(configuration=config)

        self._api = DefaultApi(api_client=self._api_client)

    def _handle_response(self, response: Dict[str, Any]) -> Any:
        """Handle API response and extract data."""
        if not response.get("success"):
            error = response.get("error", {})
            raise from_server_error(error)
        return response.get("data")

    def _extract_api_error(self, e: Exception) -> str:
        """Extract clean error message from ApiException body if possible."""
        if isinstance(e, ApiException) and hasattr(e, "body") and e.body:
            try:
                body_json = json.loads(e.body)
                if not body_json.get("success") and "error" in body_json:
                    error_detail = body_json["error"]
                    if isinstance(error_detail, dict):
                        return error_detail.get("message", str(e))
                    elif isinstance(error_detail, str):
                        return error_detail
            except:
                pass
        return str(e)

    def _parse_api_exception(self, e: ApiException) -> PmxtError:
        """Parse an ApiException into a typed PmxtError."""
        try:
            body = json.loads(e.body) if e.body else {}
            error_data = body.get("error", {})
            if isinstance(error_data, dict):
                return from_server_error(error_data)
            return PmxtError(str(error_data) if error_data else str(e))
        except (json.JSONDecodeError, AttributeError):
            return PmxtError(self._extract_api_error(e))

    def _get_auth_headers(self) -> Dict[str, str]:
        """Build request headers with a fresh access token read from the lock file.

        The token is re-read on every call so that if the sidecar server restarts
        (and writes a new token) existing client objects automatically recover on
        the next request — no re-instantiation required.
        """
        headers: Dict[str, str] = dict(self._api_client.default_headers)
        server_info = self._server_manager.get_server_info()
        if server_info and 'accessToken' in server_info:
            headers['x-pmxt-access-token'] = server_info['accessToken']
        return headers

    def _get_credentials_dict(self) -> Optional[Dict[str, Any]]:
        """Build credentials dictionary for API requests."""
        if not self.api_key and not self.private_key and not self.api_token:
            return None

        creds = {}
        if self.api_key:
            creds["apiKey"] = self.api_key
        if self.private_key:
            creds["privateKey"] = self.private_key
        if self.api_token:
            creds["apiToken"] = self.api_token
        if self.proxy_address:
            creds["funderAddress"] = self.proxy_address
        if self.signature_type is not None:
            creds["signatureType"] = self.signature_type
        return creds if creds else None

    @property
    def has(self) -> Dict[str, Any]:
        """
        Capability map indicating which methods this exchange supports.

        Values:
            True      - natively supported
            False     - not available
            'emulated' - available via workaround (polling, approximation, etc.)

        Example:
            >>> if exchange.has['fetchOHLCV']:
            ...     candles = exchange.fetch_ohlcv(outcome_id, resolution='1h')
        """
        if not hasattr(self, '_has_cache'):
            try:
                url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/has"
                headers = {"Accept": "application/json"}
                headers.update(self._get_auth_headers())
                response = self._api_client.call_api(
                    method="GET",
                    url=url,
                    header_params=headers,
                )
                response.read()
                data_json = json.loads(response.data)
                self._has_cache = self._handle_response(data_json)
            except Exception:
                self._has_cache = {}
        return self._has_cache

    # Low-Level API Access

    def _call_method(self, method_name: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Call any exchange method on the server by name."""
        try:
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/{method_name}"
            body: Dict[str, Any] = {"args": [params] if params is not None else []}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers,
            )
            response.read()
            data_json = json.loads(response.data)
            return self._handle_response(data_json)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def call_api(self, operation_id: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """
        Call an exchange-specific REST endpoint by its operationId.
        This provides direct access to all implicit API methods defined in
        the exchange's OpenAPI spec (e.g., Polymarket CLOB, Kalshi trading API).

        Args:
            operation_id: The operationId (or auto-generated name) of the endpoint
            params: Optional parameters to pass to the endpoint

        Returns:
            The raw response data from the exchange

        Example:
            >>> result = exchange.call_api('getMarket', {'condition_id': '0x...'})
        """
        try:
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/callApi"

            body = {"args": [operation_id, params]}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers
            )
            response.read()
            data_json = json.loads(response.data)
            return self._handle_response(data_json)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    # Market Data Methods

    def load_markets(self, reload: bool = False) -> Dict[str, UnifiedMarket]:
        """
        Load and cache all markets from the exchange into self.markets.
        Subsequent calls return the cached result without hitting the API again.

        Use this for stable pagination — fetch_markets() always hits the API so
        repeated calls with different offsets may return inconsistent results if
        the exchange reorders markets between requests. Call load_markets() once,
        then paginate over list(exchange.markets.values()) locally.

        Args:
            reload: Force a fresh fetch even if markets are already loaded

        Returns:
            Dict[str, UnifiedMarket] - All markets indexed by marketId

        Example:
            exchange.load_markets()
            all = list(exchange.markets.values())
            page1 = all[:100]
            page2 = all[100:200]
        """
        if self._loaded_markets and not reload:
            return self.markets

        markets = self.fetch_markets()

        self.markets = {}
        self.markets_by_slug = {}

        for market in markets:
            self.markets[market.market_id] = market

        self._loaded_markets = True
        return self.markets

    # BEGIN GENERATED METHODS

    def fetch_markets(self, params: Optional[dict] = None, **kwargs) -> List[UnifiedMarket]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(params)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchMarkets"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_market(e) for e in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_markets_paginated(self, params: Optional[dict] = None, **kwargs) -> PaginatedMarketsResult:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(params)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchMarketsPaginated"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return PaginatedMarketsResult(
                data=[_convert_market(m) for m in data.get("data", [])],
                total=data.get("total", 0),
                next_cursor=data.get("nextCursor"),
            )
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_events(self, params: Optional[dict] = None, **kwargs) -> List[UnifiedEvent]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(params)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchEvents"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_event(e) for e in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_market(self, params: Optional[dict] = None, **kwargs) -> UnifiedMarket:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(params)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchMarket"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_market(data)
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_event(self, params: Optional[dict] = None, **kwargs) -> UnifiedEvent:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(params)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchEvent"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_event(data)
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_order_book(self, id: Union[str, "MarketOutcome"]) -> OrderBook:
        try:
            id = _resolve_outcome_id(id)
            args = []
            args.append(id)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchOrderBook"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_order_book(data)
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def cancel_order(self, order_id: str) -> Order:
        try:
            args = []
            args.append(order_id)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/cancelOrder"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_order(data)
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_order(self, order_id: str) -> Order:
        try:
            args = []
            args.append(order_id)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchOrder"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_order(data)
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_open_orders(self, market_id: Optional[str] = None) -> List[Order]:
        try:
            args = []
            if market_id is not None:
                args.append(market_id)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchOpenOrders"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_order(e) for e in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_my_trades(self, params: Optional[dict] = None, **kwargs) -> List[UserTrade]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(params)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchMyTrades"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_user_trade(e) for e in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_closed_orders(self, params: Optional[dict] = None, **kwargs) -> List[Order]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(params)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchClosedOrders"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_order(e) for e in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_all_orders(self, params: Optional[dict] = None, **kwargs) -> List[Order]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(params)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchAllOrders"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_order(e) for e in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_positions(self) -> List[Position]:
        try:
            args = []
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchPositions"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_position(e) for e in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_balance(self) -> List[Balance]:
        try:
            args = []
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchBalance"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            data = self._handle_response(json.loads(response.data))
            if data is None:
                return []
            if isinstance(data, dict):
                return [
                    Balance(currency=k, total=v.get("total"), available=v.get("available"), locked=v.get("locked"))
                    for k, v in data.items()
                ]
            return [_convert_balance(e) for e in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def close(self) -> None:
        try:
            args = []
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/close"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            response.read()
            self._handle_response(json.loads(response.data))
        except Exception as e:
            raise self._parse_api_exception(e) from None

    # END GENERATED METHODS

    # ----------------------------------------------------------------------------
    # Filtering Methods
    # ----------------------------------------------------------------------------

    def filter_markets(
        self,
        markets: List[UnifiedMarket],
        criteria: Union[str, MarketFilterCriteria, MarketFilterFunction]
    ) -> List[UnifiedMarket]:
        """
        Filter markets based on criteria or custom function.

        Args:
            markets: List of markets to filter
            criteria: Filter criteria object, string (simple text search), or predicate function

        Returns:
            Filtered list of markets

        Example:
            >>> api.filter_markets(markets, "Trump")
            >>> api.filter_markets(markets, {"volume_24h": {"min": 1000}})
            >>> api.filter_markets(markets, lambda m: m.yes and m.yes.price > 0.5)
        """
        # Handle predicate function
        if callable(criteria):
            return list(filter(criteria, markets))

        # Handle simple string search
        if isinstance(criteria, str):
            lower_query = criteria.lower()
            return [m for m in markets if m.title and lower_query in m.title.lower()]

        # Handle criteria object
        params: MarketFilterCriteria = criteria # type: ignore
        results = []

        for market in markets:
            # Text search
            if "text" in params:
                lower_query = params["text"].lower()
                search_in = params.get("search_in", ["title"])
                match = False

                if "title" in search_in and market.title and lower_query in market.title.lower():
                    match = True
                elif "description" in search_in and market.description and lower_query in market.description.lower():
                    match = True
                elif "category" in search_in and market.category and lower_query in market.category.lower():
                    match = True
                elif "tags" in search_in and market.tags and any(lower_query in t.lower() for t in market.tags):
                    match = True
                elif "outcomes" in search_in and market.outcomes and any(lower_query in o.label.lower() for o in market.outcomes):
                    match = True

                if not match:
                    continue

            # Category filter
            if "category" in params:
                if market.category != params["category"]:
                    continue

            # Tags filter (match ANY)
            if "tags" in params and params["tags"]:
                if not market.tags:
                    continue
                query_tags = [t.lower() for t in params["tags"]]
                market_tags = [t.lower() for t in market.tags]
                if not any(t in market_tags for t in query_tags):
                    continue

            # Volume 24h
            if "volume_24h" in params:
                f = params["volume_24h"]
                val = market.volume_24h
                if "min" in f and val < f["min"]: continue
                if "max" in f and val > f["max"]: continue

            # Volume
            if "volume" in params:
                f = params["volume"]
                val = market.volume or 0
                if "min" in f and val < f["min"]: continue
                if "max" in f and val > f["max"]: continue

            # Liquidity
            if "liquidity" in params:
                f = params["liquidity"]
                val = market.liquidity
                if "min" in f and val < f["min"]: continue
                if "max" in f and val > f["max"]: continue

            # Open Interest
            if "open_interest" in params:
                f = params["open_interest"]
                val = market.open_interest or 0
                if "min" in f and val < f["min"]: continue
                if "max" in f and val > f["max"]: continue

            # Resolution Date
            if "resolution_date" in params:
                f = params["resolution_date"]
                val = market.resolution_date

                if not val:
                     continue

                # Ensure val is timezone-aware if the filter dates are, or naive if filter dates are.
                # Assuming standard library comparison works (or both are TZ aware/naive).
                if "before" in f and val >= f["before"]: continue
                if "after" in f and val <= f["after"]: continue

            # Price filter
            if "price" in params:
                f = params["price"]
                outcome_key = f.get("outcome")
                if outcome_key:
                    outcome = getattr(market, outcome_key, None)
                    if not outcome: continue
                    if "min" in f and outcome.price < f["min"]: continue
                    if "max" in f and outcome.price > f["max"]: continue

            # Price Change 24h
            if "price_change_24h" in params:
                f = params["price_change_24h"]
                outcome_key = f.get("outcome")
                if outcome_key:
                    outcome = getattr(market, outcome_key, None)
                    if not outcome or outcome.price_change_24h is None: continue
                    if "min" in f and outcome.price_change_24h < f["min"]: continue
                    if "max" in f and outcome.price_change_24h > f["max"]: continue

            results.append(market)

        return results

    def filter_events(
        self,
        events: List[UnifiedEvent],
        criteria: Union[str, EventFilterCriteria, EventFilterFunction]
    ) -> List[UnifiedEvent]:
        """
        Filter events based on criteria or custom function.

        Args:
            events: List of events to filter
            criteria: Filter criteria object, string, or function

        Returns:
            Filtered list of events
        """
        # Handle predicate function
        if callable(criteria):
            return list(filter(criteria, events))

        # Handle simple string search
        if isinstance(criteria, str):
            lower_query = criteria.lower()
            return [e for e in events if e.title and lower_query in e.title.lower()]

        # Handle criteria object
        params: EventFilterCriteria = criteria # type: ignore
        results = []

        for event in events:
            # Text search
            if "text" in params:
                lower_query = params["text"].lower()
                search_in = params.get("search_in", ["title"])
                match = False

                if "title" in search_in and event.title and lower_query in event.title.lower():
                    match = True
                elif "description" in search_in and event.description and lower_query in event.description.lower():
                    match = True
                elif "category" in search_in and event.category and lower_query in event.category.lower():
                    match = True
                elif "tags" in search_in and event.tags and any(lower_query in t.lower() for t in event.tags):
                    match = True

                if not match:
                    continue

            # Category
            if "category" in params:
                if event.category != params["category"]:
                    continue

            # Tags
            if "tags" in params and params["tags"]:
                if not event.tags:
                    continue
                query_tags = [t.lower() for t in params["tags"]]
                event_tags = [t.lower() for t in event.tags]
                if not any(t in event_tags for t in query_tags):
                    continue

            # Market Count
            if "market_count" in params:
                f = params["market_count"]
                count = len(event.markets)
                if "min" in f and count < f["min"]: continue
                if "max" in f and count > f["max"]: continue

            # Total Volume
            if "total_volume" in params:
                f = params["total_volume"]
                total_vol = sum(m.volume_24h for m in event.markets)
                if "min" in f and total_vol < f["min"]: continue
                if "max" in f and total_vol > f["max"]: continue

            results.append(event)

        return results

    def fetch_ohlcv(
        self,
        outcome_id: Union[str, "MarketOutcome"],
        resolution: Optional[str] = None,
        limit: Optional[int] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        **kwargs
    ) -> List[PriceCandle]:
        """
        Get historical price candles.

        **CRITICAL**: Use outcome.outcome_id, not market.market_id.
        - Polymarket: outcome.outcome_id is the CLOB Token ID
        - Kalshi: outcome.outcome_id is the Market Ticker

        Args:
            outcome_id: Outcome ID (from market.outcomes[].outcome_id), or a MarketOutcome object
            resolution: Candle resolution (e.g., "1h", "1d")
            limit: Maximum number of candles to return
            start: Start datetime for historical data
            end: End datetime for historical data
            **kwargs: Additional parameters

        Returns:
            List of price candles

        Example:
            >>> markets = exchange.fetch_markets(query="Trump")
            >>> outcome_id = markets[0].outcomes[0].outcome_id
            >>> candles = exchange.fetch_ohlcv(
            ...     outcome_id,
            ...     resolution="1h",
            ...     limit=100
            ... )
        """
        try:
            outcome_id = _resolve_outcome_id(outcome_id)
            params_dict = {}
            if resolution:
                params_dict["resolution"] = resolution
            if start:
                params_dict["start"] = start.isoformat()
            if end:
                params_dict["end"] = end.isoformat()
            if limit:
                params_dict["limit"] = limit

            # Add any extra keyword arguments
            for key, value in kwargs.items():
                if key not in params_dict:
                    params_dict[key] = value

            request_body_dict = {"args": [outcome_id, params_dict]}
            request_body = internal_models.FetchOHLCVRequest.from_dict(request_body_dict)

            response = self._api.fetch_ohlcv(
                exchange=self.exchange_name,
                fetch_ohlcv_request=request_body,
            )

            data = self._handle_response(response.to_dict())
            return [_convert_candle(c) for c in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_trades(
        self,
        outcome_id: Union[str, "MarketOutcome"],
        limit: Optional[int] = None,
        since: Optional[int] = None,
        **kwargs
    ) -> List[Trade]:
        """
        Get trade history for an outcome.

        Note: Polymarket requires API key.

        Args:
            outcome_id: Outcome ID (from market.outcomes[].outcome_id)
            limit: Maximum number of trades to return
            since: Return trades since this timestamp (Unix milliseconds)
            **kwargs: Additional parameters

        Returns:
            List of trades

        Example:
            >>> trades = exchange.fetch_trades(outcome_id, limit=50)
        """
        try:
            outcome_id = _resolve_outcome_id(outcome_id)
            params_dict = {}
            if limit:
                params_dict["limit"] = limit
            if since:
                params_dict["since"] = since

            # Add any extra keyword arguments
            for key, value in kwargs.items():
                if key not in params_dict:
                    params_dict[key] = value

            request_body_dict = {"args": [outcome_id, params_dict]}
            request_body = internal_models.FetchTradesRequest.from_dict(request_body_dict)

            response = self._api.fetch_trades(
                exchange=self.exchange_name,
                fetch_trades_request=request_body,
            )

            data = self._handle_response(response.to_dict())
            return [_convert_trade(t) for t in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    # WebSocket Streaming Methods

    def watch_order_book(self, outcome_id: Union[str, "MarketOutcome"], limit: Optional[int] = None) -> OrderBook:
        """
        Watch real-time order book updates via WebSocket.

        Returns a promise that resolves with the next order book update.
        Call repeatedly in a loop to stream updates (CCXT Pro pattern).

        Args:
            outcome_id: Outcome ID to watch
            limit: Optional depth limit for order book

        Returns:
            Next order book update

        Example:
            >>> # Stream order book updates
            >>> while True:
            ...     order_book = exchange.watch_order_book(outcome_id)
            ...     print(f"Best bid: {order_book.bids[0].price}")
            ...     print(f"Best ask: {order_book.asks[0].price}")
        """
        try:
            outcome_id = _resolve_outcome_id(outcome_id)
            args = [outcome_id]
            if limit is not None:
                args.append(limit)

            body_dict = {"args": args}

            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds

            request_body = internal_models.WatchOrderBookRequest.from_dict(body_dict)

            response = self._api.watch_order_book(
                exchange=self.exchange_name,
                watch_order_book_request=request_body,
            )

            data = self._handle_response(response.to_dict())
            return _convert_order_book(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def watch_trades(
        self,
        outcome_id: Union[str, "MarketOutcome"],
        address: Optional[str] = None,
        since: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[Trade]:
        """
        Watch real-time trade updates via WebSocket.

        Returns a promise that resolves with the next trade(s).
        Call repeatedly in a loop to stream updates (CCXT Pro pattern).

        Args:
            outcome_id: Outcome ID to watch
            address: Public wallet to be watched
            since: Optional timestamp to filter trades from
            limit: Optional limit for number of trades

        Returns:
            Next trade update(s)

        Example:
            >>> # Stream trade updates
            >>> while True:
            ...     trades = exchange.watch_trades(outcome_id)
            ...     for trade in trades:
            ...         print(f"Trade: {trade.price} @ {trade.amount}")
        """
        try:
            outcome_id = _resolve_outcome_id(outcome_id)
            args = [outcome_id]
            if address is not None:
                args.append(address)
            if since is not None:
                args.append(since)
            if limit is not None:
                args.append(limit)

            body_dict = {"args": args}

            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds

            request_body = internal_models.WatchTradesRequest.from_dict(body_dict)

            response = self._api.watch_trades(
                exchange=self.exchange_name,
                watch_trades_request=request_body,
            )

            data = self._handle_response(response.to_dict())
            return [_convert_trade(t) for t in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def watch_address(
        self,
        address: str,
        types: list[str] = None,
    ) -> SubscribedAddressSnapshot:
        """
        Watch real-time updates of a public wallet via WebSocket.

        Returns a promise that resolves with the next update(s).
        Call repeatedly in a loop to stream updates (CCXT Pro pattern).

        Args:
            address: Public wallet to be watched
            types: Subscription options including 'trades', 'positions', and 'balances'

        Returns:
            Next update(s)

        Example:
            >>> # Stream updates of a public wallet address
            >>> while True:
            ...     snapshots = exchange.watch_address(address, types)
            ...     for snapshot in snapshots:
            ...         print(f"Trade: {snapshot.trades}")
        """
        try:
            args: list = [address]
            if types is not None:
                args.append(types)

            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/watchAddress"
            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers,
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_subscription_snapshot(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def unwatch_address(
        self,
        address: str,
    ) -> None:
        """
        Stop watching a previously registered wallet address and release its resource updates.

        Args:
            address: Public wallet to be unwatched

        Returns:
            None
        """
        try:
            body: dict = {"args": [address]}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/unwatchAddress"
            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers,
            )
            response.read()
            return self._handle_response(json.loads(response.data))
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def watch_prices(self, market_address: str, callback: Optional[Any] = None) -> Any:
        """
        Watch real-time AMM price updates via WebSocket.

        Args:
            market_address: Market contract address
            callback: Optional callback for price updates (if supported by implementation)

        Returns:
            Next price update
        """
        try:
            body_dict = {"args": [market_address]}

            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds

            request_body = internal_models.WatchPricesRequest.from_dict(body_dict)

            response = self._api.watch_prices(
                exchange=self.exchange_name,
                watch_prices_request=request_body,
            )

            return self._handle_response(response.to_dict())
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def watch_user_positions(self, callback: Optional[Any] = None) -> List[Position]:
        """
        Watch real-time user position updates via WebSocket.
        Requires API key authentication.

        Args:
            callback: Optional callback for position updates

        Returns:
            Next position update
        """
        try:
            body_dict = {}

            # Add credentials (required)
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds

            request_body = internal_models.WatchUserPositionsRequest.from_dict(body_dict)

            response = self._api.watch_user_positions(
                exchange=self.exchange_name,
                watch_user_positions_request=request_body,
            )

            data = self._handle_response(response.to_dict())
            return [_convert_position(p) for p in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def watch_user_transactions(self, callback: Optional[Any] = None) -> Any:
        """
        Watch real-time user transaction updates via WebSocket.
        Requires API key authentication.

        Args:
            callback: Optional callback for transaction updates

        Returns:
            Next transaction update
        """
        try:
            body_dict = {}

            # Add credentials (required)
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds

            request_body = internal_models.WatchUserPositionsRequest.from_dict(body_dict)

            response = self._api.watch_user_transactions(
                exchange=self.exchange_name,
                watch_user_positions_request=request_body,
            )

            return self._handle_response(response.to_dict())
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    # Trading Methods (require authentication)

    def create_order(
        self,
        market_id: Optional[str] = None,
        outcome_id: Optional[str] = None,
        side: Literal["buy", "sell"] = "buy",
        type: Literal["market", "limit"] = "market",
        amount: float = 0,
        price: Optional[float] = None,
        fee: Optional[int] = None,
        outcome: Optional[MarketOutcome] = None,
    ) -> Order:
        """
        Create a new order.

        You can specify the market either with explicit market_id/outcome_id,
        or by passing an outcome object directly (e.g., market.yes).

        Args:
            market_id: Market ID (or use outcome instead)
            outcome_id: Outcome ID (or use outcome instead)
            side: Order side (buy/sell)
            type: Order type (market/limit)
            amount: Number of contracts
            price: Limit price (required for limit orders, 0.0-1.0)
            fee: Optional fee rate (e.g., 1000 for 0.1%)
            outcome: A MarketOutcome object (e.g., market.yes). Extracts market_id and outcome_id automatically.

        Returns:
            Created order

        Example:
            >>> # Using explicit IDs:
            >>> order = exchange.create_order(
            ...     market_id="663583",
            ...     outcome_id="10991849...",
            ...     side="buy",
            ...     type="limit",
            ...     amount=10,
            ...     price=0.55
            ... )
            >>>
            >>> # Using outcome shorthand:
            >>> order = exchange.create_order(
            ...     outcome=market.yes,
            ...     side="buy",
            ...     type="market",
            ...     amount=10,
            ... )
        """
        try:
            # Resolve outcome shorthand
            if outcome is not None:
                if market_id is not None or outcome_id is not None:
                    raise ValueError(
                        "Cannot specify both 'outcome' and 'market_id'/'outcome_id'. Use one or the other."
                    )
                if not outcome.market_id:
                    raise ValueError(
                        "outcome.market_id is not set. Ensure the outcome comes from a fetched market."
                    )
                market_id = outcome.market_id
                outcome_id = outcome.outcome_id
            elif market_id is None or outcome_id is None:
                raise ValueError(
                    "Either provide 'outcome' or both 'market_id' and 'outcome_id'."
                )

            params_dict = {
                "marketId": market_id,
                "outcomeId": outcome_id,
                "side": side,
                "type": type,
                "amount": amount,
            }
            if price is not None:
                params_dict["price"] = price
            if fee is not None:
                params_dict["fee"] = fee

            request_body_dict = {"args": [params_dict]}

            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                request_body_dict["credentials"] = creds

            request_body = internal_models.CreateOrderRequest.from_dict(request_body_dict)

            response = self._api.create_order(
                exchange=self.exchange_name,
                create_order_request=request_body,
            )

            data = self._handle_response(response.to_dict())
            return _convert_order(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def build_order(
        self,
        market_id: Optional[str] = None,
        outcome_id: Optional[str] = None,
        side: Literal["buy", "sell"] = "buy",
        type: Literal["market", "limit"] = "market",
        amount: float = 0,
        price: Optional[float] = None,
        fee: Optional[int] = None,
        outcome: Optional[MarketOutcome] = None,
    ) -> BuiltOrder:
        """
        Build an order payload without submitting it to the exchange.

        Returns the exchange-native signed order or transaction payload for
        inspection, forwarding through a middleware layer, or deferred
        submission via submit_order().

        You can specify the market either with explicit market_id/outcome_id,
        or by passing an outcome object directly (e.g., market.yes).

        Args:
            market_id: Market ID (or use outcome instead)
            outcome_id: Outcome ID (or use outcome instead)
            side: Order side (buy/sell)
            type: Order type (market/limit)
            amount: Number of contracts
            price: Limit price (required for limit orders, 0.0-1.0)
            fee: Optional fee rate (e.g., 1000 for 0.1%)
            outcome: A MarketOutcome object (e.g., market.yes). Extracts market_id and outcome_id automatically.

        Returns:
            A BuiltOrder containing the exchange-native payload

        Example:
            >>> # Build, inspect, then submit:
            >>> built = exchange.build_order(
            ...     market_id="663583",
            ...     outcome_id="10991849...",
            ...     side="buy",
            ...     type="limit",
            ...     amount=10,
            ...     price=0.55
            ... )
            >>> print(built.signed_order)  # inspect before submitting
            >>> order = exchange.submit_order(built)
            >>>
            >>> # Using outcome shorthand:
            >>> built = exchange.build_order(
            ...     outcome=market.yes,
            ...     side="buy",
            ...     type="market",
            ...     amount=10
            ... )
        """
        try:
            # Resolve outcome shorthand
            if outcome is not None:
                if market_id is not None or outcome_id is not None:
                    raise ValueError(
                        "Cannot specify both 'outcome' and 'market_id'/'outcome_id'. Use one or the other."
                    )
                if not outcome.market_id:
                    raise ValueError(
                        "outcome.market_id is not set. Ensure the outcome comes from a fetched market."
                    )
                market_id = outcome.market_id
                outcome_id = outcome.outcome_id
            elif market_id is None or outcome_id is None:
                raise ValueError(
                    "Either provide 'outcome' or both 'market_id' and 'outcome_id'."
                )

            params_dict = {
                "marketId": market_id,
                "outcomeId": outcome_id,
                "side": side,
                "type": type,
                "amount": amount,
            }
            if price is not None:
                params_dict["price"] = price
            if fee is not None:
                params_dict["fee"] = fee

            request_body_dict = {"args": [params_dict]}

            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                request_body_dict["credentials"] = creds

            request_body = internal_models.BuildOrderRequest.from_dict(request_body_dict)

            response = self._api.build_order(
                exchange=self.exchange_name,
                build_order_request=request_body,
            )

            data = self._handle_response(response.to_dict())
            return _convert_built_order(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def submit_order(self, built: BuiltOrder) -> Order:
        """
        Submit a pre-built order returned by build_order().

        Args:
            built: The BuiltOrder payload from build_order()

        Returns:
            The submitted order

        Example:
            >>> built = exchange.build_order(
            ...     outcome=market.yes,
            ...     side="buy",
            ...     type="limit",
            ...     amount=10,
            ...     price=0.55
            ... )
            >>> order = exchange.submit_order(built)
            >>> print(order.id, order.status)
        """
        try:
            built_dict = {
                "exchange": built.exchange,
                "params": built.params,
                "raw": built.raw,
            }
            if built.signed_order is not None:
                built_dict["signedOrder"] = built.signed_order
            if built.tx is not None:
                built_dict["tx"] = built.tx

            request_body_dict = {"args": [built_dict]}

            creds = self._get_credentials_dict()
            if creds:
                request_body_dict["credentials"] = creds

            request_body = internal_models.SubmitOrderRequest.from_dict(request_body_dict)

            response = self._api.submit_order(
                exchange=self.exchange_name,
                submit_order_request=request_body,
            )

            data = self._handle_response(response.to_dict())
            return _convert_order(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def get_execution_price(
        self,
        order_book: OrderBook,
        side: Literal["buy", "sell"],
        amount: float
    ) -> float:
        """
        Calculate the average execution price for a given amount.

        Args:
            order_book: The current order book
            side: "buy" or "sell"
            amount: The amount to execute

        Returns:
            The volume-weighted average price, or 0 if insufficient liquidity
        """
        result = self.get_execution_price_detailed(order_book, side, amount)
        return result.price if result.fully_filled else 0

    def get_execution_price_detailed(
        self,
        order_book: OrderBook,
        side: Literal["buy", "sell"],
        amount: float
    ) -> ExecutionPriceResult:
        """
        Calculate detailed execution price information.

        Args:
            order_book: The current order book
            side: "buy" or "sell"
            amount: The amount to execute

        Returns:
            Detailed execution result
        """
        try:
            # Convert order_book to dict for API call
            bids = [{"price": b.price, "size": b.size} for b in order_book.bids]
            asks = [{"price": a.price, "size": a.size} for a in order_book.asks]
            ob_dict = {"bids": bids, "asks": asks, "timestamp": order_book.timestamp}

            body = {
                "args": [ob_dict, side, amount]
            }

            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/getExecutionPriceDetailed"

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers
            )

            response.read()
            data_json = json.loads(response.data)

            data = self._handle_response(data_json)
            return _convert_execution_result(data)
        except Exception as e:
            raise self._parse_api_exception(e) from None
