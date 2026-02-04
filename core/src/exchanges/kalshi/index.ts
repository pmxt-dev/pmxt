import axios from 'axios';
import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams, ExchangeCredentials, EventFetchParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, Balance, Order, Position, CreateOrderParams } from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { fetchEvents } from './fetchEvents';
import { fetchOHLCV } from './fetchOHLCV';
import { fetchOrderBook } from './fetchOrderBook';
import { fetchTrades } from './fetchTrades';
import { KalshiAuth } from './auth';
import { KalshiWebSocket, KalshiWebSocketConfig } from './websocket';
import { kalshiErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';

// Re-export for external use
export type { KalshiWebSocketConfig };

export interface KalshiExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: KalshiWebSocketConfig;
}

export class KalshiExchange extends PredictionMarketExchange {
    private auth?: KalshiAuth;
    private wsConfig?: KalshiWebSocketConfig;

    constructor(options?: ExchangeCredentials | KalshiExchangeOptions) {
        // Support both old signature (credentials only) and new signature (options object)
        let credentials: ExchangeCredentials | undefined;
        let wsConfig: KalshiWebSocketConfig | undefined;

        if (options && 'credentials' in options) {
            // New signature: KalshiExchangeOptions
            credentials = options.credentials;
            wsConfig = options.websocket;
        } else {
            // Old signature: ExchangeCredentials directly
            credentials = options as ExchangeCredentials | undefined;
        }

        super(credentials);
        this.wsConfig = wsConfig;

        if (credentials?.apiKey && credentials?.privateKey) {
            this.auth = new KalshiAuth(credentials);
        }
    }

    get name(): string {
        return "Kalshi";
    }

    private getBaseUrl(): string {
        return 'https://api.elections.kalshi.com';
    }

    // ----------------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------------

    private ensureAuth(): KalshiAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize KalshiExchange with credentials (apiKey and privateKey).',
                'Kalshi'
            );
        }
        return this.auth;
    }

    // ----------------------------------------------------------------------------
    // Market Data Methods - Implementation for CCXT-style API
    // ----------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        return fetchMarkets(params);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        return fetchEvents(params);
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
    // User Data Methods
    // ----------------------------------------------------------------------------

    async fetchBalance(): Promise<Balance[]> {
        try {
            const auth = this.ensureAuth();
            const path = '/trade-api/v2/portfolio/balance';

            // Use demo-api if it's a sandbox key (usually indicated by config, but defaulting to prod for now)
            // Or we could detect it. For now, let's assume Production unless specified.
            // TODO: Make base URL configurable in credentials
            const baseUrl = this.getBaseUrl();

            const headers = auth.getHeaders('GET', path);

            const response = await axios.get(`${baseUrl}${path}`, { headers });

            // Kalshi response structure:
            // - balance: Available balance in cents (for trading)
            // - portfolio_value: Total portfolio value in cents (includes positions)
            // - updated_ts: Unix timestamp of last update
            const balanceCents = response.data.balance;
            const portfolioValueCents = response.data.portfolio_value;

            const available = balanceCents / 100;
            const total = portfolioValueCents / 100;
            const locked = total - available;

            return [{
                currency: 'USD',
                total: total,           // Total portfolio value (cash + positions)
                available: available,   // Available for trading
                locked: locked          // Value locked in positions
            }];
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    async createOrder(params: CreateOrderParams): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const path = '/trade-api/v2/portfolio/orders';
            const baseUrl = this.getBaseUrl();

            const headers = auth.getHeaders('POST', path);

            // Map unified params to Kalshi format
            // Kalshi uses 'yes'/'no' for side and 'buy'/'sell' for action
            const isYesSide = params.side === 'buy';
            const kalshiOrder: any = {
                ticker: params.marketId,  // Kalshi uses ticker for market identification
                client_order_id: `pmxt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                side: isYesSide ? 'yes' : 'no',
                action: params.side === 'buy' ? 'buy' : 'sell',
                count: params.amount,  // Number of contracts
                type: params.type === 'limit' ? 'limit' : 'market'
            };

            // Add price field based on side (yes_price for yes side, no_price for no side)
            if (params.price) {
                const priceInCents = Math.round(params.price * 100);
                if (isYesSide) {
                    kalshiOrder.yes_price = priceInCents;
                } else {
                    kalshiOrder.no_price = priceInCents;
                }
            }

            const response = await axios.post(`${baseUrl}${path}`, kalshiOrder, { headers });
            const order = response.data.order;

            return {
                id: order.order_id,
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                price: params.price,
                amount: params.amount,
                status: this.mapKalshiOrderStatus(order.status),
                filled: order.queue_position === 0 ? params.amount : 0,
                remaining: order.remaining_count || params.amount,
                timestamp: new Date(order.created_time).getTime()
            };
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    async cancelOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const path = `/trade-api/v2/portfolio/orders/${orderId}`;
            const baseUrl = this.getBaseUrl();

            const headers = auth.getHeaders('DELETE', path);

            const response = await axios.delete(`${baseUrl}${path}`, { headers });
            const order = response.data.order;

            return {
                id: order.order_id,
                marketId: order.ticker,
                outcomeId: order.ticker,
                side: order.side === 'yes' ? 'buy' : 'sell',
                type: 'limit',
                amount: order.count,
                status: 'cancelled',
                filled: order.count - (order.remaining_count || 0),
                remaining: 0,
                timestamp: new Date(order.created_time).getTime()
            };
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const path = `/trade-api/v2/portfolio/orders/${orderId}`;
            const baseUrl = this.getBaseUrl();

            const headers = auth.getHeaders('GET', path);

            const response = await axios.get(`${baseUrl}${path}`, { headers });
            const order = response.data.order;

            return {
                id: order.order_id,
                marketId: order.ticker,
                outcomeId: order.ticker,
                side: order.side === 'yes' ? 'buy' : 'sell',
                type: order.type === 'limit' ? 'limit' : 'market',
                price: order.yes_price ? order.yes_price / 100 : undefined,
                amount: order.count,
                status: this.mapKalshiOrderStatus(order.status),
                filled: order.count - (order.remaining_count || 0),
                remaining: order.remaining_count || 0,
                timestamp: new Date(order.created_time).getTime()
            };
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        try {
            const auth = this.ensureAuth();
            // CRITICAL: Query parameters must NOT be included in the signature
            const basePath = '/trade-api/v2/portfolio/orders';
            let queryParams = '?status=resting';

            if (marketId) {
                queryParams += `&ticker=${marketId}`;
            }

            const baseUrl = this.getBaseUrl();
            // Sign only the base path, not the query parameters
            const headers = auth.getHeaders('GET', basePath);

            const response = await axios.get(`${baseUrl}${basePath}${queryParams}`, { headers });
            const orders = response.data.orders || [];

            return orders.map((order: any) => ({
                id: order.order_id,
                marketId: order.ticker,
                outcomeId: order.ticker,
                side: order.side === 'yes' ? 'buy' : 'sell',
                type: order.type === 'limit' ? 'limit' : 'market',
                price: order.yes_price ? order.yes_price / 100 : undefined,
                amount: order.count,
                status: 'open',
                filled: order.count - (order.remaining_count || 0),
                remaining: order.remaining_count || 0,
                timestamp: new Date(order.created_time).getTime()
            }));
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    async fetchPositions(): Promise<Position[]> {
        try {
            const auth = this.ensureAuth();
            const path = '/trade-api/v2/portfolio/positions';
            const baseUrl = this.getBaseUrl();

            const headers = auth.getHeaders('GET', path);

            const response = await axios.get(`${baseUrl}${path}`, { headers });
            const positions = response.data.market_positions || [];

            return positions.map((pos: any) => {
                const absPosition = Math.abs(pos.position);
                // Prevent division by zero
                const entryPrice = absPosition > 0 ? pos.total_cost / absPosition / 100 : 0;

                return {
                    marketId: pos.ticker,
                    outcomeId: pos.ticker,
                    outcomeLabel: pos.ticker,  // Kalshi uses ticker as the outcome label
                    size: pos.position,  // Positive for long, negative for short
                    entryPrice: entryPrice,
                    currentPrice: pos.market_price ? pos.market_price / 100 : entryPrice,
                    unrealizedPnL: pos.market_exposure ? pos.market_exposure / 100 : 0,
                    realizedPnL: pos.realized_pnl ? pos.realized_pnl / 100 : 0
                };
            });
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    // Helper to map Kalshi order status to unified status
    private mapKalshiOrderStatus(status: string): 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected' {
        switch (status.toLowerCase()) {
            case 'resting':
                return 'open';
            case 'canceled':
            case 'cancelled':
                return 'cancelled';
            case 'executed':
            case 'filled':
                return 'filled';
            default:
                return 'open';
        }
    }

    // ----------------------------------------------------------------------------
    // WebSocket Methods
    // ----------------------------------------------------------------------------

    private ws?: KalshiWebSocket;

    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        const auth = this.ensureAuth();

        if (!this.ws) {
            this.ws = new KalshiWebSocket(auth, this.wsConfig);
        }
        // Normalize ticker (strip -NO suffix if present)
        const marketTicker = id.replace(/-NO$/, '');
        return this.ws.watchOrderBook(marketTicker);
    }

    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        const auth = this.ensureAuth();

        if (!this.ws) {
            this.ws = new KalshiWebSocket(auth, this.wsConfig);
        }
        // Normalize ticker (strip -NO suffix if present)
        const marketTicker = id.replace(/-NO$/, '');
        return this.ws.watchTrades(marketTicker);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }
}
