import { getContractAddress } from '@limitless-exchange/sdk';
import { Contract, providers } from 'ethers';
import {
    EventFetchParams,
    ExchangeCredentials,
    HistoryFilterParams,
    MarketFetchParams,
    MyTradesParams,
    OHLCVParams,
    OrderHistoryParams,
    PredictionMarketExchange,
    TradesParams,
} from '../../BaseExchange';
import { AuthenticationError } from '../../errors';
import { SubscribedAddressSnapshot, SubscriptionOption } from '../../subscriber/base';
import { buildLimitlessBalanceActivity, LIMITLESS_DEFAULT_SUBSCRIPTION } from '../../subscriber/external/goldsky';
import { WatcherConfig } from '../../subscriber/watcher';
import {
    Balance,
    CreateOrderParams,
    Order,
    OrderBook,
    Position,
    PriceCandle,
    Trade,
    UnifiedEvent,
    UnifiedMarket,
    UserTrade,
} from '../../types';
import { parseOpenApiSpec } from '../../utils/openapi';
import { FetcherContext } from '../interfaces';
import { limitlessApiSpec } from './api';
import { LimitlessAuth } from './auth';
import { LimitlessClient } from './client';
import { limitlessErrorMapper } from './errors';
import { LimitlessFetcher } from './fetcher';
import { LimitlessNormalizer } from './normalizer';
import { LimitlessWebSocket, LimitlessWebSocketConfig } from './websocket';

export type { LimitlessWebSocketConfig, WatcherConfig };
export { LIMITLESS_DEFAULT_SUBSCRIPTION, buildLimitlessBalanceActivity };

export interface LimitlessExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: LimitlessWebSocketConfig;
}

export class LimitlessExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchOrder: false as const,
    };

    private auth?: LimitlessAuth;
    private client?: LimitlessClient;
    private wsConfig?: LimitlessWebSocketConfig;
    private ws?: LimitlessWebSocket;
    private readonly fetcher: LimitlessFetcher;
    private readonly normalizer: LimitlessNormalizer;

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
        this.rateLimit = 200;
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

        // Register implicit API for Limitless REST endpoints
        const apiDescriptor = parseOpenApiSpec(limitlessApiSpec);
        this.defineImplicitApi(apiDescriptor);

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => this.getHeaders(),
        };

        this.fetcher = new LimitlessFetcher(ctx, this.http, this.auth?.getApiKey());
        this.normalizer = new LimitlessNormalizer();
    }


    get name(): string {
        return 'Limitless';
    }

    private getHeaders(): Record<string, string> {
        return { 'Content-Type': 'application/json' };
    }

    // ------------------------------------------------------------------------
    // Market Data  (fetcher -> normalizer)
    // ------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        const rawMarkets = await this.fetcher.fetchRawMarkets(params);

        // Handle outcomeId filtering (client-side)
        if (params?.outcomeId) {
            return rawMarkets
                .map((raw) => this.normalizer.normalizeMarket(raw))
                .filter((m): m is UnifiedMarket => m !== null && m.outcomes.length > 0)
                .filter(m => m.outcomes.some(o => o.outcomeId === params.outcomeId));
        }

        // Handle search results -- filter and limit
        if (params?.query) {
            return rawMarkets
                .map((raw) => this.normalizer.normalizeMarket(raw))
                .filter((m): m is UnifiedMarket => m !== null && m.outcomes.length > 0)
                .slice(0, params?.limit || 250000);
        }

        // Default fetch -- normalize, filter, sort, apply offset/limit
        const unifiedMarkets = rawMarkets
            .map((raw) => this.normalizer.normalizeMarket(raw))
            .filter((m): m is UnifiedMarket => m !== null && m.outcomes.length > 0);

        if (params?.sort === 'volume') {
            unifiedMarkets.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
        }

        const offset = params?.offset || 0;
        const limit = params?.limit || 250000;
        const marketsAfterOffset = offset > 0 ? unifiedMarkets.slice(offset) : unifiedMarkets;
        return marketsAfterOffset.slice(0, limit);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        const rawEvents = await this.fetcher.fetchRawEvents(params);
        return rawEvents
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null);
    }

    async fetchOHLCV(id: string, params: OHLCVParams): Promise<PriceCandle[]> {
        const rawPrices = await this.fetcher.fetchRawOHLCV!(id, params);
        return this.normalizer.normalizeOHLCV!(rawPrices as any, params);
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        const rawOrderBook = await this.fetcher.fetchRawOrderBook!(id);
        return this.normalizer.normalizeOrderBook!(rawOrderBook as any, id);
    }

    async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        if ('resolution' in params && params.resolution !== undefined) {
            console.warn(
                '[pmxt] Warning: The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.'
            );
        }
        const rawTrades = await this.fetcher.fetchRawTrades!(id, params);
        return rawTrades.map((raw, i) => this.normalizer.normalizeTrade!(raw, i));
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const auth = this.ensureAuth();
        const rawTrades = await this.fetcher.fetchRawMyTrades!(params || {}, auth.getApiKey());
        return rawTrades.map((raw, i) => this.normalizer.normalizeUserTrade!(raw, i));
    }

    // ------------------------------------------------------------------------
    // Trading  (kept in SDK class -- uses LimitlessClient)
    // ------------------------------------------------------------------------

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

            // Limitless (USDC on Base) supports 6 decimals max.
            const price = Math.round(params.price * 1_000_000) / 1_000_000;

            const response = await client.createOrder({
                marketSlug: marketSlug,
                outcomeId: params.outcomeId,
                side: side,
                price: price,
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
        throw new Error(
            'Limitless: fetchOrder(id) is not supported directly. Use fetchOpenOrders(marketSlug).'
        );
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        const client = this.ensureClient();

        try {
            if (!marketId) {
                console.warn(
                    'Limitless: fetchOpenOrders requires marketId (slug) to be efficient. Returning [].'
                );
                return [];
            }

            const orders = await client.getOrders(marketId, ['LIVE']);

            return orders.map((o: any) => ({
                id: o.id,
                marketId: marketId,
                outcomeId: o.tokenId || 'unknown',
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

    async fetchClosedOrders(params?: OrderHistoryParams): Promise<Order[]> {
        const client = this.ensureClient();
        if (!params?.marketId) {
            console.warn('Limitless: fetchClosedOrders requires marketId (slug). Returning [].');
            return [];
        }
        const orders = await client.getOrders(params.marketId, ['MATCHED']);
        return orders.map((o: any) => ({
            id: o.id,
            marketId: params.marketId!,
            outcomeId: o.tokenId || 'unknown',
            side: o.side.toLowerCase() as 'buy' | 'sell',
            type: 'limit' as const,
            price: parseFloat(o.price),
            amount: parseFloat(o.quantity),
            status: 'filled' as const,
            filled: parseFloat(o.quantity),
            remaining: 0,
            timestamp: o.createdAt ? new Date(o.createdAt).getTime() : Date.now(),
        }));
    }

    async fetchAllOrders(params?: OrderHistoryParams): Promise<Order[]> {
        const client = this.ensureClient();
        if (!params?.marketId) {
            console.warn('Limitless: fetchAllOrders requires marketId (slug). Returning [].');
            return [];
        }
        const orders = await client.getOrders(params.marketId, ['LIVE', 'MATCHED']);
        return orders.map((o: any) => ({
            id: o.id,
            marketId: params.marketId!,
            outcomeId: o.tokenId || 'unknown',
            side: o.side.toLowerCase() as 'buy' | 'sell',
            type: 'limit' as const,
            price: parseFloat(o.price),
            amount: parseFloat(o.quantity),
            status: o.status === 'LIVE' ? 'open' as const : 'filled' as const,
            filled: o.status === 'MATCHED' ? parseFloat(o.quantity) : 0,
            remaining: o.status === 'LIVE' ? parseFloat(o.quantity) : 0,
            timestamp: o.createdAt ? new Date(o.createdAt).getTime() : Date.now(),
        }));
    }

    // ------------------------------------------------------------------------
    // Positions & Balance  (fetcher -> normalizer)
    // ------------------------------------------------------------------------

    async fetchPositions(address?: string): Promise<Position[]> {
        // Public endpoint -- no auth needed when an address is explicitly supplied.
        const account = address ?? this.ensureAuth().getAddress();
        const rawItems = await this.fetcher.fetchRawPositions(account);
        return rawItems.map((raw) => this.normalizer.normalizePosition!(raw));
    }

    async fetchBalance(address?: string): Promise<Balance[]> {
        try {
            // When an external address is provided use on-chain RPC only -- no auth required.
            const targetAddress = address ?? this.ensureAuth().getAddress();
            return await this.getAddressOnChainBalance(targetAddress);
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    // ------------------------------------------------------------------------
    // WebSocket
    // ------------------------------------------------------------------------

    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        const ws = this.ensureWs();
        return ws.watchOrderBook(id);
    }

    async watchTrades(id: string, address?: string, since?: number, limit?: number): Promise<Trade[]> {
        const ws = this.ensureWs();
        return ws.watchTrades(id, address);
    }

    /**
     * Watch AMM price updates for a market address (Limitless only).
     * Requires WebSocket connection.
     *
     * @param marketAddress - Market contract address
     * @param callback - Callback for price updates
     */
    async watchPrices(marketAddress: string, callback: (data: any) => void): Promise<void> {
        const ws = this.ensureWs();
        return ws.watchPrices(marketAddress, callback);
    }

    /**
     * Watch user positions in real-time (Limitless only).
     * Requires API key authentication.
     *
     * @param callback - Callback for position updates
     */
    async watchUserPositions(callback: (data: any) => void): Promise<void> {
        this.ensureAuth();
        const ws = this.ensureWs();
        return ws.watchUserPositions(callback);
    }

    /**
     * Watch user transactions in real-time (Limitless only).
     * Requires API key authentication.
     *
     * @param callback - Callback for transaction updates
     */
    async watchUserTransactions(callback: (data: any) => void): Promise<void> {
        this.ensureAuth();
        const ws = this.ensureWs();
        return ws.watchUserTransactions(callback);
    }

    /**
     * Stream activity (positions, balances) for any public Base-chain wallet address.
     *
     * Uses polling of the Limitless public portfolio API (positions) and on-chain Base
     * RPC calls (USDC balance). No credentials are required.
     *
     * Note: Limitless does not expose a public per-address trades endpoint, so the
     * `'trades'` type returns an empty array when watching a public address.
     *
     * Follows the CCXT Pro streaming pattern: the first call returns the initial snapshot
     * immediately; subsequent calls block until a change is detected.
     *
     * @param address - Any public Base-chain wallet address
     * @param types   - Activity types to watch (default: all)
     */
    async watchAddress(
        address: string,
        types: SubscriptionOption[] = ['trades', 'positions', 'balances'],
    ): Promise<SubscribedAddressSnapshot> {
        return this.ensureWs().watchAddress(address, types);
    }

    /**
     * Stop watching an address and release polling resources.
     * Any pending `watchAddress` promises for that address will be rejected.
     */
    async unwatchAddress(address: string): Promise<void> {
        return this.ensureWs().unwatchAddress(address);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }

    protected override mapImplicitApiError(error: any): any {
        throw limitlessErrorMapper.mapError(error);
    }

    // ------------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------------

    private async getAddressOnChainBalance(targetAddress: string): Promise<Balance[]> {
        // Query USDC balance directly from Base chain
        // Static network avoids ethers v5 auto-detect (eth_chainId) which can throw
        // noNetwork / NETWORK_ERROR on flaky public RPCs (#92).
        const provider = new providers.JsonRpcProvider('https://mainnet.base.org', {
            chainId: 8453,
            name: 'base',
        });

        // Get USDC contract address for Base
        const usdcAddress = getContractAddress('USDC');

        // USDC ERC20 ABI (balanceOf only)
        const usdcContract = new Contract(
            usdcAddress,
            ['function balanceOf(address) view returns (uint256)'],
            provider,
        );
        const rawBalance = await usdcContract.balanceOf(targetAddress);
        const USDC_DECIMALS = 6;
        const total = parseFloat(rawBalance.toString()) / Math.pow(10, USDC_DECIMALS);

        return [{
            currency: 'USDC',
            total,
            available: total, // On-chain balance is all available
            locked: 0,
        }];
    }

    private ensureClient(): LimitlessClient {
        if (!this.client) {
            throw new Error(
                'Trading operations require authentication. ' +
                'Initialize LimitlessExchange with credentials: new LimitlessExchange({ privateKey: "0x...", apiKey: "lmts_..." })'
            );
        }
        return this.client;
    }

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

    private ensureWs(): LimitlessWebSocket {
        if (!this.ws) {
            const wsConfig = {
                ...this.wsConfig,
                apiKey: this.auth?.getApiKey(),
                fetchOrderBook: (id: string) => this.fetchOrderBook(id),
            };
            this.ws = new LimitlessWebSocket(this.callApi.bind(this), wsConfig);
        }
        return this.ws;
    }

    /**
     * Fetch a composite activity snapshot for a Base-chain address from the Limitless
     * public portfolio API and Base RPC. Used internally by the BaseSubscriber polling loop.
     */
    private async fetchWatchedAddressActivity(params: {
        address: string,
        types: SubscriptionOption[],
    }): Promise<SubscribedAddressSnapshot> {
        const address = params.address;
        const types = params.types;

        const result: SubscribedAddressSnapshot = { address, timestamp: Date.now() };
        const fetches: Promise<void>[] = [];

        // Limitless has no public per-address trades endpoint; return empty.
        if (types.includes('trades')) {
            result.trades = [];
        }

        if (types.includes('positions')) {
            fetches.push(
                this.fetchPositions(address)
                    .then((positions) => {
                        result.positions = positions;
                    })
            );
        }

        if (types.includes('balances')) {
            fetches.push(
                this.getAddressOnChainBalance(address)
                    .then((balances) => {
                        result.balances = balances;
                    })
            );
        }
        await Promise.all(fetches);
        return result;
    }
}
