import {
    PredictionMarketExchange,
    MarketFilterParams,
    EventFetchParams,
    SeriesFetchParams,
    ExchangeCredentials,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    UnifiedSeries,
    OrderBook,
    Trade,
    Order,
    Position,
    CreateOrderParams,
    BuiltOrder,
} from '../../types';
import { AuthenticationError } from '../../errors';
import { getGeminiConfig, GeminiApiConfig } from './config';
import { GeminiFetcher } from './fetcher';
import { GeminiNormalizer } from './normalizer';
import { GeminiAuth } from './auth';
import { geminiErrorMapper } from './errors';
import { FetcherContext } from '../interfaces';
import { GeminiWebSocket, GeminiWebSocketConfig } from './websocket';
import { fromOutcomeId, fromMarketId } from './utils';


export interface GeminiTitanExchangeOptions {
    credentials?: ExchangeCredentials;
    sandbox?: boolean;
}

export class GeminiTitanExchange extends PredictionMarketExchange {
    private readonly config: GeminiApiConfig;
    private readonly fetcher: GeminiFetcher;
    private readonly normalizer: GeminiNormalizer;
    private readonly geminiAuth?: GeminiAuth;
    private geminiWs?: GeminiWebSocket;

    protected override readonly capabilityOverrides = {
        fetchSeries: 'emulated' as const,
    };

    constructor(credentials?: ExchangeCredentials | GeminiTitanExchangeOptions) {
        const opts = credentials && 'credentials' in credentials
            ? credentials as GeminiTitanExchangeOptions
            : { credentials: credentials as ExchangeCredentials | undefined };

        super(opts.credentials);
        this.rateLimit = 200;

        const sandbox = 'sandbox' in (opts as any) ? (opts as GeminiTitanExchangeOptions).sandbox : false;
        this.config = getGeminiConfig(opts.credentials?.baseUrl, sandbox);

        // Initialize auth if apiKey + apiSecret provided (needed for trading)
        if (opts.credentials?.apiKey && opts.credentials?.apiSecret) {
            this.geminiAuth = new GeminiAuth(opts.credentials);
        }

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => ({}),
        };

        this.fetcher = new GeminiFetcher(ctx, this.config.baseUrl, this.geminiAuth);
        this.normalizer = new GeminiNormalizer();
    }

    get name(): string {
        return 'GeminiTitan';
    }

    // -------------------------------------------------------------------------
    // Auth helpers
    // -------------------------------------------------------------------------

    private requireAuth(): GeminiAuth {
        if (!this.geminiAuth) {
            throw new AuthenticationError(
                'This operation requires authentication. ' +
                'Initialize GeminiTitanExchange with credentials including apiKey and apiSecret.',
                'GeminiTitan',
            );
        }
        return this.geminiAuth;
    }

    // -------------------------------------------------------------------------
    // Market Data
    // -------------------------------------------------------------------------

    protected async fetchMarketsImpl(
        params?: MarketFilterParams,
    ): Promise<UnifiedMarket[]> {
        const rawEvents = await this.fetcher.fetchRawMarkets(params);
        const markets: UnifiedMarket[] = [];
        for (const event of rawEvents) {
            const eventMarkets = this.normalizer.normalizeMarketsFromEvent(event);
            markets.push(...eventMarkets);
        }
        return markets;
    }

    protected async fetchEventsImpl(
        params: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        const rawEvents = await this.fetcher.fetchRawEvents(params);

        let filtered = rawEvents;

        // Client-side series filter: keep only events whose series id matches.
        if (params.series) {
            const seriesId = params.series;
            filtered = rawEvents.filter((e) => {
                if (e.series == null) return false;
                const s = e.series as unknown as Record<string, unknown>;
                const id = String(s['id'] ?? s['ticker'] ?? s['symbol'] ?? '');
                return id === seriesId;
            });
        }

        return filtered
            .map(e => this.normalizer.normalizeEventWithMarkets(e))
            .filter((e): e is UnifiedEvent => e !== null);
    }

    protected async fetchSeriesImpl(
        params: SeriesFetchParams,
    ): Promise<UnifiedSeries[]> {
        // Gemini-Titan has no dedicated /series endpoint. Derive the catalog by
        // fetching all events and grouping by the series id in event.series.
        const rawEvents = await this.fetcher.fetchRawEvents({});

        // Build a map from series id -> { rawSeries, rawEvents[] }
        const seriesMap = new Map<string, {
            raw: Record<string, unknown>;
            raws: import('./types').GeminiRawEvent[];
        }>();

        for (const event of rawEvents) {
            if (event.series == null) continue;
            const s = event.series as unknown as Record<string, unknown>;
            const id = String(s['id'] ?? s['ticker'] ?? s['symbol'] ?? '');
            if (!id) continue;

            const existing = seriesMap.get(id);
            if (existing) {
                existing.raws.push(event);
            } else {
                seriesMap.set(id, { raw: s, raws: [event] });
            }
        }

        let entries = Array.from(seriesMap.entries()).map(([id, v]) => ({
            id,
            raw: v.raw,
            raws: v.raws,
        }));

        // Apply params.id filter
        if (params.id) {
            entries = entries.filter((e) => e.id === params.id);
        }

        // Apply params.slug filter (treat slug same as id for Gemini series)
        if (params.slug) {
            const slug = params.slug;
            entries = entries.filter((e) => {
                const rawSlug = e.raw['slug'] != null ? String(e.raw['slug']) : e.id;
                return rawSlug === slug;
            });
        }

        // Apply params.query filter (title match)
        if (params.query) {
            const lowerQuery = params.query.toLowerCase();
            entries = entries.filter((e) => {
                const title = String(e.raw['title'] ?? e.raw['name'] ?? '');
                return title.toLowerCase().includes(lowerQuery);
            });
        }

        // Apply params.recurrence filter
        if (params.recurrence) {
            const recurrence = params.recurrence;
            entries = entries.filter((e) => {
                const freq = e.raw['frequency'] ?? e.raw['recurrence'];
                return freq != null && String(freq) === recurrence;
            });
        }

        return entries.map((e) => {
            let events: UnifiedEvent[] | undefined;

            // When fetching by id, populate the events field.
            if (params.id) {
                events = e.raws
                    .map((raw) => this.normalizer.normalizeEventWithMarkets(raw))
                    .filter((ev): ev is UnifiedEvent => ev !== null);
            }

            return this.normalizer.normalizeSeries(e.raw, events);
        });
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(outcomeId, _params);
        outcomeId = resolved.outcomeId;
        _params = resolved.params;
        const { instrumentSymbol } = fromOutcomeId(outcomeId);
        const raw = await this.fetcher.fetchRawOrderBook(instrumentSymbol);
        if (!raw) {
            return { bids: [], asks: [], timestamp: Date.now() };
        }
        return this.normalizer.normalizeOrderBook(raw, outcomeId);
    }

    // -------------------------------------------------------------------------
    // Trading
    // -------------------------------------------------------------------------

    async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        this.requireAuth();
        const { instrumentSymbol, side } = fromOutcomeId(params.outcomeId);

        const payload: Record<string, unknown> = {
            symbol: instrumentSymbol,
            orderType: 'limit',
            side: params.side,
            quantity: String(params.amount),
            price: params.price !== undefined ? params.price.toFixed(2) : '0.50',
            outcome: side,
            timeInForce: params.type === 'market' ? 'immediate-or-cancel' : 'good-til-cancel',
        };

        return {
            exchange: this.name,
            params,
            raw: payload,
        };
    }

    async submitOrder(built: BuiltOrder): Promise<Order> {
        this.requireAuth();
        const payload = built.raw as Record<string, unknown>;

        try {
            const rawOrder = await this.fetcher.submitRawOrder(payload);
            return this.normalizer.normalizeOrder(rawOrder);
        } catch (error: any) {
            throw geminiErrorMapper.mapError(error);
        }
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const built = await this.buildOrder(params);
        return this.submitOrder(built);
    }

    async cancelOrder(orderId: string): Promise<Order> {
        this.requireAuth();

        try {
            const rawOrder = await this.fetcher.cancelRawOrder(parseInt(orderId, 10));
            return this.normalizer.normalizeOrder(rawOrder);
        } catch (error: any) {
            throw geminiErrorMapper.mapError(error);
        }
    }

    // -------------------------------------------------------------------------
    // User Data
    // -------------------------------------------------------------------------

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        this.requireAuth();
        const symbol = marketId ? fromMarketId(marketId) : undefined;
        const raw = await this.fetcher.fetchRawActiveOrders(symbol);
        return raw.map(o => this.normalizer.normalizeOrder(o));
    }

    async fetchClosedOrders(): Promise<Order[]> {
        this.requireAuth();
        const raw = await this.fetcher.fetchRawOrderHistory();
        return raw.map(o => this.normalizer.normalizeOrder(o));
    }

    async fetchAllOrders(): Promise<Order[]> {
        this.requireAuth();
        const [open, closed] = await Promise.all([
            this.fetchOpenOrders(),
            this.fetchClosedOrders(),
        ]);
        return [...open, ...closed].sort((a, b) => b.timestamp - a.timestamp);
    }

    async fetchPositions(): Promise<Position[]> {
        this.requireAuth();
        const raw = await this.fetcher.fetchRawPositions();
        return raw.map(p => this.normalizer.normalizePosition(p));
    }

    // -------------------------------------------------------------------------
    // WebSocket
    // -------------------------------------------------------------------------

    private ensureWebSocket(): GeminiWebSocket {
        if (!this.geminiWs) {
            this.geminiWs = new GeminiWebSocket(this.geminiAuth, {
                wsUrl: this.config.wsUrl,
            });
        }
        return this.geminiWs;
    }

    async watchOrderBook(outcomeId: string, _limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        const { instrumentSymbol } = fromOutcomeId(outcomeId);
        return this.ensureWebSocket().watchOrderBook(instrumentSymbol);
    }

    async watchTrades(outcomeId: string): Promise<Trade[]> {
        const { instrumentSymbol } = fromOutcomeId(outcomeId);
        return this.ensureWebSocket().watchTrades(instrumentSymbol);
    }

    async close(): Promise<void> {
        if (this.geminiWs) {
            await this.geminiWs.close();
            this.geminiWs = undefined;
        }
    }   
}


export { GeminiFetcher } from './fetcher';
export { GeminiAuth } from './auth';
export { geminiErrorMapper } from './errors';
export * from './types';