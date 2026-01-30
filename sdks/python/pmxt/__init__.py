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

__version__ = "1.0.0b4"
__all__ = [
    # Exchanges
    "Polymarket",
    "Kalshi",
    "Limitless",
    "Exchange",
    # Server Management
    "ServerManager",
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
