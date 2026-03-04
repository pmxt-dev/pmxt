
// ----------------------------------------------------------------------------
// Core Data Models
// ----------------------------------------------------------------------------

export interface MarketOutcome {
    /** Outcome ID for trading operations (CLOB Token ID for Polymarket, Market Ticker for Kalshi) */
    outcomeId: string;
    /** The market this outcome belongs to (set automatically when outcomes are built) */
    marketId?: string;
    label: string;
    price: number;
    priceChange24h?: number;
    metadata?: Record<string, any>;
}

export interface UnifiedEvent {
    id: string;
    title: string;
    description: string;
    slug: string;
    markets: UnifiedMarket[];

    volume24h: number;
    volume?: number; // Total / Lifetime volume (sum across markets; undefined if no market provides it)

    url: string;
    image?: string;

    category?: string;
    tags?: string[];
}

export interface UnifiedMarket {
    /** The unique identifier for this market */
    marketId: string;
    eventId?: string;
    title: string;
    description: string;
    slug?: string;
    outcomes: MarketOutcome[];

    resolutionDate: Date;
    volume24h: number;
    volume?: number; // Total / Lifetime volume
    liquidity: number;
    openInterest?: number;

    url: string;
    image?: string;

    category?: string;
    tags?: string[];
    tickSize?: number; // Minimum price increment (e.g., 0.01, 0.001)

    // Convenience getters for binary markets
    yes?: MarketOutcome;
    no?: MarketOutcome;
    up?: MarketOutcome;
    down?: MarketOutcome;
}

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '6h' | '1d';

export interface PriceCandle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export interface OrderLevel {
    price: number; // 0.0 to 1.0 (probability)
    size: number;  // contracts/shares
}

export interface OrderBook {
    bids: OrderLevel[];
    asks: OrderLevel[];
    timestamp?: number;
}

export interface Trade {
    id: string;
    timestamp: number;
    price: number;
    amount: number;
    side: 'buy' | 'sell' | 'unknown';
}

export interface UserTrade extends Trade {
    orderId?: string;
}

// ----------------------------------------------------------------------------
// Trading Data Models
// ----------------------------------------------------------------------------

export interface Order {
    id: string;
    marketId: string;
    outcomeId: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    price?: number;  // For limit orders
    amount: number;  // Size in contracts/shares
    status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected';
    filled: number;  // Amount filled
    remaining: number;  // Amount remaining
    timestamp: number;
    fee?: number;
}

export interface Position {
    marketId: string;
    outcomeId: string;
    outcomeLabel: string;
    size: number;  // Positive for long, negative for short
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    realizedPnL?: number;
}

export interface Balance {
    currency: string;  // e.g., 'USDC'
    total: number;
    available: number;
    locked: number;  // In open orders
}

export interface CreateOrderParams {
    marketId: string;
    outcomeId: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    amount: number;
    price?: number; // Required for limit orders
    fee?: number;   // Optional fee rate (e.g., 1000 for 0.1%)
    tickSize?: number; // Optional override for Limitless/Polymarket
    negRisk?: boolean; // Optional override to skip neg-risk lookup (Polymarket)
    buildOnly?: boolean; // If true, returns signed order data without submitting to the network
}
