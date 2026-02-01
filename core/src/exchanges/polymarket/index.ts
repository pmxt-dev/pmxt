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
import { PolymarketAuth } from './auth';
import { Side, OrderType, AssetType } from '@polymarket/clob-client';
import { PolymarketWebSocket, PolymarketWebSocketConfig } from './websocket';

// Re-export for external use
export { PolymarketWebSocketConfig };

export interface PolymarketExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: PolymarketWebSocketConfig;
}

export class PolymarketExchange extends PredictionMarketExchange {
    private auth?: PolymarketAuth;
    private wsConfig?: PolymarketWebSocketConfig;

    constructor(options?: ExchangeCredentials | PolymarketExchangeOptions) {
        // Support both old signature (credentials only) and new signature (options object)
        let credentials: ExchangeCredentials | undefined;
        let wsConfig: PolymarketWebSocketConfig | undefined;

        if (options && 'credentials' in options) {
            // New signature: PolymarketExchangeOptions
            credentials = options.credentials;
            wsConfig = options.websocket;
        } else {
            // Old signature: ExchangeCredentials directly
            credentials = options as ExchangeCredentials | undefined;
        }

        super(credentials);
        this.wsConfig = wsConfig;

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

    async searchEvents(query: string, params?: MarketFilterParams): Promise<UnifiedEvent[]> {
        return searchEvents(query, params);
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

        // For limit orders, price is required
        if (params.type === 'limit' && !params.price) {
            throw new Error('Price is required for limit orders');
        }

        // For market orders, use max slippage: 0.99 for BUY (willing to pay up to 99%), 0.01 for SELL (willing to accept down to 1%)
        const price = params.price || (side === Side.BUY ? 0.99 : 0.01);

        // Auto-detect tick size if not provided
        let tickSize: string;
        if (params.tickSize) {
            tickSize = params.tickSize.toString();
        } else {
            // Fetch the order book to infer tick size from price levels
            try {
                const orderBook = await this.fetchOrderBook(params.outcomeId);
                tickSize = this.inferTickSize(orderBook);
            } catch (error) {
                // Fallback to 0.01 if order book fetch fails (standard for Polymarket)
                tickSize = "0.01";
            }
        }

        try {
            // We use createAndPostOrder which handles signing and posting
            const response = await client.createAndPostOrder({
                tokenID: params.outcomeId,
                price: price,
                side: side,
                size: params.amount,
                feeRateBps: 0,
            }, {
                tickSize: tickSize as any
            });

            if (!response || !response.success) {
                throw new Error(`${response?.errorMsg || 'Order placement failed'} (Response: ${JSON.stringify(response)})`);
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
            throw error;
        }
    }

    /**
     * Infer the tick size from order book price levels.
     * Analyzes the decimal precision of existing orders to determine the market's tick size.
     */
    private inferTickSize(orderBook: OrderBook): string {
        const allPrices = [
            ...orderBook.bids.map(b => b.price),
            ...orderBook.asks.map(a => a.price)
        ];

        if (allPrices.length === 0) {
            return "0.01"; // Default fallback for Polymarket
        }

        // Find the smallest non-zero decimal increment
        let minIncrement = 1;
        for (const price of allPrices) {
            const priceStr = price.toString();
            const decimalPart = priceStr.split('.')[1];
            if (decimalPart) {
                const decimals = decimalPart.length;
                const increment = Math.pow(10, -decimals);
                if (increment < minIncrement) {
                    minIncrement = increment;
                }
            }
        }

        // Map to valid tick sizes: 0.1, 0.01, 0.001, 0.0001
        if (minIncrement >= 0.1) return "0.1";
        if (minIncrement >= 0.01) return "0.01";
        if (minIncrement >= 0.001) return "0.001";
        return "0.0001";
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
            throw error;
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        const auth = this.ensureAuth();
        const client = await auth.getClobClient();

        try {
            const order = await client.getOrder(orderId);
            if (!order || !order.id) {
                const errorMsg = (order as any)?.error || 'Order not found (Invalid ID)';
                throw new Error(errorMsg);
            }
            return {
                id: order.id,
                marketId: order.market || 'unknown',
                outcomeId: order.asset_id,
                side: (order.side || '').toLowerCase() as 'buy' | 'sell',
                type: order.order_type === 'GTC' ? 'limit' : 'market',
                price: parseFloat(order.price),
                amount: parseFloat(order.original_size),
                status: (typeof order.status === 'string' ? order.status.toLowerCase() : order.status) as any,
                filled: parseFloat(order.size_matched),
                remaining: parseFloat(order.original_size) - parseFloat(order.size_matched),
                timestamp: order.created_at * 1000
            };
        } catch (error: any) {
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
            console.error('Error fetching Polymarket open orders:', error);
            return [];
        }
    }

    async fetchPositions(): Promise<Position[]> {
        const auth = this.ensureAuth();
        const address = await auth.getEffectiveFunderAddress();
        return fetchPositions(address);
    }

    async fetchBalance(): Promise<Balance[]> {
        const auth = this.ensureAuth();
        const client = await auth.getClobClient();

        try {
            // Polymarket relies strictly on USDC (Polygon)
            const USDC_DECIMALS = 6;

            // Try fetching from CLOB client first
            let total = 0;
            try {
                const balRes = await client.getBalanceAllowance({
                    asset_type: AssetType.COLLATERAL
                });
                const rawBalance = parseFloat(balRes.balance);
                total = rawBalance / Math.pow(10, USDC_DECIMALS);
            } catch (clobError) {
                // If CLOB fails or returns 0 (suspiciously), we can try on-chain
                // but let's assume we proceed to on-chain check if total is 0 
                // or just do on-chain check always for robustness if possible.
                // For now, let's trust CLOB but add On-Chain fallback if CLOB returns 0.
            }

            // On-Chain Fallback/Check (Robustness)
            // If CLOB reported 0, let's verify on-chain because sometimes CLOB is behind or confused about proxies
            if (total === 0) {
                try {
                    const { ethers } = require('ethers');
                    const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
                    const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e (Bridged)
                    const usdcAbi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
                    const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);

                    const targetAddress = await auth.getEffectiveFunderAddress();
                    // console.log(`[Polymarket] Checking on-chain balance for ${targetAddress}`);

                    const usdcBal = await usdcContract.balanceOf(targetAddress);
                    const decimals = await usdcContract.decimals();
                    const onChainTotal = parseFloat(ethers.utils.formatUnits(usdcBal, decimals));

                    if (onChainTotal > 0) {
                        // console.log(`[Polymarket] On-Chain balance found: ${onChainTotal} (CLOB reported 0)`);
                        total = onChainTotal;
                    }
                } catch (chainError: any) {
                    // console.warn("[Polymarket] On-chain balance check failed:", chainError.message);
                    // Swallow error and return 0 if both fail
                }
            }

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
            throw error;
        }
    }

    // ----------------------------------------------------------------------------
    // WebSocket Methods
    // ----------------------------------------------------------------------------

    private ws?: PolymarketWebSocket;

    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        if (!this.ws) {
            this.ws = new PolymarketWebSocket(this.wsConfig);
        }
        return this.ws.watchOrderBook(id);
    }

    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        if (!this.ws) {
            this.ws = new PolymarketWebSocket(this.wsConfig);
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
