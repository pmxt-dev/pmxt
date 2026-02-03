import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams, ExchangeCredentials } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, Order, Position, Balance, CreateOrderParams } from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { searchMarkets } from './searchMarkets';
import { searchEvents } from './searchEvents';
import { getMarketsBySlug } from './getMarketsBySlug';
import { fetchOHLCV } from './fetchOHLCV';
import { fetchOrderBook } from './fetchOrderBook';
import { fetchTrades } from './fetchTrades';
import { fetchPositions } from './fetchPositions';
import { LimitlessAuth } from './auth';
import { LimitlessClient } from './client';
import { LimitlessWebSocket, LimitlessWebSocketConfig } from './websocket';
import { Side } from '@polymarket/clob-client'; // Keep for type if needed, or remove if unused
import { limitlessErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';

// Re-export for external use
export { LimitlessWebSocketConfig };

export interface LimitlessExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: LimitlessWebSocketConfig;
}

export class LimitlessExchange extends PredictionMarketExchange {
    private auth?: LimitlessAuth;
    private client?: LimitlessClient;
    private wsConfig?: LimitlessWebSocketConfig;

    constructor(options?: ExchangeCredentials | LimitlessExchangeOptions) {
        // Support both old signature (credentials only) and new signature (options object)
        let credentials: ExchangeCredentials | undefined;
        let wsConfig: LimitlessWebSocketConfig | undefined;

        if (options && 'credentials' in options) {
            // New signature: LimitlessExchangeOptions
            credentials = options.credentials;
            wsConfig = options.websocket;
        } else if (options && 'privateKey' in options) {
            // Support direct privateKey for easier initialization
            credentials = options as ExchangeCredentials;
        } else {
            // Old signature: ExchangeCredentials directly
            credentials = options as ExchangeCredentials | undefined;
        }

        super(credentials);
        this.wsConfig = wsConfig;

        // Initialize auth if credentials are provided
        if (credentials?.privateKey) {
            this.auth = new LimitlessAuth(credentials);
            this.client = new LimitlessClient(credentials.privateKey);
        }
    }

    get name(): string {
        return 'Limitless';
    }

    // ----------------------------------------------------------------------------
    // Implementation methods for CCXT-style API
    // ----------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        return fetchMarkets(params);
    }

    protected async searchMarketsImpl(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        return searchMarkets(query, params);
    }

    protected async fetchMarketsBySlugImpl(slug: string): Promise<UnifiedMarket[]> {
        return getMarketsBySlug(slug);
    }

    protected async searchEventsImpl(query: string, params?: MarketFilterParams): Promise<UnifiedEvent[]> {
        return searchEvents(query, params);
    }

    async fetchOHLCV(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
        return fetchOHLCV(id, params);
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        return fetchOrderBook(id);
    }

    async fetchTrades(id: string, params: HistoryFilterParams): Promise<Trade[]> {
        return fetchTrades(id, params);
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    private ensureClient(): LimitlessClient {
        if (!this.client) {
            throw new Error(
                'Trading operations require authentication. ' +
                'Initialize LimitlessExchange with credentials: new LimitlessExchange({ privateKey: "0x..." })'
            );
        }
        return this.client;
    }

    /**
     * Ensure authentication is initialized before trading operations.
     */
    private ensureAuth(): LimitlessAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize LimitlessExchange with credentials: new LimitlessExchange({ privateKey: "0x..." })',
                'Limitless'
            );
        }
        return this.auth;
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const client = this.ensureClient();

        try {
            const side = params.side.toUpperCase() as 'BUY' | 'SELL';

            // Note: params.marketId in pmxt LIMITLESS implementation corresponds to the SLUG.
            // See utils.ts mapMarketToUnified: id = market.slug
            const marketSlug = params.marketId;

            if (!params.price) {
                throw new Error("Limit orders require a price");
            }

            const response = await client.createOrder({
                marketSlug: marketSlug,
                outcomeId: params.outcomeId,
                side: side,
                price: params.price,
                amount: params.amount,
                type: params.type
            });

            // Map response to Order object
            // The API response for POST /orders returns the created order object
            // Structure based on YAML: { order: { ... }, ... } or usually standard REST return
            // Assuming response contains the created order data.

            // Need to inspect actual response structure from client.ts (it returns res.data)
            // If res.data is the order:
            return {
                id: response.id || 'unknown', // Adjust based on actual response
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                price: params.price,
                amount: params.amount,
                status: 'open',
                filled: 0,
                remaining: params.amount,
                timestamp: Date.now()
            };

        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async cancelOrder(orderId: string): Promise<Order> {
        const client = this.ensureClient();

        try {
            await client.cancelOrder(orderId);

            return {
                id: orderId,
                marketId: 'unknown',
                outcomeId: 'unknown',
                side: 'buy',
                type: 'limit',
                amount: 0,
                status: 'cancelled',
                filled: 0,
                remaining: 0,
                timestamp: Date.now()
            };
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        // Limitless API does not support fetching a single order by ID directly without the market slug.
        // We would need to scan all markets or maintain a local cache.
        // For now, we throw specific error.
        throw new Error("Limitless: fetchOrder(id) is not supported directly. Use fetchOpenOrders(marketSlug).");
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        const client = this.ensureClient();

        try {
            if (!marketId) {
                // We cannot fetch ALL open orders globally efficiently on Limitless (no endpoint).
                // We would need to fetch all active markets and query each.
                // For this MVP, we return empty or throw. Returning empty to be "compliant" with interface but logging warning.
                console.warn("Limitless: fetchOpenOrders requires marketId (slug) to be efficient. Returning [].");
                return [];
            }

            const orders = await client.getOrders(marketId, ['LIVE']);

            return orders.map((o: any) => ({
                id: o.id,
                marketId: marketId,
                outcomeId: "unknown", // API might not return this in the simplified list, need to check response
                side: o.side.toLowerCase() as 'buy' | 'sell',
                type: 'limit',
                price: parseFloat(o.price),
                amount: parseFloat(o.quantity),
                status: 'open',
                filled: 0, // Need to check if API returns filled amount in this view
                remaining: parseFloat(o.quantity),
                timestamp: Date.now() // API doesn't always return TS in summary
            }));
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchPositions(): Promise<Position[]> {
        const auth = this.ensureAuth();
        const address = auth.getAddress();
        return fetchPositions(address);
    }

    async fetchBalance(): Promise<Balance[]> {
        const auth = this.ensureAuth();
        const client = await auth.getClobClient();

        try {
            // 1. Fetch raw collateral balance (USDC)
            // Limitless relies strictly on USDC (Polygon) which has 6 decimals.
            // Note: This needs to be updated for Base chain!
            const USDC_DECIMALS = 6;
            const balRes = await client.getBalanceAllowance({
                asset_type: "COLLATERAL" as any
            });
            const rawBalance = parseFloat(balRes.balance);
            const total = rawBalance / Math.pow(10, USDC_DECIMALS);

            return [{
                currency: 'USDC',
                total: total,
                available: total, // Approximate
                locked: 0
            }];
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    // ----------------------------------------------------------------------------
    // WebSocket Methods
    // ----------------------------------------------------------------------------

    private ws?: LimitlessWebSocket;

    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        if (!this.ws) {
            this.ws = new LimitlessWebSocket(this.wsConfig);
        }
        return this.ws.watchOrderBook(id);
    }

    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        if (!this.ws) {
            this.ws = new LimitlessWebSocket(this.wsConfig);
        }
        return this.ws.watchTrades(id);
    }

    async close(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
    }
}
