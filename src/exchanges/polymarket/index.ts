import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams, ExchangeCredentials } from '../../BaseExchange';
import { UnifiedMarket, PriceCandle, OrderBook, Trade, Order, Position, Balance, CreateOrderParams } from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { searchMarkets } from './searchMarkets';
import { getMarketsBySlug } from './getMarketsBySlug';
import { fetchOHLCV } from './fetchOHLCV';
import { fetchOrderBook } from './fetchOrderBook';
import { fetchTrades } from './fetchTrades';
import { fetchPositions } from './fetchPositions';
import { PolymarketAuth } from './auth';
import { Side, OrderType, AssetType } from '@polymarket/clob-client';

export class PolymarketExchange extends PredictionMarketExchange {
    private auth?: PolymarketAuth;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);

        // Initialize auth if credentials are provided
        if (credentials?.privateKey) {
            this.auth = new PolymarketAuth(credentials);
        }
    }

    get name(): string {
        return 'Polymarket';
    }

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

    async fetchTrades(id: string, params: HistoryFilterParams): Promise<Trade[]> {
        return fetchTrades(id, params);
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    /**
     * Ensure authentication is initialized before trading operations.
     */
    private ensureAuth(): PolymarketAuth {
        if (!this.auth) {
            throw new Error(
                'Trading operations require authentication. ' +
                'Initialize PolymarketExchange with credentials: new PolymarketExchange({ privateKey: "0x..." })'
            );
        }
        return this.auth;
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const auth = this.ensureAuth();
        const client = await auth.getClobClient();

        // Map side to Polymarket enum
        const side = params.side.toUpperCase() === 'BUY' ? Side.BUY : Side.SELL;

        // For simple limit orders:
        if (params.type === 'limit' && !params.price) {
            throw new Error('Price is required for limit orders');
        }

        const price = params.price || (side === Side.BUY ? 1.0 : 0.0);

        try {
            // We use createAndPostOrder which handles signing and posting
            const response = await client.createAndPostOrder({
                tokenID: params.outcomeId,
                price: price,
                side: side,
                size: params.amount,
                feeRateBps: 0,
            }, {
                tickSize: "0.01"
            });

            if (!response || !response.success) {
                throw new Error(response?.errorMsg || 'Order placement failed');
            }

            return {
                id: response.orderID,
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                price: price,
                amount: params.amount,
                status: 'open',
                filled: 0,
                remaining: params.amount,
                timestamp: Date.now()
            };
        } catch (error: any) {
            console.error("Polymarket createOrder error:", error);
            throw error;
        }
    }

    async cancelOrder(orderId: string): Promise<Order> {
        const auth = this.ensureAuth();
        const client = await auth.getClobClient();

        try {
            await client.cancelOrder({ orderID: orderId });

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
            console.error("Polymarket cancelOrder error:", error);
            throw error;
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        const auth = this.ensureAuth();
        const client = await auth.getClobClient();

        try {
            const order = await client.getOrder(orderId);
            return {
                id: order.id,
                marketId: order.market || 'unknown',
                outcomeId: order.asset_id,
                side: order.side.toLowerCase() as 'buy' | 'sell',
                type: order.order_type === 'GTC' ? 'limit' : 'market',
                price: parseFloat(order.price),
                amount: parseFloat(order.original_size),
                status: order.status as any, // Needs precise mapping
                filled: parseFloat(order.size_matched),
                remaining: parseFloat(order.original_size) - parseFloat(order.size_matched),
                timestamp: order.created_at * 1000
            };
        } catch (error: any) {
            console.error("Polymarket fetchOrder error:", error);
            throw error;
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        const auth = this.ensureAuth();
        const client = await auth.getClobClient();

        try {
            const orders = await client.getOpenOrders({
                market: marketId
            });

            return orders.map((o: any) => ({
                id: o.id,
                marketId: o.market || 'unknown',
                outcomeId: o.asset_id,
                side: o.side.toLowerCase() as 'buy' | 'sell',
                type: 'limit',
                price: parseFloat(o.price),
                amount: parseFloat(o.original_size),
                status: 'open',
                filled: parseFloat(o.size_matched),
                remaining: parseFloat(o.size_left || (parseFloat(o.original_size) - parseFloat(o.size_matched))),
                timestamp: o.created_at * 1000
            }));
        } catch (error: any) {
            console.error("Polymarket fetchOpenOrders error:", error);
            return [];
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
            // Polymarket relies strictly on USDC (Polygon) which has 6 decimals.
            const USDC_DECIMALS = 6;
            const balRes = await client.getBalanceAllowance({
                asset_type: AssetType.COLLATERAL
            });
            const rawBalance = parseFloat(balRes.balance);
            const total = rawBalance / Math.pow(10, USDC_DECIMALS);

            // 2. Fetch open orders to calculate locked funds
            // We only care about BUY orders for USDC balance locking
            const openOrders = await client.getOpenOrders({});

            let locked = 0;
            if (openOrders && Array.isArray(openOrders)) {
                for (const order of openOrders) {
                    if (order.side === Side.BUY) {
                        const remainingSize = parseFloat(order.original_size) - parseFloat(order.size_matched);
                        const price = parseFloat(order.price);
                        locked += remainingSize * price;
                    }
                }
            }

            return [{
                currency: 'USDC',
                total: total,
                available: total - locked, // Available for new trades
                locked: locked
            }];
        } catch (error: any) {
            console.error("Polymarket fetchBalance error:", error);
            throw error;
        }
    }
}
