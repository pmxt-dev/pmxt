"""
PMXT - Unified Prediction Market API

A unified interface for interacting with multiple prediction market exchanges
(Kalshi, Polymarket) identically.

Example:
    >>> import pmxt
    >>>
    >>> # Initialize exchanges
    >>> poly = pmxt.Polymarket()
    >>> kalshi = pmxt.Kalshi()
    >>>
    >>> # Fetch markets
    >>> markets = await poly.fetch_markets(query="Trump")
    >>> print(markets[0].title)
"""

from typing import Any, Dict, List

from .client import Exchange
from .constants import ENV, ENV_BASE_URL, ENV_API_KEY
from ._exchanges import Polymarket, Limitless, Kalshi, KalshiDemo, Probable, Baozi, Myriad, Opinion, Metaculus, Smarkets, PolymarketUS, Polymarket_us, Hyperliquid, GeminiTitan, SuiBets, Suibets, Rain, Hunch, Mock, Router
from .router import Router
from .feed_client import FeedClient
from .server_manager import ServerManager
from .errors import (
    PmxtError,
    BadRequest,
    AuthenticationError,
    PermissionDenied,
    NotFoundError,
    OrderNotFound,
    MarketNotFound,
    EventNotFound,
    RateLimitExceeded,
    InvalidOrder,
    InsufficientFunds,
    ValidationError,
    NetworkError,
    ExchangeNotAvailable,
)
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
    FirehoseEvent,
    PaginatedMarketsResult,
    PaginatedEventsResult,
    Order,
    BuiltOrder,
    CreateOrderParams,
    TxPayload,
    Position,
    Balance,
    MarketFilterCriteria,
    EventFilterCriteria,
    MarketFetchParams,
    EventFetchParams,
    SeriesFetchParams,
    TradesParams,
    FetchOrderBookParams,
    HistoryFilterParams,
    OHLCVParams,
    MyTradesParams,
    OrderHistoryParams,
    ExchangeOptions,
    PolymarketOptions,
    RouterOptions,
    FeedClientOptions,
    MatchResult,
    EventMatchResult,
    MatchedMarketCluster,
    MatchedEventCluster,
    MatchedMarketClusterParams,
    MatchedEventClusterParams,
    PriceComparison,
    ArbitrageOpportunity,
    SubscribedAddressSnapshot,
    SubscriptionOption,
    ExecutionPriceResult,
    MatchRelation,
    ClusterSortOption,
    MatchedClusterSort,
    FetchMatchedMarketClustersParams,
    FetchMatchedEventClustersParams,
    SortOption,
    SearchIn,
    OrderSide,
    OrderType,
    CandleInterval,
)


# Global server management
_default_manager = ServerManager()


class _ServerNamespace:
    """
    Namespaced server management API: ``pmxt.server.<command>()``.

    Available commands:
        status()  - Structured snapshot of the sidecar (running, pid, port, version, uptime)
        health()  - True if the server responds to /health, False otherwise
        start()   - Idempotently start the sidecar (no-op if already running)
        stop()    - Stop the sidecar and clean up the lock file
        restart() - Stop and start the sidecar
        logs(n)   - Return the last n log lines from the sidecar log file
    """

    __slots__ = ("_manager",)

    def __init__(self, manager: ServerManager) -> None:
        self._manager = manager

    def status(self) -> Dict[str, Any]:
        return self._manager.status()

    def health(self) -> bool:
        return self._manager.health()

    def start(self) -> None:
        self._manager.start()

    def stop(self) -> None:
        self._manager.stop()

    def restart(self) -> None:
        self._manager.restart()

    def logs(self, n: int = 50) -> List[str]:
        return self._manager.logs(n)


server = _ServerNamespace(_default_manager)


# Deprecated flat aliases. Prefer ``pmxt.server.stop()`` / ``pmxt.server.restart()``.
def stop_server() -> None:
    """Deprecated: use ``pmxt.server.stop()`` instead."""
    import warnings
    warnings.warn(
        "pmxt.stop_server() is deprecated; use pmxt.server.stop() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    _default_manager.stop()


def restart_server() -> None:
    """Deprecated: use ``pmxt.server.restart()`` instead."""
    import warnings
    warnings.warn(
        "pmxt.restart_server() is deprecated; use pmxt.server.restart() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    _default_manager.restart()

__version__ = "2.17.1"
__all__ = [
    # Exchanges
    "Polymarket",
    "Limitless",
    "Kalshi",
    "KalshiDemo",
    "Probable",
    "Baozi",
    "Myriad",
    "Opinion",
    "Metaculus",
    "Smarkets",
    "PolymarketUS",
    "Polymarket_us",
    "Hyperliquid",
    "GeminiTitan",
    "SuiBets",
    "Suibets",
    "Rain",
    "Hunch",
    "Mock",
    "Router",
    "Exchange",
    "FeedClient",
    "ExchangeOptions",
    "PolymarketOptions",
    "RouterOptions",
    "FeedClientOptions",
    # Environment
    "ENV",
    "ENV_BASE_URL",
    "ENV_API_KEY",
    # Server Management
    "ServerManager",
    "server",
    "stop_server",
    "restart_server",
    # Errors
    "PmxtError",
    "BadRequest",
    "AuthenticationError",
    "PermissionDenied",
    "NotFoundError",
    "OrderNotFound",
    "MarketNotFound",
    "EventNotFound",
    "RateLimitExceeded",
    "InvalidOrder",
    "InsufficientFunds",
    "ValidationError",
    "NetworkError",
    "ExchangeNotAvailable",
    # Data Models
    "UnifiedMarket",
    "UnifiedEvent",
    "UnifiedSeries",
    "MarketOutcome",
    "MarketList",
    "PriceCandle",
    "OrderBook",
    "OrderLevel",
    "Trade",
    "UserTrade",
    "FirehoseEvent",
    "PaginatedMarketsResult",
    "PaginatedEventsResult",
    "Order",
    "BuiltOrder",
    "CreateOrderParams",
    "TxPayload",
    "ExecutionPriceResult",
    "Position",
    "Balance",
    "MatchResult",
    "EventMatchResult",
    "MatchedMarketCluster",
    "MatchedEventCluster",
    "MatchedMarketClusterParams",
    "MatchedEventClusterParams",
    "PriceComparison",
    "ArbitrageOpportunity",
    "SubscribedAddressSnapshot",
    "SubscriptionOption",
    "MatchRelation",
    "ClusterSortOption",
    "MatchedClusterSort",
    "FetchMatchedMarketClustersParams",
    "FetchMatchedEventClustersParams",
    "MarketFilterCriteria",
    "EventFilterCriteria",
    "MarketFetchParams",
    "EventFetchParams",
    "SeriesFetchParams",
    "TradesParams",
    "FetchOrderBookParams",
    "HistoryFilterParams",
    "OHLCVParams",
    "MyTradesParams",
    "OrderHistoryParams",
    "SortOption",
    "SearchIn",
    "OrderSide",
    "OrderType",
    "CandleInterval",
]
