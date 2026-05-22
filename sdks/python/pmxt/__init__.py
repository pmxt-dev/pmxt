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

from .client import Exchange
from ._exchanges import Polymarket, Limitless, Kalshi, KalshiDemo, Probable, Baozi, Myriad, Opinion, Metaculus, Smarkets, PolymarketUs, Hyperliquid, GeminiTitan, Mock, Router
from .router import Router
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
    MarketFilterCriteria,
    EventFilterCriteria,
    MarketFetchParams,
    EventFetchParams,
    MatchResult,
    EventMatchResult,
    PriceComparison,
    ArbitrageOpportunity,
    MatchRelation,
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

    def __init__(self, manager: ServerManager):
        self._manager = manager

    def status(self):
        return self._manager.status()

    def health(self) -> bool:
        return self._manager.health()

    def start(self) -> None:
        self._manager.start()

    def stop(self) -> None:
        self._manager.stop()

    def restart(self) -> None:
        self._manager.restart()

    def logs(self, n: int = 50):
        return self._manager.logs(n)


server = _ServerNamespace(_default_manager)


# Deprecated flat aliases. Prefer ``pmxt.server.stop()`` / ``pmxt.server.restart()``.
def stop_server():
    """Deprecated: use ``pmxt.server.stop()`` instead."""
    import warnings
    warnings.warn(
        "pmxt.stop_server() is deprecated; use pmxt.server.stop() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    _default_manager.stop()


def restart_server():
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
    "PolymarketUs",
    "Hyperliquid",
    "GeminiTitan",
    "Mock",
    "Router",
    "Exchange",
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
    "MarketOutcome",
    "MarketList",
    "PriceCandle",
    "OrderBook",
    "OrderLevel",
    "Trade",
    "UserTrade",
    "PaginatedMarketsResult",
    "PaginatedEventsResult",
    "Order",
    "BuiltOrder",
    "Position",
    "Balance",
    "MatchResult",
    "EventMatchResult",
    "PriceComparison",
    "ArbitrageOpportunity",
    "MatchRelation",
]
