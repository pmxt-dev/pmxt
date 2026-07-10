import {
    PredictionMarketExchange,
    MarketFetchParams,
    EventFetchParams,
    ExchangeCredentials,
    OHLCVParams,
    HistoryFilterParams,
    TradesParams,
    MyTradesParams,
} from '../../BaseExchange';
import {
    getAuthNonce as getAuthNonceFn,
    loginWithSignature as loginWithSignatureFn,
    logout as logoutFn,
    verifyL1 as verifyL1Fn,
    verifyL2 as verifyL2Fn,
} from './auth';
import {
    AuthNonceResponse,
    AuthLoginResponse,
} from '../../router/types';
import {
    UnifiedMarket,
    UnifiedEvent,
    OrderBook,
    PriceCandle,
    Trade,
    UserTrade,
    Order,
    Position,
    Balance,
    CreateOrderParams,
} from '../../types';
import { ProbableAuth } from './auth';
import { ProbableWebSocket, ProbableWebSocketConfig } from './websocket';
import { probableErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { validateTradesLimit } from '../../utils/validation';
import { OrderSide } from '@prob/clob';
import { parseOpenApiSpec } from '../../utils/openapi';
import { probableApiSpec } from './api';
import { DEFAULT_BASE_URL } from './utils';
import { ProbableFetcher } from './fetcher';
import { ProbableNormalizer } from './normalizer';
import { FetcherContext } from '../interfaces';
import { logger } from '../../utils/logger';

const BSC_USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

export class ProbableExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchSeries: false as const,
    };

    private auth?: ProbableAuth;
    private ws?: ProbableWebSocket;
    private wsConfig?: ProbableWebSocketConfig;
    private readonly fetcher: ProbableFetcher;
    private readonly normalizer: ProbableNormalizer;

    constructor(credentials?: ExchangeCredentials, wsConfig?: ProbableWebSocketConfig) {
        super(credentials);
        this.rateLimit = 500;
        this.wsConfig = wsConfig;

        if (credentials?.privateKey && credentials?.apiKey && credentials?.apiSecret && credentials?.passphrase) {
            this.auth = new ProbableAuth(credentials);
        }

        const probableBaseUrl =
            credentials?.baseUrl || process.env.PROBABLE_BASE_URL || DEFAULT_BASE_URL;
        const descriptor = parseOpenApiSpec(probableApiSpec, probableBaseUrl);
        this.defineImplicitApi(descriptor);

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => ({ 'Content-Type': 'application/json' }),
        };

        this.fetcher = new ProbableFetcher(ctx, probableBaseUrl);
        this.normalizer = new ProbableNormalizer();
    }

    get name(): string {
        return 'Probable';
    }

    protected override mapImplicitApiError(error: any): any {
        throw probableErrorMapper.mapError(error);
    }

    private ensureAuth(): ProbableAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize ProbableExchange with credentials: new ProbableExchange({ privateKey: "0x...", apiKey: "...", apiSecret: "...", passphrase: "..." })',
                'Probable'
            );
        }
        return this.auth;
    }

    async getAuthNonce(walletAddress: string): Promise<AuthNonceResponse> {
        return getAuthNonceFn(walletAddress, this.callApi.bind(this));
    }

    async loginWithSignature(
        walletAddress: string,
        signature: string,
        nonce: string
    ): Promise<AuthLoginResponse> {
        const credentials = await loginWithSignatureFn(
            walletAddress,
            signature,
            nonce,
            this.callApi.bind(this)
        );
        this.storeSession(walletAddress, credentials);
        return credentials;
    }

    async logout(walletAddress?: string): Promise<void> {
        await logoutFn(this.callApi.bind(this));
        if (walletAddress) {
            this.removeSession(walletAddress);
        }
    }

    async verifyL1(walletAddress: string, signature: string): Promise<boolean> {
        return verifyL1Fn(walletAddress, signature, this.callApi.bind(this));
    }

    async verifyL2(walletAddress: string, signature: string): Promise<boolean> {
        return verifyL2Fn(walletAddress, signature, this.callApi.bind(this));
    }

    // --------------------------------------------------------------------------
    // Market Data (fetcher -> normalizer)
    // --------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        const rawMarkets = await this.fetcher.fetchRawMarkets(params);

        const markets = rawMarkets
            .map((raw) => this.normalizer.normalizeMarket(raw))
            .filter((m): m is UnifiedMarket => m !== null);

        // Filter by outcomeId client-side if requested
        const filtered = params?.outcomeId
            ? markets.filter(m => m.outcomes.some(o => o.outcomeId === params.outcomeId))
            : markets;

        // Slug-based exact matching for search results
        if (params?.slug && rawMarkets.length > 0) {
            const exact = filtered.filter(
                m => m.marketId === params.slug ||
                    m.url.includes(params.slug!) ||
                    (rawMarkets.find(r => this.normalizer.normalizeMarket(r)?.marketId === m.marketId) as any)?._parentEvent?.slug === params.slug
            );
            if (exact.length > 0) {
                await this.normalizer.enrichMarketsWithPrices(
                    exact,
                    (tokenId) => this.fetcher.fetchRawMidpoint(tokenId)
                );
                return exact;
            }
        }

        await this.normalizer.enrichMarketsWithPrices(
            filtered,
            (tokenId) => this.fetcher.fetchRawMidpoint(tokenId)
        );
        return filtered;
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        // Venue does not expose a series concept; honoring `params.series` by
        // returning [] rather than ignoring the filter.
        if (params.series !== undefined) return [];

        const rawEvents = await this.fetcher.fetchRawEvents(params);

        const events = rawEvents
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null);

        const allMarkets = events.flatMap((e) => e.markets);
        await this.normalizer.enrichMarketsWithPrices(
            allMarkets,
            (tokenId) => this.fetcher.fetchRawMidpoint(tokenId)
        );

        return events;
    }

    /**
     * Fetch a single event by its numeric ID (Probable only).
     *
     * @param id - The numeric event ID
     * @returns The UnifiedEvent, or null if not found
     */
    async getEventById(id: string): Promise<UnifiedEvent | null> {
        const raw = await this.fetcher.fetchRawEventById(id);
        if (!raw) return null;
        const event = this.normalizer.normalizeEvent(raw);
        if (event) {
            await this.normalizer.enrichMarketsWithPrices(
                event.markets,
                (tokenId) => this.fetcher.fetchRawMidpoint(tokenId)
            );
        }
        return event;
    }

    /**
     * Fetch a single event by its URL slug (Probable only).
     *
     * @param slug - The event's URL slug (e.g. `"trump-2024-election"`)
     * @returns The UnifiedEvent, or null if not found
     */
    async getEventBySlug(slug: string): Promise<UnifiedEvent | null> {
        const raw = await this.fetcher.fetchRawEventBySlug(slug);
        if (!raw) return null;
        const event = this.normalizer.normalizeEvent(raw);
        if (event) {
            await this.normalizer.enrichMarketsWithPrices(
                event.markets,
                (tokenId) => this.fetcher.fetchRawMidpoint(tokenId)
            );
        }
        return event;
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(outcomeId, _params);
        outcomeId = resolved.outcomeId;
        _params = resolved.params;
        const raw = await this.fetcher.fetchRawOrderBook(outcomeId);
        return this.normalizer.normalizeOrderBook(raw, outcomeId);
    }

    async fetchOHLCV(outcomeId: string, params: OHLCVParams): Promise<PriceCandle[]> {
        if (!params.resolution) {
            throw new Error('fetchOHLCV requires a resolution parameter.');
        }
        const rawPoints = await this.fetcher.fetchRawOHLCV(outcomeId, params);
        return this.normalizer.normalizeOHLCV(rawPoints, params);
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const auth = this.ensureAuth();
        const address = auth.getAddress();
        const rawTrades = await this.fetcher.fetchRawMyTrades(params || {}, address);
        return rawTrades.map((raw, i) => this.normalizer.normalizeUserTrade(raw, i));
    }

    async fetchTrades(outcomeId: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        validateTradesLimit(params.limit);
        const auth = this.ensureAuth();
        const client = auth.getClobClient();

        // Use CLOB client directly for trades (legacy behaviour preserved)
        const queryParams: any = { tokenId: outcomeId };
        if (params.limit) queryParams.limit = params.limit;

        const response = await client.getTrades(queryParams);
        const trades = Array.isArray(response) ? response : (response as any)?.data || [];
        return trades.map((raw: any, i: number) => this.normalizer.normalizeTrade(raw, i));
    }

    // --------------------------------------------------------------------------
    // Trading Methods
    // --------------------------------------------------------------------------

    async createOrder(params: CreateOrderParams): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = auth.getClobClient();

            const side = params.side.toLowerCase() === 'buy' ? OrderSide.Buy : OrderSide.Sell;

            let unsignedOrder;

            if (params.type === 'market') {
                unsignedOrder = await client.createMarketOrder({
                    tokenId: params.outcomeId,
                    size: params.amount,
                    side,
                });
            } else {
                if (!params.price) {
                    throw new Error('Price is required for limit orders');
                }

                unsignedOrder = await client.createLimitOrder({
                    tokenId: params.outcomeId,
                    price: params.price,
                    size: params.amount,
                    side,
                });
            }

            if (params.fee !== undefined && params.fee !== null) {
                (unsignedOrder as any).feeRateBps = BigInt(params.fee);
            }

            const response = await client.postOrder(unsignedOrder);

            if (response && 'code' in response && (response as any).code !== undefined) {
                throw new Error((response as any).msg || 'Order placement failed');
            }

            const orderResponse = response as any;

            return {
                id: String(orderResponse.orderId || orderResponse.id || ''),
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                price: params.price || parseFloat(orderResponse.price || '0'),
                amount: params.amount,
                status: 'open',
                filled: parseFloat(orderResponse.executedQty || '0'),
                remaining: params.amount - parseFloat(orderResponse.executedQty || '0'),
                fee: params.fee,
                timestamp: orderResponse.time || Date.now(),
            };
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    /**
     * Cancel an order.
     * The Probable SDK requires both orderId and tokenId for cancellation.
     * Pass a compound key as "orderId:tokenId" to provide both values.
     */
    async cancelOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = auth.getClobClient();

            const [actualOrderId, tokenId] = parseCompoundId(orderId);

            if (!tokenId) {
                throw new Error(
                    'Probable cancelOrder requires a compound ID in the format "orderId:tokenId". ' +
                    'The tokenId (outcomeId) is required by the Probable SDK.'
                );
            }

            await client.cancelOrder({
                orderId: actualOrderId,
                tokenId,
            });

            return {
                id: actualOrderId,
                marketId: 'unknown',
                outcomeId: tokenId,
                side: 'buy',
                type: 'limit',
                amount: 0,
                status: 'canceled',
                filled: 0,
                remaining: 0,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    /**
     * Fetch a single order by ID.
     * Pass a compound key as "orderId:tokenId" since the SDK requires both.
     */
    async fetchOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = auth.getClobClient();

            const [actualOrderId, tokenId] = parseCompoundId(orderId);

            if (!tokenId) {
                throw new Error(
                    'Probable fetchOrder requires a compound ID in the format "orderId:tokenId".'
                );
            }

            const order = await client.getOrder({
                orderId: actualOrderId,
                tokenId,
            });

            if (!order || ('code' in (order as any))) {
                throw new Error((order as any)?.msg || 'Order not found');
            }

            const o = order as any;
            return {
                id: String(o.orderId || o.id),
                marketId: o.symbol || 'unknown',
                outcomeId: o.tokenId || tokenId,
                side: (o.side || '').toLowerCase() as 'buy' | 'sell',
                type: o.type === 'LIMIT' || o.timeInForce === 'GTC' ? 'limit' : 'market',
                price: parseFloat(o.price || '0'),
                amount: parseFloat(o.origQty || '0'),
                status: mapOrderStatus(o.status),
                filled: parseFloat(o.executedQty || '0'),
                remaining: parseFloat(o.origQty || '0') - parseFloat(o.executedQty || '0'),
                timestamp: o.time || o.updateTime || Date.now(),
            };
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        if (!marketId) {
            throw new Error('[Probable] fetchOpenOrders requires a marketId: this exchange does not support fetching all orders across all markets');
        }
        try {
            const auth = this.ensureAuth();
            const client = auth.getClobClient();

            const params: any = {};
            params.eventId = marketId;

            const orders = await client.getOpenOrders(params);
            const orderList = Array.isArray(orders) ? orders : (orders as any)?.data || [];

            return orderList.map((o: any) => ({
                id: String(o.orderId || o.id),
                marketId: o.symbol || 'unknown',
                outcomeId: o.tokenId || '',
                side: (o.side || '').toLowerCase() as 'buy' | 'sell',
                type: 'limit' as const,
                price: parseFloat(o.price || '0'),
                amount: parseFloat(o.origQty || '0'),
                status: 'open' as const,
                filled: parseFloat(o.executedQty || '0'),
                remaining: parseFloat(o.origQty || '0') - parseFloat(o.executedQty || '0'),
                timestamp: o.time || o.updateTime || Date.now(),
            }));
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    async fetchPositions(): Promise<Position[]> {
        try {
            const auth = this.ensureAuth();
            const address = auth.getAddress();
            const rawItems = await this.fetcher.fetchRawPositions(address);
            return rawItems.map((raw) => this.normalizer.normalizePosition(raw));
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    async fetchBalance(): Promise<Balance[]> {
        try {
            const auth = this.ensureAuth();

            let total = 0;
            try {
                const { createPublicClient, http, parseAbi, formatUnits } = require('viem');
                const { bsc } = require('viem/chains');

                const publicClient = createPublicClient({
                    chain: bsc,
                    transport: http(),
                });

                const balance = await publicClient.readContract({
                    address: BSC_USDT_ADDRESS as `0x${string}`,
                    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
                    functionName: 'balanceOf',
                    args: [auth.getAddress() as `0x${string}`],
                });

                total = parseFloat(formatUnits(balance as bigint, 18));
            } catch (chainError: unknown) {
                logger.warn('Probable fetchBalance: on-chain USDT balance fetch failed', { error: String(chainError) });
                throw chainError;
            }

            // Calculate locked from open BUY orders
            let locked = 0;
            try {
                const openOrders = await this.fetchOpenOrders();
                for (const order of openOrders) {
                    if (order.side === 'buy' && order.price) {
                        locked += order.remaining * order.price;
                    }
                }
            } catch (ordersError: unknown) {
                logger.warn('Probable fetchBalance: failed to fetch open orders for locked balance calculation', { error: String(ordersError) });
                throw ordersError;
            }

            return [{
                currency: 'USDT',
                total,
                available: total - locked,
                locked,
            }];
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    // --------------------------------------------------------------------------
    // WebSocket Streaming (public, no auth needed)
    // --------------------------------------------------------------------------

    async watchOrderBook(outcomeId: string, limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        if (!this.ws) {
            this.ws = new ProbableWebSocket(this.wsConfig);
        }
        return this.ws.watchOrderBook(outcomeId);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }
}

/**
 * Parse a compound ID in the format "orderId:tokenId".
 * Returns [orderId, tokenId] where tokenId may be undefined.
 */
function parseCompoundId(compoundId: string): [string, string | undefined] {
    const colonIndex = compoundId.indexOf(':');
    if (colonIndex === -1) {
        return [compoundId, undefined];
    }
    return [compoundId.substring(0, colonIndex), compoundId.substring(colonIndex + 1)];
}

function mapOrderStatus(status: string): 'pending' | 'open' | 'filled' | 'canceled' | 'rejected' {
    if (!status) return 'open';
    const lower = status.toLowerCase();
    if (lower === 'new' || lower === 'open' || lower === 'partially_filled') return 'open';
    if (lower === 'filled' || lower === 'trade') return 'filled';
    if (lower === 'canceled' || lower === 'cancelled' || lower === 'expired') return 'canceled';
    if (lower === 'rejected') return 'rejected';
    return 'open';
}
