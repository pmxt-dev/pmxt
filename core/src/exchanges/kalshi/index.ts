import {
    EventFetchParams,
    ExchangeCredentials,
    HistoryFilterParams,
    MarketFilterParams,
    MyTradesParams,
    OHLCVParams,
    OrderHistoryParams,
    PredictionMarketExchange,
    SeriesFetchParams,
    TradesParams,
} from '../../BaseExchange';
import { AuthenticationError } from '../../errors';
import { validateTradesLimit } from '../../utils/validation';
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
import { logger } from '../../utils/logger';
import { FetcherContext } from '../interfaces';
import { kalshiApiSpec } from './api';
import { KalshiAuth } from './auth';
import { getKalshiConfig, KALSHI_PATHS, KalshiApiConfig } from './config';
import { kalshiErrorMapper } from './errors';
import { KalshiFetcher } from './fetcher';
import { KalshiNormalizer, sortRawEvents } from './normalizer';
import { KalshiWebSocket, KalshiWebSocketConfig } from './websocket';

// Re-export for external use
export type { KalshiWebSocketConfig };

export interface KalshiExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: KalshiWebSocketConfig;
}

/** @internal */
export interface KalshiInternalOptions extends KalshiExchangeOptions {
    demoMode?: boolean;
}

export class KalshiExchange extends PredictionMarketExchange {
    private auth?: KalshiAuth;
    private wsConfig?: KalshiWebSocketConfig;
    private config: KalshiApiConfig;
    private readonly fetcher: KalshiFetcher;
    private readonly normalizer: KalshiNormalizer;

    constructor(options?: ExchangeCredentials | KalshiExchangeOptions) {
        let credentials: ExchangeCredentials | undefined;
        let wsConfig: KalshiWebSocketConfig | undefined;
        let demoMode = false;

        if (options && 'credentials' in options) {
            credentials = options.credentials;
            wsConfig = options.websocket;
            demoMode = (options as KalshiInternalOptions).demoMode || false;
        } else {
            credentials = options as ExchangeCredentials | undefined;
        }

        super(credentials);
        this.rateLimit = 100;
        this.wsConfig = wsConfig;
        this.config = getKalshiConfig(demoMode, credentials?.baseUrl);

        if (credentials?.apiKey && credentials?.privateKey) {
            this.auth = new KalshiAuth(credentials);
        }

        const descriptor = parseOpenApiSpec(
            kalshiApiSpec,
            this.config.apiUrl + KALSHI_PATHS.TRADE_API,
        );
        this.defineImplicitApi(descriptor);

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => ({}),
        };

        this.fetcher = new KalshiFetcher(ctx);
        this.normalizer = new KalshiNormalizer();
    }

    get name(): string {
        return 'Kalshi';
    }

    // ----------------------------------------------------------------------------
    // Implicit API Auth & Error Mapping
    // ----------------------------------------------------------------------------

    protected override sign(
        method: string,
        path: string,
        _params: Record<string, any>,
    ): Record<string, string> {
        const auth = this.ensureAuth();
        return auth.getHeaders(method, '/trade-api/v2' + path);
    }

    protected override mapImplicitApiError(error: any): any {
        throw kalshiErrorMapper.mapError(error);
    }

    private ensureAuth(): KalshiAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize KalshiExchange with credentials (apiKey and privateKey).',
                'Kalshi',
            );
        }
        return this.auth;
    }

    // ----------------------------------------------------------------------------
    // Market Data  (fetcher -> normalizer)
    // ----------------------------------------------------------------------------

    protected async fetchMarketsImpl(
        params?: MarketFilterParams,
    ): Promise<UnifiedMarket[]> {
        const rawEvents = await this.fetcher.fetchRawMarkets(params);

        const allMarkets: UnifiedMarket[] = [];
        for (const event of rawEvents) {
            const markets = this.normalizer.normalizeMarketsFromEvent(event);
            allMarkets.push(...markets);
        }

        // Query-based search (client-side filtering)
        if (params?.query) {
            const lowerQuery = params.query.toLowerCase();
            const searchIn = params?.searchIn || 'title';
            const filtered = allMarkets.filter((market) => {
                const titleMatch = (market.title || '').toLowerCase().includes(lowerQuery);
                const descMatch = (market.description || '').toLowerCase().includes(lowerQuery);
                if (searchIn === 'title') return titleMatch;
                if (searchIn === 'description') return descMatch;
                return titleMatch || descMatch;
            });
            return filtered.slice(0, params?.limit || 250000);
        }

        // Client-side sort
        if (params?.sort === 'volume') {
            allMarkets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (params?.sort === 'liquidity') {
            allMarkets.sort((a, b) => b.liquidity - a.liquidity);
        }

        const offset = params?.offset || 0;
        const limit = params?.limit || 250000;
        return allMarkets.slice(offset, offset + limit);
    }

    protected async fetchEventsImpl(
        params: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        const rawEvents = await this.fetcher.fetchRawEvents(params);
        const limit = params?.limit || 250000;
        const query = (params?.query || '').toLowerCase();

        const filtered = query
            ? rawEvents.filter((event) => (event.title || '').toLowerCase().includes(query))
            : rawEvents;

        const sort = params?.sort || 'volume';
        const sorted = sortRawEvents(filtered, sort);

        return sorted
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null)
            .slice(0, limit);
    }

    protected async fetchSeriesImpl(params: SeriesFetchParams): Promise<UnifiedSeries[]> {
        const rawList = await this.fetcher.fetchRawSeriesList();

        // If a specific series id is requested, fetch its events and attach them.
        // We still iterate the full list so filters apply uniformly.
        let eventsById: Map<string, UnifiedEvent[]> | null = null;
        if (params.id) {
            const rawEvents = await this.fetcher.fetchRawEvents({ series: params.id });
            const normalizedEvents = rawEvents
                .map((raw) => this.normalizer.normalizeEvent(raw))
                .filter((e): e is UnifiedEvent => e !== null);
            eventsById = new Map([[params.id, normalizedEvents]]);
        }

        const normalized: UnifiedSeries[] = rawList.map((raw) => {
            const events = eventsById?.get(raw.ticker);
            return this.normalizer.normalizeSeries(raw, events);
        });

        // Client-side filters
        let filtered = normalized;

        if (params.id) {
            filtered = filtered.filter((s) => s.id === params.id);
        } else if (params.slug) {
            filtered = filtered.filter((s) => s.ticker === params.slug || s.slug === params.slug);
        }

        if (params.query) {
            const lowerQuery = params.query.toLowerCase();
            filtered = filtered.filter((s) => s.title.toLowerCase().includes(lowerQuery));
        }

        if (params.recurrence) {
            filtered = filtered.filter((s) => s.recurrence === params.recurrence);
        }

        return filtered;
    }

    /**
     * Fetch Kalshi's venue-native per-event metadata payload.
     *
     * This surfaces Kalshi's `GET /events/{event_ticker}/metadata` endpoint,
     * which is distinct from the normalized `fetchEvent` response.
     */
    async fetchEventMetadata(eventTicker: string): Promise<Record<string, unknown>> {
        return this.fetcher.fetchRawEventMetadata(eventTicker);
    }

    async fetchEventsPage(
        params: EventFetchParams = {},
    ): Promise<{ events: UnifiedEvent[]; cursor: string | null; nextCursor: string | null }> {
        const page = await this.fetcher.fetchRawEventPage(params);
        const query = (params?.query || '').toLowerCase();

        const filtered = query
            ? page.events.filter((event) => (event.title || '').toLowerCase().includes(query))
            : page.events;

        const events = filtered
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null);

        return {
            events,
            cursor: page.cursor || null,
            nextCursor: page.cursor || null,
        };
    }

    async fetchOHLCV(
        outcomeId: string,
        params: OHLCVParams,
    ): Promise<PriceCandle[]> {
        const rawCandles = await this.fetcher.fetchRawOHLCV(outcomeId, params);
        return this.normalizer.normalizeOHLCV(rawCandles, params);
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(outcomeId, _params);
        outcomeId = resolved.outcomeId;
        _params = resolved.params;
        const raw = await this.fetcher.fetchRawOrderBook(outcomeId);
        return this.normalizer.normalizeOrderBook(raw, outcomeId);
    }

    async fetchOrderBooks(outcomeIds: string[]): Promise<Record<string, OrderBook>> {
        const raw = await this.fetcher.fetchRawOrderBooks(outcomeIds);
        const byTicker = new Map(raw.map(ob => [ob.ticker, ob]));
        const response: Record<string, OrderBook> = {};
        outcomeIds.forEach((outcomeId) => {
            const ob = byTicker.get(outcomeId.replace(/-NO$/, ''));
            if (ob) response[outcomeId] = this.normalizer.normalizeOrderBook(ob, outcomeId);
        });
        return response;
    }

    async fetchTrades(
        outcomeId: string,
        params: TradesParams | HistoryFilterParams,
    ): Promise<Trade[]> {
        validateTradesLimit(params.limit);
        if ('resolution' in params && params.resolution !== undefined) {
            logger.warn(
                'The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.',
            );
        }
        const rawTrades = await this.fetcher.fetchRawTrades(outcomeId, params);
        return rawTrades.map((raw, i) => this.normalizer.normalizeTrade(raw, i));
    }

    // ----------------------------------------------------------------------------
    // User Data  (fetcher -> normalizer)
    // ----------------------------------------------------------------------------

    async fetchBalance(): Promise<Balance[]> {
        const raw = await this.fetcher.fetchRawBalance();
        return this.normalizer.normalizeBalance(raw);
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const rawFills = await this.fetcher.fetchRawMyTrades(params || {});
        return rawFills.map((raw, i) => this.normalizer.normalizeUserTrade(raw, i));
    }

    async fetchPositions(): Promise<Position[]> {
        const rawPositions = await this.fetcher.fetchRawPositions();
        return rawPositions.map((raw) => this.normalizer.normalizePosition(raw));
    }

    async fetchClosedOrders(params?: OrderHistoryParams): Promise<Order[]> {
        const queryParams: Record<string, any> = {};
        if (params?.marketId) queryParams.ticker = params.marketId;
        if (params?.until) queryParams.max_ts = Math.floor(params.until.getTime() / 1000);
        if (params?.limit) queryParams.limit = params.limit;
        if (params?.cursor) queryParams.cursor = params.cursor;

        const rawOrders = await this.fetcher.fetchRawHistoricalOrders(queryParams);
        return rawOrders.map((o) => this.normalizer.normalizeOrder(o));
    }

    async fetchAllOrders(params?: OrderHistoryParams): Promise<Order[]> {
        const queryParams: Record<string, any> = {};
        if (params?.marketId) queryParams.ticker = params.marketId;
        if (params?.since) queryParams.min_ts = Math.floor(params.since.getTime() / 1000);
        if (params?.until) queryParams.max_ts = Math.floor(params.until.getTime() / 1000);
        if (params?.limit) queryParams.limit = params.limit;

        const historicalParams = { ...queryParams };
        delete historicalParams.min_ts;

        const [liveOrders, historicalOrders] = await Promise.all([
            this.fetcher.fetchRawOrders(queryParams),
            this.fetcher.fetchRawHistoricalOrders(historicalParams),
        ]);

        const seen = new Set<string>();
        const all: Order[] = [];
        for (const o of [...liveOrders, ...historicalOrders]) {
            if (!seen.has(o.order_id)) {
                seen.add(o.order_id);
                all.push(this.normalizer.normalizeOrder(o));
            }
        }
        return all.sort((a, b) => b.timestamp - a.timestamp);
    }

    // ----------------------------------------------------------------------------
    // Trading
    // ----------------------------------------------------------------------------

    async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        const isYesSide = params.side === 'buy';
        const body: Record<string, any> = {
            ticker: params.marketId,
            client_order_id: `pmxt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            side: isYesSide ? 'yes' : 'no',
            action: params.side === 'buy' ? 'buy' : 'sell',
            count: params.amount,
            type: params.type === 'limit' ? 'limit' : 'market',
        };

        if (params.price) {
            const priceInCents = Math.round(params.price * 100);
            if (isYesSide) {
                body.yes_price = priceInCents;
            } else {
                body.no_price = priceInCents;
            }
        }

        return { exchange: this.name, params, raw: body };
    }

    async submitOrder(built: BuiltOrder): Promise<Order> {
        const data = await this.callApi('CreateOrder', built.raw as Record<string, any>);
        return this.normalizer.normalizeOrder(data.order);
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const built = await this.buildOrder(params);
        return this.submitOrder(built);
    }

    async cancelOrder(orderId: string): Promise<Order> {
        const data = await this.callApi('CancelOrder', { order_id: orderId });
        const order = data.order;
        return {
            id: order.order_id,
            marketId: order.ticker,
            outcomeId: order.ticker,
            side: order.side === 'yes' ? 'buy' : 'sell',
            type: 'limit',
            amount: order.count,
            status: 'canceled',
            filled: order.count - (order.remaining_count || 0),
            remaining: 0,
            timestamp: new Date(order.created_time).getTime(),
        };
    }

    async fetchOrder(orderId: string): Promise<Order> {
        const data = await this.callApi('GetOrder', { order_id: orderId });
        return this.normalizer.normalizeOrder(data.order);
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        const queryParams: Record<string, any> = { status: 'resting' };
        if (marketId) queryParams.ticker = marketId;
        const rawOrders = await this.fetcher.fetchRawOrders(queryParams);
        return rawOrders.map((o) => this.normalizer.normalizeOrder(o));
    }

    // ----------------------------------------------------------------------------
    // WebSocket
    // ----------------------------------------------------------------------------

    private ws?: KalshiWebSocket;

    async watchOrderBook(outcomeId: string, limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        const auth = this.ensureAuth();
        if (!this.ws) {
            const wsConfigWithUrl: KalshiWebSocketConfig = {
                ...this.wsConfig,
                wsUrl: this.wsConfig?.wsUrl || this.config.wsUrl,
            };
            this.ws = new KalshiWebSocket(auth, wsConfigWithUrl);
        }
        const marketTicker = outcomeId.replace(/-NO$/, '');
        return this.ws.watchOrderBook(marketTicker);
    }

    async watchOrderBooks(outcomeIds: string[], limit?: number, _params: Record<string, any> = {}): Promise<Record<string, OrderBook>> {
        const auth = this.ensureAuth();
        if (!this.ws) {
            const wsConfigWithUrl: KalshiWebSocketConfig = {
                ...this.wsConfig,
                wsUrl: this.wsConfig?.wsUrl || this.config.wsUrl,
            };
            this.ws = new KalshiWebSocket(auth, wsConfigWithUrl);
        }
        const marketTickers = outcomeIds.map((oid) => oid.replace(/-NO$/, ''));
        return this.ws.watchOrderBooks(marketTickers);
    }

    async watchTrades(
        outcomeId: string,
        address?: string,
        since?: number,
        limit?: number,
    ): Promise<Trade[]> {
        const auth = this.ensureAuth();
        if (!this.ws) {
            const wsConfigWithUrl: KalshiWebSocketConfig = {
                ...this.wsConfig,
                wsUrl: this.wsConfig?.wsUrl || this.config.wsUrl,
            };
            this.ws = new KalshiWebSocket(auth, wsConfigWithUrl);
        }
        const marketTicker = outcomeId.replace(/-NO$/, '');
        return this.ws.watchTrades(marketTicker);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }
}
