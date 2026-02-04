import {
    PredictionMarketExchange,
    MarketFilterParams,
    MarketFetchParams,
    HistoryFilterParams,
    ExchangeCredentials,
    EventFetchParams,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    PriceCandle,
    OrderBook,
    Trade,
    Order,
    Position,
    Balance,
    CreateOrderParams,
} from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { fetchEvents } from './fetchEvents';
import { fetchOHLCV } from './fetchOHLCV';
import { fetchOrderBook } from './fetchOrderBook';
import { fetchTrades } from './fetchTrades';
import { fetchPositions } from './fetchPositions';
import { LimitlessAuth } from './auth';
import { LimitlessClient } from './client';
import { LimitlessWebSocket, LimitlessWebSocketConfig } from './websocket';
import { limitlessErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { PortfolioFetcher, getContractAddress } from '@limitless-exchange/sdk';
import { Contract, providers } from 'ethers';

// Re-export for external use
export type { LimitlessWebSocketConfig };

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

        // Initialize auth if API key or private key are provided
        // API key is now the primary authentication method
        if (credentials?.apiKey || credentials?.privateKey) {
            try {
                this.auth = new LimitlessAuth(credentials);

                // Initialize client only if we have both privateKey and apiKey
                if (credentials.privateKey) {
                    const apiKey = this.auth.getApiKey();
                    this.client = new LimitlessClient(credentials.privateKey, apiKey);
                }
            } catch (error) {
                // If auth initialization fails, continue without it
                // Some methods (like fetchMarkets) work without auth
                console.warn('Failed to initialize Limitless auth:', error);
            }
        }
    }

    get name(): string {
        return 'Limitless';
    }

    // ----------------------------------------------------------------------------
    // Implementation methods for CCXT-style API
    // ----------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        // Pass API key if available for authenticated requests
        const apiKey = this.auth?.getApiKey();
        return fetchMarkets(params, apiKey);
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
    // Trading Methods
    // ----------------------------------------------------------------------------

    private ensureClient(): LimitlessClient {
        if (!this.client) {
            throw new Error(
                'Trading operations require authentication. ' +
                'Initialize LimitlessExchange with credentials: new LimitlessExchange({ privateKey: "0x...", apiKey: "lmts_..." })'
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
                'Initialize LimitlessExchange with credentials: new LimitlessExchange({ privateKey: "0x...", apiKey: "lmts_..." })',
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
                throw new Error('Limit orders require a price');
            }

            const response = await client.createOrder({
                marketSlug: marketSlug,
                outcomeId: params.outcomeId,
                side: side,
                price: params.price,
                amount: params.amount,
                type: params.type,
            });

            // Map response to Order object
            // The SDK returns OrderResponse with order.id
            return {
                id: response.order.id || 'unknown',
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                price: params.price,
                amount: params.amount,
                status: 'open',
                filled: 0,
                remaining: params.amount,
                timestamp: Date.now(),
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
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        // Limitless API does not support fetching a single order by ID directly without the market slug.
        // We would need to scan all markets or maintain a local cache.
        // For now, we throw specific error.
        throw new Error(
            'Limitless: fetchOrder(id) is not supported directly. Use fetchOpenOrders(marketSlug).'
        );
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        const client = this.ensureClient();

        try {
            if (!marketId) {
                // We cannot fetch ALL open orders globally efficiently on Limitless (no endpoint).
                // We would need to fetch all active markets and query each.
                // For this MVP, we return empty or throw. Returning empty to be "compliant" with interface but logging warning.
                console.warn(
                    'Limitless: fetchOpenOrders requires marketId (slug) to be efficient. Returning [].'
                );
                return [];
            }

            const orders = await client.getOrders(marketId, ['LIVE']);

            return orders.map((o: any) => ({
                id: o.id,
                marketId: marketId,
                outcomeId: 'unknown', // API might not return this in the simplified list
                side: o.side.toLowerCase() as 'buy' | 'sell',
                type: 'limit',
                price: parseFloat(o.price),
                amount: parseFloat(o.quantity),
                status: 'open',
                filled: 0,
                remaining: parseFloat(o.quantity),
                timestamp: Date.now(),
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

        try {
            // Query USDC balance directly from the blockchain
            // Base chain RPC
            const provider = new providers.JsonRpcProvider('https://mainnet.base.org');
            const address = auth.getAddress();

            // Get USDC contract address for Base
            const usdcAddress = getContractAddress('USDC');

            // USDC ERC20 ABI (balanceOf only)
            const usdcContract = new Contract(
                usdcAddress,
                ['function balanceOf(address) view returns (uint256)'],
                provider
            );

            // Query balance
            const rawBalance = await usdcContract.balanceOf(address);

            // USDC has 6 decimals
            const USDC_DECIMALS = 6;
            const total = parseFloat(rawBalance.toString()) / Math.pow(10, USDC_DECIMALS);

            return [
                {
                    currency: 'USDC',
                    total: total,
                    available: total, // On-chain balance is all available
                    locked: 0,
                },
            ];
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    // ----------------------------------------------------------------------------
    // WebSocket Methods
    // ----------------------------------------------------------------------------

    private ws?: LimitlessWebSocket;

    /**
     * Initialize WebSocket with API key if available.
     */
    private initWebSocket(): LimitlessWebSocket {
        if (!this.ws) {
            const wsConfig = {
                ...this.wsConfig,
                apiKey: this.auth?.getApiKey(),
            };
            this.ws = new LimitlessWebSocket(wsConfig);
        }
        return this.ws;
    }

    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        const ws = this.initWebSocket();
        // Return the snapshot immediately (this allows the script to proceed)
        // Future versions could implement a more sophisticated queueing system
        return ws.watchOrderBook(id);
    }

    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        const ws = this.initWebSocket();
        return ws.watchTrades(id);
    }

    /**
     * Watch AMM price updates for a market address.
     * Requires WebSocket connection.
     * @param marketAddress - Market contract address
     * @param callback - Callback for price updates
     */
    async watchPrices(marketAddress: string, callback: (data: any) => void): Promise<void> {
        const ws = this.initWebSocket();
        return ws.watchPrices(marketAddress, callback);
    }

    /**
     * Watch user positions in real-time.
     * Requires API key authentication.
     * @param callback - Callback for position updates
     */
    async watchUserPositions(callback: (data: any) => void): Promise<void> {
        this.ensureAuth(); // Ensure API key is available
        const ws = this.initWebSocket();
        return ws.watchUserPositions(callback);
    }

    /**
     * Watch user transactions in real-time.
     * Requires API key authentication.
     * @param callback - Callback for transaction updates
     */
    async watchUserTransactions(callback: (data: any) => void): Promise<void> {
        this.ensureAuth(); // Ensure API key is available
        const ws = this.initWebSocket();
        return ws.watchUserTransactions(callback);
    }

    async close(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
    }
}
