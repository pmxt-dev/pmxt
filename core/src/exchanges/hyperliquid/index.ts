import {
    PredictionMarketExchange,
    MarketFilterParams,
    EventFetchParams,
    OHLCVParams,
    TradesParams,
    ExchangeCredentials,
    MyTradesParams,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    OrderBook,
    PriceCandle,
    Trade,
    UserTrade,
    Balance,
    Position,
    Order,
    CreateOrderParams,
    BuiltOrder,
} from '../../types';
import { AuthenticationError } from '../../errors';
import { getHyperliquidConfig, HyperliquidApiConfig } from './config';
import { HyperliquidFetcher } from './fetcher';
import { HyperliquidNormalizer } from './normalizer';
import { HyperliquidAuth, floatToWire } from './auth';
import { hyperliquidErrorMapper } from './errors';
import { FetcherContext } from '../interfaces';
import { fromMarketId } from './utils';

export interface HyperliquidExchangeOptions {
    credentials?: ExchangeCredentials;
    testnet?: boolean;
}

export class HyperliquidExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchSeries: false as const,
    };

    private readonly config: HyperliquidApiConfig;
    private readonly fetcher: HyperliquidFetcher;
    private readonly normalizer: HyperliquidNormalizer;
    private readonly walletAddress?: string;
    private readonly auth?: HyperliquidAuth;

    constructor(credentials?: ExchangeCredentials | HyperliquidExchangeOptions) {
        const opts = credentials && 'credentials' in credentials
            ? credentials as HyperliquidExchangeOptions
            : { credentials: credentials as ExchangeCredentials | undefined };

        super(opts.credentials);
        this.rateLimit = 200;

        const testnet = 'testnet' in (opts as any) ? (opts as HyperliquidExchangeOptions).testnet : false;
        this.config = getHyperliquidConfig(opts.credentials?.baseUrl, testnet);

        // Initialize auth if privateKey is provided (needed for trading)
        if (opts.credentials?.privateKey) {
            this.auth = new HyperliquidAuth(opts.credentials, this.config.testnet);
            this.walletAddress = this.auth.getAddress();
        } else {
            // For read-only usage, users can pass walletAddress as apiKey
            this.walletAddress = opts.credentials?.apiKey || undefined;
        }

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => ({}),
        };

        this.fetcher = new HyperliquidFetcher(ctx, this.config.baseUrl);
        this.normalizer = new HyperliquidNormalizer();
    }

    get name(): string {
        return 'Hyperliquid';
    }

    // -------------------------------------------------------------------------
    // Auth helpers
    // -------------------------------------------------------------------------

    private requireWallet(): string {
        if (!this.walletAddress) {
            throw new AuthenticationError(
                'This operation requires a wallet address. ' +
                'Initialize HyperliquidExchange with credentials (apiKey = wallet address, or privateKey for trading).',
                'Hyperliquid',
            );
        }
        return this.walletAddress;
    }

    private requireAuth(): HyperliquidAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading requires a privateKey for EIP-712 signing. ' +
                'Initialize HyperliquidExchange with credentials including privateKey.',
                'Hyperliquid',
            );
        }
        return this.auth;
    }

    // -------------------------------------------------------------------------
    // Market Data
    // -------------------------------------------------------------------------

    protected async fetchMarketsImpl(
        params?: MarketFilterParams,
    ): Promise<UnifiedMarket[]> {
        const rawOutcomes = await this.fetcher.fetchRawMarkets(params);
        return rawOutcomes
            .map(r => this.normalizer.normalizeMarket(r))
            .filter((m): m is UnifiedMarket => m !== null);
    }

    protected async fetchEventsImpl(
        params: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        // Venue does not expose a series concept; honoring `params.series` by returning [] rather than ignoring the filter.
        if (params.series !== undefined) {
            return [];
        }

        const [rawQuestions, meta, mids, volumeMap] = await Promise.all([
            this.fetcher.fetchRawEvents(params),
            this.fetcher.fetchOutcomeMeta(),
            this.fetcher.fetchAllMids(),
            this.fetcher.fetchOutcomeVolumeMap(),
        ]);

        return rawQuestions
            .map(q => this.normalizer.normalizeEventWithMarkets(q, meta, mids, volumeMap))
            .filter((e): e is UnifiedEvent => e !== null);
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(outcomeId, _params);
        outcomeId = resolved.outcomeId;
        _params = resolved.params;
        const raw = await this.fetcher.fetchRawOrderBook(outcomeId);
        return this.normalizer.normalizeOrderBook(raw, outcomeId);
    }

    // ponytail: Hyperliquid has no native batch order-book endpoint; loop client-side.
    // Add a concurrency cap if rate limits start biting in practice.
    async fetchOrderBooks(outcomeIds: string[]): Promise<Record<string, OrderBook>> {
        const entries = await Promise.all(
            outcomeIds.map(async id => [id, await this.fetchOrderBook(id)] as const),
        );
        return Object.fromEntries(entries);
    }

    async fetchOHLCV(outcomeId: string, params: OHLCVParams = { resolution: '1h' }): Promise<PriceCandle[]> {
        const raw = await this.fetcher.fetchRawOHLCV(outcomeId, params);
        return this.normalizer.normalizeOHLCV(raw, params);
    }

    async fetchTrades(outcomeId: string, params?: TradesParams): Promise<Trade[]> {
        const raw = await this.fetcher.fetchRawTrades(outcomeId, params || {});
        return raw.map((r, i) => this.normalizer.normalizeTrade(r, i));
    }

    // -------------------------------------------------------------------------
    // User Data
    // -------------------------------------------------------------------------

    async fetchBalance(): Promise<Balance[]> {
        const wallet = this.requireWallet();
        const raw = await this.fetcher.fetchRawUserState(wallet);
        return this.normalizer.normalizeBalance(raw);
    }

    async fetchPositions(): Promise<Position[]> {
        const wallet = this.requireWallet();
        const raw = await this.fetcher.fetchRawUserState(wallet);
        return raw.assetPositions
            .filter(ap => ap.position.coin.startsWith('#'))
            .map(ap => this.normalizer.normalizePosition(ap.position));
    }

    async fetchOpenOrders(): Promise<Order[]> {
        const wallet = this.requireWallet();
        const raw = await this.fetcher.fetchRawOpenOrders(wallet);
        return raw
            .filter(o => o.coin.startsWith('#'))
            .map(o => this.normalizer.normalizeOpenOrder(o));
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const wallet = this.requireWallet();
        const raw = await this.fetcher.fetchRawUserFills(wallet);
        return raw
            .filter(f => f.coin.startsWith('#'))
            .map((f, i) => this.normalizer.normalizeUserTrade(f, i));
    }

    // ponytail: HL exposes no "closed orders" endpoint, only userFills + openOrders.
    // Synthesize closed orders as: oids seen in fills that are not currently open.
    // Caveat — this surfaces *filled* orders, not *cancelled-with-no-fills* (HL drops those from public history).
    async fetchClosedOrders(): Promise<Order[]> {
        const wallet = this.requireWallet();
        const [rawFills, rawOpen] = await Promise.all([
            this.fetcher.fetchRawUserFills(wallet),
            this.fetcher.fetchRawOpenOrders(wallet),
        ]);
        const openOids = new Set(rawOpen.map(o => o.oid));
        const byOid = new Map<number, typeof rawFills>();
        for (const f of rawFills) {
            if (!f.coin.startsWith('#')) continue;
            if (openOids.has(f.oid)) continue;
            const list = byOid.get(f.oid) ?? [];
            list.push(f);
            byOid.set(f.oid, list);
        }
        return [...byOid.values()].map(fills => this.normalizer.synthesizeClosedOrder(fills));
    }

    async fetchAllOrders(): Promise<Order[]> {
        const [open, closed] = await Promise.all([
            this.fetchOpenOrders(),
            this.fetchClosedOrders(),
        ]);
        return [...open, ...closed];
    }

    // -------------------------------------------------------------------------
    // Trading (EIP-712 signing required)
    // -------------------------------------------------------------------------

    async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        const assetId = parseInt(params.outcomeId, 10);

        // Key order matters for msgpack hash: a, b, p, s, r, t, c
        const orderWire: Record<string, unknown> = {
            a: assetId,
            b: params.side === 'buy',
            p: params.price !== undefined ? floatToWire(params.price) : '0.5',
            s: floatToWire(params.amount),
            r: false,
            t: params.type === 'market'
                ? { limit: { tif: 'Ioc' } }
                : { limit: { tif: 'Gtc' } },
        };

        // Key order matters for msgpack hash: type, orders, grouping
        const action: Record<string, unknown> = {
            type: 'order',
            orders: [orderWire],
            grouping: 'na',
        };

        return {
            exchange: this.name,
            params,
            raw: action,
        };
    }

    async submitOrder(built: BuiltOrder): Promise<Order> {
        const auth = this.requireAuth();
        const action = built.raw as Record<string, unknown>;

        try {
            const requestBody = await auth.signExchangeRequest(action);

            const response = await this.http.post(
                `${this.config.baseUrl}/exchange`,
                requestBody,
            );

            const data = response.data;

            if (data.status === 'err') {
                throw hyperliquidErrorMapper.mapError(
                    new Error(data.response || 'Order submission failed'),
                );
            }

            const resting = data.response?.data?.statuses?.[0];
            return {
                id: resting?.resting?.oid ? String(resting.resting.oid) : 'unknown',
                marketId: built.params.marketId,
                outcomeId: built.params.outcomeId,
                side: built.params.side,
                type: built.params.type,
                price: built.params.price,
                amount: built.params.amount,
                status: resting?.resting ? 'open' : 'filled',
                filled: resting?.filled?.totalSz ? parseFloat(resting.filled.totalSz) : 0,
                remaining: built.params.amount - (resting?.filled?.totalSz ? parseFloat(resting.filled.totalSz) : 0),
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw hyperliquidErrorMapper.mapError(error);
        }
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const built = await this.buildOrder(params);
        return this.submitOrder(built);
    }

    async cancelOrder(orderId: string): Promise<Order> {
        const auth = this.requireAuth();

        // Key order matters for msgpack hash: type, cancels
        // Each cancel entry: a (asset), o (order id)
        const action: Record<string, unknown> = {
            type: 'cancel',
            cancels: [{ a: 0, o: parseInt(orderId, 10) }],
        };

        try {
            const requestBody = await auth.signExchangeRequest(action);

            const response = await this.http.post(
                `${this.config.baseUrl}/exchange`,
                requestBody,
            );

            const data = response.data;

            if (data.status === 'err') {
                throw new Error(data.response || 'Cancel failed');
            }

            return {
                id: orderId,
                marketId: '',
                outcomeId: '',
                side: 'buy',
                type: 'limit',
                amount: 0,
                status: 'canceled',
                filled: 0,
                remaining: 0,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw hyperliquidErrorMapper.mapError(error);
        }
    }

    async close(): Promise<void> {
        // No persistent connections to clean up
    }
}
