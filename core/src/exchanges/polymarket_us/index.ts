/**
 * Polymarket US exchange adapter.
 *
 * Wraps the official `polymarket-us` SDK to expose Polymarket US under the
 * unified PMXT `PredictionMarketExchange` interface.
 *
 * Notes:
 *  - PMXT `marketId` corresponds to the Polymarket US market `slug`.
 *  - Outcomes are encoded as `${slug}:long` and `${slug}:short`.
 *  - Polymarket US books and orders are quoted in long-side prices; helpers
 *    in `./price` perform the side-aware conversion.
 *  - The SDK requires `marketSlug` in the cancel body, but PMXT
 *    `cancelOrder(orderId)` does not. We maintain an in-memory cache mapping
 *    orderId -> marketSlug populated whenever we observe an order.
 */

import {
    PredictionMarketExchange,
    ExchangeCredentials,
    MarketFetchParams,
    EventFetchParams,
    SeriesFetchParams,
    MyTradesParams,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    UnifiedSeries,
    OrderBook,
    Trade,
    UserTrade,
    Order,
    Position,
    Balance,
    CreateOrderParams,
    BuiltOrder,
} from '../../types';
import { AuthenticationError } from '../../errors';
import {
    PolymarketUS as PolymarketUSClient,
    type CreateOrderParams as SdkCreateOrderParams,
    type OrderIntent,
    type OrderType as SdkOrderType,
    type TimeInForce,
} from 'polymarket-us';
import { getPolymarketUSConfig, PolymarketUSConfig } from './config';
import { PolymarketUSNormalizer } from './normalizer';
import { polymarketUSErrorMapper } from './errors';
import { PolymarketUSWebSocket } from './websocket';
import {
    toAmount,
    toLongSidePrice,
    validatePriceBounds,
    roundToTickSize,
} from './price';

export * from './config';
export * from './price';
export * from './errors';
export { PolymarketUSNormalizer } from './normalizer';

export class PolymarketUSExchange extends PredictionMarketExchange {
    private readonly client: PolymarketUSClient;
    private readonly normalizer: PolymarketUSNormalizer;
    private readonly config: PolymarketUSConfig;
    /**
     * Maps PMXT orderId -> Polymarket US marketSlug. Populated whenever we
     * observe an order (create, fetch, list) so that `cancelOrder(orderId)`
     * can supply the SDK-required `marketSlug` body field.
     */
    private readonly orderSlugCache: Map<string, string> = new Map();
    private wsWrapper?: PolymarketUSWebSocket;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);
        this.rateLimit = 20;
        this.config = getPolymarketUSConfig(credentials?.baseUrl);
        this.normalizer = new PolymarketUSNormalizer();
        this.client = new PolymarketUSClient({
            keyId: credentials?.apiKey,
            secretKey: credentials?.privateKey,
            apiBaseUrl: this.config.apiUrl,
            gatewayBaseUrl: this.config.gatewayUrl,
        });
    }

    get name(): string {
        return 'PolymarketUS';
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private requireAuth(): void {
        if (!this.credentials?.apiKey || !this.credentials?.privateKey) {
            throw new AuthenticationError(
                'PolymarketUS requires apiKey (keyId) and privateKey (secretKey) credentials.',
                'PolymarketUS',
            );
        }
    }

    /**
     * Wrap any SDK call so SDK errors get translated to PMXT error classes.
     */
    private async run<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (err) {
            throw polymarketUSErrorMapper.mapError(err);
        }
    }

    private cacheOrder(orderId: string, marketSlug: string): void {
        if (orderId && marketSlug) {
            this.orderSlugCache.set(orderId, marketSlug);
        }
    }

    /**
     * Strip a trailing `:long` or `:short` suffix from a PMXT identifier
     * to recover the bare Polymarket US market slug. If no suffix is
     * present the input is returned unchanged.
     */
    private slugFromId(id: string): string {
        if (id.endsWith(':long')) return id.slice(0, -':long'.length);
        if (id.endsWith(':short')) return id.slice(0, -':short'.length);
        return id;
    }

    // -------------------------------------------------------------------------
    // Markets / Events
    // -------------------------------------------------------------------------

    protected override async fetchMarketsImpl(
        params?: MarketFetchParams,
    ): Promise<UnifiedMarket[]> {
        return this.run(async () => {
            // Direct slug / id / outcomeId lookup
            const directSlug =
                params?.slug ||
                params?.marketId ||
                (params?.outcomeId ? this.slugFromId(params.outcomeId) : undefined);
            if (directSlug) {
                const resp = await this.client.markets.retrieveBySlug(directSlug);
                return resp.market ? [this.normalizer.normalizeMarket(resp.market)] : [];
            }

            // Markets that belong to a specific event
            if (params?.eventId) {
                const eventResp = await this.client.events.retrieveBySlug(params.eventId);
                return eventResp.event
                    ? this.normalizer.normalizeMarketsFromEvent(eventResp.event)
                    : [];
            }

            const resp = await this.client.markets.list({
                active: true,
                limit: params?.limit ?? 250,
                offset: params?.offset ?? 0,
            });
            if (!resp.markets) {
                throw new Error('PolymarketUS markets.list response missing required "markets" field');
            }
            let markets = resp.markets.map(m => this.normalizer.normalizeMarket(m));

            if (params?.query) {
                const q = params.query.toLowerCase();
                markets = markets.filter(m =>
                    m.title.toLowerCase().includes(q) ||
                    (m.description || '').toLowerCase().includes(q),
                );
            }

            return markets;
        });
    }

    protected override async fetchEventsImpl(
        params: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        return this.run(async () => {
            const directSlug = params?.eventId || params?.slug;
            if (directSlug) {
                const resp = await this.client.events.retrieveBySlug(directSlug);
                return resp.event ? [this.normalizer.normalizeEvent(resp.event)] : [];
            }

            // When filtering by series, the SDK accepts seriesId as an array of
            // numeric ids. The PMXT series param is a string (id or slug); we
            // attempt numeric parsing first and fall back to slug resolution below.
            let seriesIdFilter: number[] | undefined;
            if (params?.series != null) {
                const numericId = Number(params.series);
                if (Number.isFinite(numericId) && numericId > 0) {
                    seriesIdFilter = [numericId];
                } else {
                    // Non-numeric: attempt to resolve the slug to a numeric series id
                    // by listing series and finding a slug match.
                    const slugResp = await this.client.series.list({ slug: [params.series] });
                    const matched = slugResp.series?.[0];
                    if (!matched) {
                        // Unknown series slug — return empty rather than silently
                        // ignoring the filter and returning all events.
                        return [];
                    }
                    seriesIdFilter = [matched.id];
                }
            }

            const resp = await this.client.events.list({
                active: true,
                limit: params?.limit ?? 100,
                offset: params?.offset ?? 0,
                ...(seriesIdFilter !== undefined ? { seriesId: seriesIdFilter } : {}),
            });
            if (!resp.events) {
                throw new Error('PolymarketUS events.list response missing required "events" field');
            }
            let events = resp.events.map(e => this.normalizer.normalizeEvent(e));

            if (params?.query) {
                const q = params.query.toLowerCase();
                events = events.filter(e =>
                    e.title.toLowerCase().includes(q) ||
                    (e.description || '').toLowerCase().includes(q),
                );
            }

            return events;
        });
    }

    protected override async fetchSeriesImpl(
        params: SeriesFetchParams,
    ): Promise<UnifiedSeries[]> {
        return this.run(async () => {
            // Direct lookup by numeric id
            if (params?.id != null) {
                const numericId = Number(params.id);
                if (!Number.isFinite(numericId) || numericId <= 0) {
                    return [];
                }
                const resp = await this.client.series.retrieve(numericId);
                if (!resp.series) {
                    throw new Error('PolymarketUS series.retrieve response missing required "series" field');
                }
                return [this.normalizer.normalizeSeries(resp.series)];
            }

            const listParams: {
                active?: boolean;
                slug?: string[];
                recurrence?: string;
            } = { active: true };

            if (params?.slug != null) {
                listParams.slug = [params.slug];
            }
            if (params?.recurrence != null) {
                listParams.recurrence = params.recurrence;
            }

            const resp = await this.client.series.list(listParams);
            if (!resp.series) {
                throw new Error('PolymarketUS series.list response missing required "series" field');
            }
            let series = resp.series.map(s => this.normalizer.normalizeSeries(s));

            if (params?.query) {
                const q = params.query.toLowerCase();
                series = series.filter(s =>
                    s.title.toLowerCase().includes(q) ||
                    (s.description || '').toLowerCase().includes(q),
                );
            }

            return series;
        });
    }

    override async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const resolved = await this.resolveOutcomeAlias(outcomeId, _params);
        outcomeId = resolved.outcomeId;
        _params = resolved.params;
        return this.run(async () => {
            const slug = this.slugFromId(outcomeId);
            const book = await this.client.markets.book(slug);
            return this.normalizer.normalizeOrderBook(book, outcomeId);
        });
    }

    // -------------------------------------------------------------------------
    // Account / Portfolio
    // -------------------------------------------------------------------------

    override async fetchBalance(_address?: string): Promise<Balance[]> {
        this.requireAuth();
        return this.run(async () => {
            const resp = await this.client.account.balances();
            if (!resp.balances || resp.balances.length === 0) {
                return [];
            }
            return this.normalizer.normalizeBalance(resp.balances[0]);
        });
    }

    override async fetchPositions(_address?: string): Promise<Position[]> {
        this.requireAuth();
        return this.run(async () => {
            const resp = await this.client.portfolio.positions({});
            if (!resp.positions) {
                throw new Error('PolymarketUS portfolio.positions response missing required "positions" field');
            }
            return this.normalizer.normalizePositions(resp.positions);
        });
    }

    override async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        this.requireAuth();
        return this.run(async () => {
            const resp = await this.client.portfolio.activities({
                types: ['ACTIVITY_TYPE_TRADE'],
                limit: params?.limit ?? 100,
                marketSlug: params?.marketId,
            });
            if (!resp.activities) {
                throw new Error('PolymarketUS portfolio.activities response missing required "activities" field');
            }
            const activities = resp.activities;
            const trades: UserTrade[] = [];
            activities.forEach((activity, idx) => {
                const trade = this.normalizer.normalizeUserTradeFromActivity(activity, idx);
                if (trade) trades.push(trade);
            });
            return trades;
        });
    }

    // -------------------------------------------------------------------------
    // Orders
    // -------------------------------------------------------------------------

    override async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        this.requireAuth();
        return this.run(async () => {
            const resp = await this.client.orders.list({
                slugs: marketId ? [marketId] : undefined,
            });
            if (!resp.orders) {
                throw new Error('PolymarketUS orders.list response missing required "orders" field');
            }
            const raws = resp.orders;
            return raws.map(raw => {
                const normalized = this.normalizer.normalizeOrder(raw);
                this.cacheOrder(normalized.id, raw.marketSlug);
                return normalized;
            });
        });
    }

    override async fetchOrder(orderId: string): Promise<Order> {
        this.requireAuth();
        return this.run(async () => {
            const resp = await this.client.orders.retrieve(orderId);
            const raw = resp.order;
            const normalized = this.normalizer.normalizeOrder(raw);
            this.cacheOrder(normalized.id, raw.marketSlug);
            return normalized;
        });
    }

    override async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        const isShort = params.outcomeId.endsWith(':short');
        let intent: OrderIntent;
        if (params.side === 'buy' && !isShort) intent = 'ORDER_INTENT_BUY_LONG';
        else if (params.side === 'sell' && !isShort) intent = 'ORDER_INTENT_SELL_LONG';
        else if (params.side === 'buy' && isShort) intent = 'ORDER_INTENT_BUY_SHORT';
        else intent = 'ORDER_INTENT_SELL_SHORT';

        const sdkType: SdkOrderType = params.type === 'market'
            ? 'ORDER_TYPE_MARKET'
            : 'ORDER_TYPE_LIMIT';

        const sdkParams: SdkCreateOrderParams = {
            marketSlug: params.marketId,
            intent,
            type: sdkType,
            quantity: params.amount,
            tif: 'TIME_IN_FORCE_GOOD_TILL_CANCEL' as TimeInForce,
        };

        if (params.type === 'limit') {
            if (params.price === undefined) {
                throw new Error('Limit order requires price');
            }
            const rounded = roundToTickSize(params.price);
            validatePriceBounds(rounded);
            const longPrice = toLongSidePrice(intent, rounded);
            sdkParams.price = toAmount(longPrice);
        }

        return {
            exchange: this.name,
            params,
            raw: sdkParams as unknown as Record<string, any>,
        };
    }

    override async submitOrder(built: BuiltOrder): Promise<Order> {
        this.requireAuth();
        const sdkParams = built.raw as unknown as SdkCreateOrderParams;
        const response = await this.run(() => this.client.orders.create(sdkParams));
        const newId = response.id;
        this.cacheOrder(newId, built.params.marketId);

        return await this.fetchOrder(newId);
    }

    override async createOrder(params: CreateOrderParams): Promise<Order> {
        const built = await this.buildOrder(params);
        return this.submitOrder(built);
    }

    override async cancelOrder(orderId: string): Promise<Order> {
        this.requireAuth();

        let slug = this.orderSlugCache.get(orderId);
        if (!slug) {
            // Populate the cache by fetching the order first
            const fetched = await this.fetchOrder(orderId);
            slug = this.orderSlugCache.get(orderId) || fetched.marketId;
        }

        await this.run(() =>
            this.client.orders.cancel(orderId, { marketSlug: slug as string }),
        );

        return this.fetchOrder(orderId);
    }

    // -------------------------------------------------------------------------
    // WebSocket Streaming
    // -------------------------------------------------------------------------

    /**
     * Lazily construct the WebSocket wrapper. The underlying SDK factory
     * requires credentials even for the public market socket, so this
     * method calls `requireAuth()` up front.
     */
    private ensureWs(): PolymarketUSWebSocket {
        this.requireAuth();
        if (!this.wsWrapper) {
            this.wsWrapper = new PolymarketUSWebSocket(this.client, this.normalizer);
        }
        return this.wsWrapper;
    }

    override async watchOrderBook(outcomeId: string, _limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        return this.run(() => this.ensureWs().watchOrderBook(outcomeId));
    }

    override async watchTrades(
        outcomeId: string,
        _address?: string,
        _since?: number,
        _limit?: number,
    ): Promise<Trade[]> {
        return this.run(() => this.ensureWs().watchTrades(outcomeId));
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async close(): Promise<void> {
        if (this.wsWrapper) {
            await this.wsWrapper.close();
            this.wsWrapper = undefined;
        }
    }
}
