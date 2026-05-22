/**
 * Data models for PMXT TypeScript SDK.
 *
 * These are clean TypeScript interfaces that provide a user-friendly API.
 */

/**
 * A single tradeable outcome within a market.
 */
export interface MarketOutcome {
    /**
     * Outcome ID for trading operations. Use this for fetchOHLCV/fetchOrderBook/fetchTrades.
     * - Polymarket: CLOB Token ID
     * - Kalshi: Market Ticker
     */
    outcomeId: string;

    /** The market this outcome belongs to (set automatically). */
    marketId?: string;

    /** Human-readable label (e.g., "Trump", "Yes") */
    label: string;

    /** Current price (0.0 to 1.0, representing probability) */
    price: number;

    /** 24-hour price change */
    priceChange24h?: number;

    /** Exchange-specific metadata */
    metadata?: Record<string, any>;
}

/**
 * A unified market representation across exchanges.
 */
export interface UnifiedMarket {
    /** The unique identifier for this market */
    marketId: string;

    /** Market title */
    title: string;

    /** Market slug (URL-friendly identifier) */
    slug?: string;

    /** All tradeable outcomes */
    outcomes: MarketOutcome[];

    /** 24-hour trading volume (USD) */
    volume24h: number;

    /** Current liquidity (USD) */
    liquidity: number;

    /** Direct URL to the market */
    url: string;

    /** Market description */
    description?: string;

    /** Expected resolution date */
    resolutionDate?: Date;

    /** Total volume (USD) */
    volume?: number;

    /** Open interest (USD) */
    openInterest?: number;

    /** Market image URL */
    image?: string;

    /** Market category */
    category?: string;

    /** Market tags */
    tags?: string[];

    /** Minimum price increment (e.g., 0.01, 0.001) */
    tickSize?: number;

    /** Venue-native lifecycle status (e.g. 'active', 'closed', 'archived'). */
    status?: string;

    /** On-chain contract / condition identifier where applicable (Polymarket conditionId, etc.). */
    contractAddress?: string;

    /** The exchange/venue this market originates from (e.g. 'polymarket', 'kalshi'). Populated by the Router. */
    sourceExchange?: string;

    /** ID of the parent event this market belongs to */
    eventId?: string;

    /** Convenience access to the Yes outcome for binary markets. */
    yes?: MarketOutcome;

    /** Convenience access to the No outcome for binary markets. */
    no?: MarketOutcome;

    /** Convenience access to the Up outcome for binary markets. */
    up?: MarketOutcome;

    /** Convenience access to the Down outcome for binary markets. */
    down?: MarketOutcome;
}

/**
 * OHLCV price candle.
 */
export interface PriceCandle {
    /** Unix timestamp (milliseconds) */
    timestamp: number;

    /** Opening price (0.0 to 1.0) */
    open: number;

    /** Highest price (0.0 to 1.0) */
    high: number;

    /** Lowest price (0.0 to 1.0) */
    low: number;

    /** Closing price (0.0 to 1.0) */
    close: number;

    /** Trading volume */
    volume?: number;
}

/**
 * A single price level in the order book.
 */
export interface OrderLevel {
    /** Price (0.0 to 1.0) */
    price: number;

    /** Number of contracts */
    size: number;
}

/**
 * Order book for an outcome.
 */
export interface OrderBook {
    /** Bid orders (sorted high to low) */
    bids: OrderLevel[];

    /** Ask orders (sorted low to high) */
    asks: OrderLevel[];

    /** Unix timestamp (milliseconds) */
    timestamp?: number;

    /** ISO 8601 datetime string of the snapshot (CCXT-compatible) */
    datetime?: string;
}

/**
 * A single event from the firehose stream.
 */
export interface FirehoseEvent {
    /** The venue this event originated from (e.g. "polymarket", "limitless") */
    source: string;

    /** The outcome token id / asset id */
    symbol: string;

    /** The order book snapshot */
    orderbook: OrderBook;
}

/**
 * Result of an execution price calculation.
 */
export interface ExecutionPriceResult {
    /** The volume-weighted average price */
    price: number;

    /** The actual amount that can be filled */
    filledAmount: number;

    /** Whether the full requested amount can be filled */
    fullyFilled: boolean;
}

/**
 * A trade made by the authenticated user.
 */
export interface UserTrade {
    /** Trade ID */
    id: string;

    /** Trade price (0.0 to 1.0) */
    price: number;

    /** Trade amount (contracts) */
    amount: number;

    /** Trade side */
    side: "buy" | "sell" | "unknown";

    /** Unix timestamp (milliseconds) */
    timestamp: number;

    /** Order that created this trade */
    orderId?: string;

    /** Outcome ID */
    outcomeId?: string;

    /** Market ID */
    marketId?: string;
}

/**
 * Result of a paginated market fetch.
 */
export interface PaginatedMarketsResult {
    /** The markets for this page */
    data: UnifiedMarket[];

    /** Total number of markets (if available) */
    total?: number;

    /** Cursor for the next page (pass to fetchMarketsPaginated) */
    nextCursor?: string;
}

/**
 * Result of a paginated event fetch.
 */
export interface PaginatedEventsResult {
    /** The events for this page */
    data: UnifiedEvent[];

    /** Total number of events (if available) */
    total?: number;

    /** Cursor for the next page (pass to fetchEventsPaginated) */
    nextCursor?: string;
}

/**
 * A historical trade.
 */
export interface Trade {
    /** Trade ID */
    id: string;

    /** Unix timestamp (milliseconds) */
    timestamp: number;

    /** Trade price (0.0 to 1.0) */
    price: number;

    /** Trade amount (contracts) */
    amount: number;

    /** Trade side */
    side: "buy" | "sell" | "unknown";
}

/**
 * An order (open, filled, or cancelled).
 */
export interface Order {
    /** Order ID */
    id: string;

    /** Market ID */
    marketId: string;

    /** Outcome ID */
    outcomeId: string;

    /** Order side */
    side: "buy" | "sell";

    /** Order type */
    type: "market" | "limit";

    /** Order amount (contracts) */
    amount: number;

    /** Order status */
    status: string;

    /** Amount filled */
    filled: number;

    /** Amount remaining */
    remaining: number;

    /** Unix timestamp (milliseconds) */
    timestamp: number;

    /** Limit price (for limit orders) */
    price?: number;

    /** Trading fee */
    fee?: number;
}

/**
 * A current position in a market.
 */
export interface Position {
    /** Market ID */
    marketId: string;

    /** Outcome ID */
    outcomeId: string;

    /** Outcome label */
    outcomeLabel: string;

    /** Position size (positive for long, negative for short) */
    size: number;

    /** Average entry price */
    entryPrice: number;

    /** Current market price */
    currentPrice: number;

    /** Unrealized profit/loss */
    unrealizedPnL: number;

    /** Realized profit/loss */
    realizedPnL?: number;
}

/**
 * Account balance.
 */
export interface Balance {
    /** Currency (e.g., "USDC") */
    currency: string;

    /** Total balance */
    total: number;

    /** Available for trading */
    available: number;

    /** Locked in open orders */
    locked: number;
}

// Parameter types
/**
 * Candle interval for OHLCV data.
 *
 * Common values: `'1m'`, `'5m'`, `'15m'`, `'1h'`, `'6h'`, `'1d'`.
 * Arbitrary intervals matching `^[0-9]+[smhd]$` (e.g. `'30s'`, `'120s'`,
 * `'3h'`) are accepted by venues that support them.
 */
export type CandleInterval = string;
export type SortOption = "volume" | "liquidity" | "newest";
export type SearchIn = "title" | "description" | "both";
export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";

/**
 * Parameters for filtering markets.
 */
export interface MarketFilterParams {
    /** Maximum number of results */
    limit?: number;

    /** Pagination offset */
    offset?: number;

    /** Sort order */
    sort?: SortOption;

    /** Filter by market status (default: 'active') */
    status?: 'active' | 'inactive' | 'closed' | 'all';

    /** Where to search (for filterMarkets) */
    searchIn?: SearchIn;

    /** Keyword search query */
    query?: string;

    /** Slug/ticker lookup */
    slug?: string;

    /** Direct lookup by market ID */
    marketId?: string;

    /** Reverse lookup -- find market containing this outcome */
    outcomeId?: string;

    /** Find markets belonging to an event */
    eventId?: string;

    /** Pagination page (used by Limitless) */
    page?: number;

    /** Semantic search threshold (used by Limitless) */
    similarityThreshold?: number;

    /** Filter by market category (e.g. "sports", "politics", "crypto") */
    category?: string;

    /** Filter by tags attached to the market */
    tags?: string[];

    /** Optional client-side filter applied after fetching */
    filter?: MarketFilterCriteria;
}

/**
 * Parameters for fetching events.
 */
export interface EventFetchParams {
    /** Keyword search */
    query?: string;

    /** Maximum number of results */
    limit?: number;

    /** Pagination offset */
    offset?: number;

    /** Sort order */
    sort?: SortOption;

    /** Filter by event status */
    status?: 'active' | 'inactive' | 'closed' | 'all';

    /** Where to search */
    searchIn?: SearchIn;

    /** Direct lookup by event ID */
    eventId?: string;

    /** Lookup by event slug */
    slug?: string;

    /** Filter by event category (e.g. "sports", "politics", "crypto") */
    category?: string;

    /** Filter by tags attached to the event */
    tags?: string[];

    /** Optional client-side filter applied after fetching */
    filter?: EventFilterCriteria;
}

/**
 * Parameters for fetching historical data.
 */
export interface HistoryFilterParams {
    /** Candle resolution */
    resolution: CandleInterval;

    /** Start time */
    start?: Date;

    /** End time */
    end?: Date;

    /** Maximum number of results */
    limit?: number;
}

/**
 * Parameters for creating an order.
 */
export interface CreateOrderParams {
    /** Market ID */
    marketId: string;

    /** Outcome ID */
    outcomeId: string;

    /** Order side (buy/sell) */
    side: OrderSide;

    /** Order type (market/limit) */
    type: OrderType;

    /** Number of contracts */
    amount: number;

    /** Limit price (required for limit orders, 0.0-1.0) */
    price?: number;

    /** Optional fee rate (e.g., 1000 for 0.1%) */
    fee?: number;
}

/** Alias matching the core MarketFetchParams name. */
export type MarketFetchParams = MarketFilterParams;

/**
 * Parameters for fetching OHLCV candle data.
 */
export interface OHLCVParams {
    /** Candle resolution (e.g. '1m', '5m', '1h', '1d') */
    resolution: CandleInterval;
    /** Start of the time range */
    start?: Date;
    /** End of the time range */
    end?: Date;
    /** Maximum number of candles */
    limit?: number;
}

/**
 * Parameters for fetching public trades.
 */
export interface TradesParams {
    /** Start of the time range */
    start?: Date;
    /** End of the time range */
    end?: Date;
    /** Maximum number of results */
    limit?: number;
}

/**
 * Parameters for fetching the authenticated user's trade history.
 */
export interface MyTradesParams {
    /** Filter by outcome ID */
    outcomeId?: string;
    /** Filter by market ID */
    marketId?: string;
    /** Only return records after this date */
    since?: Date;
    /** Only return records before this date */
    until?: Date;
    /** Maximum number of results */
    limit?: number;
    /** Cursor for pagination */
    cursor?: string;
}

/**
 * Parameters for fetching closed/all order history.
 */
export interface OrderHistoryParams {
    /** Filter by market ID */
    marketId?: string;
    /** Only return records after this date */
    since?: Date;
    /** Only return records before this date */
    until?: Date;
    /** Maximum number of results */
    limit?: number;
    /** Cursor for pagination */
    cursor?: string;
}

/**
 * An order payload built but not yet submitted to the exchange.
 */
export interface BuiltOrder {
    /** The exchange name this order was built for. */
    exchange: string;
    /** The original params used to build this order. */
    params: CreateOrderParams;
    /** For CLOB exchanges (Polymarket): the EIP-712 signed order. */
    signedOrder?: Record<string, unknown>;
    /** For on-chain AMM exchanges: the EVM transaction payload. */
    tx?: {
        to: string;
        data: string;
        value: string;
        chainId: number;
    };
    /** The raw, exchange-native payload. Always present. */
    raw: unknown;
}


/**
 * A list of UnifiedMarket objects with a convenience match() method.
 * Extends Array so all standard array operations work unchanged.
 */
export class MarketList extends Array<UnifiedMarket> {
    /**
     * Find a single market by case-insensitive substring match.
     *
     * @param query - Substring to search for
     * @param searchIn - Fields to search in (default: ['title'])
     * @returns The matching UnifiedMarket
     * @throws Error if zero or multiple markets match
     */
    match(query: string, searchIn?: ('title' | 'description' | 'category' | 'tags' | 'outcomes')[]): UnifiedMarket {
        const fields = searchIn || ['title'];
        const lowerQuery = query.toLowerCase();
        const matches: UnifiedMarket[] = [];

        for (const m of this) {
            for (const field of fields) {
                if (field === 'title' && m.title?.toLowerCase().includes(lowerQuery)) {
                    matches.push(m);
                    break;
                }
                if (field === 'description' && m.description?.toLowerCase().includes(lowerQuery)) {
                    matches.push(m);
                    break;
                }
                if (field === 'category' && m.category?.toLowerCase().includes(lowerQuery)) {
                    matches.push(m);
                    break;
                }
                if (field === 'tags' && m.tags?.some(t => t.toLowerCase().includes(lowerQuery))) {
                    matches.push(m);
                    break;
                }
                if (field === 'outcomes' && m.outcomes?.some(o => o.label.toLowerCase().includes(lowerQuery))) {
                    matches.push(m);
                    break;
                }
            }
        }

        if (matches.length === 0) {
            throw new Error(`No markets matching '${query}'`);
        }
        if (matches.length > 1) {
            const titlesStr = matches
                .map((m, i) => {
                    const truncated = m.title.length > 70 ? m.title.substring(0, 70) + '...' : m.title;
                    return `${i + 1}. ${truncated}`;
                })
                .join('\n  ');
            throw new Error(`Multiple markets matching '${query}' (${matches.length} matches):\n  ${titlesStr}\n\nPlease refine your search.`);
        }
        return matches[0];
    }
}

/**
 * A grouped collection of related markets (e.g., "Who will be Fed Chair?" contains multiple candidate markets)
 */
export interface UnifiedEvent {
    /** Event ID */
    id: string;

    /** Event title */
    title: string;

    /** Event description */
    description: string;

    /** Event slug */
    slug: string;

    /** Related markets in this event */
    markets: MarketList;

    /** 24-hour trading volume (USD) */
    volume24h?: number;

    /** Total / Lifetime volume (sum across markets; undefined if no market provides it) */
    volume?: number;

    /** Event URL */
    url: string;

    /** Event image URL */
    image?: string;

    /** Event category */
    category?: string;

    /** Event tags */
    tags?: string[];

    /** The exchange/venue this event originates from (e.g. 'polymarket', 'kalshi'). Populated by the Router. */
    sourceExchange?: string;
}

// ----------------------------------------------------------------------------
// Advanced Filtering Types
// ----------------------------------------------------------------------------

/**
 * Advanced criteria for filtering markets.
 * Supports text search, numeric ranges, dates, categories, and price filters.
 */
export interface MarketFilterCriteria {
    /** Text search query */
    text?: string;

    /** Fields to search in (default: ['title']) */
    searchIn?: ('title' | 'description' | 'category' | 'tags' | 'outcomes')[];

    /** Filter by 24-hour volume */
    volume24h?: { min?: number; max?: number };

    /** Filter by total volume */
    volume?: { min?: number; max?: number };

    /** Filter by liquidity */
    liquidity?: { min?: number; max?: number };

    /** Filter by open interest */
    openInterest?: { min?: number; max?: number };

    /** Filter by resolution date */
    resolutionDate?: {
        before?: Date;
        after?: Date;
    };

    /** Filter by category */
    category?: string;

    /** Filter by tags (matches if market has ANY of these) */
    tags?: string[];

    /** Filter by outcome price (for binary markets) */
    price?: {
        outcome: 'yes' | 'no' | 'up' | 'down';
        min?: number;
        max?: number;
    };

    /** Filter by 24-hour price change */
    priceChange24h?: {
        outcome: 'yes' | 'no' | 'up' | 'down';
        min?: number;
        max?: number;
    };
}

/**
 * Function type for custom market filtering logic.
 */
export type MarketFilterFunction = (market: UnifiedMarket) => boolean;

/**
 * Advanced criteria for filtering events.
 */
export interface EventFilterCriteria {
    /** Text search query */
    text?: string;

    /** Fields to search in (default: ['title']) */
    searchIn?: ('title' | 'description' | 'category' | 'tags')[];

    /** Filter by category */
    category?: string;

    /** Filter by tags (matches if event has ANY of these) */
    tags?: string[];

    /** Filter by number of markets in the event */
    marketCount?: { min?: number; max?: number };

    /** Filter by total volume across all markets */
    totalVolume?: { min?: number; max?: number };
}

/**
 * Function type for custom event filtering logic.
 */
export type EventFilterFunction = (event: UnifiedEvent) => boolean;

/**
 * Subscription options.
 */
export type SubscriptionOption = 'trades' | 'positions' | 'balances';

/**
 * Subscription snapshot of a watched public wallet address.
 */
export interface SubscribedAddressSnapshot {
    /** The wallet address being watched */
    address: string;

    /** Recent trades for this address
     * (if the above SubscriptionOption 'trades' option was requested)
     */
    trades?: Trade[];

    /** Current open positions for this address
     * (if the above SubscriptionOption 'positions' option was requested)
     */
    positions?: Position[];

    /** Current balances for this address
     * (if the above SubscriptionOption 'balances' option was requested)
     */
    balances?: Balance[];

    /** Unix timestamp (ms) of this snapshot */
    timestamp: number;
}

// ----------------------------------------------------------------------------
// Router Types
// ----------------------------------------------------------------------------

/** Set-theoretic relation between two markets' resolution conditions. */
export type MatchRelation = 'identity' | 'subset' | 'superset' | 'overlap' | 'disjoint';

/** A cross-venue market match with relation classification.
 *  Market properties (title, slug, url, etc.) are accessible directly on the result. */
export interface MatchResult extends Readonly<UnifiedMarket> {
    /** The matched market on another venue. */
    market: UnifiedMarket;

    /** Set-theoretic relation between the source and matched market. */
    relation: MatchRelation;

    /** Confidence score (0.0 to 1.0). */
    confidence: number;

    /** Human-readable explanation of the match. */
    reasoning?: string;

    /** Best bid price on the matched venue (when includePrices=true). */
    bestBid?: number;

    /** Best ask price on the matched venue (when includePrices=true). */
    bestAsk?: number;

    /** The source market this was matched against. Present in browse mode, absent in lookup mode. */
    sourceMarket?: UnifiedMarket;
}

/** A cross-venue event match with constituent market matches.
 *  Event properties (title, slug, url, etc.) are accessible directly on the result. */
export interface EventMatchResult extends Readonly<UnifiedEvent> {
    /** The matched event on another venue. */
    event: UnifiedEvent;

    /** Cross-venue market matches within this event. */
    marketMatches: MatchResult[];
}

/** Side-by-side price comparison for a matched market. */
export interface PriceComparison {
    /** The matched market. */
    market: UnifiedMarket;

    /** Relation type (typically 'identity' for price comparisons). */
    relation: MatchRelation;

    /** Confidence score (0.0 to 1.0). */
    confidence: number;

    /** Human-readable explanation. */
    reasoning?: string;

    /** Best bid price on this venue. */
    bestBid?: number;

    /** Best ask price on this venue. */
    bestAsk?: number;

    /** The venue name (e.g. 'kalshi', 'polymarket'). */
    venue: string;
}

/** A cross-venue arbitrage opportunity. */
export interface ArbitrageOpportunity {
    /** Market on the buy side. */
    marketA: UnifiedMarket;

    /** Market on the sell side. */
    marketB: UnifiedMarket;

    /** Price spread (sellPrice - buyPrice). */
    spread: number;

    /** Venue to buy on. */
    buyVenue: string;

    /** Venue to sell on. */
    sellVenue: string;

    /** Price to buy at. */
    buyPrice: number;

    /** Price to sell at. */
    sellPrice: number;

    /** The set-theoretic relation between the two markets (e.g. identity, subset). */
    relation?: MatchRelation;

    /** Match confidence score (0.0 to 1.0). */
    confidence?: number;
}
