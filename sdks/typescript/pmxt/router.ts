/**
 * Router — cross-venue intelligence layer.
 *
 * Search, match, compare prices, find hedges, and detect arbitrage across
 * every venue PMXT supports. Only requires a PMXT API key.
 */

import { Exchange, ExchangeOptions } from "./client.js";
import { logger } from "./logger.js";
import {
    MatchResult,
    MatchRelation,
    EventMatchResult,
    FetchMatchedEventClustersParams,
    FetchMatchedMarketClustersParams,
    MatchedMarketClusterParams,
    MatchedEventCluster,
    MatchedMarketCluster,
    PriceComparison,
    ArbitrageOpportunity,
    UnifiedMarket,
    UnifiedEvent,
} from "./models.js";

function withQuestionAlias<T extends UnifiedMarket>(market: T): T {
    Object.defineProperty(market, 'question', {
        get() { return this.title; },
        enumerable: false,
        configurable: true,
    });
    return market;
}

function convertMarket(raw: any): UnifiedMarket {
    const outcomes = (raw.outcomes || []).map((o: any) => ({
        outcomeId: o.outcomeId,
        marketId: o.marketId,
        label: o.label,
        price: o.price,
        priceChange24h: o.priceChange24h,
        bestBid: o.bestBid,
        bestAsk: o.bestAsk,
        metadata: o.metadata,
    }));

    const convertOutcome = (o: any) => o ? ({
        outcomeId: o.outcomeId,
        marketId: o.marketId,
        label: o.label,
        price: o.price,
        priceChange24h: o.priceChange24h,
        bestBid: o.bestBid,
        bestAsk: o.bestAsk,
        metadata: o.metadata,
    }) : undefined;

    return withQuestionAlias({
        marketId: raw.marketId,
        title: raw.title,
        slug: raw.slug,
        outcomes,
        volume24h: raw.volume24h || 0,
        liquidity: raw.liquidity || 0,
        url: raw.url,
        description: raw.description,
        resolutionDate: raw.resolutionDate ? new Date(raw.resolutionDate) : undefined,
        volume: raw.volume,
        openInterest: raw.openInterest,
        image: raw.image,
        category: raw.category,
        tags: raw.tags,
        tickSize: raw.tickSize,
        status: raw.status,
        contractAddress: raw.contractAddress,
        sourceExchange: raw.sourceExchange,
        eventId: raw.eventId,
        yes: convertOutcome(raw.yes),
        no: convertOutcome(raw.no),
        up: convertOutcome(raw.up),
        down: convertOutcome(raw.down),
    });
}

function convertEvent(raw: any): UnifiedEvent {
    return {
        id: raw.id,
        title: raw.title,
        description: raw.description,
        slug: raw.slug,
        markets: (raw.markets || []).map(convertMarket),
        volume24h: raw.volume24h,
        volume: raw.volume,
        url: raw.url,
        image: raw.image,
        category: raw.category,
        tags: raw.tags,
        sourceExchange: raw.sourceExchange,
    };
}

function parseMatchResult(raw: any): MatchResult {
    const marketData = raw.market || {};
    const market = convertMarket(marketData);
    const result: MatchResult = {
        ...market,
        market,
        relation: raw.relation || 'identity',
        confidence: raw.confidence || 0,
        reasoning: raw.reasoning,
        bestBid: raw.bestBid ?? marketData.bestBid,
        bestAsk: raw.bestAsk ?? marketData.bestAsk,
        sourceMarket: raw.sourceMarket ? convertMarket(raw.sourceMarket) : undefined,
    };
    return withQuestionAlias(result);
}

function normalizeQueryValue(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    return value;
}

function appendQuery(query: Record<string, unknown>, key: string, value: unknown): void {
    if (value !== undefined && value !== null && value !== '') {
        query[key] = normalizeQueryValue(value);
    }
}

function addClusterFilters(query: Record<string, unknown>, params: {
    query?: string;
    category?: string;
    relations?: MatchRelation | MatchRelation[] | string;
    relation?: MatchRelation;
    minConfidence?: number;
    venues?: string | string[];
    excludeVenues?: string | string[];
    minVenues?: number;
    withOrderbook?: boolean;
    updatedSince?: string | Date;
    includeRawMatches?: boolean;
    sort?: string;
    limit?: number;
    offset?: number;
    edgeLimit?: number;
}): void {
    appendQuery(query, 'query', params.query);
    appendQuery(query, 'category', params.category);
    appendQuery(query, 'relations', params.relations);
    appendQuery(query, 'relation', params.relation);
    appendQuery(query, 'minConfidence', params.minConfidence);
    appendQuery(query, 'venues', params.venues);
    appendQuery(query, 'excludeVenues', params.excludeVenues);
    appendQuery(query, 'minVenues', params.minVenues);
    appendQuery(query, 'withOrderbook', params.withOrderbook);
    appendQuery(query, 'updatedSince', params.updatedSince);
    appendQuery(query, 'includeRawMatches', params.includeRawMatches);
    appendQuery(query, 'sort', params.sort);
    appendQuery(query, 'limit', params.limit);
    appendQuery(query, 'offset', params.offset);
    appendQuery(query, 'edgeLimit', params.edgeLimit);
}

function extractCatalogArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
}

function isUnifiedMarket(value: UnifiedMarket | FetchMatchedMarketClustersParams): value is UnifiedMarket {
    return Boolean(value && 'marketId' in value && 'title' in value);
}

function isUnifiedEvent(value: UnifiedEvent | FetchMatchedEventClustersParams): value is UnifiedEvent {
    return Boolean(value && 'id' in value && 'title' in value && 'markets' in value);
}

function parseMatchedMarketCluster(raw: any): MatchedMarketCluster {
    return {
        ...raw,
        markets: (raw.markets || []).map(convertMarket),
    };
}

function parseMatchedEventCluster(raw: any): MatchedEventCluster {
    return {
        ...raw,
        events: (raw.events || []).map(convertEvent),
    };
}

/** Options for creating a Router. */
export interface RouterOptions {
    /** PMXT API key (required for hosted mode). */
    pmxtApiKey?: string;

    /** Override the base URL (defaults to hosted API). */
    baseUrl?: string;

    /** Start local sidecar (default: false). */
    autoStartServer?: boolean;
}

/**
 * Cross-venue intelligence layer.
 *
 * Search markets and events across every venue, find semantically
 * equivalent markets on other platforms, compare prices, discover
 * hedges, and scan for arbitrage — all from a single PMXT API key.
 *
 * @example
 * ```typescript
 * import pmxt from "pmxtjs";
 *
 * const router = new pmxt.Router({ pmxtApiKey: "pmxt_live_..." });
 * const markets = await router.fetchMarkets({ query: "election" });
 * const matches = await router.fetchMarketMatches(markets[0]);
 * ```
 */
export class Router extends Exchange {
    constructor(options: RouterOptions = {}) {
        super("router", options as ExchangeOptions);
    }

    // ------------------------------------------------------------------
    // Matching
    // ------------------------------------------------------------------

    /**
     * Find markets on other venues that correspond to a given market.
     *
     * @param marketOrParams - A UnifiedMarket, or an options object.
     */
    async fetchMarketMatches(market: UnifiedMarket): Promise<MatchResult[]>;
    async fetchMarketMatches(params?: {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
        query?: string;
        category?: string;
        relation?: MatchRelation;
        minConfidence?: number;
        limit?: number;
        includePrices?: boolean;
    }): Promise<MatchResult[]>;
    async fetchMarketMatches(marketOrParams: UnifiedMarket | {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
        query?: string;
        category?: string;
        relation?: MatchRelation;
        minConfidence?: number;
        limit?: number;
        includePrices?: boolean;
    } = {}): Promise<MatchResult[]> {
        const params = 'title' in marketOrParams ? { market: marketOrParams as UnifiedMarket } : marketOrParams;
        await this.initPromise;
        const query: Record<string, unknown> = {};
        const marketId = params.marketId ?? (!params.market?.slug ? params.market?.marketId : undefined);
        if (marketId) query.marketId = marketId;
        if (params.slug ?? params.market?.slug) query.slug = params.slug ?? params.market?.slug;
        if (params.url) query.url = params.url;
        if (params.query) query.query = params.query;
        if (params.category) query.category = params.category;
        if (params.relation) query.relation = params.relation;
        if (params.minConfidence !== undefined) query.minConfidence = params.minConfidence;
        if (params.limit !== undefined) query.limit = params.limit;
        if (params.includePrices) query.includePrices = true;

        try {
            const json = await this.sidecarReadRequest('fetchMarketMatches', query, [query]);
            const data = this.handleResponse(json);
            if (!data) return [];
            if (!Array.isArray(data)) {
                throw new Error('fetchMarketMatches returned an unexpected response shape: expected an array');
            }
            return (data as any[]).map(parseMatchResult);
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchMarketMatches: ${error}`);
        }
    }

    /**
     * @deprecated Use {@link fetchMarketMatches} instead.
     */
    async fetchMatches(market: UnifiedMarket): Promise<MatchResult[]>;
    async fetchMatches(params?: {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
        query?: string;
        category?: string;
        relation?: MatchRelation;
        minConfidence?: number;
        limit?: number;
        includePrices?: boolean;
    }): Promise<MatchResult[]>;
    async fetchMatches(marketOrParams: UnifiedMarket | {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
        query?: string;
        category?: string;
        relation?: MatchRelation;
        minConfidence?: number;
        limit?: number;
        includePrices?: boolean;
    } = {}): Promise<MatchResult[]> {
        logger.warn('fetchMatches is deprecated, use fetchMarketMatches instead');
        return this.fetchMarketMatches(marketOrParams as any);
    }

    /**
     * Match an entire event across venues.
     *
     * @param eventOrParams - A UnifiedEvent, or an options object.
     */
    async fetchEventMatches(event: UnifiedEvent): Promise<EventMatchResult[]>;
    async fetchEventMatches(params?: {
        event?: UnifiedEvent;
        eventId?: string;
        slug?: string;
        query?: string;
        category?: string;
        relation?: MatchRelation;
        minConfidence?: number;
        limit?: number;
        includePrices?: boolean;
    }): Promise<EventMatchResult[]>;
    async fetchEventMatches(eventOrParams: UnifiedEvent | {
        event?: UnifiedEvent;
        eventId?: string;
        slug?: string;
        query?: string;
        category?: string;
        relation?: MatchRelation;
        minConfidence?: number;
        limit?: number;
        includePrices?: boolean;
    } = {}): Promise<EventMatchResult[]> {
        const params = 'title' in eventOrParams && 'markets' in eventOrParams ? { event: eventOrParams as UnifiedEvent } : eventOrParams;
        await this.initPromise;
        const query: Record<string, unknown> = {};
        const eventId = params.eventId ?? (!params.event?.slug ? params.event?.id : undefined);
        if (eventId) query.eventId = eventId;
        if (params.slug ?? params.event?.slug) query.slug = params.slug ?? params.event?.slug;
        if (params.query) query.query = params.query;
        if (params.category) query.category = params.category;
        if (params.relation) query.relation = params.relation;
        if (params.minConfidence !== undefined) query.minConfidence = params.minConfidence;
        if (params.limit !== undefined) query.limit = params.limit;
        if (params.includePrices) query.includePrices = true;

        try {
            const json = await this.sidecarReadRequest('fetchEventMatches', query, [query]);
            const data = this.handleResponse(json);
            if (!data) return [];
            if (!Array.isArray(data)) {
                throw new Error('fetchEventMatches returned an unexpected response shape: expected an array');
            }
            return (data as any[]).map((entry) => {
                const event = convertEvent(entry.event || {});
                return {
                    ...event,
                    event,
                    marketMatches: (entry.marketMatches || []).map(parseMatchResult),
                };
            });
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchEventMatches: ${error}`);
        }
    }

    /**
     * Fetch connected clusters of semantically matched markets across venues.
     *
     * @param marketOrParams - A UnifiedMarket, or an options object.
     */
    async fetchMatchedMarketClusters(market: UnifiedMarket): Promise<MatchedMarketCluster[]>;
    async fetchMatchedMarketClusters(params?: FetchMatchedMarketClustersParams): Promise<MatchedMarketCluster[]>;
    async fetchMatchedMarketClusters(
        marketOrParams: UnifiedMarket | FetchMatchedMarketClustersParams = {},
    ): Promise<MatchedMarketCluster[]> {
        const params: FetchMatchedMarketClustersParams = isUnifiedMarket(marketOrParams)
            ? { market: marketOrParams }
            : marketOrParams;
        await this.initPromise;

        const query: Record<string, unknown> = {};
        const marketId = params.marketId ?? params.market?.marketId;
        const slug = params.slug ?? (!marketId ? params.market?.slug : undefined);
        const url = params.url ?? (!marketId && !slug ? params.market?.url : undefined);
        appendQuery(query, 'marketId', marketId);
        appendQuery(query, 'slug', slug);
        appendQuery(query, 'url', url);
        addClusterFilters(query, params);

        try {
            const raw = await this.catalogReadRequest('/v0/matched-market-clusters', query);
            return extractCatalogArray(raw).map(parseMatchedMarketCluster);
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchMatchedMarketClusters: ${error}`);
        }
    }

    /**
     * Fetch connected clusters of semantically matched events across venues.
     *
     * @param eventOrParams - A UnifiedEvent, or an options object.
     */
    async fetchMatchedEventClusters(event: UnifiedEvent): Promise<MatchedEventCluster[]>;
    async fetchMatchedEventClusters(params?: FetchMatchedEventClustersParams): Promise<MatchedEventCluster[]>;
    async fetchMatchedEventClusters(
        eventOrParams: UnifiedEvent | FetchMatchedEventClustersParams = {},
    ): Promise<MatchedEventCluster[]> {
        const params: FetchMatchedEventClustersParams = isUnifiedEvent(eventOrParams)
            ? { event: eventOrParams }
            : eventOrParams;
        await this.initPromise;

        const query: Record<string, unknown> = {};
        const eventId = params.eventId ?? params.event?.id;
        const slug = params.slug ?? (!eventId ? params.event?.slug : undefined);
        const url = params.url ?? (!eventId && !slug ? params.event?.url : undefined);
        appendQuery(query, 'eventId', eventId);
        appendQuery(query, 'slug', slug);
        appendQuery(query, 'url', url);
        addClusterFilters(query, params);

        try {
            const raw = await this.catalogReadRequest('/v0/matched-event-clusters', query);
            return extractCatalogArray(raw).map(parseMatchedEventCluster);
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchMatchedEventClusters: ${error}`);
        }
    }

    // ------------------------------------------------------------------
    // Price comparison
    // ------------------------------------------------------------------

    /**
     * Compare prices for the same market across venues.
     *
     * @param marketOrParams - A UnifiedMarket, or an options object.
     */
    async compareMarketPrices(market: UnifiedMarket): Promise<PriceComparison[]>;
    async compareMarketPrices(params?: {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
    }): Promise<PriceComparison[]>;
    async compareMarketPrices(marketOrParams: UnifiedMarket | {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
    } = {}): Promise<PriceComparison[]> {
        const params = 'title' in marketOrParams ? { market: marketOrParams as UnifiedMarket } : marketOrParams;
        await this.initPromise;
        const query: Record<string, unknown> = {};
        const marketId = params.marketId ?? params.market?.marketId;
        if (marketId) query.marketId = marketId;
        if (params.slug) query.slug = params.slug;
        if (params.url) query.url = params.url;

        try {
            const url = `${this.config.basePath}/api/${this.exchangeName}/compareMarketPrices`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args: [query], credentials: this.getCredentials() }),
                signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === 'object') {
                    const { fromServerError } = await import('./errors.js');
                    throw fromServerError(body.error);
                }
                throw new Error(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            if (!data) return [];
            return (data as any[]).map((r) => {
                const marketPayload = r.market || {};
                const market = convertMarket(marketPayload);
                // Hosted /api/router response carries the live bid/ask on the
                // nested market (and the venue via market.sourceExchange). The
                // top-level bestBid/bestAsk/venue fields are legacy and often
                // null on the wire, so prefer the market fields and fall back
                // to the top-level only when needed.
                const bestBid =
                    r.bestBid ?? (market as any).bestBid ?? marketPayload.bestBid ?? null;
                const bestAsk =
                    r.bestAsk ?? (market as any).bestAsk ?? marketPayload.bestAsk ?? null;
                const venue =
                    r.venue || (market as any).sourceExchange || marketPayload.sourceExchange || '';
                return {
                    market,
                    relation: r.relation || 'identity',
                    confidence: r.confidence || 0,
                    reasoning: r.reasoning,
                    bestBid,
                    bestAsk,
                    venue,
                };
            });
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to compareMarketPrices: ${error}`);
        }
    }

    // ------------------------------------------------------------------
    // Hedging
    // ------------------------------------------------------------------

    /**
     * Find markets that partially hedge a position.
     *
     * @param marketOrParams - A UnifiedMarket, or an options object.
     */
    async fetchHedges(market: UnifiedMarket): Promise<PriceComparison[]>;
    async fetchHedges(params?: {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
    }): Promise<PriceComparison[]>;
    async fetchHedges(marketOrParams: UnifiedMarket | {
        market?: UnifiedMarket;
        marketId?: string;
        slug?: string;
        url?: string;
    } = {}): Promise<PriceComparison[]> {
        const params = 'title' in marketOrParams ? { market: marketOrParams as UnifiedMarket } : marketOrParams;
        await this.initPromise;
        const query: Record<string, unknown> = {};
        const marketId = params.marketId ?? params.market?.marketId;
        if (marketId) query.marketId = marketId;
        if (params.slug) query.slug = params.slug;
        if (params.url) query.url = params.url;

        try {
            const json = await this.sidecarReadRequest('fetchHedges', query, [query]);
            const data = this.handleResponse(json);
            if (!data) return [];
            return (data as any[]).map((r) => {
                const marketPayload = r.market || {};
                const market = convertMarket(marketPayload);
                const bestBid =
                    r.bestBid ?? (market as any).bestBid ?? marketPayload.bestBid ?? null;
                const bestAsk =
                    r.bestAsk ?? (market as any).bestAsk ?? marketPayload.bestAsk ?? null;
                const venue =
                    r.venue || (market as any).sourceExchange || marketPayload.sourceExchange || '';
                return {
                    market,
                    relation: r.relation || 'identity',
                    confidence: r.confidence || 0,
                    reasoning: r.reasoning,
                    bestBid,
                    bestAsk,
                    venue,
                };
            });
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchHedges: ${error}`);
        }
    }

    // ------------------------------------------------------------------
    // Arbitrage
    // ------------------------------------------------------------------

    /**
     * Scan for cross-venue arbitrage opportunities.
     *
     * @param params.minSpread - Only return pairs with spread >= this value.
     * @param params.category - Filter source markets by category.
     * @param params.limit - Max source markets to scan (default: 50).
     * @param params.relations - Relation types to include (default: ['identity']).
     */
    async fetchArbitrage(params: {
        minSpread?: number;
        category?: string;
        limit?: number;
        relations?: MatchRelation[];
    } = {}): Promise<ArbitrageOpportunity[]> {
        await this.initPromise;
        const query: Record<string, unknown> = {};
        if (params.minSpread !== undefined) query.minSpread = params.minSpread;
        if (params.category) query.category = params.category;
        if (params.limit !== undefined) query.limit = params.limit;
        if (params.relations && params.relations.length > 0) {
            query.relations = params.relations.join(',');
        }

        try {
            const json = await this.sidecarReadRequest('fetchArbitrage', query, [query]);
            const data = this.handleResponse(json);
            if (!data) return [];
            return (data as any[]).map((r) => ({
                marketA: convertMarket(r.marketA || {}),
                marketB: convertMarket(r.marketB || {}),
                spread: r.spread || 0,
                buyVenue: r.buyVenue || '',
                sellVenue: r.sellVenue || '',
                buyPrice: r.buyPrice || 0,
                sellPrice: r.sellPrice || 0,
                relation: r.relation,
                confidence: r.confidence,
            }));
        } catch (error) {
            if (error instanceof Error) throw error;
            throw new Error(`Failed to fetchArbitrage: ${error}`);
        }
    }
}
