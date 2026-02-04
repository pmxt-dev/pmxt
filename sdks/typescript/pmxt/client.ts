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
    SearchIn,
    UnifiedEvent,
    ExecutionPriceResult,
    MarketFilterCriteria,
    MarketFilterFunction,
    EventFilterCriteria,
    EventFilterFunction,
} from "./models.js";

import { ServerManager } from "./server-manager.js";

// Converter functions
function convertMarket(raw: any): UnifiedMarket {
    const outcomes: MarketOutcome[] = (raw.outcomes || []).map((o: any) => ({
        outcomeId: o.outcomeId,
        label: o.label,
        price: o.price,
        priceChange24h: o.priceChange24h,
        metadata: o.metadata,
    }));

    const convertOutcome = (o: any) => o ? ({
        outcomeId: o.outcomeId,
        label: o.label,
        price: o.price,
        priceChange24h: o.priceChange24h,
        metadata: o.metadata,
    }) : undefined;

    return {
        marketId: raw.marketId,
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
        yes: convertOutcome(raw.yes),
        no: convertOutcome(raw.no),
        up: convertOutcome(raw.up),
        down: convertOutcome(raw.down),
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

function convertEvent(raw: any): UnifiedEvent {
    const markets = (raw.markets || []).map(convertMarket);

    return {
        id: raw.id,
        title: raw.title,
        description: raw.description,
        slug: raw.slug,
        markets,
        url: raw.url,
        image: raw.image,
        category: raw.category,
        tags: raw.tags,
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

    /** Optional Polymarket Proxy/Smart Wallet address */
    proxyAddress?: string;

    /** Optional signature type (0=EOA, 1=Proxy) */
    signatureType?: number;
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
    protected proxyAddress?: string;
    protected signatureType?: number;
    protected api: DefaultApi;
    protected config: Configuration;
    protected serverManager: ServerManager;
    protected initPromise: Promise<void>;

    constructor(exchangeName: string, options: ExchangeOptions = {}) {
        this.exchangeName = exchangeName.toLowerCase();
        this.apiKey = options.apiKey;
        this.privateKey = options.privateKey;
        this.proxyAddress = options.proxyAddress;
        this.signatureType = options.signatureType;

        let baseUrl = options.baseUrl || "http://localhost:3847";
        const autoStartServer = options.autoStartServer !== false;

        // Initialize server manager
        this.serverManager = new ServerManager({ baseUrl });

        // Configure the API client with the initial base URL (will be updated if port changes)
        this.config = new Configuration({ basePath: baseUrl });
        this.api = new DefaultApi(this.config);

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

                const accessToken = this.serverManager.getAccessToken();
                const headers: any = {};
                if (accessToken) {
                    headers['x-pmxt-access-token'] = accessToken;
                }

                // Update API client with actual base URL
                this.config = new Configuration({
                    basePath: newBaseUrl,
                    headers
                });
                this.api = new DefaultApi(this.config);
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
            funderAddress: this.proxyAddress,
            signatureType: this.signatureType,
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
    async fetchMarkets(params?: any): Promise<UnifiedMarket[]> {
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
     * Get historical price candles.
     *
     * @param outcomeId - Outcome ID (from market.outcomes[].outcomeId)
     * @param params - History filter parameters
     * @returns List of price candles
     * 
     * @example
     * ```typescript
     * const markets = await exchange.fetchMarkets({ query: "Trump" });
     * const outcomeId = markets[0].outcomes[0].outcomeId;
     * const candles = await exchange.fetchOHLCV(outcomeId, {
     *   resolution: "1h",
     *   limit: 100
     * });
     * ```
     */
    async fetchOHLCV(
        outcomeId: string,
        params: any
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
        params: any
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

    // WebSocket Streaming Methods

    /**
     * Watch real-time order book updates via WebSocket.
     * 
     * Returns a promise that resolves with the next order book update.
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     * 
     * @param outcomeId - Outcome ID to watch
     * @param limit - Optional depth limit for order book
     * @returns Next order book update
     * 
     * @example
     * ```typescript
     * // Stream order book updates
     * while (true) {
     *   const orderBook = await exchange.watchOrderBook(outcomeId);
     *   console.log(`Best bid: ${orderBook.bids[0].price}`);
     *   console.log(`Best ask: ${orderBook.asks[0].price}`);
     * }
     * ```
     */
    async watchOrderBook(outcomeId: string, limit?: number): Promise<OrderBook> {
        await this.initPromise;
        try {
            const args: any[] = [outcomeId];
            if (limit !== undefined) {
                args.push(limit);
            }

            const requestBody: any = {
                args,
                credentials: this.getCredentials()
            };

            const response = await this.api.watchOrderBook({
                exchange: this.exchangeName as any,
                watchOrderBookRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return convertOrderBook(data);
        } catch (error) {
            throw new Error(`Failed to watch order book: ${error}`);
        }
    }

    /**
     * Watch real-time trade updates via WebSocket.
     * 
     * Returns a promise that resolves with the next trade(s).
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     * 
     * @param outcomeId - Outcome ID to watch
     * @param since - Optional timestamp to filter trades from
     * @param limit - Optional limit for number of trades
     * @returns Next trade update(s)
     * 
     * @example
     * ```typescript
     * // Stream trade updates
     * while (true) {
     *   const trades = await exchange.watchTrades(outcomeId);
     *   for (const trade of trades) {
     *     console.log(`Trade: ${trade.price} @ ${trade.amount}`);
     *   }
     * }
     * ```
     */
    async watchTrades(
        outcomeId: string,
        since?: number,
        limit?: number
    ): Promise<Trade[]> {
        await this.initPromise;
        try {
            const args: any[] = [outcomeId];
            if (since !== undefined) {
                args.push(since);
            }
            if (limit !== undefined) {
                args.push(limit);
            }

            const requestBody: any = {
                args,
                credentials: this.getCredentials()
            };

            const response = await this.api.watchTrades({
                exchange: this.exchangeName as any,
                watchTradesRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertTrade);
        } catch (error) {
            throw new Error(`Failed to watch trades: ${error}`);
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
    async createOrder(params: any): Promise<Order> {
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
            if (params.fee !== undefined) {
                paramsDict.fee = params.fee;
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

    /**
     * Calculate the average execution price for a given amount by walking the order book.
     * Uses the sidecar server for calculation to ensure consistency.
     * 
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - The amount to execute
     * @returns The volume-weighted average price, or 0 if insufficient liquidity
     */
    async getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<number> {
        const result = await this.getExecutionPriceDetailed(orderBook, side, amount);
        return result.fullyFilled ? result.price : 0;
    }

    /**
     * Calculate detailed execution price information.
     * Uses the sidecar server for calculation to ensure consistency.
     * 
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - The amount to execute
     * @returns Detailed execution result
     */
    async getExecutionPriceDetailed(
        orderBook: OrderBook,
        side: 'buy' | 'sell',
        amount: number
    ): Promise<ExecutionPriceResult> {
        await this.initPromise;
        try {
            const body: any = {
                args: [orderBook, side, amount]
            };
            const credentials = this.getCredentials();
            if (credentials) {
                body.credentials = credentials;
            }

            const url = `${this.config.basePath}/api/${this.exchangeName}/getExecutionPriceDetailed`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }

            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            throw new Error(`Failed to get execution price: ${error}`);
        }
    }

    // ----------------------------------------------------------------------------
    // Filtering Methods
    // ----------------------------------------------------------------------------

    /**
     * Filter markets based on criteria or custom function.
     *
     * @param markets - Array of markets to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of markets
     *
     * @example Simple text search
     * api.filterMarkets(markets, 'Trump')
     *
     * @example Advanced filtering
     * api.filterMarkets(markets, {
     *   text: 'Trump',
     *   searchIn: ['title', 'tags'],
     *   volume24h: { min: 10000 },
     *   category: 'Politics',
     *   price: { outcome: 'yes', max: 0.5 }
     * })
     *
     * @example Custom predicate
     * api.filterMarkets(markets, m => m.liquidity > 5000 && m.yes?.price < 0.3)
     */
    filterMarkets(
        markets: UnifiedMarket[],
        criteria: string | MarketFilterCriteria | MarketFilterFunction
    ): UnifiedMarket[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return markets.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return markets.filter(m =>
                m.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return markets.filter(market => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && market.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && market.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && market.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && market.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'outcomes' && market.outcomes?.some(o => o.label.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && market.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    market.tags?.some(marketTag =>
                        marketTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Volume24h filter
            if (criteria.volume24h) {
                if (criteria.volume24h.min !== undefined && market.volume24h < criteria.volume24h.min) {
                    return false;
                }
                if (criteria.volume24h.max !== undefined && market.volume24h > criteria.volume24h.max) {
                    return false;
                }
            }

            // Volume filter
            if (criteria.volume) {
                if (criteria.volume.min !== undefined && (market.volume || 0) < criteria.volume.min) {
                    return false;
                }
                if (criteria.volume.max !== undefined && (market.volume || 0) > criteria.volume.max) {
                    return false;
                }
            }

            // Liquidity filter
            if (criteria.liquidity) {
                if (criteria.liquidity.min !== undefined && market.liquidity < criteria.liquidity.min) {
                    return false;
                }
                if (criteria.liquidity.max !== undefined && market.liquidity > criteria.liquidity.max) {
                    return false;
                }
            }

            // OpenInterest filter
            if (criteria.openInterest) {
                if (criteria.openInterest.min !== undefined && (market.openInterest || 0) < criteria.openInterest.min) {
                    return false;
                }
                if (criteria.openInterest.max !== undefined && (market.openInterest || 0) > criteria.openInterest.max) {
                    return false;
                }
            }

            // ResolutionDate filter
            if (criteria.resolutionDate && market.resolutionDate) {
                const resDate = market.resolutionDate;
                if (criteria.resolutionDate.before && resDate >= criteria.resolutionDate.before) {
                    return false;
                }
                if (criteria.resolutionDate.after && resDate <= criteria.resolutionDate.after) {
                    return false;
                }
            }

            // Price filter (for binary markets)
            if (criteria.price) {
                const outcome = market[criteria.price.outcome];
                if (!outcome) return false;

                if (criteria.price.min !== undefined && outcome.price < criteria.price.min) {
                    return false;
                }
                if (criteria.price.max !== undefined && outcome.price > criteria.price.max) {
                    return false;
                }
            }

            // Price change filter
            if (criteria.priceChange24h) {
                const outcome = market[criteria.priceChange24h.outcome];
                if (!outcome || outcome.priceChange24h === undefined) return false;

                if (criteria.priceChange24h.min !== undefined && outcome.priceChange24h < criteria.priceChange24h.min) {
                    return false;
                }
                if (criteria.priceChange24h.max !== undefined && outcome.priceChange24h > criteria.priceChange24h.max) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Filter events based on criteria or custom function.
     *
     * @param events - Array of events to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of events
     *
     * @example Simple text search
     * api.filterEvents(events, 'Trump')
     *
     * @example Advanced filtering
     * api.filterEvents(events, {
     *   text: 'Election',
     *   searchIn: ['title', 'tags'],
     *   category: 'Politics',
     *   marketCount: { min: 5 }
     * })
     *
     * @example Custom predicate
     * api.filterEvents(events, e => e.markets.length > 10)
     */
    filterEvents(
        events: UnifiedEvent[],
        criteria: string | EventFilterCriteria | EventFilterFunction
    ): UnifiedEvent[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return events.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return events.filter(e =>
                e.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return events.filter(event => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && event.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && event.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && event.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && event.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && event.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    event.tags?.some(eventTag =>
                        eventTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Market count filter
            if (criteria.marketCount) {
                const count = event.markets.length;
                if (criteria.marketCount.min !== undefined && count < criteria.marketCount.min) {
                    return false;
                }
                if (criteria.marketCount.max !== undefined && count > criteria.marketCount.max) {
                    return false;
                }
            }

            // Total volume filter
            if (criteria.totalVolume) {
                const totalVolume = event.markets.reduce((sum, m) => sum + m.volume24h, 0);
                if (criteria.totalVolume.min !== undefined && totalVolume < criteria.totalVolume.min) {
                    return false;
                }
                if (criteria.totalVolume.max !== undefined && totalVolume > criteria.totalVolume.max) {
                    return false;
                }
            }

            return true;
        });
    }
}

/**
 * Polymarket exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const poly = new Polymarket();
 * const markets = await poly.fetchMarkets({ query: "Trump" });
 *
 * // Trading (requires auth)
 * const poly = new Polymarket({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
 * const balance = await poly.fetchBalance();
 * ```
 */
/**
 * Options for initializing Polymarket client.
 */
export interface PolymarketOptions {
    /** Private key for authentication (optional) */
    privateKey?: string;

    /** Base URL of the PMXT sidecar server */
    baseUrl?: string;

    /** Automatically start server if not running (default: true) */
    autoStartServer?: boolean;

    /** Optional Polymarket Proxy/Smart Wallet address */
    proxyAddress?: string;

    /** Optional signature type */
    signatureType?: 'eoa' | 'poly-proxy' | 'gnosis-safe' | number;
}

export class Polymarket extends Exchange {
    constructor(options: PolymarketOptions = {}) {
        // Default to gnosis-safe signature type
        const polyOptions = {
            signatureType: 'gnosis-safe',
            ...options
        };
        super("polymarket", polyOptions as ExchangeOptions);
    }
}

/**
 * Kalshi exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const kalshi = new Kalshi();
 * const markets = await kalshi.fetchMarkets({ query: "Fed rates" });
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

/**
 * Limitless exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const limitless = new Limitless();
 * const markets = await limitless.fetchMarkets({ query: "Trump" });
 *
 * // Trading (requires auth)
 * const limitless = new Limitless({
 *   apiKey: process.env.LIMITLESS_API_KEY,
 *   privateKey: process.env.LIMITLESS_PRIVATE_KEY
 * });
 * const balance = await limitless.fetchBalance();
 * ```
 */
export class Limitless extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("limitless", options);
    }
}
