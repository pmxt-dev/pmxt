// ----------------------------------------------------------------------------
// Core Data Models
// ----------------------------------------------------------------------------

export interface MarketOutcome {
    /** Outcome ID for trading operations (CLOB Token ID for Polymarket, Market Ticker for Kalshi) */
    outcomeId: string;
    /** The market this outcome belongs to (set automatically when outcomes are built) */
    marketId?: string;
    /** Human-readable outcome label (e.g., "Yes", "No", candidate name). */
    label: string;
    /** Probability between 0.0 and 1.0. */
    price: number;
    /** Change in price over the past 24 hours, as an absolute probability delta. */
    priceChange24h?: number;
    /** Exchange-specific metadata (e.g., clobTokenId for Polymarket) */
    metadata?: Record<string, any>;
}

/**
 * A grouped collection of related markets (e.g., "Who will be Fed Chair?" contains multiple candidate markets).
 */
export interface UnifiedEvent {
    /** The unique identifier for this event. */
    id: string;
    /** The event title (e.g., "Who will be Fed Chair?"). */
    title: string;
    /** Long-form event description. */
    description: string;
    /** URL-friendly slug for the event. */
    slug: string;
    /** Markets grouped under this event. */
    markets: UnifiedMarket[];

    /** Trading volume over the past 24 hours (USD). */
    volume24h: number;
    volume?: number; // Total / Lifetime volume (sum across markets; undefined if no market provides it)

    /** Canonical URL to view the event on the venue. */
    url: string;
    /** Optional image URL for the event. */
    image?: string;

    /** Optional category label. Venue-defined — common values include "Sports", "Politics", "Crypto", "Economics", "Science", "Culture". Polymarket uses finer-grained categories like "Bitcoin", "Soccer", "Economic Policy"; Kalshi uses broader ones like "Sports" or "Mentions". */
    category?: string;
    /** Optional list of tags. More granular than category — e.g. ["Sports", "FIFA World Cup", "2026 FIFA World Cup"] or ["Politics", "Geopolitics", "Middle East"]. Tags vary by venue: Polymarket markets carry several, Kalshi typically one. */
    tags?: string[];

    /** Raw venue-specific metadata not captured by first-class fields (e.g. Kalshi series_ticker / series_title, Polymarket series). Passed through verbatim so downstream consumers can recover anything the unified shape omits. Each venue populates what it has. */
    sourceMetadata?: Record<string, unknown>;

    /** The exchange/venue this event originates from (e.g. 'polymarket', 'kalshi'). Populated by the Router. */
    sourceExchange?: string;
}

export interface UnifiedMarket {
    /** The unique identifier for this market */
    marketId: string;
    /** Link to parent event */
    eventId?: string;
    /** The market title (e.g., "Will BTC close above $100k on Dec 31?"). */
    title: string;
    /** Long-form market description or resolution criteria. */
    description: string;
    /** URL-friendly slug for the market. */
    slug?: string;
    /** The possible outcomes for this market. */
    outcomes: MarketOutcome[];

    /** When the market is scheduled to resolve. Optional because some venues
     * do not publish a cutoff for every market (e.g. Opinion categorical
     * children) — emit `undefined` rather than coercing to epoch. */
    resolutionDate?: Date;
    /** Trading volume over the past 24 hours (USD). */
    volume24h: number;
    volume?: number; // Total / Lifetime volume
    /** Current market liquidity (USD). */
    liquidity: number;
    /** Total value of outstanding contracts (USD). */
    openInterest?: number;

    /** Canonical URL to view the market on the venue. */
    url: string;
    /** Optional image URL for the market. */
    image?: string;

    /** Optional category label. Venue-defined — common values include "Sports", "Politics", "Crypto", "Economics", "Science", "Culture". Polymarket uses finer-grained categories like "Bitcoin", "Soccer", "Economic Policy"; Kalshi uses broader ones like "Sports" or "Mentions". */
    category?: string;
    /** Optional list of tags. More granular than category — e.g. ["Crypto", "Crypto Prices", "Bitcoin"] or ["Politics", "Elections", "Trump"]. Tags vary by venue: Polymarket markets carry several, Kalshi typically one. */
    tags?: string[];
    tickSize?: number; // Minimum price increment (e.g., 0.01, 0.001)

    /** Venue-native lifecycle status (e.g. 'active', 'closed', 'archived'). */
    status?: string;
    /** On-chain contract / condition identifier where applicable (Polymarket conditionId, etc.). */
    contractAddress?: string;

    /** Raw venue-specific metadata not captured by first-class fields (e.g. Kalshi series_ticker / series_title from the parent event, Polymarket series). Passed through verbatim so downstream consumers can recover anything the unified shape omits. Each venue populates what it has. */
    sourceMetadata?: Record<string, unknown>;

    /** The exchange/venue this market originates from (e.g. 'polymarket', 'kalshi'). Populated by the Router. */
    sourceExchange?: string;

    // Convenience getters for binary markets
    /** Convenience accessor for the YES outcome on a binary market. */
    yes?: MarketOutcome;
    /** Convenience accessor for the NO outcome on a binary market. */
    no?: MarketOutcome;
    /** Convenience accessor for the UP outcome on a binary market. */
    up?: MarketOutcome;
    /** Convenience accessor for the DOWN outcome on a binary market. */
    down?: MarketOutcome;
}

/**
 * A recurring grouping of events on a venue — the fourth tier above
 * Event -> Market -> Outcome. Examples: Kalshi `KXATPMATCH` (every ATP
 * tennis match), Polymarket `wta` (every WTA match), Opinion's daily
 * `collection`. Series only exists where the venue exposes a recurring-event
 * concept; venues without one return an empty array from `fetchSeries`.
 */
export interface UnifiedSeries {
    /** Stable venue-native series identifier (e.g. "KXATPMATCH" on Kalshi, "atp" on Polymarket Gamma, numeric Gamma id). */
    id: string;
    /** Venue-native ticker, when distinct from `id`. */
    ticker?: string;
    /** Venue-native slug. */
    slug?: string;
    /** Human-readable series title (e.g. "ATP Match Winner", "WTA"). */
    title: string;
    /** Long-form series description. */
    description?: string | null;
    /** Recurrence cadence the venue reports ('daily', 'weekly', 'annual', ...). */
    recurrence?: string | null;
    /** Child events. Populated when fetched by id; the list form usually omits this to keep payloads small. */
    events?: UnifiedEvent[];
    /** Canonical venue URL for the series. */
    url?: string | null;
    /** Venue-hosted image. */
    image?: string | null;
    /** The exchange this series originates from. Populated by the Router. */
    sourceExchange?: string;
    /** Raw venue-specific fields not promoted to first-class columns. */
    sourceMetadata?: Record<string, unknown>;
}

/**
 * Candle interval for OHLCV data.
 *
 * Common values: `'1m'`, `'5m'`, `'15m'`, `'1h'`, `'6h'`, `'1d'`.
 * Arbitrary intervals matching `^[0-9]+[smhd]$` (e.g. `'30s'`, `'2m'`,
 * `'120s'`, `'3h'`) are accepted by venues that support them.
 */
export type CandleInterval = string;

export interface PriceCandle {
    /** Unix timestamp in milliseconds marking the start of the candle. */
    timestamp: number;
    /** Opening price for the interval (probability between 0.0 and 1.0). */
    open: number;
    /** Highest price during the interval (probability between 0.0 and 1.0). */
    high: number;
    /** Lowest price during the interval (probability between 0.0 and 1.0). */
    low: number;
    /** Closing price for the interval (probability between 0.0 and 1.0). */
    close: number;
    /** Trading volume during the interval. */
    volume?: number;
}

export interface OrderLevel {
    price: number; // 0.0 to 1.0 (probability)
    size: number;  // contracts/shares
    orderCount?: number;
}

export interface OrderBook {
    /** Order book bid levels, sorted by price descending. */
    bids: OrderLevel[];
    /** Order book ask levels, sorted by price ascending. */
    asks: OrderLevel[];
    /** Unix timestamp in milliseconds when the snapshot was taken. */
    timestamp?: number;
    /** ISO 8601 datetime string of the snapshot (CCXT-compatible). */
    datetime?: string;
    /** Whether the venue marks this snapshot as a negative-risk market. */
    isNegRisk?: boolean;
    /** Last traded price from venues that include it with the book snapshot. */
    lastTradePrice?: number;
    /** Venue-specific metadata preserved from the raw order book snapshot. */
    sourceMetadata?: Record<string, unknown>;
}

export interface Trade {
    /** The unique identifier for this trade. */
    id: string;
    /** Unix timestamp in milliseconds when the trade executed. */
    timestamp: number;
    /** Probability between 0.0 and 1.0. */
    price: number;
    /** Size of the trade in contracts/shares. */
    amount: number;
    /** Trade side from the taker's perspective. */
    side: 'buy' | 'sell' | 'unknown';
    /** The outcome this trade is for (if known). */
    outcomeId?: string;
}

export interface UserTrade extends Trade {
    /** The order that produced this trade, if known. */
    orderId?: string;
    /** The market this trade belongs to, when the venue exposes it (e.g. derivable from the fill's coin/asset). */
    marketId?: string;
    /** Trading fee paid by the user for this fill, when the venue exposes it. */
    fee?: number;
    /** Populated in hosted mode after on-chain settlement; null for local-mode and for non-on-chain venues. */
    txHash?: string | null;
    /** Populated in hosted mode after on-chain settlement; null for local-mode and for non-on-chain venues. */
    chain?: string | null;
    /** Populated in hosted mode after on-chain settlement; null for local-mode and for non-on-chain venues. */
    blockNumber?: number | null;
}


export interface QueuedPromise<T> {
    /** Internal: resolver for a queued promise. */
    resolve: (value: T | PromiseLike<T>) => void;
    /** Internal: rejecter for a queued promise. */
    reject: (reason?: any) => void;
}

// ----------------------------------------------------------------------------
// Trading Data Models
// ----------------------------------------------------------------------------

export interface Order {
    /** The exchange-assigned order identifier. */
    id: string;
    /** The market this order was placed on. */
    marketId: string;
    /** The outcome this order was placed on. */
    outcomeId: string;
    /** Order side: buy or sell. */
    side: 'buy' | 'sell';
    /** Order type: market (execute immediately) or limit (resting at a price). */
    type: 'market' | 'limit';
    price?: number;  // For limit orders
    amount: number;  // Size in contracts/shares
    /** Lifecycle status of the order. */
    status: 'pending' | 'open' | 'filled' | 'canceled' | 'rejected';
    filled: number;  // Amount filled (USDC cost for buys, shares for sells)
    /** Amount filled in shares/contracts (if different from USDC-denominated `filled`). */
    filledShares?: number;
    remaining: number;  // Amount remaining
    /** Unix timestamp in milliseconds when the order was created. */
    timestamp: number;
    /** Fee paid for this order, if known. */
    fee?: number;
    /** Fee rate in basis points applied to this order (e.g. 100 = 1%). */
    feeRateBps?: number;
    /** Populated in hosted mode after on-chain settlement; null for local-mode and for non-on-chain venues. */
    txHash?: string | null;
    /** Populated in hosted mode after on-chain settlement; null for local-mode and for non-on-chain venues. */
    chain?: string | null;
    /** Populated in hosted mode after on-chain settlement; null for local-mode and for non-on-chain venues. */
    blockNumber?: number | null;
}

/**
 * A current position in a market.
 *
 * In hosted mode, `outcomeLabel`, `entryPrice`, `currentPrice` and
 * `unrealizedPnL` may be null when the server cannot derive them
 * (e.g. `with_mtm=false` or no fill history). Venue-direct callers
 * continue to populate every field.
 */
export interface Position {
    /** The market this position is held in. */
    marketId: string;
    /** The outcome this position is held in. */
    outcomeId: string;
    /** Human-readable label for the outcome held. Optional in hosted mode. */
    outcomeLabel?: string | null;
    size: number;  // Positive for long, negative for short
    /** Average entry price for the position (probability between 0.0 and 1.0). Optional in hosted mode when no fill history is available. */
    entryPrice?: number | null;
    /** Current mark price for the position (probability between 0.0 and 1.0). Optional in hosted mode when mark-to-market data is unavailable. */
    currentPrice?: number | null;
    /** Current market value of the position (size * currentPrice). Null when currentPrice is unavailable. */
    currentValue?: number | null;
    /** Unrealized profit or loss at the current price (USD). Optional in hosted mode when mark-to-market data is unavailable. */
    unrealizedPnL?: number | null;
    /** Realized profit or loss booked so far (USD). */
    realizedPnL?: number;
    /** Populated in hosted mode after on-chain settlement (from the last fill); null for local-mode and for non-on-chain venues. */
    txHash?: string | null;
    /** Populated in hosted mode after on-chain settlement (from the last fill); null for local-mode and for non-on-chain venues. */
    chain?: string | null;
    /** Populated in hosted mode after on-chain settlement (from the last fill); null for local-mode and for non-on-chain venues. */
    blockNumber?: number | null;
}

export interface Balance {
    currency: string;  // e.g., 'USDC'
    /** Total balance including funds locked in open orders. */
    total: number;
    /** Balance available to trade (excludes locked funds). */
    available: number;
    locked: number;  // In open orders
    /** Hosted-mode: which venue this balance belongs to in a multi-venue response. Null when the balance is venue-agnostic. */
    venue?: string | null;
}

export interface CreateOrderParams {
    /** The market to trade on. */
    marketId: string;
    /** The outcome to trade. */
    outcomeId: string;
    /** Order side: buy or sell. */
    side: 'buy' | 'sell';
    /** Order type: market (execute immediately) or limit (resting at a price). */
    type: 'market' | 'limit';
    /** Size of the order in contracts/shares. */
    amount: number;
    price?: number; // Required for limit orders
    denom?: 'usdc' | 'shares'; // Hosted mode: amount unit.
    slippage_pct?: number; // Hosted mode: maximum market-order slippage percentage.
    fee?: number;   // Optional fee rate (e.g., 1000 for 0.1%)
    /** Hyperliquid builder address to attach to the order action. */
    builder?: string;
    /** Hyperliquid builder fee in tenths of a basis point (e.g. 10 = 1 bp). */
    builderFee?: number;
    tickSize?: number; // Optional override for Limitless/Polymarket
    negRisk?: boolean; // Optional override to skip neg-risk lookup (Polymarket)
    onBehalfOf?: number; // Limitless delegated signing: profile ID to trade on behalf of
}

export interface BuiltOrder {
    /** The exchange name this order was built for. */
    exchange: string;
    /** The original params used to build this order. */
    params: CreateOrderParams;
    /**
     * For CLOB exchanges (Polymarket): the EIP-712 signed order
     * ready to POST to the exchange's order endpoint.
     */
    signedOrder?: Record<string, unknown>;
    /**
     * For on-chain AMM exchanges: the EVM transaction payload.
     * Reserved for future exchanges; no current exchange populates this.
     */
    tx?: {
        to: string;
        data: string;
        value: string;
        chainId: number;
    };
    /** The raw, exchange-native payload. Always present. */
    raw: unknown;
    /**
     * Unix epoch (ms) when this built order expires server-side.
     * Submitting after expiry returns BUILT_ORDER_EXPIRED.
     */
    expiry?: number | null;
}
