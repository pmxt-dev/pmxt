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
     * Outcome ID. Use this for fetchOHLCV/fetchOrderBook/fetchTrades.
     * - Polymarket: CLOB Token ID
     * - Kalshi: Market Ticker
     */
    id: string;

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
    /** Market ID */
    id: string;

    /** Market title */
    title: string;

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
 * Current order book for an outcome.
 */
export interface OrderBook {
    /** Bid orders (sorted high to low) */
    bids: OrderLevel[];

    /** Ask orders (sorted low to high) */
    asks: OrderLevel[];

    /** Unix timestamp (milliseconds) */
    timestamp?: number;
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
export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "6h" | "1d";
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

    /** Where to search (for searchMarkets) */
    searchIn?: SearchIn;
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
    markets: UnifiedMarket[];

    /** Event URL */
    url: string;

    /** Event image URL */
    image?: string;

    /** Event category */
    category?: string;

    /** Event tags */
    tags?: string[];

    /**
     * Search for markets within this event by keyword.
     * 
     * @param query - Search query (case-insensitive)
     * @param searchIn - Where to search - "title", "description", or "both"
     * @returns List of matching markets
     */
    searchMarkets(query: string, searchIn?: SearchIn): UnifiedMarket[];
}
