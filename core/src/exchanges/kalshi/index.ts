import axios from 'axios';
import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams, ExchangeCredentials } from '../../BaseExchange';
import { UnifiedMarket, PriceCandle, OrderBook, Trade, Balance, Order, Position, CreateOrderParams } from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { searchMarkets } from './searchMarkets';
import { getMarketsBySlug } from './getMarketsBySlug';
import { fetchOHLCV } from './fetchOHLCV';
import { fetchOrderBook } from './fetchOrderBook';
import { fetchTrades } from './fetchTrades';
import { KalshiAuth } from './auth';
import { KalshiWebSocketManager } from './websocket';

export class KalshiExchange extends PredictionMarketExchange {
    private auth?: KalshiAuth;
    private wsManager?: KalshiWebSocketManager;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);
        if (credentials?.apiKey && credentials?.privateKey) {
            this.auth = new KalshiAuth(credentials);
        }
    }

    get name(): string {
        return "Kalshi";
    }

    // ----------------------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------------------

    private ensureAuth(): KalshiAuth {
        if (!this.auth) {
            throw new Error(
                'Trading operations require authentication. ' +
                'Initialize KalshiExchange with credentials (apiKey and privateKey).'
            );
        }
        return this.auth;
    }

    // ----------------------------------------------------------------------------
    // Market Data Methods
    // ----------------------------------------------------------------------------

    async fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        return fetchMarkets(params);
    }

    async searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        return searchMarkets(query, params);
    }

    async getMarketsBySlug(slug: string): Promise<UnifiedMarket[]> {
        return getMarketsBySlug(slug);
    }

    async fetchOHLCV(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
        return fetchOHLCV(id, params);
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        return fetchOrderBook(id);
    }

    async *watchOrderBook(ticker: string): AsyncGenerator<OrderBook> {
        if (!this.credentials?.apiKey || !this.credentials?.privateKey) {
            throw new Error('Kalshi WebSocket requires API credentials (apiKey and privateKey)');
        }

        if (!this.wsManager) {
            this.wsManager = new KalshiWebSocketManager(this.credentials);
        }

        if (!this.wsManager.isConnected()) {
            await this.wsManager.connect();
        }

        const wsStream = this.wsManager.watchOrderBook(ticker);

        const initialSnapshot = await this.fetchOrderBook(ticker);
        this.wsManager.setInitialSnapshot(ticker, initialSnapshot);
        yield initialSnapshot;

        yield* wsStream;
    }

    async fetchTrades(id: string, params: HistoryFilterParams): Promise<Trade[]> {
        return fetchTrades(id, params);
    }

    // ----------------------------------------------------------------------------
    // User Data Methods
    // ----------------------------------------------------------------------------

    async fetchBalance(): Promise<Balance[]> {
        const auth = this.ensureAuth();
        const path = '/trade-api/v2/portfolio/balance';

        // Use demo-api if it's a sandbox key (usually indicated by config, but defaulting to prod for now)
        // Or we could detect it. For now, let's assume Production unless specified.
        // TODO: Make base URL configurable in credentials
        const baseUrl = 'https://trading-api.kalshi.com';

        const headers = auth.getHeaders('GET', path);

        try {
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
            console.error("Kalshi fetchBalance error:", error?.response?.data || error.message);
            throw error;
        }
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const auth = this.ensureAuth();
        const path = '/trade-api/v2/portfolio/orders';
        const baseUrl = 'https://trading-api.kalshi.com';

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

        try {
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
            console.error("Kalshi createOrder error:", error?.response?.data || error.message);
            throw error;
        }
    }

    async cancelOrder(orderId: string): Promise<Order> {
        const auth = this.ensureAuth();
        const path = `/trade-api/v2/portfolio/orders/${orderId}`;
        const baseUrl = 'https://trading-api.kalshi.com';

        const headers = auth.getHeaders('DELETE', path);

        try {
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
            console.error("Kalshi cancelOrder error:", error?.response?.data || error.message);
            throw error;
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        const auth = this.ensureAuth();
        const path = `/trade-api/v2/portfolio/orders/${orderId}`;
        const baseUrl = 'https://trading-api.kalshi.com';

        const headers = auth.getHeaders('GET', path);

        try {
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
            console.error("Kalshi fetchOrder error:", error?.response?.data || error.message);
            throw error;
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        const auth = this.ensureAuth();
        // CRITICAL: Query parameters must NOT be included in the signature
        const basePath = '/trade-api/v2/portfolio/orders';
        let queryParams = '?status=resting';

        if (marketId) {
            queryParams += `&ticker=${marketId}`;
        }

        const baseUrl = 'https://trading-api.kalshi.com';
        // Sign only the base path, not the query parameters
        const headers = auth.getHeaders('GET', basePath);

        try {
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
            console.error("Kalshi fetchOpenOrders error:", error?.response?.data || error.message);
            return [];
        }
    }

    async fetchPositions(): Promise<Position[]> {
        const auth = this.ensureAuth();
        const path = '/trade-api/v2/portfolio/positions';
        const baseUrl = 'https://trading-api.kalshi.com';

        const headers = auth.getHeaders('GET', path);

        try {
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
            console.error("Kalshi fetchPositions error:", error?.response?.data || error.message);
            return [];
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
}
