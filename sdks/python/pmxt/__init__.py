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
    >>> # Search for markets
    >>> markets = await poly.search_markets("Trump")
    >>> print(markets[0].title)
"""

from .client import Polymarket, Kalshi, Limitless, Exchange
from .server_manager import ServerManager
from .models import (
    UnifiedMarket,
    MarketOutcome,
    PriceCandle,
    OrderBook,
    OrderLevel,
    Trade,
    Order,
    Position,
    Balance,
    MarketFilterParams,
    HistoryFilterParams,
    CreateOrderParams,
)


# Global server management functions
_default_manager = ServerManager()

def stop_server():
    """
    Stop the background PMXT sidecar server.
    """
    _default_manager.stop()

def restart_server():
    """
    Restart the background PMXT sidecar server.
    """
    _default_manager.restart()

__version__ = "1.0.0b4"
__all__ = [
    # Exchanges
    "Polymarket",
    "Kalshi",
    "Limitless",
    "Exchange",
    # Server Management
    "ServerManager",
    "stop_server",
    "restart_server",
    # Data Models
    "UnifiedMarket",
    "MarketOutcome",
    "PriceCandle",
    "OrderBook",
    "OrderLevel",
    "Trade",
    "Order",
    "Position",
    "Balance",
    # Parameters
    "MarketFilterParams",
    "HistoryFilterParams",
    "CreateOrderParams",
]
