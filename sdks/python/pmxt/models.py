"""
Data models for PMXT.

These are clean Pythonic wrappers around the auto-generated OpenAPI models.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal, Union, TypedDict

# Parameter types
# Common values: "1m", "5m", "15m", "1h", "6h", "1d".
# Arbitrary intervals matching ^[0-9]+[smhd]$ (e.g. "30s", "120s", "3h")
# are accepted by venues that support them.
CandleInterval = str
SortOption = Literal["volume", "liquidity", "newest"]
SearchIn = Literal["title", "description", "both"]
OrderSide = Literal["buy", "sell"]
OrderType = Literal["market", "limit"]
OutcomeType = Literal["yes", "no", "up", "down"]
SubscriptionOption = Literal["trades", "positions", "balances"]


@dataclass
class MarketOutcome:
    """A single tradeable outcome within a market."""

    outcome_id: str
    """Outcome ID for trading operations. Use this for fetchOHLCV/fetchOrderBook/fetchTrades.
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

    market_id: Optional[str] = None
    """The market this outcome belongs to (set automatically)."""

    best_bid: Optional[float] = None
    """Best bid price from the order book (when includePrices=True)."""

    best_ask: Optional[float] = None
    """Best ask price from the order book (when includePrices=True)."""


@dataclass
class UnifiedMarket:
    """A unified market representation across exchanges."""

    market_id: str
    """The unique identifier for this market"""

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

    slug: Optional[str] = None
    """Market slug (URL-friendly identifier)"""

    tick_size: Optional[float] = None
    """Minimum price increment (e.g., 0.01, 0.001)"""

    status: Optional[str] = None
    """Venue-native lifecycle status (e.g. 'active', 'closed', 'archived')."""

    contract_address: Optional[str] = None
    """On-chain contract / condition identifier where applicable (Polymarket conditionId, etc.)."""

    source_exchange: Optional[str] = None
    """The exchange/venue this market comes from (e.g. 'polymarket', 'kalshi'). Populated by the Router."""

    event_id: Optional[str] = None
    """ID of the parent event this market belongs to."""

    yes: Optional[MarketOutcome] = None
    """Convenience access to the Yes outcome for binary markets."""

    no: Optional[MarketOutcome] = None
    """Convenience access to the No outcome for binary markets."""

    up: Optional[MarketOutcome] = None
    """Convenience access to the Up outcome for binary markets."""

    down: Optional[MarketOutcome] = None
    """Convenience access to the Down outcome for binary markets."""

    source_metadata: Optional[Dict[str, Any]] = None
    """Raw venue-specific metadata not captured by first-class fields. Passed through verbatim."""

    @property
    def question(self) -> str:
        """Alias for title."""
        return self.title


class MarketList(List[UnifiedMarket]):
    """A list of UnifiedMarket objects with a convenience match() method."""

    def match(
        self,
        query: str,
        search_in: Optional[List[Literal["title", "description", "category", "tags", "outcomes"]]] = None,
    ) -> "UnifiedMarket":
        """Find a single market by case-insensitive substring match.

        Args:
            query: Substring to search for.
            search_in: Fields to search in (default: ["title"]).

        Returns:
            The matching UnifiedMarket.

        Raises:
            ValueError: If zero or multiple markets match.
        """
        if search_in is None:
            search_in = ["title"]
        lower_query = query.lower()
        matches = []
        for m in self:
            for field in search_in:
                if field == "title" and m.title and lower_query in m.title.lower():
                    matches.append(m)
                    break
                if field == "description" and m.description and lower_query in m.description.lower():
                    matches.append(m)
                    break
                if field == "category" and m.category and lower_query in m.category.lower():
                    matches.append(m)
                    break
                if field == "tags" and m.tags and any(lower_query in t.lower() for t in m.tags):
                    matches.append(m)
                    break
                if field == "outcomes" and m.outcomes and any(lower_query in o.label.lower() for o in m.outcomes):
                    matches.append(m)
                    break
        if len(matches) == 0:
            raise ValueError(f"No markets matching '{query}'")
        if len(matches) > 1:
            titles_str = "\n  ".join(
                f"{i+1}. {m.title[:70]}{'...' if len(m.title) > 70 else ''}"
                for i, m in enumerate(matches)
            )
            raise ValueError(
                f"Multiple markets matching '{query}' ({len(matches)} matches):\n  {titles_str}\n\nPlease refine your search."
            )
        return matches[0]


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
    
    markets: "MarketList"
    """Related markets in this event"""
    
    url: str
    """Event URL"""
    
    image: Optional[str] = None
    """Event image URL"""

    category: Optional[str] = None
    """Event category"""

    tags: Optional[List[str]] = None
    """Event tags"""

    volume_24h: Optional[float] = None
    """24-hour trading volume (USD)"""

    volume: Optional[float] = None
    """Total / Lifetime volume (sum across markets; undefined if no market provides it)"""

    source_exchange: Optional[str] = None
    """The exchange/venue this event comes from (e.g. 'polymarket', 'kalshi'). Populated by the Router."""

    source_metadata: Optional[Dict[str, Any]] = None
    """Raw venue-specific metadata not captured by first-class fields. Passed through verbatim."""


@dataclass
class UnifiedSeries:
    """A recurring grouping of events on a venue — the tier above Event.

    Examples: Kalshi ``KXATPMATCH`` (every ATP tennis match), Polymarket
    ``wta`` (every WTA match). Series only exists where the venue exposes a
    recurring-event concept; venues without one return an empty array from
    ``fetchSeries``.
    """

    id: str
    """Stable venue-native series identifier (e.g. "KXATPMATCH" on Kalshi, "atp" on Polymarket Gamma)."""

    title: str
    """Human-readable series title (e.g. "ATP Match Winner", "WTA")."""

    ticker: Optional[str] = None
    """Venue-native ticker, when distinct from id."""

    slug: Optional[str] = None
    """Venue-native slug."""

    description: Optional[str] = None
    """Long-form series description."""

    recurrence: Optional[str] = None
    """Recurrence cadence the venue reports ('daily', 'weekly', 'annual', ...)."""

    events: Optional[List["UnifiedEvent"]] = None
    """Child events. Populated when fetched by id; the list form usually omits this to keep payloads small."""

    url: Optional[str] = None
    """Canonical venue URL for the series."""

    image: Optional[str] = None
    """Venue-hosted image."""

    source_exchange: Optional[str] = None
    """The exchange this series originates from. Populated by the Router."""

    source_metadata: Optional[Dict[str, Any]] = None
    """Raw venue-specific fields not promoted to first-class columns."""


@dataclass
class OrderLevel:
    """A single price level in the order book."""
    
    price: float
    """Price (0.0 to 1.0)"""
    
    size: float
    """Number of contracts"""

    order_count: Optional[int] = None
    """Number of orders aggregated at this price level, when reported by the venue."""


@dataclass
class OrderBook:
    """Current order book for an outcome."""
    
    bids: List[OrderLevel]
    """Bid orders (sorted high to low)"""
    
    asks: List[OrderLevel]
    """Ask orders (sorted low to high)"""
    
    timestamp: Optional[int] = None
    """Unix timestamp (milliseconds)"""

    datetime: Optional[str] = None
    """ISO 8601 datetime string (CCXT-compatible)"""

    is_neg_risk: Optional[bool] = None
    """Whether the underlying market uses negative-risk collateral/netting semantics."""

    last_trade_price: Optional[float] = None
    """Last traded price for the outcome, when reported alongside the book."""

    source_metadata: Optional[Dict[str, Any]] = None
    """Raw venue-specific fields not promoted to first-class columns."""


@dataclass
class FirehoseEvent:
    """A single event from the firehose stream."""

    source: str
    """The venue this event originated from (e.g. 'polymarket', 'limitless')"""

    symbol: str
    """The outcome token id / asset id"""

    orderbook: OrderBook
    """The order book snapshot"""


@dataclass
class ExecutionPriceResult:
    """Result of an execution price calculation."""
    
    price: float
    """The volume-weighted average price"""
    
    filled_amount: float
    """The actual amount that can be filled"""
    
    fully_filled: bool
    """Whether the full requested amount can be filled"""


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
class UserTrade(Trade):
    """A trade made by the authenticated user."""

    order_id: Optional[str] = None
    """The order that generated this fill"""

    outcome_id: Optional[str] = None
    """The outcome this trade belongs to"""

    market_id: Optional[str] = None
    """The market this trade belongs to"""

    fee: Optional[float] = None
    """Trading fee, when available."""

    tx_hash: str | None = None
    """On-chain transaction hash (hosted mode only; None in venue-direct mode)."""

    chain: str | None = None
    """Chain identifier where the trade settled (hosted mode only; None in venue-direct mode)."""

    block_number: int | None = None
    """Block number of the settling transaction (hosted mode only; None in venue-direct mode)."""

    venue: Optional[str] = None
    """Venue that produced this trade, when available."""

    raw: Optional[Any] = None
    """Raw venue-specific payload, when available."""


@dataclass
class PaginatedMarketsResult:
    """Result of a paginated markets fetch."""

    data: "List[UnifiedMarket]"
    """Markets in this page"""

    total: Optional[int] = None
    """Total number of markets in the snapshot"""

    next_cursor: Optional[str] = None
    """Opaque cursor to pass to the next call, or None if this is the last page"""


@dataclass
class PaginatedEventsResult:
    """Result of a paginated events fetch."""

    data: "List[UnifiedEvent]"
    """Events in this page"""

    total: Optional[int] = None
    """Total number of events in the snapshot"""

    next_cursor: Optional[str] = None
    """Opaque cursor to pass to the next call, or None if this is the last page"""


@dataclass
class Order:
    """An order (open, filled, or canceled)."""
    
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
    """Order status (pending, open, filled, canceled, rejected)"""
    
    filled: float
    """Amount filled"""

    remaining: float
    """Amount remaining"""

    timestamp: int
    """Unix timestamp (milliseconds)"""

    filled_shares: Optional[float] = None
    """Amount filled in shares/contracts (if different from USDC-denominated `filled`)."""

    price: Optional[float] = None
    """Limit price (for limit orders)"""

    fee: Optional[float] = None
    """Trading fee"""

    fee_rate_bps: Optional[float] = None
    """Fee rate in basis points applied to this order (e.g. 100 = 1%)."""

    tx_hash: str | None = None
    """On-chain transaction hash (hosted mode only; None in venue-direct mode)."""

    chain: str | None = None
    """Chain identifier where the order settled (hosted mode only; None in venue-direct mode)."""

    block_number: int | None = None
    """Block number of the settling transaction (hosted mode only; None in venue-direct mode)."""

    raw: Optional[Any] = None
    """Raw venue-specific payload, when available."""


@dataclass
class BuiltOrder:
    """An order payload built but not yet submitted to the exchange."""

    exchange: str
    """The exchange name this order was built for."""

    params: "CreateOrderParams"
    """The original params used to build this order."""

    raw: Any
    """The raw, exchange-native payload. Always present."""

    signed_order: Optional[Dict[str, Any]] = None
    """For CLOB exchanges (Polymarket): the EIP-712 signed order."""

    tx: Optional["TxPayload"] = None
    """For on-chain AMM exchanges: the EVM transaction payload."""


class CreateOrderParams(TypedDict, total=False):
    """Parameters used to build or create an order."""
    market_id: str
    outcome_id: str
    side: OrderSide
    type: OrderType
    amount: float
    price: float
    fee: int


class TxPayload(TypedDict):
    """EVM transaction payload returned for on-chain AMM orders."""
    to: str
    data: str
    value: str
    chainId: int

@dataclass
class Position:
    """A current position in a market.

    In hosted mode, ``outcome_label``, ``entry_price``, ``current_price`` and
    ``unrealized_pnl`` may be ``None`` when the server cannot derive them
    (e.g. ``with_mtm=false`` or no fill history). Venue-direct callers
    continue to populate every field.
    """

    market_id: str
    """Market ID"""

    outcome_id: str
    """Outcome ID"""

    size: float
    """Position size (positive for long, negative for short)"""

    outcome_label: str | None = None
    """Outcome label (None in hosted mode when the server cannot enrich)."""

    entry_price: float | None = None
    """Average entry price (None in hosted mode when no fill history is available)."""

    current_price: float | None = None
    """Current market price (None in hosted mode when ``with_mtm=false``)."""

    unrealized_pnl: float | None = None
    """Unrealized profit/loss (None when entry_price or current_price is None)."""

    realized_pnl: Optional[float] = None
    """Realized profit/loss"""

    tx_hash: str | None = None
    """On-chain transaction hash of the position-creating event (hosted mode only)."""

    chain: str | None = None
    """Chain identifier (hosted mode only; None in venue-direct mode)."""

    block_number: int | None = None
    """Block number of the position-creating transaction (hosted mode only)."""

    venue: Optional[str] = None
    """Venue that produced this position, when available."""

    current_value: Optional[float] = None
    """Current mark-to-market value, when available."""

    raw: Optional[Any] = None
    """Raw venue-specific payload, when available."""


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

    tx_hash: str | None = None
    """On-chain transaction hash of the latest balance-affecting event (hosted mode only)."""

    chain: str | None = None
    """Chain identifier (hosted mode only; None in venue-direct mode)."""

    block_number: int | None = None
    """Block number of the latest balance-affecting transaction (hosted mode only)."""

    venue: Optional[str] = None
    """Venue or hosted account source, when available."""


@dataclass
class SubscribedAddressSnapshot:
    """Subscription snapshot."""

    """The wallet address being watched"""
    address: str

    """Unix timestamp (ms) of this snapshot"""
    timestamp: int

    """Recent trades for this address"""
    trades: Optional[List[Trade]] = None

    """Open positions of this address"""
    positions: Optional[List[Position]] = None

    """Balances of this address"""
    balances: Optional[List[Balance]] = None

# -----------------------------------------------------------------------------
# Public SDK option types
# -----------------------------------------------------------------------------

class ExchangeOptions(TypedDict, total=False):
    """Constructor options shared by the exchange clients."""
    pmxt_api_key: str
    base_url: str
    auto_start_server: bool
    api_key: str
    private_key: str
    api_token: str
    proxy_address: str
    signature_type: Union[str, int]


class PolymarketOptions(ExchangeOptions, total=False):
    """Constructor options for Polymarket clients."""
    signature_type: Union[Literal["eoa", "poly-proxy", "gnosis-safe"], int]


class RouterOptions(TypedDict, total=False):
    """Constructor options for Router clients."""
    pmxt_api_key: str
    base_url: str
    auto_start_server: bool


class FeedClientOptions(TypedDict, total=False):
    """Constructor options for FeedClient."""
    pmxt_api_key: str
    base_url: str

# -----------------------------------------------------------------------------
# Filtering Types
# -----------------------------------------------------------------------------

from typing import TypedDict, Callable


class MinMax(TypedDict, total=False):
    """Range filter."""
    min: float
    max: float

class DateRange(TypedDict, total=False):
    """Date range filter."""
    before: datetime
    after: datetime

class PriceFilter(TypedDict, total=False):
    """Price filter."""
    outcome: OutcomeType
    min: float
    max: float

class MarketFilterCriteria(TypedDict, total=False):
    """Criteria for filtering markets locally."""
    
    # Text search
    text: str
    search_in: List[Literal["title", "description", "category", "tags", "outcomes"]]
    
    # Numeric range filters
    volume_24h: MinMax
    volume: MinMax
    liquidity: MinMax
    open_interest: MinMax
    
    # Date filters
    resolution_date: DateRange
    
    # Category/tag filters
    category: str
    tags: List[str]
    
    # Price filters
    price: PriceFilter
    price_change_24h: PriceFilter

MarketFilterFunction = Callable[[UnifiedMarket], bool]

class EventFilterCriteria(TypedDict, total=False):
    """Criteria for filtering events locally."""
    
    # Text search
    text: str
    search_in: List[Literal["title", "description", "category", "tags"]]
    
    # Category/tag filters
    category: str
    tags: List[str]
    
    # Market metrics
    market_count: MinMax
    total_volume: MinMax

EventFilterFunction = Callable[[UnifiedEvent], bool]


class MarketFetchParams(TypedDict, total=False):
    """Parameters for fetching markets."""
    query: str
    limit: int
    offset: int
    sort: Literal["volume", "liquidity", "newest"]
    status: Literal["active", "inactive", "closed", "all"]
    search_in: Literal["title", "description", "both"]
    slug: str
    market_id: str
    outcome_id: str
    event_id: str
    source_exchange: str
    exchange: str
    category: str
    tags: List[str]
    filter: MarketFilterCriteria
    page: int
    similarity_threshold: float


class EventFetchParams(TypedDict, total=False):
    """Parameters for fetching events."""
    query: str
    limit: int
    offset: int
    cursor: str
    sort: Literal["volume", "liquidity", "newest"]
    status: Literal["active", "inactive", "closed", "all"]
    search_in: Literal["title", "description", "both"]
    event_id: str
    slug: str
    source_exchange: str
    exchange: str
    series: str
    category: str
    tags: List[str]
    filter: EventFilterCriteria


class SeriesFetchParams(TypedDict, total=False):
    """Parameters for fetching recurring venue series."""
    id: str
    slug: str
    query: str
    recurrence: str
    limit: int
    offset: int


class TradesParams(TypedDict, total=False):
    """Parameters for fetching public trade history."""
    since: int
    until: int
    limit: int
    cursor: str
    resolution: str


class HistoryFilterParams(TypedDict, total=False):
    """Parameters for generic history queries."""
    from_timestamp: int
    until_timestamp: int
    max_size: int
    order: Literal["asc", "desc"]


class OHLCVParams(TypedDict, total=False):
    """Parameters for OHLCV candle queries."""
    since: int
    until: int
    limit: int
    resolution: str


class FetchOrderBookParams(TypedDict, total=False):
    """Parameters for historical order book queries."""
    side: Literal["yes", "no"]
    outcome: str
    since: int
    until: int


class MyTradesParams(TypedDict, total=False):
    """Parameters for fetching authenticated user trades."""
    outcome_id: str
    market_id: str
    since: int
    until: int
    limit: int
    cursor: str


class OrderHistoryParams(TypedDict, total=False):
    """Parameters for fetching authenticated order history."""
    market_id: str
    since: int
    until: int
    limit: int
    cursor: str


# -----------------------------------------------------------------------------
# Router Types
# -----------------------------------------------------------------------------

MatchRelation = Literal["identity", "complement", "subset", "superset", "overlap", "disjoint"]
ClusterSortOption = Literal["volume", "confidence"]
VenueFilter = Union[str, List[str]]


class MatchedMarketClusterParams(TypedDict, total=False):
    """Parameters for fetching matched market clusters."""
    market: UnifiedMarket
    market_id: str
    slug: str
    url: str
    query: str
    category: str
    relations: Union[str, List[MatchRelation]]
    relation: MatchRelation
    min_confidence: float
    venues: VenueFilter
    exclude_venues: VenueFilter
    min_venues: int
    with_orderbook: bool
    updated_since: Union[str, datetime]
    include_raw_matches: bool
    sort: ClusterSortOption
    limit: int
    offset: int
    edge_limit: int


class MatchedEventClusterParams(TypedDict, total=False):
    """Parameters for fetching matched event clusters."""
    event: UnifiedEvent
    event_id: str
    slug: str
    url: str
    query: str
    category: str
    relations: Union[str, List[MatchRelation]]
    relation: MatchRelation
    min_confidence: float
    venues: VenueFilter
    exclude_venues: VenueFilter
    min_venues: int
    with_orderbook: bool
    updated_since: Union[str, datetime]
    include_raw_matches: bool
    sort: ClusterSortOption
    limit: int
    offset: int
    edge_limit: int


@dataclass
class MatchResult:
    """A cross-venue market match with relation classification."""

    market: UnifiedMarket
    """The matched market on another venue."""

    relation: MatchRelation
    """Set-theoretic relation between the source and matched market."""

    confidence: float
    """Confidence score (0.0 to 1.0)."""

    reasoning: Optional[str] = None
    """Human-readable explanation of the match."""

    best_bid: Optional[float] = None
    """Best bid price on the matched venue (when includePrices=True)."""

    best_ask: Optional[float] = None
    """Best ask price on the matched venue (when includePrices=True)."""

    source_market: Optional[UnifiedMarket] = None
    """The source market this was matched against. Present in browse mode, absent in lookup mode."""

    def __getattr__(self, name: str) -> Any:
        return getattr(self.market, name)


@dataclass
class EventMatchResult:
    """A cross-venue event match with constituent market matches."""

    event: UnifiedEvent
    """The matched event on another venue."""

    market_matches: List[MatchResult]
    """Cross-venue market matches within this event."""

    def __getattr__(self, name: str) -> Any:
        return getattr(self.event, name)


MatchedClusterSort = ClusterSortOption
FetchMatchedMarketClustersParams = MatchedMarketClusterParams
FetchMatchedEventClustersParams = MatchedEventClusterParams


@dataclass
class MatchedMarketCluster:
    """A connected cluster of semantically matched markets across venues."""

    cluster_id: str
    """Stable cluster ID."""

    canonical_title: Optional[str]
    """Canonical title selected by the hosted API."""

    markets: List[UnifiedMarket]
    """Markets in the cluster."""

    relations: List[MatchRelation]
    """Relation types present among the cluster's pairwise edges."""

    confidence: float
    """Cluster confidence score."""

    volume_24h: float
    """Total 24-hour volume across markets in the cluster."""

    category: Optional[str] = None
    """Canonical category selected by the hosted API."""

    raw_matches: Optional[List[Dict[str, Any]]] = None
    """Pairwise match edges used to build the cluster when requested."""


@dataclass
class MatchedEventCluster:
    """A connected cluster of semantically matched events across venues."""

    cluster_id: str
    """Stable cluster ID."""

    canonical_title: Optional[str]
    """Canonical title selected by the hosted API."""

    events: List[UnifiedEvent]
    """Events in the cluster."""

    relations: List[MatchRelation]
    """Relation types present among the cluster's pairwise edges."""

    confidence: float
    """Cluster confidence score."""

    volume_24h: float
    """Total 24-hour volume across events in the cluster."""

    category: Optional[str] = None
    """Canonical category selected by the hosted API."""

    raw_matches: Optional[List[Dict[str, Any]]] = None
    """Pairwise match edges used to build the cluster when requested."""


@dataclass
class PriceComparison:
    """Side-by-side price comparison for an identity-matched market."""

    market: UnifiedMarket
    """The matched market."""

    relation: MatchRelation
    """Relation type (typically 'identity' for price comparisons)."""

    confidence: float
    """Confidence score (0.0 to 1.0)."""

    reasoning: Optional[str] = None
    """Human-readable explanation."""

    best_bid: Optional[float] = None
    """Best bid price on this venue."""

    best_ask: Optional[float] = None
    """Best ask price on this venue."""

    venue: str = ""
    """The venue name (e.g. 'kalshi', 'polymarket')."""


@dataclass
class ArbitrageOpportunity:
    """A cross-venue arbitrage opportunity."""

    market_a: UnifiedMarket
    """Market on the buy side."""

    market_b: UnifiedMarket
    """Market on the sell side."""

    spread: float
    """Price spread (sell_price - buy_price)."""

    buy_venue: str
    """Venue to buy on."""

    sell_venue: str
    """Venue to sell on."""

    buy_price: float
    """Price to buy at."""

    sell_price: float
    """Price to sell at."""

    relation: Optional[MatchRelation] = None
    """The set-theoretic relation between the two markets (e.g. identity, subset)."""

    confidence: Optional[float] = None
    """Match confidence score (0.0 to 1.0)."""
