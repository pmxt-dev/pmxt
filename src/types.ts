
// ----------------------------------------------------------------------------
// Core Data Models
// ----------------------------------------------------------------------------

export interface MarketOutcome {
    id: string; // The unique ID of this outcome. This MUST be the ID required for valid deep-dive operations (orderbook/history).
    // For Polymarket: This is the CLOB Token ID.
    // For Kalshi: This is the Market This (e.g. "FED-25JAN") for the Yes outcome.
    label: string;
    price: number;
    priceChange24h?: number;
    metadata?: Record<string, any>;
}

export interface UnifiedMarket {
    id: string;
    title: string;
    description: string;
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
