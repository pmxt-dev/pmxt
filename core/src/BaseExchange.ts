import { UnifiedMarket, UnifiedEvent, PriceCandle, CandleInterval, OrderBook, Trade, Order, Position, Balance, CreateOrderParams } from './types';
import { getExecutionPrice, getExecutionPriceDetailed, ExecutionPriceResult } from './utils/math';

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
    signatureType?: number | string;  // 0 = EOA, 1 = Poly Proxy, 2 = Gnosis Safe (Can also use 'eoa', 'polyproxy', 'gnosis_safe')
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
     * Fetch markets by URL slug (Polymarket) or ticker (Kalshi).
     * @param slug - Market slug or ticker
     */
    abstract getMarketsBySlug(slug: string): Promise<UnifiedMarket[]>;

    /**
     * Search for events matching a keyword query.
     * Returns grouped events, each containing related markets.
     * @param query - Search term
     * @param params - Optional filter parameters
     */
    async searchEvents(query: string, params?: MarketFilterParams): Promise<UnifiedEvent[]> {
        throw new Error("Method searchEvents not implemented.");
    }

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

    getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): number {
        return getExecutionPrice(orderBook, side, amount);
    }

    getExecutionPriceDetailed(
        orderBook: OrderBook,
        side: 'buy' | 'sell',
        amount: number
    ): ExecutionPriceResult {
        return getExecutionPriceDetailed(orderBook, side, amount);
    }

    // ----------------------------------------------------------------------------
    // WebSocket Streaming Methods
    // ----------------------------------------------------------------------------

    /**
     * Watch orderbook updates in real-time via WebSocket.
     * Returns a promise that resolves with the latest orderbook state.
     * The orderbook is maintained internally with incremental updates.
     * 
     * Usage (async iterator pattern):
     * ```typescript
     * while (true) {
     *     const orderbook = await exchange.watchOrderBook(outcomeId);
     *     console.log(orderbook);
     * }
     * ```
     * 
     * @param id - The Outcome ID to watch
     * @param limit - Optional limit for orderbook depth
     * @returns Promise that resolves with the current orderbook state
     */
    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        throw new Error(`watchOrderBook() is not supported by ${this.name}`);
    }

    /**
     * Watch trade executions in real-time via WebSocket.
     * Returns a promise that resolves with an array of recent trades.
     * 
     * Usage (async iterator pattern):
     * ```typescript
     * while (true) {
     *     const trades = await exchange.watchTrades(outcomeId);
     *     console.log(trades);
     * }
     * ```
     * 
     * @param id - The Outcome ID to watch
     * @param since - Optional timestamp to filter trades from
     * @param limit - Optional limit for number of trades
     * @returns Promise that resolves with recent trades
     */
    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        throw new Error(`watchTrades() is not supported by ${this.name}`);
    }

    /**
     * Close all WebSocket connections and clean up resources.
     * Should be called when done with real-time data to prevent memory leaks.
     * 
     * Usage:
     * ```typescript
     * await exchange.close();
     * ```
     */
    async close(): Promise<void> {
        // Default implementation: no-op
        // Exchanges with WebSocket support should override this
    }
}
