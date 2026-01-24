import { UnifiedMarket, PriceCandle, CandleInterval, OrderBook, Trade, Order, Position, Balance, CreateOrderParams } from './types';

export interface MarketFilterParams {
    limit?: number;
    offset?: number;
    sort?: 'volume' | 'liquidity' | 'newest';
    searchIn?: 'title' | 'description' | 'both'; // Where to search (default: 'title')
}

export interface HistoryFilterParams {
    resolution: CandleInterval;
    start?: Date;
    end?: Date;
    limit?: number;
}

export interface ExchangeCredentials {
    // Standard API authentication (Kalshi, etc.)
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;

    // Blockchain-based authentication (Polymarket)
    privateKey?: string;  // Required for Polymarket L1 auth

    // Polymarket-specific L2 fields
    signatureType?: number;  // 0 = EOA, 1 = Poly Proxy, 2 = Gnosis Safe
    funderAddress?: string;  // The address funding the trades (defaults to signer address)
}

// ----------------------------------------------------------------------------
// Base Exchange Class
// ----------------------------------------------------------------------------

export abstract class PredictionMarketExchange {
    protected credentials?: ExchangeCredentials;

    constructor(credentials?: ExchangeCredentials) {
        this.credentials = credentials;
    }

    abstract get name(): string;

    /**
     * Fetch all relevant markets from the source.
     */
    abstract fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]>;

    /**
     * Search for markets matching a keyword query.
     * By default, searches only in market titles. Use params.searchIn to search descriptions or both.
     */
    abstract searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]>;

    /**
     * Fetch historical price data for a specific market outcome.
     * @param id - The Outcome ID (MarketOutcome.id). This should be the ID of the specific tradeable asset.
     */
    async fetchOHLCV(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
        throw new Error("Method fetchOHLCV not implemented.");
    }

    /**
     * Fetch the current order book (bids/asks) for a specific outcome.
     * Essential for calculating localized spread and depth.
     */
    async fetchOrderBook(id: string): Promise<OrderBook> {
        throw new Error("Method fetchOrderBook not implemented.");
    }

    /**
     * Watch orderbook updates in real-time via WebSocket.
     * Returns an async generator that yields OrderBook updates.
     * @param symbol - The outcome ID (token ID for Polymarket, ticker for Kalshi)
     * @yields {OrderBook} Orderbook updates as they arrive
     */
    async *watchOrderBook(symbol: string): AsyncGenerator<OrderBook> {
        throw new Error("Method watchOrderBook not implemented.");
    }

    /**
     * Fetch raw trade history.
     */
    async fetchTrades(id: string, params: HistoryFilterParams): Promise<Trade[]> {
        throw new Error("Method fetchTrades not implemented.");
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    /**
     * Place a new order.
     */
    async createOrder(params: CreateOrderParams): Promise<Order> {
        throw new Error("Method createOrder not implemented.");
    }

    /**
     * Cancel an existing order.
     */
    async cancelOrder(orderId: string): Promise<Order> {
        throw new Error("Method cancelOrder not implemented.");
    }

    /**
     * Fetch a specific order by ID.
     */
    async fetchOrder(orderId: string): Promise<Order> {
        throw new Error("Method fetchOrder not implemented.");
    }

    /**
     * Fetch all open orders.
     * @param marketId - Optional filter by market.
     */
    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        throw new Error("Method fetchOpenOrders not implemented.");
    }

    /**
     * Fetch current user positions.
     */
    async fetchPositions(): Promise<Position[]> {
        throw new Error("Method fetchPositions not implemented.");
    }

    /**
     * Fetch account balances.
     */
    async fetchBalance(): Promise<Balance[]> {
        throw new Error("Method fetchBalance not implemented.");
    }
}
