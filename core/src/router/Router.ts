import {
    PredictionMarketExchange,
    type ExchangeCredentials,
    type MarketFetchParams,
    type EventFetchParams,
    type SeriesFetchParams,
} from '../BaseExchange';
import { BaseError, EventNotFound, MarketNotFound } from '../errors';
import type { UnifiedMarket, UnifiedEvent, UnifiedSeries, OrderBook, OrderLevel, MarketOutcome } from '../types';
import { logger } from '../utils/logger';
import { PmxtApiClient } from './client';
import { SERIES_MAP, getVenueSeriesId } from './series-map';
import type {
    RouterOptions,
    MatchResult,
    EventMatchResult,
    PriceComparison,
    ArbitrageOpportunity,
    MatchedMarketPair,
    MatchedPricePair,
    FetchMarketMatchesParams,
    FetchMatchesParams,
    FetchEventMatchesParams,
    FetchArbitrageParams,
    FetchMatchedMarketsParams,
    FetchMatchedPricesParams,
} from './types';

// ---------------------------------------------------------------------------
// Orderbook merge utilities
// ---------------------------------------------------------------------------

function findOutcomeForSide(market: UnifiedMarket, side: 'yes' | 'no'): MarketOutcome | undefined {
    return market.outcomes.find((o) => o.label.toLowerCase() === side)
        ?? market.outcomes[side === 'yes' ? 0 : 1];
}

function mergeLevels(levels: OrderLevel[]): OrderLevel[] {
    const byPrice = new Map<number, number>();
    for (const level of levels) {
        byPrice.set(level.price, (byPrice.get(level.price) ?? 0) + level.size);
    }
    return Array.from(byPrice.entries()).map(([price, size]) => ({ price, size }));
}

function mergeOrderBooks(books: OrderBook[]): OrderBook {
    const allBids = books.flatMap((b) => b.bids);
    const allAsks = books.flatMap((b) => b.asks);

    return {
        bids: mergeLevels(allBids).sort((a, b) => b.price - a.price),
        asks: mergeLevels(allAsks).sort((a, b) => a.price - b.price),
        timestamp: Date.now(),
    };
}

// ---------------------------------------------------------------------------

const MOCK_MARKET_OR_OUTCOME_ID_RE = /^(mock-m\d+)(?:-(?:yes|no|\d+))?$/;
const MOCK_EVENT_ID_RE = /^mock-event-\d+$/;

class LocalRouterMatchLookupUnsupported extends BaseError {
    constructor(kind: 'market' | 'event', identifier: string) {
        super(
            `LOCAL_MATCH_LOOKUP_UNSUPPORTED: Router match lookup for local mock ${kind} ` +
            `"${identifier}" cannot be served by the hosted match catalog. ` +
            `Configure RouterOptions.localExchanges.mock when using Router in-process; ` +
            `the /api/router sidecar endpoint resolves bundled mock IDs locally and returns [] because mock fixtures have no hosted cross-venue matches.`,
            501,
            'LOCAL_MATCH_LOOKUP_UNSUPPORTED',
            false,
            'Router',
        );
    }
}

function sourceExchangeIsMock(sourceExchange: unknown): boolean {
    return typeof sourceExchange === 'string' && sourceExchange.toLowerCase() === 'mock';
}

function lookupString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function mockMarketIdFromLocalId(id: unknown): string | undefined {
    const value = lookupString(id);
    if (!value) return undefined;
    return value.match(MOCK_MARKET_OR_OUTCOME_ID_RE)?.[1];
}

function isMockEventId(id: unknown): boolean {
    const value = lookupString(id);
    return value !== undefined && MOCK_EVENT_ID_RE.test(value);
}

function isMockUrl(url: unknown, resource: 'market' | 'event'): boolean {
    const value = lookupString(url);
    if (!value) return false;
    try {
        const parsed = new URL(value);
        return parsed.hostname === 'mock.pmxt.dev' && parsed.pathname.startsWith(`/${resource}/`);
    } catch {
        return value.includes(`mock.pmxt.dev/${resource}/`);
    }
}

function describeMarketLookup(params: FetchMarketMatchesParams): string {
    return params.market?.marketId
        ?? lookupString(params.marketId)
        ?? lookupString(params.slug)
        ?? lookupString(params.url)
        ?? 'unknown';
}

function describeEventLookup(params: FetchEventMatchesParams): string {
    return params.event?.id
        ?? lookupString(params.eventId)
        ?? lookupString(params.slug)
        ?? 'unknown';
}

function isLocalMockMarketLookup(params: FetchMarketMatchesParams): boolean {
    return sourceExchangeIsMock(params.market?.sourceExchange)
        || mockMarketIdFromLocalId(params.market?.marketId) !== undefined
        || mockMarketIdFromLocalId(params.marketId) !== undefined
        || mockMarketIdFromLocalId(params.slug) !== undefined
        || isMockUrl(params.url, 'market');
}

function isLocalMockEventLookup(params: FetchEventMatchesParams): boolean {
    return sourceExchangeIsMock(params.event?.sourceExchange)
        || isMockEventId(params.event?.id)
        || isMockEventId(params.eventId)
        || isMockEventId(params.slug);
}

function findByUrl<T extends { url?: string }>(items: T[], url: string): T | undefined {
    return items.find((item) => item.url === url);
}

export class Router extends PredictionMarketExchange {
    private readonly client: PmxtApiClient;
    private readonly exchanges: Record<string, PredictionMarketExchange>;
    private readonly localExchanges: Record<string, PredictionMarketExchange>;

    constructor(options: RouterOptions) {
        super({ apiKey: options.apiKey } as ExchangeCredentials);
        this.client = new PmxtApiClient(options.apiKey, options.baseUrl);
        this.exchanges = options.exchanges ?? {};
        this.localExchanges = options.localExchanges ?? options.exchanges ?? {};
        this.rateLimit = 100;
    }

    get name(): string {
        return 'Router';
    }

    // -----------------------------------------------------------------------
    // BaseExchange implementation delegates
    // -----------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        const response = await this.client.searchMarkets({
            query: params?.query,
            category: params?.category,
            limit: params?.limit,
            offset: params?.offset,
            closed: params?.status === 'closed' || params?.status === 'inactive',
            sourceExchange: params?.sourceExchange ?? params?.exchange,
        });
        if (!Array.isArray(response)) {
            throw new Error(
                `fetchMarketsImpl: expected array from searchMarkets but received ${typeof response}`,
            );
        }
        return response;
    }

    protected async fetchEventsImpl(params?: EventFetchParams): Promise<UnifiedEvent[]> {
        // When a normalized series id is requested, fan out to each mapped venue
        // using the venue-native series id and aggregate the results.
        if (params?.series !== undefined) {
            const normalized = params.series;
            const entry = SERIES_MAP.find((e) => e.id === normalized);

            if (entry !== undefined) {
                return this.fetchEventsForMappedSeries(entry.venues, params);
            }

            // Not a known normalized id — fall through and pass the raw value to
            // the hosted search endpoint (single-venue callers using vendor-native
            // ids still work).
        }

        const response = await this.client.searchEvents({
            query: params?.query,
            category: params?.category,
            limit: params?.limit,
            offset: params?.offset,
            sourceExchange: params?.sourceExchange ?? params?.exchange,
        });
        if (!Array.isArray(response)) {
            throw new Error(
                `fetchEventsImpl: expected array from searchEvents but received ${typeof response}`,
            );
        }
        return response;
    }

    /**
     * Fan out fetchEvents({series: venueSeriesId}) to each venue in the
     * mapping, collect all results, and tag each event with its sourceExchange.
     */
    private async fetchEventsForMappedSeries(
        venueMap: { readonly [venueName: string]: string },
        baseParams: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        const venueEntries = Object.entries(venueMap);
        if (venueEntries.length === 0) return [];

        const fetchResults = await Promise.all(
            venueEntries.map(async ([venueName, venueSeriesId]) => {
                const exchange = this.localExchanges[venueName];
                if (!exchange) {
                    logger.debug(
                        `Router.fetchEventsForMappedSeries: no exchange instance for venue "${venueName}", skipping`,
                    );
                    return [] as UnifiedEvent[];
                }
                try {
                    const events = await exchange.fetchEvents({
                        ...baseParams,
                        series: venueSeriesId,
                    });
                    return events.map((ev): UnifiedEvent => ({
                        ...ev,
                        sourceExchange: ev.sourceExchange ?? venueName,
                    }));
                } catch (error: unknown) {
                    logger.warn(
                        `Router.fetchEventsForMappedSeries: fetchEvents failed for venue "${venueName}" ` +
                        `series "${venueSeriesId}": ${error instanceof Error ? error.message : String(error)}`,
                    );
                    return [] as UnifiedEvent[];
                }
            }),
        );

        return fetchResults.flat();
    }

    // -----------------------------------------------------------------------
    // Cross-venue series (series-map + fan-out)
    // -----------------------------------------------------------------------

    /**
     * Cross-venue series fetch.
     *
     * - If `params.id` matches a normalized id in SERIES_MAP, returns a single
     *   synthesized `UnifiedSeries` whose `events` is the concatenation of
     *   `fetchEvents({series: venueSeriesId})` results from each mapped venue.
     * - Otherwise fans out `fetchSeries(params)` to all venue instances with
     *   `has.fetchSeries !== false`, collects, and returns deduplicated results
     *   tagged with their `sourceExchange`.
     */
    protected async fetchSeriesImpl(params: SeriesFetchParams): Promise<UnifiedSeries[]> {
        const requestedId = params.id;

        if (requestedId !== undefined) {
            const entry = SERIES_MAP.find((e) => e.id === requestedId);
            if (entry !== undefined) {
                return this.fetchSynthesizedSeries(entry, params);
            }
        }

        return this.fanOutFetchSeries(params);
    }

    /**
     * Build a single synthesized `UnifiedSeries` from the SERIES_MAP entry by
     * fetching events from all mapped venues and concatenating them.
     */
    private async fetchSynthesizedSeries(
        entry: { id: string; title: string; venues: { readonly [venueName: string]: string } },
        params: SeriesFetchParams,
    ): Promise<UnifiedSeries[]> {
        const venueEntries = Object.entries(entry.venues);

        const eventsPerVenue = await Promise.all(
            venueEntries.map(async ([venueName, venueSeriesId]) => {
                const exchange = this.localExchanges[venueName];
                if (!exchange) {
                    logger.debug(
                        `Router.fetchSynthesizedSeries: no exchange instance for venue "${venueName}", skipping`,
                    );
                    return [] as UnifiedEvent[];
                }
                try {
                    const events = await exchange.fetchEvents({ series: venueSeriesId });
                    return events.map((ev): UnifiedEvent => ({
                        ...ev,
                        sourceExchange: ev.sourceExchange ?? venueName,
                    }));
                } catch (error: unknown) {
                    logger.warn(
                        `Router.fetchSynthesizedSeries: fetchEvents failed for venue "${venueName}" ` +
                        `series "${venueSeriesId}": ${error instanceof Error ? error.message : String(error)}`,
                    );
                    return [] as UnifiedEvent[];
                }
            }),
        );

        const allEvents = eventsPerVenue.flat();

        const synthesized: UnifiedSeries = {
            id: entry.id,
            title: entry.title,
            events: allEvents,
            sourceExchange: 'Router',
        };

        // Apply limit/offset if the caller passed them (BaseExchange.fetchSeries strips
        // them before calling fetchSeriesImpl, but guard defensively).
        const limit = params.limit;
        const offset = params.offset ?? 0;
        if (limit !== undefined) {
            return [{ ...synthesized, events: allEvents.slice(offset, offset + limit) }];
        }
        return [synthesized];
    }

    /**
     * Fan out `fetchSeries(params)` to all venue instances whose
     * `has.fetchSeries` is not `false`. Tag each result with its originating
     * venue name.
     */
    private async fanOutFetchSeries(params: SeriesFetchParams): Promise<UnifiedSeries[]> {
        const venueEntries = Object.entries(this.localExchanges);
        if (venueEntries.length === 0) return [];

        const fetchResults = await Promise.all(
            venueEntries.map(async ([venueName, exchange]) => {
                if (exchange.has.fetchSeries === false) return [] as UnifiedSeries[];

                // When params.id is a venue-native id on this specific venue,
                // pass it through directly so single-venue lookups still work.
                let venueParams = params;
                if (params.id !== undefined) {
                    const nativeId = getVenueSeriesId(params.id, venueName);
                    if (nativeId !== undefined) {
                        venueParams = { ...params, id: nativeId };
                    }
                }

                try {
                    const series = await exchange.fetchSeries(venueParams);
                    return series.map((s): UnifiedSeries => ({
                        ...s,
                        sourceExchange: s.sourceExchange ?? venueName,
                    }));
                } catch (error: unknown) {
                    logger.warn(
                        `Router.fanOutFetchSeries: fetchSeries failed for venue "${venueName}": ` +
                        `${error instanceof Error ? error.message : String(error)}`,
                    );
                    return [] as UnifiedSeries[];
                }
            }),
        );

        return fetchResults.flat();
    }

    // -----------------------------------------------------------------------
    // Unified orderbook (cross-exchange merge)
    // -----------------------------------------------------------------------

    async fetchOrderBook(outcomeId: string, limit?: number, params?: Record<string, any>): Promise<OrderBook> {
        const exchangeNames = Object.keys(this.exchanges);
        if (exchangeNames.length === 0) {
            throw new Error(
                'Router requires exchange instances for fetchOrderBook. Pass exchanges in RouterOptions.',
            );
        }

        const resolvedSide = params?.side ?? 'yes';

        // Find identity matches across venues
        const matches = await this.fetchMarketMatches({
            marketId: outcomeId,
            relation: 'identity',
        });

        const fetchPromises: Promise<{ book: OrderBook | null; venue: string; error: unknown }>[] = [];
        const matchedVenues = new Set(
            matches.map((m) => m.market.sourceExchange).filter(Boolean),
        );

        // Fetch from matched markets (we know their exchange + outcome IDs)
        for (const match of matches) {
            const venueName = match.market.sourceExchange ?? '';
            const exchange = this.exchanges[venueName];
            if (!exchange) continue;

            const outcome = findOutcomeForSide(match.market, resolvedSide);
            if (!outcome) continue;

            fetchPromises.push(
                exchange
                    .fetchOrderBook(outcome.outcomeId, undefined, { side: resolvedSide })
                    .then((book) => ({ book, venue: venueName, error: null }))
                    .catch((error: unknown) => ({ book: null, venue: venueName, error })),
            );
        }

        // Fetch the source market's orderbook (try remaining exchanges with the raw ID)
        for (const [name, exchange] of Object.entries(this.exchanges)) {
            if (matchedVenues.has(name)) continue;
            fetchPromises.push(
                exchange
                    .fetchOrderBook(outcomeId, undefined, { side: resolvedSide })
                    .then((book) => ({ book, venue: name, error: null }))
                    .catch((error: unknown) => ({ book: null, venue: name, error })),
            );
        }

        const results = await Promise.all(fetchPromises);
        const books = results.filter((r): r is { book: OrderBook; venue: string; error: null } => r.book !== null);
        const failures = results.filter((r) => r.book === null && r.error !== null);

        if (books.length === 0 && failures.length > 0) {
            const reasons = failures
                .map((f) => `${f.venue}: ${f.error instanceof Error ? f.error.message : String(f.error)}`)
                .join('; ');
            throw new Error(`fetchOrderBook failed on all exchanges for outcomeId "${outcomeId}": ${reasons}`);
        }

        if (books.length === 0) {
            throw new Error(`fetchOrderBook: no exchange returned an orderbook for outcomeId "${outcomeId}"`);
        }

        return mergeOrderBooks(books.map((r) => r.book));
    }

    // -----------------------------------------------------------------------
    // Cross-exchange market matches
    // -----------------------------------------------------------------------

    async fetchMarketMatches(params: FetchMarketMatchesParams = {}): Promise<MatchResult[]> {
        if (params.market && !params.marketId) {
            if (sourceExchangeIsMock(params.market.sourceExchange)) {
                params = { ...params, marketId: params.market.marketId };
            } else if (params.market.slug && !params.slug) {
                params = { ...params, slug: params.market.slug };
            } else {
                params = { ...params, marketId: params.market.marketId };
            }
        }

        // Browse mode: no specific market identifier → return all matches
        // from the catalog, with both sides of each pair.
        const hasIdentifier = params.marketId || params.slug || params.url;
        if (!hasIdentifier) {
            return this.fetchMarketMatchesBrowse(params);
        }

        if (await this.resolveLocalMockMarketLookup(params)) {
            return [];
        }

        // Lookup mode: find matches for a specific market.
        const response = await this.client.getMarketMatches(params);
        if (!response || !Array.isArray(response.matches)) {
            throw new Error('fetchMarketMatches returned an unexpected response shape: missing matches array');
        }
        const matches = response.matches;
        return matches.map((m: any) => ({
            market: m.market,
            relation: m.relation,
            confidence: m.confidence,
            reasoning: m.reasoning ?? null,
            bestBid: m.market?.bestBid ?? null,
            bestAsk: m.market?.bestAsk ?? null,
        }));
    }

    /**
     * Browse mode: fetch all matched market pairs from the catalog.
     * Each result includes sourceMarket (one side) and market (the other).
     */
    private async fetchMarketMatchesBrowse(params: FetchMarketMatchesParams): Promise<MatchResult[]> {
        const results = await this.client.browseMarketMatches(params);
        if (!Array.isArray(results)) {
            throw new Error(
                `browseMarketMatches returned unexpected type '${typeof results}'`
            );
        }
        return results;
    }

    /** @deprecated Use {@link fetchMarketMatches} instead. */
    async fetchMatches(params: FetchMatchesParams): Promise<MatchResult[]> {
        logger.warn('fetchMatches is deprecated, use fetchMarketMatches instead');
        return this.fetchMarketMatches(params);
    }

    // -----------------------------------------------------------------------
    // Cross-exchange event matches
    // -----------------------------------------------------------------------

    async fetchEventMatches(params: FetchEventMatchesParams = {}): Promise<EventMatchResult[]> {
        if (params.event && !params.eventId) {
            if (sourceExchangeIsMock(params.event.sourceExchange)) {
                params = { ...params, eventId: params.event.id };
            } else if (params.event.slug && !params.slug) {
                params = { ...params, slug: params.event.slug };
            } else {
                params = { ...params, eventId: params.event.id };
            }
        }

        // Browse mode: no specific event identifier → return all matches
        const hasIdentifier = params.eventId || params.slug;
        if (!hasIdentifier) {
            const results = await this.client.browseEventMatches(params);
            if (!Array.isArray(results)) {
                throw new Error(
                    `browseEventMatches returned unexpected type '${typeof results}'`
                );
            }
            return results;
        }

        if (await this.resolveLocalMockEventLookup(params)) {
            return [];
        }

        // Lookup mode: find matches for a specific event.
        const response = await this.client.getEventMatches(params);
        if (!response || !Array.isArray(response.matches)) {
            throw new Error('fetchEventMatches returned an unexpected response shape: missing matches array');
        }
        return response.matches;
    }

    // -----------------------------------------------------------------------
    // Price comparison: identity matches with live prices
    // -----------------------------------------------------------------------

    async compareMarketPrices(params: FetchMarketMatchesParams): Promise<PriceComparison[]> {
        if (params.market && !params.marketId) {
            params = { ...params, marketId: params.market.marketId };
        }
        const matches = await this.fetchMarketMatches({
            ...params,
            relation: 'identity',
            includePrices: true,
        });

        return matches.map((m) => ({
            market: m.market,
            relation: m.relation,
            confidence: m.confidence,
            reasoning: m.reasoning,
            bestBid: m.bestBid,
            bestAsk: m.bestAsk,
            venue: m.market.sourceExchange ?? '',
        }));
    }

    // -----------------------------------------------------------------------
    // Related markets: subset/superset matches with live prices
    // -----------------------------------------------------------------------

    async fetchRelatedMarkets(params: FetchMarketMatchesParams): Promise<PriceComparison[]> {
        if (params.market && !params.marketId) {
            params = { ...params, marketId: params.market.marketId };
        }
        const matches = await this.fetchMarketMatches({
            ...params,
            includePrices: true,
        });

        return matches
            .filter((m) => m.relation === 'subset' || m.relation === 'superset')
            .map((m) => ({
                market: m.market,
                relation: m.relation,
                confidence: m.confidence,
                reasoning: m.reasoning,
                bestBid: m.bestBid,
                bestAsk: m.bestAsk,
                venue: m.market.sourceExchange ?? '',
            }));
    }

    /** @deprecated Use {@link fetchRelatedMarkets} instead. */
    async fetchHedges(params: FetchMarketMatchesParams): Promise<PriceComparison[]> {
        logger.warn('fetchHedges is deprecated, use fetchRelatedMarkets instead');
        return this.fetchRelatedMarkets(params);
    }

    // -----------------------------------------------------------------------
    // Matched markets (deprecated — use fetchMarketMatches without a
    // marketId for browse mode instead)
    // -----------------------------------------------------------------------

    /** @deprecated Use {@link fetchMarketMatches} without a marketId instead. */
    async fetchMatchedMarkets(params?: FetchMatchedMarketsParams): Promise<MatchedMarketPair[]> {
        // Convert params: minDifference -> minSpread for internal use
        const legacyParams: FetchArbitrageParams | undefined = params
            ? {
                  minSpread: params.minDifference,
                  category: params.category,
                  limit: params.limit,
                  relations: params.relations,
              }
            : undefined;

        const legacy = await this.fetchArbitrageInternal(legacyParams);

        return legacy.map((opp) => ({
            marketA: opp.marketA,
            marketB: opp.marketB,
            priceDifference: opp.spread,
            venueA: opp.buyVenue,
            venueB: opp.sellVenue,
            priceA: opp.buyPrice,
            priceB: opp.sellPrice,
            relation: opp.relation,
            confidence: opp.confidence,
            reasoning: (opp as any).reasoning ?? null,
        }));
    }

    /** @deprecated Use {@link fetchMatchedMarkets} instead. */
    async fetchMatchedPrices(params?: FetchMatchedPricesParams): Promise<MatchedPricePair[]> {
        logger.warn('fetchMatchedPrices is deprecated, use fetchMatchedMarkets instead');
        return this.fetchMatchedMarkets(params);
    }

    /** @deprecated Use {@link fetchMatchedMarkets} instead. */
    async fetchArbitrage(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]> {
        logger.warn('fetchArbitrage is deprecated, use fetchMatchedPrices instead');
        return this.fetchArbitrageInternal(params);
    }

    private getLocalExchange(name: string): PredictionMarketExchange | undefined {
        const target = name.toLowerCase();
        for (const [key, exchange] of Object.entries(this.localExchanges)) {
            if (key.toLowerCase() === target || exchange.name.toLowerCase() === target) {
                return exchange;
            }
        }
        return undefined;
    }

    /**
     * Local mock IDs are sidecar-only fixtures. Hosted match endpoints do not
     * know them, so resolve them locally when possible and avoid opaque hosted
     * "not found" responses.
     */
    private async resolveLocalMockMarketLookup(params: FetchMarketMatchesParams): Promise<boolean> {
        if (!isLocalMockMarketLookup(params)) return false;

        const identifier = describeMarketLookup(params);
        const mock = this.getLocalExchange('mock');
        if (!mock) {
            throw new LocalRouterMatchLookupUnsupported('market', identifier);
        }

        if (params.market && sourceExchangeIsMock(params.market.sourceExchange)) {
            return true;
        }

        const localMarketId =
            mockMarketIdFromLocalId(params.marketId)
            ?? mockMarketIdFromLocalId(params.slug);
        if (localMarketId) {
            await mock.fetchMarket({ marketId: localMarketId });
            return true;
        }

        const url = lookupString(params.url);
        if (url && isMockUrl(url, 'market')) {
            const markets = await mock.fetchMarkets();
            if (!findByUrl(markets, url)) {
                throw new MarketNotFound(url, mock.name);
            }
            return true;
        }

        return true;
    }

    private async resolveLocalMockEventLookup(params: FetchEventMatchesParams): Promise<boolean> {
        if (!isLocalMockEventLookup(params)) return false;

        const identifier = describeEventLookup(params);
        const mock = this.getLocalExchange('mock');
        if (!mock) {
            throw new LocalRouterMatchLookupUnsupported('event', identifier);
        }

        if (params.event && sourceExchangeIsMock(params.event.sourceExchange)) {
            return true;
        }

        const localEventId =
            isMockEventId(params.eventId) ? params.eventId
            : isMockEventId(params.slug) ? params.slug
            : undefined;
        if (localEventId) {
            await mock.fetchEvent({ eventId: localEventId });
            return true;
        }

        const url = lookupString((params as FetchEventMatchesParams & { url?: string }).url);
        if (url && isMockUrl(url, 'event')) {
            const events = await mock.fetchEvents();
            if (!findByUrl(events, url)) {
                throw new EventNotFound(url, mock.name);
            }
            return true;
        }

        return true;
    }

    private async fetchArbitrageInternal(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]> {
        // Try the dedicated bulk endpoint first (single DB query).
        try {
            return await this.fetchArbitrageBulk(params);
        } catch (error: unknown) {
            // Only fall back when the bulk endpoint is genuinely not available (404/501).
            // All other errors (network failures, 5xx, parsing errors) propagate so
            // callers are not silently given stale N+1 data.
            const status = (error as any)?.status ?? (error as any)?.response?.status;
            if (status === 404 || status === 501) {
                logger.warn('Router: bulk arbitrage endpoint unavailable, falling back to N+1 approach');
                return this.fetchArbitrageFallback(params);
            }
            throw error;
        }
    }

    /**
     * Bulk arbitrage via `GET /v0/arbitrage`. One round-trip.
     */
    private async fetchArbitrageBulk(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]> {
        const query: Record<string, string> = {};
        const relations = params?.relations ?? ['identity'];
        query.relations = relations.join(',');
        if (params?.minSpread !== undefined) query.minSpread = String(params.minSpread);
        if (params?.category) query.category = params.category;
        if (params?.limit !== undefined) query.limit = String(params.limit);

        const items = await this.client.getArbitrage(query);

        return items.map((r) => {
            if (r.spread == null || r.buyPrice == null || r.sellPrice == null) {
                throw new Error(
                    `fetchArbitrageBulk: arbitrage record is missing required price fields ` +
                    `(spread=${r.spread}, buyPrice=${r.buyPrice}, sellPrice=${r.sellPrice}) ` +
                    `for markets ${r.marketA?.marketId ?? '?'} / ${r.marketB?.marketId ?? '?'}`,
                );
            }
            return {
                marketA: r.marketA,
                marketB: r.marketB,
                spread: r.spread,
                buyVenue: r.buyVenue ?? '',
                sellVenue: r.sellVenue ?? '',
                buyPrice: r.buyPrice,
                sellPrice: r.sellPrice,
                relation: r.relation,
                confidence: r.confidence,
            };
        });
    }

    /**
     * Legacy N+1 fallback: fetch markets, then fetch matches per-market.
     */
    private async fetchArbitrageFallback(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]> {
        const minSpread = params?.minSpread ?? 0;
        const limit = params?.limit ?? 50;
        const relations = params?.relations ?? ['identity'];

        const markets = await this.fetchMarkets({
            category: params?.category,
            limit,
        });

        const opportunities: ArbitrageOpportunity[] = [];

        for (const market of markets) {
            for (const relation of relations) {
                const matches = await this.fetchMarketMatches({
                    marketId: market.marketId,
                    relation,
                    includePrices: true,
                });
                if (matches.length === 0) continue;

                const sourceAsk = market.outcomes[0]?.price ?? null;
                const sourceBid = sourceAsk;
                const sourceVenue = market.sourceExchange ?? '';

                for (const match of matches) {
                    const matchBid = match.bestBid;
                    const matchAsk = match.bestAsk;
                    const matchVenue = match.market.sourceExchange ?? '';

                    if (sourceAsk !== null && matchBid !== null) {
                        const spread = matchBid - sourceAsk;
                        if (spread >= minSpread) {
                            opportunities.push({
                                marketA: market,
                                marketB: match.market,
                                spread,
                                buyVenue: sourceVenue,
                                sellVenue: matchVenue,
                                buyPrice: sourceAsk,
                                sellPrice: matchBid,
                                relation: match.relation,
                                confidence: match.confidence,
                            });
                        }
                    }

                    if (matchAsk !== null && sourceBid !== null) {
                        const spread = sourceBid - matchAsk;
                        if (spread >= minSpread) {
                            opportunities.push({
                                marketA: match.market,
                                marketB: market,
                                spread,
                                buyVenue: matchVenue,
                                sellVenue: sourceVenue,
                                buyPrice: matchAsk,
                                sellPrice: sourceBid,
                                relation: match.relation,
                                confidence: match.confidence,
                            });
                        }
                    }
                }
            }
        }

        opportunities.sort((a, b) => b.spread - a.spread);
        return opportunities;
    }
}
