import {
    PredictionMarketExchange,
    MarketFilterParams,
    OHLCVParams,
    ExchangeCredentials,
    EventFetchParams,
    SeriesFetchParams,
    MyTradesParams,
    OrderHistoryParams,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    UnifiedSeries,
    PriceCandle,
    OrderBook,
    Trade,
    Order,
    Position,
    UserTrade,
    CreateOrderParams,
    BuiltOrder,
} from '../../types';
// The @opinion-labs/opinion-clob-sdk is ESM-only. We use dynamic import()
// to avoid breaking CJS consumers at require-time.
type OpinionSdk = typeof import('@opinion-labs/opinion-clob-sdk');

let sdkPromise: Promise<OpinionSdk> | undefined;

function loadSdk(): Promise<OpinionSdk> {
    if (!sdkPromise) {
        sdkPromise = import('@opinion-labs/opinion-clob-sdk');
    }
    return sdkPromise;
}
import { OpinionAuth } from './auth';
import { OpinionWebSocket, OpinionWebSocketConfig } from './websocket';
import { opinionErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { parseOpenApiSpec } from '../../utils/openapi';
import { opinionApiSpec } from './api';
import { DEFAULT_OPINION_API_URL } from './config';
import { OpinionFetcher } from './fetcher';
import { OpinionNormalizer } from './normalizer';
import { FetcherContext } from '../interfaces';

// Re-export for external use
export type { OpinionWebSocketConfig };

export interface OpinionExchangeOptions {
    credentials?: ExchangeCredentials;
    walletAddress?: string;
    websocket?: OpinionWebSocketConfig;
}

export class OpinionExchange extends PredictionMarketExchange {
    private auth?: OpinionAuth;
    private readonly walletAddress?: string;
    private wsConfig?: OpinionWebSocketConfig;
    private readonly fetcher: OpinionFetcher;
    private readonly normalizer: OpinionNormalizer;
    private ws?: OpinionWebSocket;

    // Maps outcomeId (token ID) → numeric marketId for WebSocket subscriptions
    private readonly outcomeToMarketId = new Map<string, number>();

    protected override readonly capabilityOverrides = {
        fetchSeries: 'emulated' as const,
    };

    constructor(options?: ExchangeCredentials | OpinionExchangeOptions) {
        let credentials: ExchangeCredentials | undefined;
        let walletAddress: string | undefined;
        let wsConfig: OpinionWebSocketConfig | undefined;

        if (options && 'credentials' in options) {
            credentials = options.credentials;
            walletAddress = options.walletAddress;
            wsConfig = options.websocket;
        } else {
            credentials = options as ExchangeCredentials | undefined;
        }

        super(credentials);
        this.rateLimit = 100;
        this.walletAddress = walletAddress;
        this.wsConfig = wsConfig;

        if (credentials?.apiKey) {
            this.auth = new OpinionAuth(credentials);
        }

        const opinionBaseUrl =
            credentials?.baseUrl || process.env.OPINION_BASE_URL || DEFAULT_OPINION_API_URL;
        const descriptor = parseOpenApiSpec(opinionApiSpec, opinionBaseUrl);
        this.defineImplicitApi(descriptor);

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => this.auth?.getHeaders() ?? {},
        };

        this.fetcher = new OpinionFetcher(ctx, opinionBaseUrl);
        this.normalizer = new OpinionNormalizer();
    }

    get name(): string {
        return 'Opinion';
    }

    // -------------------------------------------------------------------------
    // Implicit API Auth & Error Mapping
    // -------------------------------------------------------------------------

    protected override sign(
        _method: string,
        _path: string,
        _params: Record<string, any>,
    ): Record<string, string> {
        if (!this.auth) {
            throw new AuthenticationError(
                'This operation requires authentication. ' +
                'Initialize OpinionExchange with credentials (apiKey).',
                'Opinion',
            );
        }
        return this.auth.getHeaders();
    }

    protected override mapImplicitApiError(error: any): any {
        throw opinionErrorMapper.mapError(error);
    }

    // -------------------------------------------------------------------------
    // Market Data (fetcher -> normalizer)
    // -------------------------------------------------------------------------

    protected async fetchMarketsImpl(
        params?: MarketFilterParams,
    ): Promise<UnifiedMarket[]> {
        const rawMarkets = await this.fetcher.fetchRawMarkets(params);

        const allMarkets: UnifiedMarket[] = [];
        for (const raw of rawMarkets) {
            const markets = this.normalizer.normalizeMarketsFromEvent(raw);
            for (const market of markets) {
                for (const outcome of market.outcomes) {
                    if (outcome.outcomeId) {
                        this.outcomeToMarketId.set(
                            outcome.outcomeId,
                            Number(market.marketId),
                        );
                    }
                }
            }
            allMarkets.push(...markets);
        }

        if (params?.query) {
            const lowerQuery = params.query.toLowerCase();
            const searchIn = params.searchIn || 'title';
            const filtered = allMarkets.filter((market) => {
                const titleMatch = (market.title || '').toLowerCase().includes(lowerQuery);
                const descMatch = (market.description || '').toLowerCase().includes(lowerQuery);
                if (searchIn === 'title') return titleMatch;
                if (searchIn === 'description') return descMatch;
                return titleMatch || descMatch;
            });
            await this.enrichPrices(filtered);
            return filtered.slice(0, params.limit || 250000);
        }

        if (params?.sort === 'volume') {
            allMarkets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (params?.sort === 'liquidity') {
            allMarkets.sort((a, b) => b.liquidity - a.liquidity);
        }

        const offset = params?.offset || 0;
        const limit = params?.limit || 250000;
        const sliced = allMarkets.slice(offset, offset + limit);
        await this.enrichPrices(sliced);
        return sliced;
    }

    protected async fetchEventsImpl(
        params: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        const rawEvents = await this.fetcher.fetchRawEvents(params);
        const limit = params.limit || 250000;
        const query = (params.query || '').toLowerCase();

        let filtered = query
            ? rawEvents.filter((raw) => (raw.marketTitle || '').toLowerCase().includes(query))
            : rawEvents;

        // Client-side series filter: keep only events whose collection symbol
        // matches the requested series identifier.
        if (params.series) {
            const seriesId = params.series;
            filtered = filtered.filter(
                (raw) => raw.collection?.symbol === seriesId,
            );
        }

        const events = filtered
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null)
            .slice(0, limit);

        const allMarkets = events.flatMap((e) => e.markets);
        await this.enrichPrices(allMarkets);

        return events;
    }

    protected async fetchSeriesImpl(
        params: SeriesFetchParams,
    ): Promise<UnifiedSeries[]> {
        // Opinion has no dedicated /series endpoint. Derive the catalog by
        // fetching all markets and grouping by collection.symbol.
        const rawMarkets = await this.fetcher.fetchRawMarkets();

        // Build a map from collection.symbol -> { collection, rawEvents[] }
        const seriesMap = new Map<string, {
            collection: import('./fetcher').OpinionRawCollection;
            raws: import('./fetcher').OpinionRawMarket[];
        }>();

        for (const raw of rawMarkets) {
            if (!raw.collection) continue;
            const sym = raw.collection.symbol;
            const existing = seriesMap.get(sym);
            if (existing) {
                existing.raws.push(raw);
            } else {
                seriesMap.set(sym, { collection: raw.collection, raws: [raw] });
            }
        }

        let entries = Array.from(seriesMap.values());

        // Apply params.id filter
        if (params.id) {
            entries = entries.filter((e) => e.collection.symbol === params.id);
        }

        // Apply params.query filter (title match)
        if (params.query) {
            const lowerQuery = params.query.toLowerCase();
            entries = entries.filter((e) =>
                e.collection.title.toLowerCase().includes(lowerQuery),
            );
        }

        // Apply params.recurrence filter
        if (params.recurrence) {
            const recurrence = params.recurrence;
            entries = entries.filter((e) => e.collection.frequency === recurrence);
        }

        return entries.map((e) => {
            let events: UnifiedEvent[] | undefined;

            // When fetching by id, populate the events field.
            if (params.id) {
                events = e.raws
                    .map((raw) => this.normalizer.normalizeEvent(raw))
                    .filter((ev): ev is UnifiedEvent => ev !== null);
            }

            return this.normalizer.normalizeSeries(e.collection, events);
        });
    }

    async fetchOHLCV(
        outcomeId: string,
        params: OHLCVParams,
    ): Promise<PriceCandle[]> {
        const rawPoints = await this.fetcher.fetchRawOHLCV(outcomeId, params);
        return this.normalizer.normalizeOHLCV({ history: rawPoints }, params);
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(outcomeId, _params);
        outcomeId = resolved.outcomeId;
        _params = resolved.params;
        const raw = await this.fetcher.fetchRawOrderBook(outcomeId);
        return this.normalizer.normalizeOrderBook(raw, outcomeId);
    }

    // -------------------------------------------------------------------------
    // User Data (fetcher -> normalizer)
    // -------------------------------------------------------------------------

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const wallet = this.requireWalletAddress();
        const rawTrades = await this.fetcher.fetchRawMyTrades(params || {}, wallet);
        return rawTrades.map((raw, i) => this.normalizer.normalizeUserTrade(raw, i));
    }

    async fetchPositions(): Promise<Position[]> {
        const wallet = this.requireWalletAddress();
        const rawPositions = await this.fetcher.fetchRawPositions(wallet);
        return rawPositions.map((raw) => this.normalizer.normalizePosition(raw));
    }

    async fetchOrder(orderId: string): Promise<Order> {
        const raw = await this.fetcher.fetchRawOrderById(orderId);
        if (!raw) {
            throw new Error(`Order not found: ${orderId}`);
        }
        return this.normalizer.normalizeOrder(raw);
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        const queryParams: { marketId?: number; status: string } = { status: '1' };
        if (marketId) {
            queryParams.marketId = Number(marketId);
        }
        const rawOrders = await this.fetcher.fetchRawOrders(queryParams);
        return rawOrders.map((o) => this.normalizer.normalizeOrder(o));
    }

    async fetchClosedOrders(params?: OrderHistoryParams): Promise<Order[]> {
        const queryParams: { marketId?: number; status: string; limit?: number } = {
            status: '2,3,4,5',
        };
        if (params?.marketId) {
            queryParams.marketId = Number(params.marketId);
        }
        if (params?.limit) {
            queryParams.limit = params.limit;
        }
        const rawOrders = await this.fetcher.fetchRawOrders(queryParams);
        return rawOrders.map((o) => this.normalizer.normalizeOrder(o));
    }

    async fetchAllOrders(params?: OrderHistoryParams): Promise<Order[]> {
        const queryParams: { marketId?: number; limit?: number } = {};
        if (params?.marketId) {
            queryParams.marketId = Number(params.marketId);
        }
        if (params?.limit) {
            queryParams.limit = params.limit;
        }
        const rawOrders = await this.fetcher.fetchRawOrders(queryParams);
        return rawOrders.map((o) => this.normalizer.normalizeOrder(o));
    }

    // -------------------------------------------------------------------------
    // Trading (CLOB SDK)
    // -------------------------------------------------------------------------

    async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        try {
            const auth = this.ensureTradeAuth();
            await auth.getClobClient(); // validate client can be created

            const sdk = await loadSdk();
            const side = params.side === 'buy' ? sdk.OrderSide.BUY : sdk.OrderSide.SELL;
            const orderType = params.type === 'market'
                ? sdk.OrderType.MARKET_ORDER
                : sdk.OrderType.LIMIT_ORDER;

            const price = params.type === 'market' ? '0' : String(params.price ?? 0);

            const orderData: Record<string, any> = {
                marketId: Number(params.marketId),
                tokenId: params.outcomeId,
                side,
                orderType,
                price,
            };

            if (side === sdk.OrderSide.BUY) {
                orderData.makerAmountInQuoteToken = String(params.amount);
            } else {
                orderData.makerAmountInBaseToken = String(params.amount);
            }

            return {
                exchange: 'Opinion',
                params,
                raw: orderData,
            };
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    async submitOrder(built: BuiltOrder): Promise<Order> {
        try {
            const auth = this.ensureTradeAuth();
            await auth.ensureTradingEnabled();

            const client = await auth.getClobClient();
            const response = await client.placeOrder(built.raw);

            const errorCode = response.code ?? response.errno;
            const errorMessage = response.msg || response.errmsg || 'Unknown error';
            if (errorCode !== 0) {
                throw new Error(
                    `Order submission failed: ${errorMessage} (code: ${errorCode ?? 'unknown'})`,
                );
            }

            const result = response.result as Record<string, any>;
            const orderId = result?.orderId ?? result?.order_id ?? 'unknown';

            return {
                id: String(orderId),
                marketId: built.params.marketId,
                outcomeId: built.params.outcomeId,
                side: built.params.side,
                type: built.params.type,
                price: built.params.price,
                amount: built.params.amount,
                status: 'open',
                filled: 0,
                remaining: built.params.amount,
                fee: built.params.fee,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const built = await this.buildOrder(params);
        return this.submitOrder(built);
    }

    async cancelOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureTradeAuth();
            const client = await auth.getClobClient();

            const response = await client.cancelOrder(orderId);

            const errorCode = response.code ?? response.errno;
            const errorMessage = response.msg || response.errmsg || 'Unknown error';
            if (errorCode !== 0) {
                throw new Error(
                    `Order cancellation failed: ${errorMessage} (code: ${errorCode ?? 'unknown'})`,
                );
            }

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
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -------------------------------------------------------------------------
    // WebSocket
    // -------------------------------------------------------------------------

    async watchOrderBook(outcomeId: string, _limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        const ws = this.ensureWebSocket();
        const marketId = this.resolveMarketId(outcomeId);
        return ws.watchOrderBook(marketId);
    }

    async watchTrades(outcomeId: string): Promise<Trade[]> {
        const ws = this.ensureWebSocket();
        const marketId = this.resolveMarketId(outcomeId);
        return ws.watchTrades(marketId);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Resolve an ID (which may be a token/outcome ID or a numeric market ID string)
     * to the numeric market ID used by the Opinion WebSocket API.
     */
    private resolveMarketId(id: string): number {
        // Check if it's a known outcome/token ID
        const mapped = this.outcomeToMarketId.get(id);
        if (mapped !== undefined) return mapped;

        // Fall back to parsing as a numeric market ID
        const parsed = Number(id);
        if (!isNaN(parsed) && parsed > 0) return parsed;

        throw new Error(
            `Cannot resolve market ID for "${id}". ` +
            'Call fetchMarkets() first to populate the outcome-to-market mapping, ' +
            'or pass a numeric market ID.',
        );
    }

    private ensureTradeAuth(): OpinionAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading requires authentication. ' +
                'Initialize OpinionExchange with credentials (apiKey, privateKey, funderAddress).',
                'Opinion',
            );
        }
        if (!this.auth.hasTradeCredentials()) {
            throw new AuthenticationError(
                'Trading requires a privateKey and funderAddress. ' +
                'Initialize OpinionExchange with full trading credentials.',
                'Opinion',
            );
        }
        return this.auth;
    }

    private requireWalletAddress(): string {
        if (!this.walletAddress) {
            throw new AuthenticationError(
                'Wallet address is required for this operation. ' +
                'Initialize OpinionExchange with { walletAddress: "0x..." } in options.',
                'Opinion',
            );
        }
        return this.walletAddress;
    }

    private ensureWebSocket(): OpinionWebSocket {
        if (!this.ws) {
            if (!this.auth) {
                throw new AuthenticationError(
                    'WebSocket requires authentication. ' +
                    'Initialize OpinionExchange with credentials (apiKey).',
                    'Opinion',
                );
            }
            this.ws = new OpinionWebSocket(
                this.auth.getWsUrl(),
                this.wsConfig,
            );
        }
        return this.ws;
    }

    private async enrichPrices(markets: UnifiedMarket[]): Promise<void> {
        await this.normalizer.enrichMarketsWithPrices(
            markets,
            (tokenId) => this.fetcher.fetchRawLatestPrice(tokenId),
        );
    }
}
