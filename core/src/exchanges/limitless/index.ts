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
import { LIMITLESS_CHAIN_ID, LIMITLESS_RPC_URL } from './config';
import { limitlessErrorMapper } from './errors';
import { LimitlessFetcher } from './fetcher';
import { LimitlessNormalizer } from './normalizer';
import { DEFAULT_LIMITLESS_API_URL, scaledIntegerToNumber } from './utils';
import { LimitlessWebSocket, LimitlessWebSocketConfig } from './websocket';
import { logger } from '../../utils/logger';

export type { LimitlessWebSocketConfig, WatcherConfig };
export { LIMITLESS_DEFAULT_SUBSCRIPTION, buildLimitlessBalanceActivity };

export interface LimitlessExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: LimitlessWebSocketConfig;
}

export class LimitlessExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchOrder: false as const,
        fetchSeries: false as const,
    };

    private auth?: LimitlessAuth;
    private client?: LimitlessClient;
    private wsConfig?: LimitlessWebSocketConfig;
    private ws?: LimitlessWebSocket;
    private readonly fetcher: LimitlessFetcher;
    private readonly normalizer: LimitlessNormalizer;
    private readonly outcomeToSlug = new Map<string, string>();
    private readonly noTokenIds = new Set<string>();

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

                if (credentials.privateKey) {
                    // Signing mode: use the private key for EIP-712 signatures.
                    // When apiSecret is also present, use HMAC-authenticated HTTP
                    // (new-style tokens); otherwise legacy X-API-Key header.
                    if (credentials.apiSecret) {
                        let pk = credentials.privateKey;
                        if (!pk.startsWith('0x')) pk = '0x' + pk;
                        const wallet = new (require('ethers').Wallet)(pk);
                        this.client = new LimitlessClient({
                            httpClient: this.auth.getHttpClient(),
                            wallet,
                            walletAddress: credentials.walletAddress,
                        });
                    } else {
                        const apiKey = this.auth.getApiKey();
                        this.client = new LimitlessClient(credentials.privateKey, apiKey, this.auth.host);
                    }
                } else if (this.auth.isDelegatedSigning()) {
                    // Delegated mode: HMAC auth, no private key, server signs
                    this.client = new LimitlessClient({
                        httpClient: this.auth.getHttpClient(),
                        isDelegated: true,
                        walletAddress: credentials.walletAddress,
                    });
                }
            } catch (error) {
                // If auth initialization fails, continue without it
                // Some methods (like fetchMarkets) work without auth
                logger.warn('Failed to initialize Limitless auth', { error: String(error) });
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

        const limitlessBaseUrl =
            this.auth?.host ||
            credentials?.baseUrl ||
            process.env.LIMITLESS_BASE_URL ||
            DEFAULT_LIMITLESS_API_URL;
        this.fetcher = new LimitlessFetcher(ctx, this.http, this.auth?.getApiKey(), limitlessBaseUrl);
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
            const results = rawMarkets
                .map((raw) => this.normalizer.normalizeMarket(raw))
                .filter((m): m is UnifiedMarket => m !== null && m.outcomes.length > 0)
                .filter(m => m.outcomes.some(o => o.outcomeId === params.outcomeId));
            this.indexOutcomeSlugs(results);
            return results;
        }

        // Handle search results -- filter and limit
        if (params?.query) {
            const results = rawMarkets
                .map((raw) => this.normalizer.normalizeMarket(raw))
                .filter((m): m is UnifiedMarket => m !== null && m.outcomes.length > 0)
                .slice(0, params?.limit || 250000);
            this.indexOutcomeSlugs(results);
            return results;
        }

        // Default fetch -- normalize, filter, sort, apply offset/limit
        const unifiedMarkets = rawMarkets
            .map((raw) => this.normalizer.normalizeMarket(raw))
            .filter((m): m is UnifiedMarket => m !== null && m.outcomes.length > 0);

        this.indexOutcomeSlugs(unifiedMarkets);

        if (params?.sort === 'volume') {
            unifiedMarkets.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
        }

        const offset = params?.offset || 0;
        const limit = params?.limit || 250000;
        const marketsAfterOffset = offset > 0 ? unifiedMarkets.slice(offset) : unifiedMarkets;
        return marketsAfterOffset.slice(0, limit);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        // Venue does not expose a series concept; honoring `params.series` by
        // returning [] rather than ignoring the filter.
        if (params.series !== undefined) return [];

        const rawEvents = await this.fetcher.fetchRawEvents(params);
        return rawEvents
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null);
    }

    async fetchOHLCV(outcomeId: string, params: OHLCVParams): Promise<PriceCandle[]> {
        const slug = await this.resolveSlug(outcomeId);
        if (!this.fetcher.fetchRawOHLCV) { throw new Error('fetchRawOHLCV is not implemented for this exchange'); }
        const rawPrices = await this.fetcher.fetchRawOHLCV(slug, params);
        if (!this.normalizer.normalizeOHLCV) { throw new Error('normalizeOHLCV is not implemented for this exchange'); }
        return this.normalizer.normalizeOHLCV(rawPrices as any, params);
    }

    async fetchOrderBook(outcomeId: string, limit?: number, params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(outcomeId, params);
        outcomeId = resolved.outcomeId;
        params = resolved.params;
        const slug = await this.resolveSlug(outcomeId);
        if (!this.fetcher.fetchRawOrderBook) { throw new Error('fetchRawOrderBook is not implemented for this exchange'); }
        const rawOrderBook = await this.fetcher.fetchRawOrderBook(slug);
        if (!this.normalizer.normalizeOrderBook) { throw new Error('normalizeOrderBook is not implemented for this exchange'); }
        const orderBook = this.normalizer.normalizeOrderBook(rawOrderBook as any, outcomeId);

        // The Limitless API always returns the Yes-side order book regardless
        // of which token is queried. If the caller asked for the No token,
        // flip: noBid = 1 - yesAsk, noAsk = 1 - yesBid.
        const side = params?.side;
        const isNoToken = side === 'no' || (!side && await this.isNoOutcome(outcomeId, slug));
        if (isNoToken) {
            return {
                bids: orderBook.asks.map((level) => ({ price: 1 - level.price, size: level.size }))
                    .sort((a, b) => b.price - a.price),
                asks: orderBook.bids.map((level) => ({ price: 1 - level.price, size: level.size }))
                    .sort((a, b) => a.price - b.price),
                timestamp: orderBook.timestamp,
            };
        }

        return orderBook;
    }

    private async isNoOutcome(outcomeId: string, slug: string): Promise<boolean> {
        // Check the cached set first (populated by indexOutcomeSlugs).
        if (this.noTokenIds.has(outcomeId)) return true;

        // If not cached, fetch the market by slug and index it.
        if (/^\d+$/.test(outcomeId)) {
            const markets = await this.fetchMarketsImpl({ slug });
            if (markets.length > 0) {
                this.indexOutcomeSlugs(markets);
                return this.noTokenIds.has(outcomeId);
            }
        }

        return false;
    }

    async fetchTrades(outcomeId: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        if ('resolution' in params && params.resolution !== undefined) {
            logger.warn(
                'The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.',
            );
        }
        const slug = await this.resolveSlug(outcomeId);
        if (!this.fetcher.fetchRawTrades) { throw new Error('fetchRawTrades is not implemented for this exchange'); }
        const rawTrades = await this.fetcher.fetchRawTrades(slug, params);
        if (!this.normalizer.normalizeTrade) { throw new Error('normalizeTrade is not implemented for this exchange'); }
        const normalizeTrade = this.normalizer.normalizeTrade;
        return rawTrades.map((raw, i) => normalizeTrade(raw, i));
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const auth = this.ensureAuth();
        if (!this.fetcher.fetchRawMyTrades) { throw new Error('fetchRawMyTrades is not implemented for this exchange'); }
        const rawTrades = await this.fetcher.fetchRawMyTrades(params || {}, auth.getApiKey());
        if (!this.normalizer.normalizeUserTrade) { throw new Error('normalizeUserTrade is not implemented for this exchange'); }
        const normalizeUserTrade = this.normalizer.normalizeUserTrade;
        return rawTrades.map((raw, i) => normalizeUserTrade(raw, i));
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
                onBehalfOf: params.onBehalfOf,
            });

            // Map response to Order object.
            // The SDK returns OrderResponse: { order: CreatedOrder, makerMatches?: OrderMatch[] }
            // For GTC orders that rest on the book, makerMatches is empty.
            // For FOK/FAK orders (or GTC with immediate partial matches), makerMatches contains fills.
            // Each OrderMatch.matchedSize is in USDC raw units (6 decimals).
            const USDC_DECIMALS = 6;
            const raw = response as any;
            const matches: any[] = raw.makerMatches ?? raw.order?.makerMatches ?? [];
            const filledRaw = matches.reduce((sum: number, m: any) => {
                const size = typeof m.matchedSize === 'string'
                    ? parseFloat(m.matchedSize)
                    : (m.matchedSize ?? 0);
                return sum + size;
            }, 0);
            const filled = filledRaw / Math.pow(10, USDC_DECIMALS);
            const remaining = Math.max(0, params.amount - filled);
            const orderFeeRateBps = raw.order?.feeRateBps
                ?? raw.feeRateBps
                ?? undefined;

            return {
                id: raw.order?.id || raw.id || 'unknown',
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                price: params.price,
                amount: params.amount,
                status: filled >= params.amount ? 'filled' : 'open',
                filled,
                remaining,
                timestamp: Date.now(),
                ...(orderFeeRateBps != null ? { feeRateBps: orderFeeRateBps } : {}),
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
                status: 'canceled',
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
                throw new Error('Limitless: fetchOpenOrders requires marketId (slug).');
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
            throw new Error('Limitless: fetchClosedOrders requires marketId (slug).');
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
            throw new Error('Limitless: fetchAllOrders requires marketId (slug).');
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
        if (!this.normalizer.normalizePosition) { throw new Error('normalizePosition is not implemented for this exchange'); }
        const normalizePosition = this.normalizer.normalizePosition;
        return rawItems.map((raw) => normalizePosition(raw));
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

    async watchOrderBook(outcomeId: string, limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        const slug = await this.resolveSlug(outcomeId);
        const ws = this.ensureWs();
        return ws.watchOrderBook(slug);
    }

    async unwatchOrderBook(outcomeId: string): Promise<void> {
        const slug = await this.resolveSlug(outcomeId);
        const ws = this.ensureWs();
        await ws.unsubscribe(slug);
    }

    async watchTrades(outcomeId: string, address?: string, since?: number, limit?: number): Promise<Trade[]> {
        const slug = await this.resolveSlug(outcomeId);
        const ws = this.ensureWs();
        return ws.watchTrades(slug, address);
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
        //
        // Static network avoids ethers v5 auto-detect (eth_chainId), which can throw
        // noNetwork / NETWORK_ERROR on flaky public RPCs (#92).
        const provider = new providers.StaticJsonRpcProvider(LIMITLESS_RPC_URL, {
            chainId: LIMITLESS_CHAIN_ID,
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
        const total = scaledIntegerToNumber(rawBalance, USDC_DECIMALS);

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
     * Populate the outcomeId -> slug lookup from a list of unified markets.
     */
    private indexOutcomeSlugs(markets: UnifiedMarket[]): void {
        for (const market of markets) {
            if (!market.slug) continue;
            for (const outcome of market.outcomes) {
                this.outcomeToSlug.set(outcome.outcomeId, market.slug);
                if (outcome.label.toLowerCase() === 'no') {
                    this.noTokenIds.add(outcome.outcomeId);
                }
            }
        }
    }

    /**
     * Resolve an outcomeId to the market slug required by the Limitless API.
     * Returns the id unchanged if it already looks like a slug (no digits-only check)
     * or if no mapping is found.
     */
    private async resolveSlug(outcomeId: string): Promise<string> {
        const cached = this.outcomeToSlug.get(outcomeId);
        if (cached) return cached;

        // If the id doesn't look like a numeric token ID, assume it's already a slug.
        if (!/^\d+$/.test(outcomeId)) return outcomeId;

        // Attempt to discover the slug by fetching markets filtered by outcomeId.
        const markets = await this.fetchMarketsImpl({ outcomeId });
        if (markets.length > 0 && markets[0].slug) {
            return markets[0].slug;
        }

        return outcomeId;
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
