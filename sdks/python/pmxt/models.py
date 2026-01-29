"""
Data models for PMXT.

These are clean Pythonic wrappers around the auto-generated OpenAPI models.
"""

from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from dataclasses import dataclass


# Parameter types
CandleInterval = Literal["1m", "5m", "15m", "1h", "6h", "1d"]
SortOption = Literal["volume", "liquidity", "newest"]
SearchIn = Literal["title", "description", "both"]
OrderSide = Literal["buy", "sell"]
OrderType = Literal["market", "limit"]


@dataclass
class MarketOutcome:
    """A single tradeable outcome within a market."""
    
    id: str
    """Outcome ID. Use this for fetchOHLCV/fetchOrderBook/fetchTrades.
    - Polymarket: CLOB Token ID
    - Kalshi: Market Ticker
    """
    
    label: str
    """Human-readable label (e.g., "Trump", "Yes")"""
    
    price: float
    """Current price (0.0 to 1.0, representing probability)"""
    
    price_change_24h: Optional[float] = None
    """24-hour price change"""
    
    metadata: Optional[Dict[str, Any]] = None
    """Exchange-specific metadata"""


@dataclass
class UnifiedMarket:
    """A unified market representation across exchanges."""
    
    id: str
    """Market ID"""
    
    title: str
    """Market title"""
    
    outcomes: List[MarketOutcome]
    """All tradeable outcomes"""
    
    volume_24h: float
    """24-hour trading volume (USD)"""
    
    liquidity: float
    """Current liquidity (USD)"""
    
    url: str
    """Direct URL to the market"""
    
    description: Optional[str] = None
    """Market description"""
    
    resolution_date: Optional[datetime] = None
    """Expected resolution date"""
    
    volume: Optional[float] = None
    """Total volume (USD)"""
    
    open_interest: Optional[float] = None
    """Open interest (USD)"""
    
    image: Optional[str] = None
    """Market image URL"""
    
    category: Optional[str] = None
    """Market category"""
    
    tags: Optional[List[str]] = None
    """Market tags"""

    yes: Optional[MarketOutcome] = None
    """Convenience access to the Yes outcome for binary markets."""

    no: Optional[MarketOutcome] = None
    """Convenience access to the No outcome for binary markets."""

    up: Optional[MarketOutcome] = None
    """Convenience access to the Up outcome for binary markets."""

    down: Optional[MarketOutcome] = None
    """Convenience access to the Down outcome for binary markets."""

    @property
    def question(self) -> str:
        """Alias for title."""
        return self.title


@dataclass
class PriceCandle:
    """OHLCV price candle."""
    
    timestamp: int
    """Unix timestamp (milliseconds)"""
    
    open: float
    """Opening price (0.0 to 1.0)"""
    
    high: float
    """Highest price (0.0 to 1.0)"""
    
    low: float
    """Lowest price (0.0 to 1.0)"""
    
    close: float
    """Closing price (0.0 to 1.0)"""
    
    volume: Optional[float] = None
    """Trading volume"""


@dataclass
class UnifiedEvent:
    """A grouped collection of related markets."""
    
    id: str
    """Event ID"""
    
    title: str
    """Event title"""
    
    description: str
    """Event description"""
    
    slug: str
    """Event slug"""
    
    markets: List[UnifiedMarket]
    """Related markets in this event"""
    
    url: str
    """Event URL"""
    
    image: Optional[str] = None
    """Event image URL"""
    
    category: Optional[str] = None
    """Event category"""
    
    tags: Optional[List[str]] = None
    """Event tags"""
    
    def search_markets(self, query: str, search_in: SearchIn = "both") -> List[UnifiedMarket]:
        """
        Search for markets within this event by keyword.
        
        Args:
            query: Search query (case-insensitive)
            search_in: Where to search - "title", "description", or "both"
            
        Returns:
            List of matching markets
            
        Example:
            >>> events = api.search_events('Fed Chair')
            >>> event = events[0]
            >>> warsh_markets = event.search_markets('Kevin Warsh')
        """
        query_lower = query.lower()
        results = []
        
        for market in self.markets:
            match = False
            
            if search_in in ("title", "both"):
                if query_lower in market.title.lower():
                    match = True
            
            if search_in in ("description", "both") and market.description:
                if query_lower in market.description.lower():
                    match = True
            
            if match:
                results.append(market)
        
        return results



@dataclass
class OrderLevel:
    """A single price level in the order book."""
    
    price: float
    """Price (0.0 to 1.0)"""
    
    size: float
    """Number of contracts"""


@dataclass
class OrderBook:
    """Current order book for an outcome."""
    
    bids: List[OrderLevel]
    """Bid orders (sorted high to low)"""
    
    asks: List[OrderLevel]
    """Ask orders (sorted low to high)"""
    
    timestamp: Optional[int] = None
    """Unix timestamp (milliseconds)"""


@dataclass
class Trade:
    """A historical trade."""
    
    id: str
    """Trade ID"""
    
    timestamp: int
    """Unix timestamp (milliseconds)"""
    
    price: float
    """Trade price (0.0 to 1.0)"""
    
    amount: float
    """Trade amount (contracts)"""
    
    side: Literal["buy", "sell", "unknown"]
    """Trade side"""


@dataclass
class Order:
    """An order (open, filled, or cancelled)."""
    
    id: str
    """Order ID"""
    
    market_id: str
    """Market ID"""
    
    outcome_id: str
    """Outcome ID"""
    
    side: Literal["buy", "sell"]
    """Order side"""
    
    type: Literal["market", "limit"]
    """Order type"""
    
    amount: float
    """Order amount (contracts)"""
    
    status: str
    """Order status (pending, open, filled, cancelled, rejected)"""
    
    filled: float
    """Amount filled"""
    
    remaining: float
    """Amount remaining"""
    
    timestamp: int
    """Unix timestamp (milliseconds)"""
    
    price: Optional[float] = None
    """Limit price (for limit orders)"""
    
    fee: Optional[float] = None
    """Trading fee"""


@dataclass
class Position:
    """A current position in a market."""
    
    market_id: str
    """Market ID"""
    
    outcome_id: str
    """Outcome ID"""
    
    outcome_label: str
    """Outcome label"""
    
    size: float
    """Position size (positive for long, negative for short)"""
    
    entry_price: float
    """Average entry price"""
    
    current_price: float
    """Current market price"""
    
    unrealized_pnl: float
    """Unrealized profit/loss"""
    
    realized_pnl: Optional[float] = None
    """Realized profit/loss"""


@dataclass
class Balance:
    """Account balance."""
    
    currency: str
    """Currency (e.g., "USDC")"""
    
    total: float
    """Total balance"""
    
    available: float
    """Available for trading"""
    
    locked: float
    """Locked in open orders"""




@dataclass
class MarketFilterParams:
    """Parameters for filtering markets."""
    
    limit: Optional[int] = None
    """Maximum number of results"""
    
    offset: Optional[int] = None
    """Pagination offset"""
    
    sort: Optional[SortOption] = None
    """Sort order"""
    
    search_in: Optional[SearchIn] = None
    """Where to search (for searchMarkets)"""


@dataclass
class HistoryFilterParams:
    """Parameters for fetching historical data."""
    
    resolution: CandleInterval
    """Candle resolution"""
    
    start: Optional[datetime] = None
    """Start time"""
    
    end: Optional[datetime] = None
    """End time"""
    
    limit: Optional[int] = None
    """Maximum number of results"""


@dataclass
class CreateOrderParams:
    """Parameters for creating an order."""
    
    market_id: str
    """Market ID"""
    
    outcome_id: str
    """Outcome ID"""
    
    side: OrderSide
    """Order side (buy/sell)"""
    
    type: OrderType
    """Order type (market/limit)"""
    
    amount: float
    """Number of contracts"""
    
    price: Optional[float] = None
    """Limit price (required for limit orders, 0.0-1.0)"""
