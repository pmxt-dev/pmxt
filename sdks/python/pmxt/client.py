"""
Exchange client implementations.

This module provides clean, Pythonic wrappers around the auto-generated
OpenAPI client, matching the JavaScript API exactly.
"""

import json
import os
import re
import sys
import time
import urllib.error
import uuid
from abc import ABC
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Callable, List, Optional, Dict, Any, Literal, Union, Tuple, Type

# Add generated client to path
_GENERATED_PATH = os.path.join(os.path.dirname(__file__), "..", "generated")
if _GENERATED_PATH not in sys.path:
    sys.path.insert(0, _GENERATED_PATH)

from pmxt_internal import ApiClient, Configuration
from pmxt_internal.api.default_api import DefaultApi
from pmxt_internal.exceptions import ApiException

from .models import (
    UnifiedMarket,
    UnifiedEvent,
    UnifiedSeries,
    MarketOutcome,
    MarketList,
    PriceCandle,
    OrderBook,
    OrderLevel,
    Trade,
    UserTrade,
    PaginatedMarketsResult,
    PaginatedEventsResult,
    Order,
    BuiltOrder,
    Position,
    Balance,
    ExecutionPriceResult,
    MarketFilterCriteria,
    MarketFilterFunction,
    EventFilterCriteria,
    EventFilterFunction,
    SeriesFetchParams,
    TradesParams,
    FetchOrderBookParams,
    SubscribedAddressSnapshot,
    SubscriptionOption,
    FirehoseEvent,
    MatchResult,
    EventMatchResult,
    PriceComparison,
    ArbitrageOpportunity,
)
from .constants import LOCAL_URL, resolve_pmxt_base_url
from .errors import (
    InvalidOrder,
    InvalidSignature,
    MissingWalletAddress,
    NotSupported,
    PmxtError,
    from_server_error,
)
from ._hosted_routing import (
    HOSTED_METHOD_ROUTES,
    HOSTED_TRADING_VENUES,
    _trading_request,
    ensure_hosted_method_supported,
    ensure_hosted_trading_supported,
    format_route_path,
    get_hosted_route,
    hosted_route_url,
    resolve_wallet_address,
)
from ._hosted_mappers import (
    balance_from_v0,
    built_order_from_v0,
    order_from_v0,
    position_from_v0,
    to_6dec,
    user_trade_from_v0,
)
from ._hosted_typeddata import (
    validate_economics,
    validate_typed_data,
    verify_signature,
)
from .escrow import Escrow
from .server_manager import ServerManager

import dataclasses as _dc


# Irregular camelCase -> snake_case mappings where the simple algorithm fails.
# Most fields (e.g. market_id -> marketId) convert correctly via the algorithm
# in _snake_to_camel; only genuinely irregular names need to be listed here.
_SNAKE_TO_CAMEL = {
    'volume_24h': 'volume24h',
    'price_change_24h': 'priceChange24h',
    'unrealized_pnl': 'unrealizedPnL',
    'realized_pnl': 'realizedPnL',
}


def _snake_to_camel(name: str) -> str:
    """Convert snake_case field name to camelCase JSON key."""
    if name in _SNAKE_TO_CAMEL:
        return _SNAKE_TO_CAMEL[name]
    parts = name.split('_')
    return parts[0] + ''.join(p.title() for p in parts[1:])


def _convert_params_to_camel(params: Dict[str, Any]) -> Dict[str, Any]:
    """Convert snake_case param keys to camelCase for the sidecar wire format.

    Keys that are already camelCase or single-word pass through unchanged.
    Nested dicts/lists are left as-is -- only top-level keys are converted.
    """
    return {_snake_to_camel(k): v for k, v in params.items()}


def _auto_convert(cls: Type[Any], raw: Dict[str, Any], **overrides: Any) -> Any:
    """Auto-map camelCase raw dict to snake_case dataclass fields.

    Iterates over the dataclass fields, looks up the camelCase key in ``raw``,
    and constructs the instance.  Explicit *overrides* take precedence so
    callers can inject pre-processed values (e.g. nested converters, defaults).
    """
    kwargs: Dict[str, Any] = {}
    for f in _dc.fields(cls):
        if f.name in overrides:
            kwargs[f.name] = overrides[f.name]
        else:
            camel_key = _snake_to_camel(f.name)
            if camel_key in raw:
                kwargs[f.name] = raw[camel_key]
            elif f.name in raw:
                # Covers keys that are already snake_case or single-word
                kwargs[f.name] = raw[f.name]
    return cls(**kwargs)


_UNSET = object()


def _compat_id(outcome_id, compat_kwargs):
    """Backwards compat: accept ``id=`` as alias for ``outcome_id=`` with deprecation warning."""
    if outcome_id is not _UNSET and outcome_id is not None:
        if 'id' in compat_kwargs:
            raise TypeError("Cannot pass both 'outcome_id' and 'id'")
        return outcome_id
    if 'id' in compat_kwargs:
        import warnings
        warnings.warn(
            "Parameter 'id' is deprecated, use 'outcome_id' instead.",
            DeprecationWarning,
            stacklevel=3,
        )
        return compat_kwargs.pop('id')
    if outcome_id is _UNSET:
        raise TypeError("Missing required argument: 'outcome_id'")
    return outcome_id


def _resolve_outcome_id(value: Union[str, "MarketOutcome"]) -> str:
    """Extract outcome_id string from a MarketOutcome or pass through a string."""
    if isinstance(value, str):
        return value
    return value.outcome_id


def _display_price(
    last_price: Optional[float],
    best_bid: Optional[float],
    best_ask: Optional[float],
) -> Optional[float]:
    """Mid-price when spread < $0.10, last trade otherwise (Polymarket convention)."""
    if best_bid is not None and best_ask is not None and (best_ask - best_bid) < 0.10:
        return (best_bid + best_ask) / 2
    return last_price


def _convert_outcome(raw: Dict[str, Any]) -> MarketOutcome:
    """Convert raw API response to MarketOutcome."""
    best_bid = raw.get("bestBid")
    best_ask = raw.get("bestAsk")
    last_price = raw.get("price")
    return _auto_convert(MarketOutcome, raw,
        price=_display_price(last_price, best_bid, best_ask),
        best_bid=best_bid,
        best_ask=best_ask,
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
                pass
        elif isinstance(res_date_raw, datetime):
            res_date = res_date_raw

    return _auto_convert(UnifiedMarket, raw,
        outcomes=outcomes,
        resolution_date=res_date,
        volume_24h=raw.get("volume24h", 0),
        liquidity=raw.get("liquidity", 0),
        yes=_convert_outcome(raw["yes"]) if raw.get("yes") else None,
        no=_convert_outcome(raw["no"]) if raw.get("no") else None,
        up=_convert_outcome(raw["up"]) if raw.get("up") else None,
        down=_convert_outcome(raw["down"]) if raw.get("down") else None,
    )


def _convert_event(raw: Dict[str, Any]) -> UnifiedEvent:
    """Convert raw API response to UnifiedEvent."""
    markets = MarketList(_convert_market(m) for m in raw.get("markets", []))
    return _auto_convert(UnifiedEvent, raw, markets=markets)


def _convert_series(raw: Dict[str, Any]) -> UnifiedSeries:
    """Convert raw API response to UnifiedSeries."""
    raw_events = raw.get("events")
    events = [_convert_event(e) for e in raw_events] if isinstance(raw_events, list) else raw_events
    return _auto_convert(UnifiedSeries, raw, events=events)


def _convert_candle(raw: Dict[str, Any]) -> PriceCandle:
    """Convert raw API response to PriceCandle."""
    return _auto_convert(PriceCandle, raw)


def _convert_order_book(raw: Dict[str, Any]) -> OrderBook:
    """Convert raw API response to OrderBook."""
    bids = [_auto_convert(OrderLevel, b) for b in raw.get("bids", [])]
    asks = [_auto_convert(OrderLevel, a) for a in raw.get("asks", [])]
    return _auto_convert(OrderBook, raw, bids=bids, asks=asks)


def _convert_trade(raw: Dict[str, Any]) -> Trade:
    """Convert raw API response to Trade."""
    return _auto_convert(Trade, raw, side=raw.get("side", "unknown"))


def _convert_user_trade(raw: Dict[str, Any]) -> UserTrade:
    """Convert raw API response to UserTrade."""
    return _auto_convert(UserTrade, raw, side=raw.get("side", "unknown"))


def _convert_order(raw: Dict[str, Any]) -> Order:
    """Convert raw API response to Order."""
    return _auto_convert(Order, raw)


def _convert_built_order(raw: Dict[str, Any]) -> BuiltOrder:
    """Convert raw API response to BuiltOrder."""
    return _auto_convert(BuiltOrder, raw,
        exchange=raw.get("exchange", ""),
        params=raw.get("params", {}),
    )


def _convert_position(raw: Dict[str, Any]) -> Position:
    """Convert raw API response to Position."""
    return _auto_convert(Position, raw)


def _convert_balance(raw: Dict[str, Any]) -> Balance:
    """Convert raw API response to Balance."""
    return _auto_convert(Balance, raw)


def _convert_execution_result(raw: Dict[str, Any]) -> ExecutionPriceResult:
    """Convert raw API response to ExecutionPriceResult."""
    return _auto_convert(ExecutionPriceResult, raw,
        price=raw.get("price", 0),
        filled_amount=raw.get("filledAmount", 0),
        fully_filled=raw.get("fullyFilled", False),
    )


def _convert_subscription_snapshot(raw: Dict[str, Any]) -> SubscribedAddressSnapshot:
    """Convert raw API response to SubscribedAddressSnapshot."""
    raw_trades = raw.get("trades")
    raw_positions = raw.get("positions")
    raw_balances = raw.get("balances")
    return _auto_convert(SubscribedAddressSnapshot, raw,
        trades=[_convert_trade(t) for t in (raw_trades or [])],
        positions=[_convert_position(p) for p in (raw_positions or [])],
        balances=[_convert_balance(b) for b in (raw_balances or [])],
    )


class Exchange(ABC):
    """
    Base class for prediction market exchanges.

    This provides a unified interface for interacting with different
    prediction market platforms (Polymarket, Kalshi, etc.).
    """

    _OBDATA_WATCH_ALL_SOURCES = frozenset({
        "polymarket",
        "limitless",
        "kalshi",
        "opinion",
    })

    def __init__(
        self,
        exchange_name: str,
        api_key: Optional[str] = None,
        private_key: Optional[str] = None,
        api_token: Optional[str] = None,
        base_url: Optional[str] = None,
        auto_start_server: Optional[bool] = None,
        proxy_address: Optional[str] = None,
        signature_type: Optional[str] = None,
        pmxt_api_key: Optional[str] = None,
        wallet_address: Optional[str] = None,
        signer: Optional[Any] = None,
    ) -> None:
        """
        Initialize an exchange client.

        Args:
            exchange_name: Name of the exchange ("polymarket" or "kalshi")
            api_key: API key for authentication on the venue itself (optional)
            private_key: Private key for authentication (optional)
            api_token: Metaculus-style bearer token (optional)
            base_url: Explicit sidecar / hosted-pmxt base URL. When omitted,
                the URL is resolved from ``PMXT_BASE_URL`` env, then from the
                presence of ``pmxt_api_key`` (implying the hosted endpoint),
                then falling back to the local sidecar default.
            auto_start_server: When True, start the local sidecar on demand.
                Defaults to True for local mode and False for hosted mode.
                Pass an explicit bool to override.
            proxy_address: Proxy/smart wallet address (optional).
            signature_type: Signature type for venues that need it (optional).
            pmxt_api_key: Hosted pmxt API key. Distinct from ``api_key``,
                which targets the venue. If supplied (or via ``PMXT_API_KEY``
                env) and no explicit ``base_url`` is set, the SDK auto-routes
                to the hosted pmxt endpoint and injects ``Authorization:
                Bearer`` on every request.
            wallet_address: EVM wallet address used for hosted reads/writes.
                Required for all hosted endpoints that operate on a wallet
                (balances, positions, trades, open orders, build/submit/cancel).
            signer: Optional EIP-712 signer object exposing
                ``sign_typed_data(typed_data) -> 0x-prefixed hex``. When
                ``private_key`` is supplied without ``signer`` in hosted mode,
                an :class:`EthAccountSigner` is created automatically.
        """
        self.exchange_name = exchange_name.lower()
        self.api_key = api_key
        self.private_key = private_key
        self.api_token = api_token
        self.proxy_address = proxy_address
        self.signature_type = signature_type
        self.wallet_address = wallet_address
        self.signer = signer
        self.markets: Dict[str, "UnifiedMarket"] = {}
        self.markets_by_slug: Dict[str, "UnifiedMarket"] = {}
        self._loaded_markets: bool = False
        # Sticky flag: flipped to True the first time the sidecar rejects a
        # GET read with 404/405 (i.e. an older pmxt-core that only supports
        # POST). Once set, read methods skip the GET probe for the lifetime
        # of this client and POST directly.
        self._get_reads_unsupported: bool = False
        # WebSocket client for streaming methods (lazy, shared)
        self._ws_client = None
        self._ws_lock = __import__("threading").Lock()
        # Sticky flag: set to True if the sidecar's /ws endpoint is
        # unavailable (older core). Once set, streaming methods fail
        # fast with a clear WebSocket transport error.
        self._ws_unsupported: bool = False

        # Resolve base_url / hosted mode using the shared rules.
        resolved = resolve_pmxt_base_url(
            base_url=base_url,
            pmxt_api_key=pmxt_api_key,
        )
        effective_base_url = resolved.base_url
        self.pmxt_api_key = resolved.pmxt_api_key
        self.is_hosted = resolved.is_hosted

        # Bridge private_key -> EthAccountSigner for hosted trading mode.
        # Lazy import keeps the eth-account dep optional.
        if (
            self.pmxt_api_key
            and self.private_key
            and self.signer is None
        ):
            from .signers import EthAccountSigner
            self.signer = EthAccountSigner(self.private_key)

        # Hosted trading exposes an escrow namespace for deposits/withdrawals.
        if self.pmxt_api_key and self.exchange_name in HOSTED_TRADING_VENUES:
            self.escrow = Escrow(self)

        # Default auto_start_server: true locally, false when hosted.
        if auto_start_server is None:
            auto_start_server = not self.is_hosted

        # Initialize server manager against the resolved URL so lock-file
        # lookups still work when pointing at the local sidecar.
        self._server_manager = ServerManager(effective_base_url)

        # Ensure server is running (unless disabled or running hosted).
        if auto_start_server:
            try:
                self._server_manager.ensure_server_running()

                # Get the actual port the server is running on
                # (may differ from default if default port was busy)
                actual_port = self._server_manager.get_running_port()
                effective_base_url = f"http://localhost:{actual_port}"

            except Exception as e:
                raise PmxtError(
                    f"Failed to start PMXT server: {e}\n\n"
                    f"Please ensure 'pmxt-core' is installed: npm install -g pmxt-core\n"
                    f"Or start the server manually: pmxt-server"
                )

        # Configure the API client with the actual base URL
        config = Configuration(host=effective_base_url)
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
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                pass
        return str(e)

    def _parse_api_exception(self, e: Exception) -> PmxtError:
        """Parse an ApiException (or pass through an existing PmxtError)
        into a typed PmxtError.

        The read path in ``_sidecar_read_request`` already raises typed
        ``PmxtError`` subclasses (e.g. ``BadRequest``) for non-404/405
        HTTP errors. Outer per-method ``except Exception`` wrappers call
        this helper for uniform error handling, so returning those typed
        errors unchanged prevents a second parse from collapsing them
        back to a plain ``PmxtError``.
        """
        if isinstance(e, PmxtError):
            return e
        try:
            body = json.loads(e.body) if getattr(e, "body", None) else {}
            error_data = body.get("error", {})
            if isinstance(error_data, dict):
                return from_server_error(error_data)
            return PmxtError(str(error_data) if error_data else str(e))
        except (json.JSONDecodeError, AttributeError):
            return PmxtError(self._extract_api_error(e))

    def _fetch_with_retry(self, fn):
        """Execute an API call with retry on connection failures.

        Only retries on connection-level errors (ECONNREFUSED, ECONNRESET) --
        never on HTTP/API errors (4xx, 5xx). On first connection failure,
        attempts to restart the sidecar.
        """
        delays = [0.2, 0.5, 1.0]
        last_error = None

        for attempt in range(len(delays) + 1):
            try:
                return fn()
            except (ConnectionError, OSError, urllib.error.URLError) as e:
                last_error = e
                if attempt >= len(delays):
                    break

                # Connection failed -- try to restart sidecar on first failure
                if attempt == 0 and not self.pmxt_api_key:
                    try:
                        self._server_manager.ensure_server_running()
                    except Exception:
                        pass
                time.sleep(delays[attempt])
            except ApiException:
                raise  # HTTP errors are not retryable here

        raise last_error

    def _resolve_sidecar_host(self) -> str:
        """Return the current sidecar host URL.

        The local sidecar may pick a different port on restart (e.g. if
        the previous port is still held by a zombie process), so we
        re-read the lock file on every request instead of trusting the
        ``configuration.host`` captured at SDK construction time. When
        running hosted (``pmxt_api_key`` set) or against an explicit
        remote URL, the server manager has no lock file and we fall
        back to the configured host.
        """
        if self.is_hosted:
            return self._api_client.configuration.host
        server_info = self._server_manager.get_server_info()
        if server_info and 'port' in server_info:
            return f"http://localhost:{server_info['port']}"
        return self._api_client.configuration.host

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
        if self.pmxt_api_key:
            headers['Authorization'] = f'Bearer {self.pmxt_api_key}'
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

    # ------------------------------------------------------------------
    # Hosted trading dispatch helpers
    # ------------------------------------------------------------------

    def _hosted_method_enabled(self, method_name: str) -> bool:
        """Return True when the caller should route ``method_name`` to v0."""
        if not self.pmxt_api_key:
            return False
        if self.exchange_name == "sor":
            return False
        if self.exchange_name not in HOSTED_TRADING_VENUES:
            return False
        ensure_hosted_method_supported(self, method_name)
        return True

    def _hosted_request(
        self,
        method_name: str,
        *,
        body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        path_params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        route = ensure_hosted_method_supported(self, method_name)
        path = format_route_path(route, path_params)
        return _trading_request(
            self,
            method=route.method,
            path=path,
            body=body,
            params=params,
        )

    @staticmethod
    def _hosted_response_data(payload: Any, collection_key: Optional[str] = None) -> Any:
        if not isinstance(payload, dict):
            return payload
        if collection_key and collection_key in payload:
            return payload[collection_key]
        if "built_order_id" in payload or "cancel_id" in payload:
            return payload
        if payload.get("success") is True and "data" in payload:
            data = payload["data"]
            if collection_key and isinstance(data, dict) and collection_key in data:
                return data[collection_key]
            return data
        data = payload.get("data")
        if collection_key and isinstance(data, dict) and collection_key in data:
            return data[collection_key]
        return payload

    def _hosted_collection(
        self,
        payload: Any,
        collection_key: str,
        mapper: Callable[[Any], Any],
    ) -> List[Any]:
        data = self._hosted_response_data(payload, collection_key)
        if data is None:
            return []
        if isinstance(data, dict) and collection_key in data:
            data = data[collection_key]
        if not isinstance(data, list):
            raise PmxtError(
                f"Hosted response field {collection_key!r} must be a list"
            )
        return [mapper(item) for item in data]

    def _hosted_single(
        self,
        payload: Any,
        collection_key: str,
        mapper: Callable[[Any], Any],
    ) -> Any:
        data = self._hosted_response_data(payload, collection_key)
        if data is None:
            raise PmxtError(f"Hosted response missing {collection_key!r}")
        return mapper(data)

    @staticmethod
    def _hosted_order_target(
        market_id: Optional[str],
        outcome_id: Optional[str],
        outcome: Optional["MarketOutcome"],
    ) -> Tuple[Optional[str], str]:
        """Resolve (market_id, outcome_id) for a hosted order request.

        Returns a tuple ``(market_id_or_None, outcome_id)``. The returned
        ``outcome_id`` may be either a catalog UUID OR a venue-native
        identifier -- the caller is responsible for inspecting its shape
        and choosing the correct wire field (``outcome_id`` vs.
        ``(venue, venue_outcome_id)``). ``market_id`` is optional in
        hosted mode -- the trading backend derives it from ``outcome_id``
        (when a catalog UUID is supplied) or from
        ``(venue, venue_outcome_id)`` when a venue-native id is supplied.
        Callers may still pass ``market_id`` for backward compatibility,
        in which case it is forwarded as-is.
        """
        if outcome is not None:
            if market_id is not None or outcome_id is not None:
                raise ValueError(
                    "Cannot specify both 'outcome' and 'market_id'/'outcome_id'. "
                    "Use one or the other."
                )
            if not outcome.outcome_id:
                raise ValueError(
                    "outcome.outcome_id is not set. Ensure the outcome comes "
                    "from a fetched market."
                )
            # outcome.market_id may be empty -- the backend derives it from outcome_id.
            return outcome.market_id or None, outcome.outcome_id
        if outcome_id is None:
            raise ValueError(
                "Either provide 'outcome' or 'outcome_id' (with optional 'market_id')."
            )
        return market_id, outcome_id

    # Match a canonical 8-4-4-4-12 UUID string. The hosted catalog emits
    # UUIDs in this exact shape, so a regex is both faster and stricter than
    # stdlib ``uuid.UUID(...)`` parsing (which also accepts braces, urns,
    # and other variants we never want to forward as catalog ids).
    _UUID_RE = re.compile(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        re.IGNORECASE,
    )

    @classmethod
    def _looks_like_catalog_uuid(cls, value: str) -> bool:
        """True iff ``value`` parses as a canonical catalog UUID string."""
        return bool(cls._UUID_RE.match(value))

    @staticmethod
    def _hosted_amount_6dec(amount: float) -> int:
        try:
            amount_6dec = to_6dec(amount)
        except InvalidOrder:
            raise
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise InvalidOrder("amount must be a finite positive number") from exc
        if amount_6dec <= 0:
            raise InvalidOrder("amount must be positive")
        return amount_6dec

    @staticmethod
    def _hosted_denom(side: str, order_type: str, denom: Optional[str]) -> str:
        if side not in {"buy", "sell"}:
            raise InvalidOrder("side must be 'buy' or 'sell'")
        if order_type not in {"market", "limit"}:
            raise InvalidOrder("order_type must be 'market' or 'limit'")
        expected = "usdc" if order_type == "market" and side == "buy" else "shares"
        normalized = expected if denom is None else str(denom).lower()
        if normalized != expected:
            if order_type == "market":
                raise InvalidOrder(f"market {side} requires denom={expected!r}")
            raise InvalidOrder("limit orders require denom='shares'")
        return normalized

    def _hosted_build_order_request(
        self,
        market_id: Optional[str],
        outcome_id: Optional[str],
        *,
        side: str,
        order_type: str,
        amount: float,
        price: Optional[float],
        fee: Optional[int],
        outcome: Optional["MarketOutcome"],
        denom: Optional[str],
        slippage_pct: Optional[float],
    ) -> Dict[str, Any]:
        resolved_market_id, resolved_outcome_id = self._hosted_order_target(
            market_id, outcome_id, outcome
        )
        amount_6dec = self._hosted_amount_6dec(amount)
        normalized_denom = self._hosted_denom(side, order_type, denom)
        if order_type == "limit" and price is None:
            raise InvalidOrder("price is required for limit orders")
        if price is not None and price <= 0:
            raise InvalidOrder("price must be positive")
        # The resolved outcome id may be a catalog UUID OR a venue-native id
        # (e.g. a Polymarket tokenId or an Opinion market hash). Catalog UUIDs
        # are forwarded as ``outcome_id``; venue-native ids are forwarded as
        # ``(venue, venue_outcome_id)`` so the backend resolver picks the
        # right path. Either shape is accepted by the v0 trading API.
        base: Dict[str, Any] = {
            "side": side,
            "order_type": order_type,
            "amount": amount,
            "amount_6dec": amount_6dec,
            "denom": normalized_denom,
            "user_address": resolve_wallet_address(self),
        }
        if self._looks_like_catalog_uuid(resolved_outcome_id):
            base["outcome_id"] = resolved_outcome_id
            # market_id is optional in hosted mode: backend derives it from
            # outcome_id (UUID) when omitted. Forward only when the caller
            # supplied a non-empty UUID -- "absent" and "null" are not
            # equivalent under some Pydantic configs on the backend.
            if resolved_market_id and self._looks_like_catalog_uuid(
                resolved_market_id
            ):
                base["market_id"] = resolved_market_id
        else:
            # Venue-native form: backend resolves the row from
            # (source_exchange, pmxt_id). market_id from a venue client is
            # itself venue-native and would fail backend UUID validation
            # if forwarded -- suppress it.
            base["venue"] = self.exchange_name
            base["venue_outcome_id"] = resolved_outcome_id
        with_price = {**base, "price": price} if price is not None else base
        with_fee = {**with_price, "fee": fee} if fee is not None else with_price
        return (
            {**with_fee, "slippage_pct": slippage_pct}
            if slippage_pct is not None
            else with_fee
        )

    @staticmethod
    def _hosted_nested(payload: Dict[str, Any], *keys: str) -> Any:
        value: Any = payload
        for key in keys:
            if not isinstance(value, dict):
                return None
            value = value.get(key)
        return value

    def _validate_hosted_limit_price(
        self,
        build_request: Dict[str, Any],
        build_response: Dict[str, Any],
    ) -> None:
        if build_request.get("order_type") != "limit" or build_request.get("price") is None:
            return
        tick_size = (
            self._hosted_nested(build_response, "quote", "tick_size")
            or self._hosted_nested(build_response, "resolved", "tick_size")
        )
        if tick_size is None:
            return
        try:
            price = Decimal(str(build_request["price"]))
            tick = Decimal(str(tick_size))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise InvalidOrder("price must be numeric") from exc
        if tick <= 0:
            return
        if (price / tick) != (price / tick).to_integral_value():
            raise InvalidOrder(f"price must be a multiple of tick_size {tick_size}")

    def _hosted_order_validation_route(self, side: str) -> str:
        if self.exchange_name == "polymarket":
            return f"polymarket_{side}"
        if self.exchange_name == "opinion" and side == "buy":
            return "opinion_buy"
        if self.exchange_name == "opinion" and side == "sell":
            return "opinion_sell_polygon"
        if self.exchange_name == "limitless" and side == "buy":
            return "limitless_buy"
        if self.exchange_name == "limitless" and side == "sell":
            return "limitless_sell_polygon"
        raise NotSupported(f"Hosted trading not supported for {self.exchange_name}.")

    def _hosted_order_pull_validation_route(self, side: str) -> Optional[str]:
        if self.exchange_name == "opinion" and side == "sell":
            return "opinion_sell_bsc_pull"
        if self.exchange_name == "limitless" and side == "sell":
            return "limitless_sell_base_pull"
        return None

    def _hosted_cancel_validation_routes(self) -> Tuple[str, Optional[str]]:
        if self.exchange_name == "polymarket":
            return "cancel_polymarket", None
        if self.exchange_name == "opinion":
            return "cancel_opinion_polygon", "cancel_opinion_bsc_pull"
        raise NotSupported("Hosted trading is only supported for Polymarket and Opinion.")

    @staticmethod
    def _hosted_typed_data(payload: Dict[str, Any], key: str) -> Dict[str, Any]:
        typed_data = payload.get(key)
        if not isinstance(typed_data, dict):
            raise InvalidSignature(f"{key} missing from hosted build response")
        return typed_data

    def _validate_hosted_build_response(
        self,
        build_response: Dict[str, Any],
        build_request: Dict[str, Any],
    ) -> None:
        route = self._hosted_order_validation_route(str(build_request["side"]))
        wallet_address = str(build_request["user_address"])
        typed_data = self._hosted_typed_data(build_response, "typed_data")
        validate_typed_data(typed_data, route, wallet_address)
        validate_economics(typed_data, route, build_request, build_response)
        self._validate_hosted_limit_price(build_request, build_response)
        pull_route = self._hosted_order_pull_validation_route(str(build_request["side"]))
        if pull_route and build_response.get("pull_typed_data"):
            validate_typed_data(
                self._hosted_typed_data(build_response, "pull_typed_data"),
                pull_route,
                wallet_address,
            )

    @staticmethod
    def _call_hosted_signer(signer: Any, typed_data: Dict[str, Any]) -> str:
        if signer is None:
            raise InvalidSignature("signer is required for hosted trading")
        signature = None
        for method_name in ("sign_typed_data", "sign"):
            method = getattr(signer, method_name, None)
            if callable(method):
                signature = method(typed_data)
                break
        if signature is None:
            if not callable(signer):
                raise InvalidSignature(
                    "signer must be callable or expose sign_typed_data()"
                )
            signature = signer(typed_data)
        if isinstance(signature, bytes):
            return "0x" + signature.hex()
        if isinstance(signature, str) and not signature.startswith("0x"):
            return f"0x{signature}"
        return signature

    def _sign_hosted_typed_data(
        self,
        build_response: Dict[str, Any],
        typed_data_key: str,
        route: str,
        wallet_address: str,
        build_request: Dict[str, Any],
        *,
        signer: Optional[Any] = None,
        validate_economics_check: bool = True,
    ) -> str:
        typed_data = self._hosted_typed_data(build_response, typed_data_key)
        validate_typed_data(typed_data, route, wallet_address)
        if validate_economics_check:
            validate_economics(typed_data, route, build_request, build_response)
        signature = self._call_hosted_signer(signer or self.signer, typed_data)
        return verify_signature(typed_data, signature, wallet_address)

    @staticmethod
    def _hosted_built_payload(built: "BuiltOrder") -> Dict[str, Any]:
        raw = dict(built.raw) if isinstance(built.raw, dict) else {}
        params = dict(built.params or {})
        payload = raw
        for key in (
            "built_order_id",
            "typed_data",
            "pull_typed_data",
            "side",
            "quote",
            "resolved",
            "build_request",
        ):
            if key not in payload and key in params:
                payload = {**payload, key: params[key]}
        return payload

    def _hosted_build_request_from_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        request = payload.get("build_request")
        if isinstance(request, dict):
            return request
        params_request = self._hosted_nested(payload, "params", "build_request")
        if isinstance(params_request, dict):
            return params_request
        params = payload.get("params")
        if isinstance(params, dict) and {"side", "amount", "denom"}.issubset(params.keys()):
            return params
        if {"side", "amount", "denom"}.issubset(payload.keys()):
            return payload
        raise InvalidSignature(
            "hosted built order is missing the original build_request; "
            "rebuild with build_order()"
        )

    @staticmethod
    def _with_hosted_build_request(
        built: "BuiltOrder",
        build_response: Dict[str, Any],
        build_request: Dict[str, Any],
    ) -> "BuiltOrder":
        return BuiltOrder(
            exchange=built.exchange,
            params={**built.params, "build_request": build_request},
            raw={**build_response, "build_request": build_request},
            signed_order=built.signed_order,
            tx=built.tx,
        )

    def _hosted_submit_body(
        self,
        build_payload: Dict[str, Any],
        build_request: Dict[str, Any],
        signer: Optional[Any] = None,
    ) -> Dict[str, Any]:
        wallet_address = resolve_wallet_address(self)
        side = str(build_request.get("side") or build_payload.get("side"))
        route = self._hosted_order_validation_route(side)
        signature = self._sign_hosted_typed_data(
            build_payload,
            "typed_data",
            route,
            wallet_address,
            build_request,
            signer=signer,
        )
        built_order_id = build_payload.get("built_order_id")
        if not built_order_id:
            raise InvalidSignature("built_order_id missing from hosted build response")
        body = {"built_order_id": built_order_id, "signature": signature}
        pull_route = self._hosted_order_pull_validation_route(side)
        if pull_route and build_payload.get("pull_typed_data"):
            pull_signature = self._sign_hosted_typed_data(
                build_payload,
                "pull_typed_data",
                pull_route,
                wallet_address,
                build_request,
                signer=signer,
                validate_economics_check=False,
            )
            return {**body, "pull_signature": pull_signature}
        return body

    def _hosted_cancel_order(
        self,
        order_id: str,
        signer: Optional[Any] = None,
    ) -> "Order":
        wallet_address = resolve_wallet_address(self)
        build_request = {"order_id": order_id, "user_address": wallet_address}
        build_payload = self._hosted_response_data(
            self._hosted_request("cancel_order_build", body=build_request)
        )
        if not isinstance(build_payload, dict):
            raise InvalidSignature("cancel build response must be an object")
        route, pull_route = self._hosted_cancel_validation_routes()
        signature = self._sign_hosted_typed_data(
            build_payload,
            "typed_data",
            route,
            wallet_address,
            build_request,
            signer=signer,
        )
        cancel_id = build_payload.get("cancel_id")
        if not cancel_id:
            raise InvalidSignature("cancel_id missing from hosted cancel build response")
        body = {"cancel_id": cancel_id, "signature": signature}
        if pull_route and build_payload.get("pull_typed_data"):
            pull_signature = self._sign_hosted_typed_data(
                build_payload,
                "pull_typed_data",
                pull_route,
                wallet_address,
                build_request,
                signer=signer,
            )
            body = {**body, "pull_signature": pull_signature}
        response = self._hosted_request("cancel_order", body=body)
        return self._hosted_single(response, "order", order_from_v0)

    def _default_watch_all_order_book_venues(self) -> Optional[List[str]]:
        if self.exchange_name in self._OBDATA_WATCH_ALL_SOURCES:
            return [self.exchange_name]
        return None

    @staticmethod
    def _build_sidecar_query_string(query: Dict[str, Any]) -> str:
        """URL-encode a flat query dict for the sidecar GET path.

        - ``None`` values are skipped entirely.
        - Lists become repeated ``key=v1&key=v2`` pairs.
        - Nested dicts are skipped (callers detect them via
          ``_query_has_nested_object`` and fall back to POST).
        """
        from urllib.parse import quote
        parts: List[str] = []
        for key, value in query.items():
            if value is None:
                continue
            if isinstance(value, (list, tuple)):
                for v in value:
                    if v is None:
                        continue
                    parts.append(f"{quote(str(key), safe='')}={quote(str(v), safe='')}")
            elif isinstance(value, dict):
                continue
            elif isinstance(value, bool):
                # Python's str(True) is "True" — the sidecar expects lowercase.
                parts.append(f"{quote(str(key), safe='')}={'true' if value else 'false'}")
            else:
                parts.append(f"{quote(str(key), safe='')}={quote(str(value), safe='')}")
        return "&".join(parts)

    @staticmethod
    def _query_has_nested_object(query: Dict[str, Any]) -> bool:
        """True if any value is a nested dict (not a list/scalar).

        Nested dicts can't be faithfully expressed in a query string, so we
        fall back to POST to preserve the original shape.
        """
        for value in query.values():
            if value is None:
                continue
            if isinstance(value, dict):
                return True
        return False

    def _sidecar_read_request(
        self,
        method_name: str,
        query: Dict[str, Any],
        args: List[Any],
    ) -> Dict[str, Any]:
        """Dispatch a sidecar read, preferring GET with POST fallback.

        GET is attempted when the client has no per-instance credentials
        (the sidecar's GET handler drops credentials to avoid leaking them
        through query strings), the server hasn't already told us it
        doesn't understand GET, and the query is flat enough to serialise.

        On 404/405 the client remembers the downgrade and transparently
        POSTs, so users talking to an older pmxt-core build continue to
        work unchanged. Every non-404/405 GET error is raised via the
        same ``_parse_api_exception`` path as the POST fallback.
        """
        base_url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/{method_name}"
        query = _convert_params_to_camel(query)
        creds = self._get_credentials_dict()
        has_credentials = creds is not None

        if (
            not has_credentials
            and not self._get_reads_unsupported
            and not self._query_has_nested_object(query)
        ):
            qs = self._build_sidecar_query_string(query)
            get_url = f"{base_url}?{qs}" if qs else base_url
            headers = {"Accept": "application/json"}
            headers.update(self._get_auth_headers())
            try:
                response = self._fetch_with_retry(
                    lambda: self._api_client.call_api(
                        method="GET",
                        url=get_url,
                        header_params=headers,
                    )
                )
                response.read()
                status = getattr(response, "status", 200)
                if status in (404, 405):
                    # Older sidecar without GET dispatch — remember and
                    # fall through to POST below.
                    self._get_reads_unsupported = True
                else:
                    return json.loads(response.data)
            except ApiException as e:
                if getattr(e, "status", None) in (404, 405):
                    self._get_reads_unsupported = True
                else:
                    raise self._parse_api_exception(e) from None

        # POST fallback — identical to the original per-method template.
        body: Dict[str, Any] = {"args": args}
        if creds:
            body["credentials"] = creds
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        headers.update(self._get_auth_headers())
        try:
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=base_url,
                    body=body,
                    header_params=headers,
                )
            )
            response.read()
            return json.loads(response.data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

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
                url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/has"
                headers = {"Accept": "application/json"}
                headers.update(self._get_auth_headers())
                response = self._fetch_with_retry(
                    lambda: self._api_client.call_api(
                        method="GET",
                        url=url,
                        header_params=headers,
                    )
                )
                response.read()
                data_json = json.loads(response.data)
                self._has_cache = self._handle_response(data_json)
            except Exception as e:
                raise PmxtError(f"Failed to fetch exchange capabilities: {e}") from e
        return self._has_cache

    # Low-Level API Access

    def _call_method(self, method_name: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Call any exchange method on the server by name."""
        try:
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/{method_name}"
            body: Dict[str, Any] = {"args": [params] if params is not None else []}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers,
                )
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
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/callApi"

            body = {"args": [operation_id, params]}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers
                )
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
            if market.slug:
                self.markets_by_slug[market.slug] = market

        self._loaded_markets = True
        return self.markets

    # BEGIN GENERATED METHODS

    def fetch_markets(self, params: Optional[dict] = None, **kwargs) -> List[UnifiedMarket]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchMarkets"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_market(e) for e in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_markets_paginated(self, params: Optional[dict] = None, **kwargs) -> PaginatedMarketsResult:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchMarketsPaginated"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return PaginatedMarketsResult(
                data=[_convert_market(m) for m in data.get("data", [])],
                total=data.get("total"),
                next_cursor=data.get("nextCursor"),
            )
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_events(self, params: Optional[dict] = None, **kwargs) -> List[UnifiedEvent]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchEvents"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_event(e) for e in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_series(self, params: Optional[dict] = None, **kwargs) -> List[UnifiedSeries]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchSeries"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_series(e) for e in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_market(self, params: Optional[Union[dict, str]] = None, **kwargs) -> UnifiedMarket:
        try:
            args = []
            if isinstance(params, str):
                params = {"market_id": params}
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchMarket"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_market(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_event(self, params: Optional[dict] = None, **kwargs) -> UnifiedEvent:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchEvent"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_event(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_order_book(self, outcome_id: Union[str, "MarketOutcome"] = _UNSET, limit: Optional[float] = None, params: Optional[FetchOrderBookParams] = None, **kwargs) -> Union[OrderBook, List[OrderBook]]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            outcome_id = _compat_id(outcome_id, kwargs)
            args.append(_resolve_outcome_id(outcome_id))
            if limit is not None:
                args.append(limit)
            if params is not None:
                if limit is None:
                    args.append(None)
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchOrderBook"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            if isinstance(data, list):
                return [_convert_order_book(d) for d in data]
            return _convert_order_book(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_order_books(self, outcome_ids: List[Union[str, "MarketOutcome"]]) -> Dict[str, OrderBook]:
        try:
            args = []
            args.append([_resolve_outcome_id(x) for x in outcome_ids])
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchOrderBooks"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return {key: _convert_order_book(value) for key, value in (data or {}).items()}
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def cancel_order(self, order_id: str) -> Order:
        if self.is_hosted:
            return self._hosted_cancel_order(order_id)
        try:
            args = []
            args.append(order_id)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/cancelOrder"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_order(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_order(self, order_id: str) -> Order:
        if self.is_hosted:
            response = self._hosted_request(
                "fetch_order",
                path_params={"order_id": order_id},
            )
            return self._hosted_single(response, "order", order_from_v0)
        try:
            args = []
            args.append(order_id)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchOrder"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_order(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_open_orders(self, market_id: Optional[str] = None) -> List[Order]:
        if self.is_hosted:
            resolved_address = resolve_wallet_address(self, None)
            params: Dict[str, Any] = {"address": resolved_address}
            if market_id is not None:
                params["market_id"] = market_id
            response = self._hosted_request(
                "fetch_open_orders",
                params=params,
            )
            return self._hosted_collection(response, "orders", order_from_v0)
        try:
            args = []
            if market_id is not None:
                args.append(market_id)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchOpenOrders"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_order(e) for e in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_my_trades(self, params: Optional[dict] = None, **kwargs) -> List[UserTrade]:
        if self.is_hosted:
            resolved_address = resolve_wallet_address(self, None)
            response = self._hosted_request(
                "fetch_my_trades",
                path_params={"address": resolved_address},
            )
            return self._hosted_collection(response, "trades", user_trade_from_v0)
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchMyTrades"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_user_trade(e) for e in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_closed_orders(self, params: Optional[dict] = None, **kwargs) -> List[Order]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchClosedOrders"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_order(e) for e in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_all_orders(self, params: Optional[dict] = None, **kwargs) -> List[Order]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchAllOrders"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_order(e) for e in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_positions(self, address: Optional[str] = None) -> List[Position]:
        if self.is_hosted:
            resolved_address = resolve_wallet_address(self, address)
            response = self._hosted_request(
                "fetch_positions",
                path_params={"address": resolved_address},
            )
            return self._hosted_collection(response, "positions", position_from_v0)
        try:
            args = []
            if address is not None:
                args.append(address)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchPositions"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_position(e) for e in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_balance(self, address: Optional[str] = None) -> List[Balance]:
        if self.is_hosted:
            resolved_address = resolve_wallet_address(self, address)
            response = self._hosted_request(
                "fetch_balance",
                path_params={"address": resolved_address},
            )
            return self._hosted_collection(response, "balances", balance_from_v0)
        try:
            args = []
            if address is not None:
                args.append(address)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchBalance"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_balance(e) for e in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def unwatch_order_book(self, outcome_id: Union[str, "MarketOutcome"] = _UNSET, **_compat_kwargs) -> None:
        try:
            args = []
            outcome_id = _compat_id(outcome_id, _compat_kwargs)
            args.append(_resolve_outcome_id(outcome_id))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/unwatchOrderBook"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            self._handle_response(json.loads(response.data))
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def unwatch_address(self, address: str) -> None:
        try:
            args = []
            args.append(address)
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/unwatchAddress"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            self._handle_response(json.loads(response.data))
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def close(self) -> None:
        try:
            args = []
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/close"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            self._handle_response(json.loads(response.data))
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_market_matches(self, params: Optional[dict] = None, **kwargs) -> List[Any]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchMarketMatches"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return data
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_matches(self, params: dict, **kwargs) -> List[Any]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchMatches"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return data
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_event_matches(self, params: Optional[dict] = None, **kwargs) -> List[Any]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchEventMatches"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return data
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def compare_market_prices(self, params: dict, **kwargs) -> List[Any]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/compareMarketPrices"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return data
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_related_markets(self, params: dict, **kwargs) -> List[Any]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchRelatedMarkets"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return data
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_matched_markets(self, params: Optional[dict] = None, **kwargs) -> List[Any]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchMatchedMarkets"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return data
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_matched_prices(self, params: Optional[dict] = None, **kwargs) -> List[Any]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchMatchedPrices"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return data
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_hedges(self, params: dict, **kwargs) -> List[Any]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchHedges"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return data
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def fetch_arbitrage(self, params: Optional[dict] = None, **kwargs) -> List[Any]:
        try:
            args = []
            if kwargs:
                params = {**(params or {}), **kwargs}
            if params is not None:
                args.append(_convert_params_to_camel(params))
            body: dict = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/fetchArbitrage"
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(method="POST", url=url, body=body, header_params=headers)
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return data
        except ApiException as e:
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
        outcome_id: Union[str, "MarketOutcome"] = _UNSET,
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
            outcome_id = _compat_id(outcome_id, kwargs)
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

            args = [outcome_id, params_dict]
            query = {"outcomeId": outcome_id, **params_dict}
            data = self._handle_response(
                self._sidecar_read_request("fetchOHLCV", query, args)
            )
            return [_convert_candle(c) for c in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    def fetch_trades(
        self,
        outcome_id: Union[str, "MarketOutcome"] = _UNSET,
        limit: Optional[int] = None,
        since: Optional[int] = None,
        start: Optional[Union[str, int]] = None,
        end: Optional[Union[str, int]] = None,
        resolution: Optional[str] = None,
        **kwargs
    ) -> List[Trade]:
        """
        Get trade history for an outcome.

        Note: Polymarket requires API key.

        Args:
            outcome_id: Outcome ID (from market.outcomes[].outcome_id)
            limit: Maximum number of trades to return
            since: Return trades since this timestamp (Unix milliseconds)
            start: Start of time range (ISO 8601 string or epoch seconds/ms)
            end: End of time range (ISO 8601 string or epoch seconds/ms)
            resolution: Optional trade resolution/status filter forwarded to the venue
            **kwargs: Additional parameters

        Returns:
            List of trades

        Example:
            >>> trades = exchange.fetch_trades(outcome_id, limit=50)
            >>> trades = exchange.fetch_trades(outcome_id, start="2025-01-01T00:00:00Z", end="2025-01-31T00:00:00Z")
        """
        try:
            outcome_id = _compat_id(outcome_id, kwargs)
            outcome_id = _resolve_outcome_id(outcome_id)
            params_dict = {}
            if limit:
                params_dict["limit"] = limit
            if since:
                params_dict["since"] = since
            if start is not None:
                params_dict["start"] = start
            if end is not None:
                params_dict["end"] = end
            if resolution is not None:
                params_dict["resolution"] = resolution

            # Add any extra keyword arguments
            for key, value in kwargs.items():
                if key not in params_dict:
                    params_dict[key] = value

            args = [outcome_id, params_dict]
            query = {"outcomeId": outcome_id, **params_dict}
            data = self._handle_response(
                self._sidecar_read_request("fetchTrades", query, args)
            )
            return [_convert_trade(t) for t in data]
        except Exception as e:
            raise self._parse_api_exception(e) from None

    # WebSocket Streaming Methods

    def _get_or_create_ws(self):
        """Return the shared WebSocket client, creating it on first use.

        Thread-safe. Returns None if the websocket-client package is not
        installed or the sidecar /ws endpoint was previously found to be
        unavailable.
        """
        if self._ws_unsupported:
            return None

        with self._ws_lock:
            if self._ws_client is not None and self._ws_client.connected:
                return self._ws_client

            try:
                from .ws_client import SidecarWsClient
            except ImportError:
                self._ws_unsupported = True
                return None

            host = self._resolve_sidecar_host()
            if self.is_hosted:
                client = SidecarWsClient(host, api_key=self.pmxt_api_key)
            else:
                server_info = self._server_manager.get_server_info()
                access_token = (
                    server_info.get("accessToken") if server_info else None
                )
                client = SidecarWsClient(host, access_token=access_token)
            try:
                # Trigger connection to validate the endpoint exists
                with client._lock:
                    client._ensure_connected()
            except Exception:
                # WS endpoint not available -- remember and fail fast.
                self._ws_unsupported = True
                return None

            self._ws_client = client
            return self._ws_client

    def _watch_via_ws(
        self,
        method: str,
        args: List[Any],
    ) -> Optional[Any]:
        """Attempt to use the WS transport for a watch method.

        Returns the raw data payload on success, or None if WS is unavailable.
        """
        ws = self._get_or_create_ws()
        if ws is None:
            return None

        try:
            return ws.subscribe(
                exchange=self.exchange_name,
                method=method,
                args=args,
                credentials=self._get_credentials_dict(),
            )
        except (ConnectionError, OSError):
            # Transport-level failure.
            return None

    def _ws_required_error(self, method_name: str) -> PmxtError:
        return PmxtError(f"{method_name}() requires WebSocket transport — connection failed")

    def _require_ws_transport(self, method_name: str) -> "SidecarWsClient":
        ws = self._get_or_create_ws()
        if ws is None:
            raise self._ws_required_error(method_name)
        return ws

    def _watch_required_via_ws(
        self,
        public_method_name: str,
        ws_method_name: str,
        args: List[Any],
    ) -> Any:
        data = self._watch_via_ws(ws_method_name, args)
        if data is None:
            raise self._ws_required_error(public_method_name)
        return data

    def _watch_batch_required_via_ws(
        self,
        public_method_name: str,
        ws_method_name: str,
        args: List[Any],
    ) -> Any:
        ws = self._require_ws_transport(public_method_name)
        try:
            return ws.subscribe_batch(
                exchange=self.exchange_name,
                method=ws_method_name,
                args=args,
                credentials=self._get_credentials_dict(),
            )
        except (ConnectionError, OSError) as e:
            self._ws_unsupported = True
            raise self._ws_required_error(public_method_name) from e

    def _unwatch_required_via_ws(
        self,
        public_method_name: str,
        ws_method_name: str,
        args: List[Any],
    ) -> None:
        ws = self._require_ws_transport(public_method_name)
        try:
            with ws._lock:
                ws._ensure_connected()
                sub_key = None
                existing_id = None
                if ws_method_name == "unwatchOrderBook" and args:
                    sub_key = f"watchOrderBook:{args[0]}"
                    existing_id = ws._active_subs.get(sub_key)
                request_id = existing_id or f"req-{uuid.uuid4().hex[:12]}"
                message = {
                    "id": request_id,
                    "action": "unsubscribe",
                    "exchange": self.exchange_name,
                    "method": ws_method_name,
                    "args": args,
                }
                ws._ws.send(json.dumps(message))

                if sub_key:
                    existing_id = ws._active_subs.pop(sub_key, None)
                    if existing_id:
                        ws._subscriptions.pop(existing_id, None)
                        ws._data_queues.pop(existing_id, None)
                        ws._data_store.pop(existing_id, None)
        except PmxtError:
            raise
        except Exception as e:
            self._ws_unsupported = True
            raise self._ws_required_error(public_method_name) from e

    def watch_order_book(
        self,
        outcome_id: Union[str, "MarketOutcome"] = _UNSET,
        limit: Optional[int] = None,
        params: Optional[Dict[str, Any]] = None,
        **_compat_kwargs,
    ) -> OrderBook:
        """
        Watch real-time order book updates via WebSocket.

        Returns a promise that resolves with the next order book update.
        Call repeatedly in a loop to stream updates (CCXT Pro pattern).

        Requires the sidecar WebSocket transport.

        Args:
            outcome_id: Outcome ID to watch
            limit: Optional depth limit for order book
            params: Optional exchange-specific parameters

        Returns:
            Next order book update

        Example:
            >>> # Stream order book updates
            >>> while True:
            ...     order_book = exchange.watch_order_book(outcome_id)
            ...     print(f"Best bid: {order_book.bids[0].price}")
            ...     print(f"Best ask: {order_book.asks[0].price}")
        """
        outcome_id = _compat_id(outcome_id, _compat_kwargs)
        outcome_id = _resolve_outcome_id(outcome_id)
        args: List[Any] = [outcome_id]
        if limit is not None:
            args.append(limit)
        if params:
            if limit is None:
                args.append(None)
            args.append(_convert_params_to_camel(params))

        ws_data = self._watch_required_via_ws(
            "watch_order_book",
            "watchOrderBook",
            args,
        )
        return _convert_order_book(ws_data)

    def watch_order_books(
        self,
        outcome_ids: List[Union[str, "MarketOutcome"]] = _UNSET,
        limit: Optional[int] = None,
        params: Optional[Dict[str, Any]] = None,
        **_compat_kwargs,
    ) -> Dict[str, OrderBook]:
        """
        Watch real-time order book updates for multiple outcomes at once.

        Returns a dict mapping each outcome ID (ticker) to its latest
        order book snapshot. Call repeatedly in a loop to stream updates
        (CCXT Pro pattern).

        Requires the sidecar WebSocket transport.

        Args:
            outcome_ids: List of outcome IDs (or MarketOutcome objects)
                to watch simultaneously.
            limit: Optional depth limit for each order book.
            params: Optional exchange-specific parameters.

        Returns:
            Dict mapping ticker string to OrderBook.

        Example:
            >>> # Stream multiple order books
            >>> ids = [m.outcomes[0].outcome_id for m in markets[:3]]
            >>> while True:
            ...     books = exchange.watch_order_books(ids)
            ...     for ticker, ob in books.items():
            ...         print(f"{ticker}: bid={ob.bids[0].price}")
        """
        if outcome_ids is _UNSET:
            if 'ids' in _compat_kwargs:
                import warnings
                warnings.warn(
                    "Parameter 'ids' is deprecated, use 'outcome_ids' instead.",
                    DeprecationWarning,
                    stacklevel=2,
                )
                outcome_ids = _compat_kwargs.pop('ids')
            else:
                raise TypeError("Missing required argument: 'outcome_ids'")
        resolved_ids = [_resolve_outcome_id(oid) for oid in outcome_ids]
        args: List[Any] = [resolved_ids]
        if limit is not None:
            args.append(limit)
        if params:
            if limit is None:
                args.append(None)
            args.append(_convert_params_to_camel(params))

        raw_result = self._watch_batch_required_via_ws(
            "watch_order_books",
            "watchOrderBooks",
            args,
        )
        if isinstance(raw_result, dict):
            return {
                k: _convert_order_book(v)
                for k, v in raw_result.items()
                if isinstance(v, dict)
            }
        return {}

    def watch_all_order_books(
        self,
        venues: Optional[List[str]] = None,
    ) -> "FirehoseEvent":
        """Stream all orderbook updates across venues via the hosted WebSocket API.

        Returns the next book event. Call repeatedly in a loop to stream
        updates (CCXT Pro pattern). Requires hosted mode (``pmxt_api_key`` set).

        Args:
            venues: Optional venue filter. Defaults to this exchange's venue
                for venue clients (e.g. Kalshi -> ``["kalshi"]``); Router
                defaults to all venues.

        Returns:
            FirehoseEvent with source, symbol, and orderbook
        """
        if not self.is_hosted:
            raise PmxtError("watch_all_order_books() requires hosted mode (set pmxt_api_key)")

        effective_venues = venues if venues is not None else self._default_watch_all_order_book_venues()
        args: List[Any] = [effective_venues] if effective_venues else []
        data = self._watch_via_ws("watchAllOrderBooks", args)
        if data is not None:
            return FirehoseEvent(
                source=data.get("_source", ""),
                symbol=data.get("_symbol", ""),
                orderbook=_convert_order_book(data),
            )

        raise PmxtError("watch_all_order_books() requires WebSocket transport — connection failed")

    def firehose(
        self,
        venues: Optional[List[str]] = None,
    ) -> "FirehoseEvent":
        """Deprecated: Use :meth:`watch_all_order_books` instead."""
        return self.watch_all_order_books(venues)

    def watch_trades(
        self,
        outcome_id: Union[str, "MarketOutcome"] = _UNSET,
        address: Optional[str] = None,
        since: Optional[int] = None,
        limit: Optional[int] = None,
        **_compat_kwargs,
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
        outcome_id = _compat_id(outcome_id, _compat_kwargs)
        outcome_id = _resolve_outcome_id(outcome_id)
        args: List[Any] = [outcome_id]
        if address is not None:
            args.append(address)
        if since is not None:
            args.append(since)
        if limit is not None:
            args.append(limit)

        data = self._watch_required_via_ws(
            "watch_trades",
            "watchTrades",
            args,
        )
        if not isinstance(data, list):
            raise PmxtError("watch_trades() expected WebSocket trade list")
        return [_convert_trade(t) for t in data]

    def watch_address(
        self,
        address: str,
        types: Optional[List[SubscriptionOption]] = None,
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
            args: List[Any] = [address]
            if types is not None:
                args.append(types)

            body: Dict[str, Any] = {"args": args}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/watchAddress"
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers,
                )
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
            body: Dict[str, Any] = {"args": [address]}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/unwatchAddress"
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers,
                )
            )
            response.read()
            return self._handle_response(json.loads(response.data))
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def watch_prices(self, market_address: str, callback: Optional[Callable[[Dict[str, Any]], None]] = None) -> Dict[str, Any]:
        """
        Watch real-time AMM price updates via WebSocket.

        Args:
            market_address: Market contract address
            callback: Optional callback for price updates (if supported by implementation)

        Returns:
            Next price update
        """
        try:
            body: Dict[str, Any] = {"args": [market_address]}

            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/watchPrices"
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers,
                )
            )
            response.read()
            return self._handle_response(json.loads(response.data))
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def watch_user_positions(self, callback: Optional[Callable[[Dict[str, Any]], None]] = None) -> List[Position]:
        """
        Watch real-time user position updates via WebSocket.
        Requires API key authentication.

        Args:
            callback: Optional callback for position updates

        Returns:
            Next position update
        """
        try:
            body: Dict[str, Any] = {"args": []}

            # Add credentials (required)
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/watchUserPositions"
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers,
                )
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return [_convert_position(p) for p in data]
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def watch_user_transactions(self, callback: Optional[Callable[[Dict[str, Any]], None]] = None) -> Dict[str, Any]:
        """
        Watch real-time user transaction updates via WebSocket.
        Requires API key authentication.

        Args:
            callback: Optional callback for transaction updates

        Returns:
            Next transaction update
        """
        try:
            body: Dict[str, Any] = {"args": []}

            # Add credentials (required)
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/watchUserTransactions"
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers,
                )
            )
            response.read()
            return self._handle_response(json.loads(response.data))
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    # Trading Methods (require authentication)

    def _discover_hosted_account(self) -> dict:
        if not hasattr(self, "_hosted_account_cache"):
            import requests as _req
            try:
                resp = _req.get(
                    f"{self._resolve_sidecar_host()}/v0/account",
                    headers=self._get_auth_headers(),
                    timeout=10,
                )
                self._hosted_account_cache = resp.json() if resp.ok else {}
            except Exception:
                self._hosted_account_cache = {}
        return self._hosted_account_cache

    def _execute_sor_order(self, **kwargs) -> "Order":
        import requests as _req
        import time
        account = self._discover_hosted_account()
        host = self._resolve_sidecar_host()

        o = kwargs.get("outcome")
        if o is not None and hasattr(o, "market_id"):
            params = {"marketId": o.market_id, "outcomeId": o.outcome_id, "side": kwargs.get("side", "buy"), "shares": kwargs.get("amount", 0)}
        else:
            params = {"marketId": kwargs.get("market_id"), "side": kwargs.get("side", "buy"), "outcome": kwargs.get("outcome"), "shares": kwargs.get("amount", 0)}
        if kwargs.get("price") is not None:
            params["price"] = kwargs["price"]
        if kwargs.get("tick_size") is not None:
            params["tickSize"] = kwargs["tick_size"]
        if kwargs.get("neg_risk") is not None:
            params["negRisk"] = kwargs["neg_risk"]
        if kwargs.get("on_behalf_of") is not None:
            params["onBehalfOf"] = kwargs["on_behalf_of"]
        params = {k: v for k, v in params.items() if v is not None}

        build_resp = _req.post(f"{host}/api/sor/buildOrder", headers={"Content-Type": "application/json", **self._get_auth_headers()}, json={"args": [params]}, timeout=30)
        if not build_resp.ok:
            raise PmxtError(f"buildOrder failed: {build_resp.text}")
        build_data = build_resp.json().get("data", build_resp.json())
        order_id, legs = build_data["orderId"], build_data["legs"]

        fills = []
        for leg in legs:
            try:
                from . import _exchanges
                venue_map = {"polymarket": getattr(_exchanges, "Polymarket", None), "limitless": getattr(_exchanges, "Limitless", None)}
                venue_cls = venue_map.get(leg["venue"])
                if not venue_cls:
                    raise PmxtError(f"Unsupported venue: {leg['venue']}")
                venue_opts = {"private_key": self.private_key}
                if leg["venue"] == "polymarket" and account.get("deposit_wallet"):
                    venue_opts["proxy_address"] = account["deposit_wallet"]
                    venue_opts["signature_type"] = account.get("signature_type", 3)
                venue = venue_cls(**venue_opts)
                result = venue.create_order(market_id=leg.get("venueMarketId"), outcome_id=leg["tokenId"], side=leg["side"], amount=leg["shares"], price=leg["price"])
                filled = getattr(result, "filled", 0) or 0
                fills.append({"venue": leg["venue"], "venueOrderId": result.id, "venueMarketId": leg.get("venueMarketId"), "venueOutcomeId": leg.get("venueOutcomeId"), "shares": filled if filled > 0 else leg["shares"], "price": getattr(result, "price", None) or leg["price"], "status": "filled" if filled > 0 else "open"})
            except Exception as e:
                fills.append({"venue": leg["venue"], "venueMarketId": leg.get("venueMarketId"), "venueOutcomeId": leg.get("venueOutcomeId"), "shares": leg["shares"], "price": leg["price"], "status": "failed", "error": str(e)})

        submit_resp = _req.post(f"{host}/api/sor/submitOrder", headers={"Content-Type": "application/json", **self._get_auth_headers()}, json={"args": [{"orderId": order_id, "fills": fills}]}, timeout=30)
        if not submit_resp.ok:
            raise PmxtError(f"submitOrder failed: {submit_resp.text}")
        data = submit_resp.json().get("data", submit_resp.json())
        if data.get("status") == "failed" and data.get("errors"):
            raise PmxtError(data["errors"][0])
        from .models import Order
        return Order(
            id=data.get("id", order_id), market_id=params.get("marketId", ""),
            outcome_id="", side=params.get("side", "buy"), type="market",
            amount=float(data.get("filled_shares", 0)), price=float(data.get("average_price") or 0),
            filled=float(data.get("filled_shares", 0)), filled_shares=float(data.get("filled_shares", 0)) if data.get("filled_shares") is not None else None,
            remaining=0,
            status=data.get("status", "unknown"), fee=float(data.get("fee_amount", 0)),
            fee_rate_bps=float(data.get("fee_rate_bps")) if data.get("fee_rate_bps") is not None else None,
            timestamp=int(time.time() * 1000),
        )

    def create_order(
        self,
        market_id: Optional[str] = None,
        outcome_id: Optional[str] = None,
        *,
        side: Literal["buy", "sell"],
        order_type: Literal["market", "limit"],
        amount: float,
        price: Optional[float] = None,
        fee: Optional[int] = None,
        tick_size: Optional[float] = None,
        neg_risk: Optional[bool] = None,
        on_behalf_of: Optional[int] = None,
        outcome: Optional[MarketOutcome] = None,
        denom: Optional[Literal["usdc", "shares"]] = None,
        slippage_pct: Optional[float] = None,
    ) -> Order:
        """
        Create a new order.

        In hosted mode (``pmxt_api_key`` + ``wallet_address`` + ``private_key``)
        this wraps build -> local EIP-712 sign -> submit against the hosted
        trading API. Venue-direct mode executes locally with raw credentials.

        You can specify the market either with explicit market_id/outcome_id,
        or by passing an outcome object directly (e.g., market.yes).

        Args:
            market_id: Market ID (or use outcome instead)
            outcome_id: Outcome ID (or use outcome instead)
            side: Order side (buy/sell)
            order_type: Order type (market/limit)
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
            ...     order_type="limit",
            ...     amount=10,
            ...     price=0.55
            ... )
            >>>
            >>> # Using outcome shorthand:
            >>> order = exchange.create_order(
            ...     outcome=market.yes,
            ...     side="buy",
            ...     order_type="market",
            ...     amount=10,
            ... )
        """
        if self.is_hosted:
            if self.exchange_name == "sor" and self.private_key:
                return self._execute_sor_order(
                    market_id=market_id, outcome_id=outcome_id, side=side,
                    type=order_type, amount=amount, price=price, outcome=outcome,
                    tick_size=tick_size, neg_risk=neg_risk, on_behalf_of=on_behalf_of,
                )
            if self.signer is None:
                raise InvalidSignature(
                    "create_order requires a signer (or private_key) in hosted "
                    "trading mode; construct the exchange with private_key= or "
                    "signer=."
                )
            build_request = self._hosted_build_order_request(
                market_id,
                outcome_id,
                side=side,
                order_type=order_type,
                amount=amount,
                price=price,
                fee=fee,
                outcome=outcome,
                denom=denom,
                slippage_pct=slippage_pct,
            )
            build_payload = self._hosted_response_data(
                self._hosted_request("create_order", body=build_request)
            )
            if not isinstance(build_payload, dict):
                raise InvalidSignature("hosted build response must be an object")
            self._validate_hosted_build_response(build_payload, build_request)
            submit_body = self._hosted_submit_body(build_payload, build_request)
            response = self._hosted_request("submit_order", body=submit_body)
            return self._hosted_single(response, "order", order_from_v0)
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
                "type": order_type,
                "amount": amount,
            }
            if price is not None:
                params_dict["price"] = price
            if fee is not None:
                params_dict["fee"] = fee
            if tick_size is not None:
                params_dict["tickSize"] = tick_size
            if neg_risk is not None:
                params_dict["negRisk"] = neg_risk
            if on_behalf_of is not None:
                params_dict["onBehalfOf"] = on_behalf_of

            body: Dict[str, Any] = {"args": [params_dict]}

            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/createOrder"
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers,
                )
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
            return _convert_order(data)
        except ApiException as e:
            raise self._parse_api_exception(e) from None

    def build_order(
        self,
        market_id: Optional[str] = None,
        outcome_id: Optional[str] = None,
        *,
        side: Literal["buy", "sell"],
        order_type: Literal["market", "limit"],
        amount: float,
        price: Optional[float] = None,
        fee: Optional[int] = None,
        tick_size: Optional[float] = None,
        neg_risk: Optional[bool] = None,
        on_behalf_of: Optional[int] = None,
        outcome: Optional[MarketOutcome] = None,
        denom: Optional[Literal["usdc", "shares"]] = None,
        slippage_pct: Optional[float] = None,
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
            order_type: Order type (market/limit)
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
            ...     order_type="limit",
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
            ...     order_type="market",
            ...     amount=10
            ... )
        """
        if self.is_hosted:
            build_request = self._hosted_build_order_request(
                market_id,
                outcome_id,
                side=side,
                order_type=order_type,
                amount=amount,
                price=price,
                fee=fee,
                outcome=outcome,
                denom=denom,
                slippage_pct=slippage_pct,
            )
            build_payload = self._hosted_response_data(
                self._hosted_request("build_order", body=build_request)
            )
            if not isinstance(build_payload, dict):
                raise InvalidSignature("hosted build response must be an object")
            self._validate_hosted_build_response(build_payload, build_request)
            built = built_order_from_v0(build_payload)
            return self._with_hosted_build_request(built, build_payload, build_request)
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
                "type": order_type,
                "amount": amount,
            }
            if price is not None:
                params_dict["price"] = price
            if fee is not None:
                params_dict["fee"] = fee
            if tick_size is not None:
                params_dict["tickSize"] = tick_size
            if neg_risk is not None:
                params_dict["negRisk"] = neg_risk
            if on_behalf_of is not None:
                params_dict["onBehalfOf"] = on_behalf_of

            body: Dict[str, Any] = {"args": [params_dict]}

            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/buildOrder"
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers,
                )
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
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
        if self.is_hosted:
            if self.signer is None:
                raise InvalidSignature(
                    "submit_order requires a signer (or private_key) in hosted "
                    "trading mode; construct the exchange with private_key= or "
                    "signer=."
                )
            build_payload = self._hosted_built_payload(built)
            build_request = self._hosted_build_request_from_payload(build_payload)
            submit_body = self._hosted_submit_body(build_payload, build_request)
            response = self._hosted_request("submit_order", body=submit_body)
            return self._hosted_single(response, "order", order_from_v0)
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

            body: Dict[str, Any] = {"args": [built_dict]}

            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/submitOrder"
            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers,
                )
            )
            response.read()
            data = self._handle_response(json.loads(response.data))
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

            url = f"{self._resolve_sidecar_host()}/api/{self.exchange_name}/getExecutionPriceDetailed"

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._get_auth_headers())

            response = self._fetch_with_retry(
                lambda: self._api_client.call_api(
                    method="POST",
                    url=url,
                    body=body,
                    header_params=headers
                )
            )

            response.read()
            data_json = json.loads(response.data)

            data = self._handle_response(data_json)
            return _convert_execution_result(data)
        except Exception as e:
            raise self._parse_api_exception(e) from None
