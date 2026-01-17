/**
 * Exchange client implementations.
 * 
 * This module provides clean, TypeScript-friendly wrappers around the auto-generated
 * OpenAPI client, matching the Python API exactly.
 */

import {
    DefaultApi,
    Configuration,
    FetchMarketsRequest,
    SearchMarketsRequest,
    GetMarketsBySlugRequest,
    FetchOHLCVRequest,
    FetchOrderBookRequest,
    FetchTradesRequest,
    CreateOrderRequest,
    CancelOrderRequest,
    FetchOpenOrdersRequest,
    FetchPositionsRequest,
    ExchangeCredentials,
} from "../generated/src/index.js";

import {
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
} from "./models.js";

import { ServerManager } from "./server-manager.js";

// Converter functions
function convertMarket(raw: any): UnifiedMarket {
    const outcomes: MarketOutcome[] = (raw.outcomes || []).map((o: any) => ({
        id: o.id,
        label: o.label,
        price: o.price,
        priceChange24h: o.priceChange24h,
        metadata: o.metadata,
    }));

    return {
        id: raw.id,
        title: raw.title,
        outcomes,
        volume24h: raw.volume24h || 0,
        liquidity: raw.liquidity || 0,
        url: raw.url,
        description: raw.description,
        resolutionDate: raw.resolutionDate ? new Date(raw.resolutionDate) : undefined,
        volume: raw.volume,
        openInterest: raw.openInterest,
        image: raw.image,
        category: raw.category,
        tags: raw.tags,
    };
}

function convertCandle(raw: any): PriceCandle {
    return {
        timestamp: raw.timestamp,
        open: raw.open,
        high: raw.high,
        low: raw.low,
        close: raw.close,
        volume: raw.volume,
    };
}

function convertOrderBook(raw: any): OrderBook {
    const bids: OrderLevel[] = (raw.bids || []).map((b: any) => ({
        price: b.price,
        size: b.size,
    }));

    const asks: OrderLevel[] = (raw.asks || []).map((a: any) => ({
        price: a.price,
        size: a.size,
    }));

    return {
        bids,
        asks,
        timestamp: raw.timestamp,
    };
}

function convertTrade(raw: any): Trade {
    return {
        id: raw.id,
        timestamp: raw.timestamp,
        price: raw.price,
        amount: raw.amount,
        side: raw.side || "unknown",
    };
}

function convertOrder(raw: any): Order {
    return {
        id: raw.id,
        marketId: raw.marketId,
        outcomeId: raw.outcomeId,
        side: raw.side,
        type: raw.type,
        amount: raw.amount,
        status: raw.status,
        filled: raw.filled,
        remaining: raw.remaining,
        timestamp: raw.timestamp,
        price: raw.price,
        fee: raw.fee,
    };
}

function convertPosition(raw: any): Position {
    return {
        marketId: raw.marketId,
        outcomeId: raw.outcomeId,
        outcomeLabel: raw.outcomeLabel,
        size: raw.size,
        entryPrice: raw.entryPrice,
        currentPrice: raw.currentPrice,
        unrealizedPnL: raw.unrealizedPnL,
        realizedPnL: raw.realizedPnL,
    };
}

function convertBalance(raw: any): Balance {
    return {
        currency: raw.currency,
        total: raw.total,
        available: raw.available,
        locked: raw.locked,
    };
}

/**
 * Base exchange client options.
 */
export interface ExchangeOptions {
    /** API key for authentication (optional) */
    apiKey?: string;

    /** Private key for authentication (optional) */
    privateKey?: string;

    /** Base URL of the PMXT sidecar server */
    baseUrl?: string;

    /** Automatically start server if not running (default: true) */
    autoStartServer?: boolean;
}

/**
 * Base class for prediction market exchanges.
 * 
 * This provides a unified interface for interacting with different
 * prediction market platforms (Polymarket, Kalshi, etc.).
 */
export abstract class Exchange {
    protected exchangeName: string;
    protected apiKey?: string;
    protected privateKey?: string;
    protected api: DefaultApi;
    protected serverManager: ServerManager;
    protected initPromise: Promise<void>;

    constructor(exchangeName: string, options: ExchangeOptions = {}) {
        this.exchangeName = exchangeName.toLowerCase();
        this.apiKey = options.apiKey;
        this.privateKey = options.privateKey;

        let baseUrl = options.baseUrl || "http://localhost:3847";
        const autoStartServer = options.autoStartServer !== false;

        // Initialize server manager
        this.serverManager = new ServerManager({ baseUrl });

        // Configure the API client with the initial base URL (will be updated if port changes)
        const config = new Configuration({ basePath: baseUrl });
        this.api = new DefaultApi(config);

        // Initialize the server connection asynchronously
        this.initPromise = this.initializeServer(autoStartServer);
    }

    private async initializeServer(autoStartServer: boolean): Promise<void> {
        if (autoStartServer) {
            try {
                await this.serverManager.ensureServerRunning();

                // Get the actual port the server is running on
                // (may differ from default if default port was busy)
                const actualPort = this.serverManager.getRunningPort();
                const newBaseUrl = `http://localhost:${actualPort}`;

                // Update API client with actual base URL
                const newConfig = new Configuration({ basePath: newBaseUrl });
                this.api = new DefaultApi(newConfig);
            } catch (error) {
                throw new Error(
                    `Failed to start PMXT server: ${error}\n\n` +
                    `Please ensure 'pmxt-core' is installed: npm install -g pmxt-core\n` +
                    `Or start the server manually: pmxt-server`
                );
            }
        }
    }

    protected handleResponse(response: any): any {
        if (!response.success) {
            const error = response.error || {};
            throw new Error(error.message || "Unknown error");
        }
        return response.data;
    }

    protected getCredentials(): ExchangeCredentials | undefined {
        if (!this.apiKey && !this.privateKey) {
            return undefined;
        }
        return {
            apiKey: this.apiKey,
            privateKey: this.privateKey,
        };
    }

    // Market Data Methods

    /**
     * Get active markets from the exchange.
     * 
     * @param params - Optional filter parameters
     * @returns List of unified markets
     * 
     * @example
     * ```typescript
     * const markets = await exchange.fetchMarkets({ limit: 20, sort: "volume" });
     * ```
     */
    async fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params) {
                args.push(params);
            }

            const requestBody: FetchMarketsRequest = {
                args,
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchMarkets({
                exchange: this.exchangeName as any,
                fetchMarketsRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertMarket);
        } catch (error) {
            throw new Error(`Failed to fetch markets: ${error}`);
        }
    }

    /**
     * Search markets by keyword.
     * 
     * @param query - Search query
     * @param params - Optional filter parameters
     * @returns List of matching markets
     * 
     * @example
     * ```typescript
     * const markets = await exchange.searchMarkets("Trump", { limit: 10 });
     * ```
     */
    async searchMarkets(
        query: string,
        params?: MarketFilterParams
    ): Promise<UnifiedMarket[]> {
        await this.initPromise;
        try {
            const args: any[] = [query];
            if (params) {
                args.push(params);
            }

            const requestBody: SearchMarketsRequest = {
                args,
                credentials: this.getCredentials()
            };

            const response = await this.api.searchMarkets({
                exchange: this.exchangeName as any,
                searchMarketsRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertMarket);
        } catch (error) {
            throw new Error(`Failed to search markets: ${error}`);
        }
    }

    /**
     * Fetch markets by URL slug/ticker.
     * 
     * @param slug - Market slug (Polymarket) or ticker (Kalshi)
     * @returns List of matching markets
     * 
     * @example
     * ```typescript
     * // Polymarket
     * const markets = await poly.getMarketsBySlug("who-will-trump-nominate-as-fed-chair");
     * 
     * // Kalshi
     * const markets = await kalshi.getMarketsBySlug("KXFEDCHAIRNOM-29");
     * ```
     */
    async getMarketsBySlug(slug: string): Promise<UnifiedMarket[]> {
        await this.initPromise;
        try {
            const requestBody: GetMarketsBySlugRequest = {
                args: [slug],
                credentials: this.getCredentials()
            };

            const response = await this.api.getMarketsBySlug({
                exchange: this.exchangeName as any,
                getMarketsBySlugRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertMarket);
        } catch (error) {
            throw new Error(`Failed to get markets by slug: ${error}`);
        }
    }

    /**
     * Get historical price candles.
     * 
     * **CRITICAL**: Use outcome.id, not market.id.
     * - Polymarket: outcome.id is the CLOB Token ID
     * - Kalshi: outcome.id is the Market Ticker
     * 
     * @param outcomeId - Outcome ID (from market.outcomes[].id)
     * @param params - History filter parameters
     * @returns List of price candles
     * 
     * @example
     * ```typescript
     * const markets = await exchange.searchMarkets("Trump");
     * const outcomeId = markets[0].outcomes[0].id;
     * const candles = await exchange.fetchOHLCV(outcomeId, {
     *   resolution: "1h",
     *   limit: 100
     * });
     * ```
     */
    async fetchOHLCV(
        outcomeId: string,
        params: HistoryFilterParams
    ): Promise<PriceCandle[]> {
        await this.initPromise;
        try {
            const paramsDict: any = { resolution: params.resolution };
            if (params.start) {
                paramsDict.start = params.start.toISOString();
            }
            if (params.end) {
                paramsDict.end = params.end.toISOString();
            }
            if (params.limit) {
                paramsDict.limit = params.limit;
            }

            const requestBody: FetchOHLCVRequest = {
                args: [outcomeId, paramsDict],
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchOHLCV({
                exchange: this.exchangeName as any,
                fetchOHLCVRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertCandle);
        } catch (error) {
            throw new Error(`Failed to fetch OHLCV: ${error}`);
        }
    }

    /**
     * Get current order book for an outcome.
     * 
     * @param outcomeId - Outcome ID
     * @returns Current order book
     * 
     * @example
     * ```typescript
     * const orderBook = await exchange.fetchOrderBook(outcomeId);
     * console.log(`Best bid: ${orderBook.bids[0].price}`);
     * console.log(`Best ask: ${orderBook.asks[0].price}`);
     * ```
     */
    async fetchOrderBook(outcomeId: string): Promise<OrderBook> {
        await this.initPromise;
        try {
            const requestBody: FetchOrderBookRequest = {
                args: [outcomeId],
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchOrderBook({
                exchange: this.exchangeName as any,
                fetchOrderBookRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return convertOrderBook(data);
        } catch (error) {
            throw new Error(`Failed to fetch order book: ${error}`);
        }
    }

    /**
     * Watch orderbook updates in real-time via WebSocket.
     * 
     * Note: This method uses the core exchange directly (bypasses the server)
     * to maintain a persistent WebSocket connection. For WebSocket features,
     * consider using the core package directly for better performance.
     * 
     * @param outcomeId - Outcome ID (token ID for Polymarket, ticker for Kalshi)
     * @yields {OrderBook} Orderbook updates as they arrive
     * 
     * @example
     * ```typescript
     * for await (const orderbook of exchange.watchOrderBook(outcomeId)) {
     *     console.log(`Best bid: ${orderbook.bids[0]?.price}`);
     *     console.log(`Best ask: ${orderbook.asks[0]?.price}`);
     * }
     * ```
     */
    async *watchOrderBook(outcomeId: string): AsyncGenerator<OrderBook> {
        // Try to import core exchange - works in monorepo or if pmxt-core is installed
        let ExchangeClass: any;
        
        try {
            // Try relative import (works in monorepo)
            const coreModule = await import('../../../../core/src/index.js');
            ExchangeClass = this.exchangeName === 'polymarket' 
                ? coreModule.PolymarketExchange 
                : this.exchangeName === 'kalshi'
                ? coreModule.KalshiExchange
                : null;
        } catch {
            try {
                // Try package import (works if pmxt-core is installed)
                const coreModule = await import('pmxt-core');
                ExchangeClass = this.exchangeName === 'polymarket' 
                    ? coreModule.PolymarketExchange 
                    : this.exchangeName === 'kalshi'
                    ? coreModule.KalshiExchange
                    : null;
            } catch (error: any) {
                throw new Error(
                    'WebSocket support requires access to pmxt-core. ' +
                    'For WebSocket features, use the core package directly: ' +
                    'import { PolymarketExchange } from "pmxt-core"'
                );
            }
        }

        if (!ExchangeClass) {
            throw new Error(`WebSocket not supported for exchange: ${this.exchangeName}`);
        }

        // Create exchange instance with credentials
        const coreExchange = new ExchangeClass(this.getCredentials());

        // Yield from core exchange's watchOrderBook
        yield* coreExchange.watchOrderBook(outcomeId);
    }

    /**
     * Get trade history for an outcome.
     * 
     * Note: Polymarket requires API key.
     * 
     * @param outcomeId - Outcome ID
     * @param params - History filter parameters
     * @returns List of trades
     */
    async fetchTrades(
        outcomeId: string,
        params: HistoryFilterParams
    ): Promise<Trade[]> {
        await this.initPromise;
        try {
            const paramsDict: any = { resolution: params.resolution };
            if (params.limit) {
                paramsDict.limit = params.limit;
            }

            const requestBody: FetchTradesRequest = {
                args: [outcomeId, paramsDict],
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchTrades({
                exchange: this.exchangeName as any,
                fetchTradesRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertTrade);
        } catch (error) {
            throw new Error(`Failed to fetch trades: ${error}`);
        }
    }

    // Trading Methods (require authentication)

    /**
     * Create a new order.
     * 
     * @param params - Order parameters
     * @returns Created order
     * 
     * @example
     * ```typescript
     * const order = await exchange.createOrder({
     *   marketId: "663583",
     *   outcomeId: "10991849...",
     *   side: "buy",
     *   type: "limit",
     *   amount: 10,
     *   price: 0.55
     * });
     * ```
     */
    async createOrder(params: CreateOrderParams): Promise<Order> {
        await this.initPromise;
        try {
            const paramsDict: any = {
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                amount: params.amount,
            };
            if (params.price !== undefined) {
                paramsDict.price = params.price;
            }

            const requestBody: CreateOrderRequest = {
                args: [paramsDict],
                credentials: this.getCredentials()
            };

            const response = await this.api.createOrder({
                exchange: this.exchangeName as any,
                createOrderRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return convertOrder(data);
        } catch (error) {
            throw new Error(`Failed to create order: ${error}`);
        }
    }

    /**
     * Cancel an open order.
     * 
     * @param orderId - Order ID to cancel
     * @returns Cancelled order
     */
    async cancelOrder(orderId: string): Promise<Order> {
        await this.initPromise;
        try {
            const requestBody: CancelOrderRequest = {
                args: [orderId],
                credentials: this.getCredentials()
            };

            const response = await this.api.cancelOrder({
                exchange: this.exchangeName as any,
                cancelOrderRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return convertOrder(data);
        } catch (error) {
            throw new Error(`Failed to cancel order: ${error}`);
        }
    }

    /**
     * Get details of a specific order.
     * 
     * @param orderId - Order ID
     * @returns Order details
     */
    async fetchOrder(orderId: string): Promise<Order> {
        await this.initPromise;
        try {
            const requestBody: CancelOrderRequest = {
                args: [orderId],
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchOrder({
                exchange: this.exchangeName as any,
                cancelOrderRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return convertOrder(data);
        } catch (error) {
            throw new Error(`Failed to fetch order: ${error}`);
        }
    }

    /**
     * Get all open orders, optionally filtered by market.
     * 
     * @param marketId - Optional market ID to filter by
     * @returns List of open orders
     */
    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (marketId) {
                args.push(marketId);
            }

            const requestBody: FetchOpenOrdersRequest = {
                args,
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchOpenOrders({
                exchange: this.exchangeName as any,
                fetchOpenOrdersRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertOrder);
        } catch (error) {
            throw new Error(`Failed to fetch open orders: ${error}`);
        }
    }

    // Account Methods

    /**
     * Get current positions across all markets.
     * 
     * @returns List of positions
     */
    async fetchPositions(): Promise<Position[]> {
        await this.initPromise;
        try {
            const requestBody: FetchPositionsRequest = {
                args: [],
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchPositions({
                exchange: this.exchangeName as any,
                fetchPositionsRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertPosition);
        } catch (error) {
            throw new Error(`Failed to fetch positions: ${error}`);
        }
    }

    /**
     * Get account balance.
     * 
     * @returns List of balances (by currency)
     */
    async fetchBalance(): Promise<Balance[]> {
        await this.initPromise;
        try {
            const requestBody: FetchPositionsRequest = {
                args: [],
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchBalance({
                exchange: this.exchangeName as any,
                fetchPositionsRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertBalance);
        } catch (error) {
            throw new Error(`Failed to fetch balance: ${error}`);
        }
    }
}

/**
 * Polymarket exchange client.
 * 
 * @example
 * ```typescript
 * // Public data (no auth)
 * const poly = new Polymarket();
 * const markets = await poly.searchMarkets("Trump");
 * 
 * // Trading (requires auth)
 * const poly = new Polymarket({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
 * const balance = await poly.fetchBalance();
 * ```
 */
export class Polymarket extends Exchange {
    constructor(options: Omit<ExchangeOptions, "apiKey"> = {}) {
        super("polymarket", options);
    }
}

/**
 * Kalshi exchange client.
 * 
 * @example
 * ```typescript
 * // Public data (no auth)
 * const kalshi = new Kalshi();
 * const markets = await kalshi.searchMarkets("Fed rates");
 * 
 * // Trading (requires auth)
 * const kalshi = new Kalshi({
 *   apiKey: process.env.KALSHI_API_KEY,
 *   privateKey: process.env.KALSHI_PRIVATE_KEY
 * });
 * const balance = await kalshi.fetchBalance();
 * ```
 */
export class Kalshi extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("kalshi", options);
    }
}
