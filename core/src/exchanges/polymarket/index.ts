import type { SignedOrder } from '@polymarket/clob-client-v2';
import { AssetType, Side } from '@polymarket/clob-client-v2';
import { createHmac } from 'crypto';
import {
    EventFetchParams,
    ExchangeCredentials,
    HistoryFilterParams,
    MarketFilterParams,
    MyTradesParams,
    OHLCVParams,
    PredictionMarketExchange,
    SeriesFetchParams,
    TradesParams,
} from '../../BaseExchange';
import { AuthenticationError } from '../../errors';
import { SubscribedAddressSnapshot, SubscriptionOption } from '../../subscriber/base';
import { buildPolymarketTradesActivity, POLYMARKET_DEFAULT_SUBSCRIPTION } from '../../subscriber/external/goldsky';
import { WatcherConfig } from '../../subscriber/watcher';
import {
    Balance,
    BuiltOrder,
    CreateOrderParams,
    Order,
    OrderBook,
    Position,
    PriceCandle,
    Trade,
    UnifiedEvent,
    UnifiedMarket,
    UnifiedSeries,
    UserTrade,
} from '../../types';
import { parseOpenApiSpec } from '../../utils/openapi';
import { validateIdFormat, validateOutcomeId, validateTradesLimit } from '../../utils/validation';
import { FetcherContext } from '../interfaces';
import { polymarketClobSpec } from './api-clob';
import { polymarketDataSpec } from './api-data';
import { polymarketGammaSpec } from './api-gamma';
import { PolymarketAuth } from './auth';
import { POLYMARKET_CHAIN_ID } from './config';
import { logger } from '../../utils/logger';
import { polymarketErrorMapper } from './errors';
import { PolymarketFetcher } from './fetcher';
import { PolymarketNormalizer } from './normalizer';
import {
    PolymarketWebSocket, PolymarketWebSocketConfig,
    UserChannelCallback, UserChannelEvent, PolymarketUserChannelCreds,
} from './websocket';

// Re-export for external use
export type { PolymarketWebSocketConfig, WatcherConfig, UserChannelCallback, UserChannelEvent, PolymarketUserChannelCreds };
export { POLYMARKET_DEFAULT_SUBSCRIPTION, buildPolymarketTradesActivity };

export interface PolymarketExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: PolymarketWebSocketConfig;
}

export class PolymarketExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchSeries: true as const,
    };

    private auth?: PolymarketAuth;
    private wsConfig?: PolymarketWebSocketConfig;
    private cachedApiCreds?: { key: string; secret: string; passphrase: string };
    private cachedAddress?: string;
    private ws?: PolymarketWebSocket;
    private readonly fetcher: PolymarketFetcher;
    private readonly normalizer: PolymarketNormalizer;

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
        this.rateLimit = 200;
        this.wsConfig = wsConfig;

        // Add browser-mimicking headers to help pass Cloudflare bot detection on the Gamma API.
        // Origin/Referer make requests look like same-site CORS calls from the Polymarket frontend.
        Object.assign(this.http.defaults.headers.common, {
            'Accept': 'application/json, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://polymarket.com',
            'Referer': 'https://polymarket.com/',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
        });

        // Initialize auth if credentials are provided
        if (credentials?.privateKey) {
            this.auth = new PolymarketAuth(credentials);
        }

        // If L2 API creds are provided directly, cache them for sync sign()
        if (credentials?.apiKey && credentials?.apiSecret && credentials?.passphrase) {
            this.cachedApiCreds = {
                key: credentials.apiKey,
                secret: credentials.apiSecret,
                passphrase: credentials.passphrase,
            };
        }

        // Register implicit APIs for all 3 Polymarket services
        const clobDescriptor = parseOpenApiSpec(polymarketClobSpec);
        this.defineImplicitApi(clobDescriptor);

        const gammaDescriptor = parseOpenApiSpec(polymarketGammaSpec);
        this.defineImplicitApi(gammaDescriptor);

        const dataDescriptor = parseOpenApiSpec(polymarketDataSpec);
        this.defineImplicitApi(dataDescriptor);

        // Initialize fetcher + normalizer layers
        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => ({}),
        };

        this.fetcher = new PolymarketFetcher(ctx, this.http);
        this.normalizer = new PolymarketNormalizer();
    }

    get name(): string {
        return 'Polymarket';
    }

    // ----------------------------------------------------------------------------
    // Implicit API Auth & Error Mapping
    // ----------------------------------------------------------------------------

    /**
     * Initialize L2 API credentials for implicit API signing.
     * Must be called before using private implicit API endpoints if only
     * a privateKey was provided (not apiKey/apiSecret/passphrase).
     */
    async initAuth(): Promise<void> {
        const auth = this.ensureAuth();
        const creds = await auth.getApiCredentials();
        this.cachedApiCreds = {
            key: creds.key,
            secret: creds.secret,
            passphrase: creds.passphrase,
        };
        this.cachedAddress = auth.getFunderAddress();
    }

    async fetchOHLCV(outcomeId: string, params: OHLCVParams): Promise<PriceCandle[]> {
        validateIdFormat(outcomeId, 'OHLCV');
        validateOutcomeId(outcomeId, 'OHLCV');
        if (!params.resolution) {
            throw new Error('fetchOHLCV requires a resolution parameter. Use OHLCVParams with resolution specified.');
        }
        const raw = await this.fetcher.fetchRawOHLCV(outcomeId, params);
        return this.normalizer.normalizeOHLCV(raw, params);
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(outcomeId, _params);
        outcomeId = resolved.outcomeId;
        _params = resolved.params;
        validateIdFormat(outcomeId, 'OrderBook');
        validateOutcomeId(outcomeId, 'OrderBook');
        const raw = await this.fetcher.fetchRawOrderBook(outcomeId);
        return this.normalizer.normalizeOrderBook(raw, outcomeId);
    }

    async fetchOrderBooks(outcomeIds: string[]): Promise<Record<string, OrderBook>> {
        outcomeIds.forEach((outcomeId) => {
            validateIdFormat(outcomeId, 'OrderBook');
            validateOutcomeId(outcomeId, 'OrderBook');
        });
        const raw = await this.fetcher.fetchRawOrderBooks(outcomeIds);
        const byAssetId = new Map(raw.map(item => [item.asset_id, item]));
        const response: Record<string, OrderBook> = {};
        outcomeIds.forEach((outcomeId) => {
            const item = byAssetId.get(outcomeId);
            if (item) response[outcomeId] = this.normalizer.normalizeOrderBook(item, outcomeId);
        });
        return response;
    }

    async fetchTrades(outcomeId: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        validateIdFormat(outcomeId, 'Trades');
        validateOutcomeId(outcomeId, 'Trades');
        validateTradesLimit(params.limit);
        if ('resolution' in params && params.resolution !== undefined) {
            logger.warn('The "resolution" parameter is deprecated for fetchTrades() and will be ignored. It will be removed in v3.0.0.');
        }
        const rawTrades = await this.fetcher.fetchRawTrades(outcomeId, params);
        const mappedTrades = rawTrades.map((raw: any, i: number) => this.normalizer.normalizeTrade(raw, i));
        if (params.limit && mappedTrades.length > params.limit) {
            return mappedTrades.slice(0, params.limit);
        }
        return mappedTrades;
    }

    /**
     * Pre-warm the SDK's internal caches for a market outcome.
     *
     * Fetches tick size, fee rate, and neg-risk in parallel so that subsequent
     * `createOrder` calls skip those lookups and hit only `POST /order`.
     * Call this when you start watching a market.
     *
     * @param outcomeId - The CLOB Token ID for the outcome (use `outcome.outcomeId`)
     */
    async preWarmMarket(outcomeId: string): Promise<void> {
        const auth = this.ensureAuth();
        const client = await auth.getClobClient();
        await Promise.all([
            client.getTickSize(outcomeId),
            client.getFeeRateBps(outcomeId),
            client.getNegRisk(outcomeId),
        ]);
    }

    async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            const side = params.side.toUpperCase() === 'BUY' ? Side.BUY : Side.SELL;
            const tickSize = params.tickSize ? params.tickSize.toString() : undefined;
            const options: any = {};
            if (tickSize) options.tickSize = tickSize;
            if (params.negRisk !== undefined) options.negRisk = params.negRisk;

            let signedOrder;

            if (params.type === 'market' || !params.price) {
                const marketAmount = side === Side.BUY
                    ? params.amount * (params.price || 1)
                    : params.amount;
                signedOrder = await client.createMarketOrder(
                    { tokenID: params.outcomeId, amount: marketAmount, side },
                    options,
                );
            } else {
                signedOrder = await client.createOrder(
                    { tokenID: params.outcomeId, price: params.price, side, size: params.amount },
                    options,
                );
            }

            return {
                exchange: this.name,
                params,
                signedOrder: signedOrder as Record<string, unknown>,
                raw: signedOrder,
            };
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async submitOrder(built: BuiltOrder): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            const isMarket = built.params.type === 'market' || !built.params.price;
            const response = isMarket
                ? await client.postOrder(built.raw as SignedOrder, 'FOK' as any)
                : await client.postOrder(built.raw as SignedOrder);

            if (!response || !response.success) {
                throw new Error(`${response?.errorMsg || 'Order submission failed'} (Response: ${JSON.stringify(response)})`);
            }

            const side = built.params.side.toUpperCase() === 'BUY' ? Side.BUY : Side.SELL;
            const price = built.params.price || 0;

            const responseStatus = (response.status || '').toUpperCase();
            const isImmediatelyFilled = responseStatus === 'MATCHED' || responseStatus === 'CONFIRMED';
            let filled = 0;
            if (isImmediatelyFilled) {
                const taking = typeof response.takingAmount === 'string'
                    ? parseFloat(response.takingAmount)
                    : (response.takingAmount ?? 0);
                const making = typeof response.makingAmount === 'string'
                    ? parseFloat(response.makingAmount)
                    : (response.makingAmount ?? 0);
                // BUY: takingAmount = shares received, makingAmount = USDC spent
                // SELL: makingAmount = shares sold, takingAmount = USDC received
                filled = side === Side.BUY ? taking : making;
            }
            const remaining = Math.max(0, built.params.amount - filled);
            const orderStatus = isImmediatelyFilled ? 'filled' : 'open';

            return {
                id: response.orderID,
                marketId: built.params.marketId,
                outcomeId: built.params.outcomeId,
                side: built.params.side,
                type: built.params.type,
                price,
                amount: built.params.amount,
                status: orderStatus,
                filled,
                remaining,
                fee: built.params.fee,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const built = await this.buildOrder(params);
        return this.submitOrder(built);
    }

    async cancelOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            await client.cancelOrder({ orderID: orderId });

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
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

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
                timestamp: order.created_at * 1000,
            };
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            const orders = await client.getOpenOrders({
                market: marketId,
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
                timestamp: o.created_at * 1000,
            }));
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async fetchUserTrades(address: string, params?: MyTradesParams): Promise<UserTrade[]> {
        const rawTrades = await this.fetcher.fetchRawMyTrades(params || {}, address);
        return rawTrades.map((raw: any, i: number) => this.normalizer.normalizeUserTrade(raw, i));
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const auth = this.ensureAuth();
        const address = await auth.getEffectiveFunderAddress();
        return this.fetchUserTrades(address, params);
    }

    async fetchPositions(address?: string): Promise<Position[]> {
        try {
            let usrAddress: string;
            if (address) {
                usrAddress = address;
            } else {
                const auth = this.ensureAuth();
                usrAddress = await auth.getEffectiveFunderAddress();
            }
            const rawPositions = await this.fetcher.fetchRawPositions(usrAddress);
            return rawPositions.map((raw: any) => this.normalizer.normalizePosition(raw));
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async fetchBalance(address?: string): Promise<Balance[]> {
        try {
            if (address) {
                return await this.getAddressOnChainBalance(address);
            }

            // Authenticated path: use CLOB client + on-chain fallback for own wallet.
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            // Polymarket relies strictly on USDC (Polygon)
            const USDC_DECIMALS = 6;

            // Try fetching from CLOB client first.
            //
            // Note on the bundled @polymarket/clob-client error model: its HTTP
            // wrapper swallows axios errors and RETURNS an envelope shaped like
            // { error, status } instead of throwing. We must therefore validate
            // the shape of the result before using it, otherwise downstream
            // parseFloat() yields NaN and the on-chain fallback never triggers.
            let total = 0;
            let clobBalanceAvailable = false;
            try {
                const balRes: any = await client.getBalanceAllowance({
                    asset_type: AssetType.COLLATERAL,
                });
                if (balRes && typeof balRes.balance === 'string') {
                    const rawBalance = parseFloat(balRes.balance);
                    if (Number.isFinite(rawBalance)) {
                        total = rawBalance / Math.pow(10, USDC_DECIMALS);
                        clobBalanceAvailable = true;
                    }
                }
                // If balRes was an error envelope, fall through to on-chain.
            } catch (clobError: unknown) {
                logger.warn('CLOB balance request failed, falling through to on-chain', {
                    error: clobError instanceof Error ? clobError.message : String(clobError),
                });
            }

            // On-Chain Fallback/Check (Robustness)
            // Trigger when CLOB couldn't tell us, or reported a true zero (CLOB
            // can lag or be confused about proxies for newly funded wallets).
            if (!clobBalanceAvailable || total === 0) {
                try {
                    const targetAddress = await auth.getEffectiveFunderAddress();
                    const balances = await this.getAddressOnChainBalance(targetAddress);
                    const onChain = balances[0]?.total ?? 0;
                    if (onChain > 0) {
                        total = onChain;
                    }
                } catch (err: unknown) {
                    logger.warn('On-chain balance lookup failed; using CLOB balance only', {
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            }

            // 2. Fetch open orders to calculate locked funds.
            // We only care about BUY orders for USDC balance locking.
            //
            // The bundled @polymarket/clob-client throws "response.data is not
            // iterable" from inside its getOpenOrders pagination loop whenever
            // the CLOB API returns an HTTP error envelope (the library spreads
            // response.data unconditionally). This is the root cause of #72:
            // a wallet that has not completed Polymarket onboarding triggers an
            // upstream auth/setup rejection that surfaces here as an opaque
            // TypeError. Catch it and translate to a clear AuthenticationError.
            let locked = 0;
            try {
                const openOrders = await client.getOpenOrders({});
                if (Array.isArray(openOrders)) {
                    for (const order of openOrders) {
                        if (order.side === Side.BUY) {
                            const remainingSize = parseFloat(order.original_size) - parseFloat(order.size_matched);
                            const price = parseFloat(order.price);
                            locked += remainingSize * price;
                        }
                    }
                }
            } catch (ordersError: any) {
                const msg = String(ordersError?.message ?? ordersError);
                if (msg.includes('is not iterable')) {
                    throw new AuthenticationError(
                        'Polymarket CLOB rejected the request to list open orders. ' +
                        'This usually means your signature_type is wrong for this account, ' +
                        'or the wallet has not completed Polymarket onboarding. ' +
                        "Try signature_type='deposit_wallet' (newest accounts), " +
                        "'gnosis_safe' (2023-era accounts), or 'polyproxy' (legacy accounts). " +
                        'If none work, visit https://polymarket.com to complete account setup.',
                        'Polymarket',
                    );
                }
                // Unexpected failure — surface through the standard mapper.
                throw ordersError;
            }

            return [{
                currency: 'USDC',
                total: total,
                available: total - locked, // Available for new trades
                locked: locked,
            }];
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    // ----------------------------------------------------------------------------
    // WebSocket Methods
    // ----------------------------------------------------------------------------


    async watchOrderBook(outcomeId: string, limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        return this.ensureWs().watchOrderBook(outcomeId);
    }

    async unwatchOrderBook(outcomeId: string): Promise<void> {
        return this.ensureWs().unwatchOrderBook(outcomeId);
    }

    async watchTrades(outcomeId: string, address?: string, since?: number, limit?: number): Promise<Trade[]> {
        return this.ensureWs().watchTrades(outcomeId, address);
    }

    async watchAddress(
        address: string,
        types: SubscriptionOption[] = ['trades', 'positions', 'balances'],
    ): Promise<SubscribedAddressSnapshot> {
        return this.ensureWs().watchAddress(address, types);
    }

    async unwatchAddress(address: string): Promise<void> {
        return this.ensureWs().unwatchAddress(address);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }


    protected override sign(method: string, path: string, _params: Record<string, any>): Record<string, string> {
        if (!this.cachedApiCreds) {
            throw new AuthenticationError(
                'API credentials not initialized. Either provide apiKey/apiSecret/passphrase ' +
                'in credentials, or call initAuth() before using private implicit API endpoints.',
                'Polymarket',
            );
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const message = timestamp + method.toUpperCase() + path;

        // Decode the base64url secret
        const secretB64 = this.cachedApiCreds.secret
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const secretBuffer = Buffer.from(secretB64, 'base64');

        // HMAC-SHA256 -> base64url
        const hmac = createHmac('sha256', secretBuffer);
        hmac.update(message);
        const signature = hmac.digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

        return {
            'POLY_ADDRESS': this.cachedAddress || (this.auth ? this.auth.getFunderAddress() : ''),
            'POLY_SIGNATURE': signature,
            'POLY_TIMESTAMP': timestamp,
            'POLY_API_KEY': this.cachedApiCreds.key,
            'POLY_PASSPHRASE': this.cachedApiCreds.passphrase,
        };
    }

    protected override mapImplicitApiError(error: any): any {
        throw polymarketErrorMapper.mapError(error);
    }

    // ----------------------------------------------------------------------------
    // Implementation methods for CCXT-style API
    // ----------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        const rawEvents = await this.fetcher.fetchRawMarkets(params);

        const unifiedMarkets: UnifiedMarket[] = [];
        const useQuestionFallback = !!(params?.marketId || params?.slug || params?.eventId);

        for (const event of rawEvents) {
            const markets = this.normalizer.normalizeMarketsFromEvent(event, { useQuestionAsCandidateFallback: useQuestionFallback });
            unifiedMarkets.push(...markets);
        }

        // For outcomeId filtering (no direct API, fetch and filter)
        if (params?.outcomeId) {
            return unifiedMarkets.filter(m =>
                m.outcomes.some(o => o.outcomeId === params.outcomeId),
            );
        }

        // For query-based search, apply client-side filtering on market title
        if (params?.query) {
            const lowerQuery = params.query.toLowerCase();
            const searchIn = params?.searchIn || 'title';
            const filtered = unifiedMarkets.filter(m => {
                const titleMatch = (m.title || '').toLowerCase().includes(lowerQuery);
                const descMatch = (m.description || '').toLowerCase().includes(lowerQuery);
                if (searchIn === 'title') return titleMatch;
                if (searchIn === 'description') return descMatch;
                return titleMatch || descMatch;
            });
            return filtered.slice(0, params?.limit || 250000);
        }

        // Client-side sort for default/non-search paths
        if (params?.sort === 'volume') {
            unifiedMarkets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (params?.sort === 'liquidity') {
            unifiedMarkets.sort((a, b) => b.liquidity - a.liquidity);
        } else if (!params?.marketId && !params?.slug && !params?.eventId) {
            unifiedMarkets.sort((a, b) => b.volume24h - a.volume24h);
        }

        return unifiedMarkets.slice(0, params?.limit || 250000);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        if (params.eventId || params.slug) {
            // Use implicit API for eventId/slug lookup (listEvents)
            const queryParams = params.eventId ? { id: params.eventId } : { slug: params.slug };
            const events = await this.callApi('listEvents', queryParams);
            return (events || []).map((event: any) => this.normalizer.normalizeEvent(event)).filter((e: UnifiedEvent | null): e is UnifiedEvent => e !== null);
        }

        if (params.series) {
            const seriesId = await this.resolveSeriesId(params.series);
            const events = await this.callApi('listEvents', { series_id: seriesId });
            return (events || []).map((event: any) => this.normalizer.normalizeEvent(event)).filter((e: UnifiedEvent | null): e is UnifiedEvent => e !== null);
        }

        const rawEvents = await this.fetcher.fetchRawEvents(params);
        return rawEvents
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null)
            .slice(0, params.limit || 250000);
    }

    /**
     * Resolve a series id or slug string to a numeric Gamma series id.
     * If the value is already numeric, returns it unchanged.
     * Otherwise, calls `listSeries` with the value as `slug` and returns the
     * first matching series id.
     */
    private async resolveSeriesId(seriesValue: string): Promise<number> {
        const numericId = Number(seriesValue);
        if (Number.isInteger(numericId) && numericId > 0) {
            return numericId;
        }
        // Slug path: look up via listSeries
        const results = await this.callApi('listSeries', { slug: [seriesValue] });
        const first = Array.isArray(results) ? results[0] : undefined;
        if (!first || first.id == null) {
            throw new Error(`Polymarket: no series found for slug "${seriesValue}"`);
        }
        return Number(first.id);
    }

    protected override async fetchSeriesImpl(params: SeriesFetchParams): Promise<UnifiedSeries[]> {
        if (params.id) {
            const raw = await this.callApi('getSeries', { id: params.id });
            if (!raw || raw.id == null) return [];
            return [this.normalizer.normalizeSeries(raw as unknown as Record<string, unknown>)];
        }

        const queryParams: Record<string, unknown> = {};
        if (params.slug) queryParams['slug'] = [params.slug];
        if (params.recurrence) queryParams['recurrence'] = params.recurrence;

        const results = await this.callApi('listSeries', queryParams);
        const list: unknown[] = Array.isArray(results) ? results : [];

        const normalized = list.map((raw) =>
            this.normalizer.normalizeSeries(raw as unknown as Record<string, unknown>),
        );

        if (params.query) {
            const lowerQuery = params.query.toLowerCase();
            return normalized.filter((s) =>
                (s.title || '').toLowerCase().includes(lowerQuery) ||
                (s.description || '').toLowerCase().includes(lowerQuery),
            );
        }

        return normalized;
    }

    /**
     * Ensure authentication is initialized before trading operations.
     */
    private ensureAuth(): PolymarketAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize PolymarketExchange with credentials: new PolymarketExchange({ privateKey: "0x..." })',
                'Polymarket',
            );
        }
        return this.auth;
    }

    /** Fetch on-chain pUSD balance on Polygon for any address without requiring credentials. */
    private async getAddressOnChainBalance(address: string): Promise<Balance[]> {
        const { ethers } = require('ethers');

        if (!ethers.utils.isAddress(address)) {
            throw new Error(`Invalid address: ${address}`);
        }
        // Static network avoids ethers v5 auto-detect (eth_chainId), which can throw
        // noNetwork / NETWORK_ERROR on flaky public RPCs (#92).
        const provider = new ethers.providers.StaticJsonRpcProvider('https://polygon-rpc.com', {
            chainId: POLYMARKET_CHAIN_ID,
            name: 'matic',
        });
        const pusdAddress = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'; // pUSD (Polymarket USD)
        const erc20Abi = [
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)',
        ];
        const pusdContract = new ethers.Contract(pusdAddress, erc20Abi, provider);
        const rawBalance = await pusdContract.balanceOf(address);
        const decimals = await pusdContract.decimals();
        const total = parseFloat(ethers.utils.formatUnits(rawBalance, decimals));
        return [{ currency: 'USDC', total, available: total, locked: 0 }];
    }

    private ensureWs(): PolymarketWebSocket {
        if (!this.ws) {
            this.ws = new PolymarketWebSocket(this.callApi.bind(this), this.wsConfig);
        }
        return this.ws;
    }

    private async fetchWatchedAddressActivity(params: {
        address: string,
        types: SubscriptionOption[]
    }): Promise<SubscribedAddressSnapshot> {
        const address = params.address;
        const types = params.types;

        const result: SubscribedAddressSnapshot = { address, timestamp: Date.now() };
        const fetches: Promise<void>[] = [];

        if (types.includes('trades')) {
            fetches.push(
                this.callApi('getTrades', { user: address, limit: 20 })
                    .then((data: any) => {
                        const raw = Array.isArray(data) ? data : (data?.data ?? []);
                        result.trades = raw.map((t: any) => ({
                            id: t.id || t.transactionHash || String(t.timestamp),
                            timestamp: typeof t.timestamp === 'number' ? t.timestamp * 1000 : Date.now(),
                            price: parseFloat(t.price || '0'),
                            amount: parseFloat(t.size || t.amount || '0'),
                            side: t.side === 'BUY' ? 'buy' as const
                                : t.side === 'SELL' ? 'sell' as const
                                    : 'unknown' as const,
                            outcomeId: t.asset ?? undefined,
                        }));
                    }),
            );
        }

        if (types.includes('positions')) {
            fetches.push(
                this.fetcher.fetchRawPositions(address)
                    .then((rawPositions) => {
                        result.positions = rawPositions.map((p) => this.normalizer.normalizePosition(p));
                    }),
            );
        }

        if (types.includes('balances')) {
            fetches.push(
                this.getAddressOnChainBalance(address)
                    .then(b => {
                        result.balances = b;
                    }),
            );
        }

        await Promise.all(fetches);
        return result;
    }
}
