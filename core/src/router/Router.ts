import {
    PredictionMarketExchange,
    type ExchangeCredentials,
    type MarketFetchParams,
    type EventFetchParams,
} from '../BaseExchange';
import type { UnifiedMarket, UnifiedEvent, OrderBook, OrderLevel, MarketOutcome } from '../types';
import { PmxtApiClient } from './client';
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

export class Router extends PredictionMarketExchange {
    private readonly client: PmxtApiClient;
    private readonly exchanges: Record<string, PredictionMarketExchange>;

    constructor(options: RouterOptions) {
        super({ apiKey: options.apiKey } as ExchangeCredentials);
        this.client = new PmxtApiClient(options.apiKey, options.baseUrl);
        this.exchanges = options.exchanges ?? {};
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
        });
        if (!Array.isArray(response)) {
            throw new Error(
                `fetchMarketsImpl: expected array from searchMarkets but received ${typeof response}`,
            );
        }
        return response;
    }

    protected async fetchEventsImpl(params?: EventFetchParams): Promise<UnifiedEvent[]> {
        const response = await this.client.searchEvents({
            query: params?.query,
            category: params?.category,
            limit: params?.limit,
            offset: params?.offset,
        });
        if (!Array.isArray(response)) {
            throw new Error(
                `fetchEventsImpl: expected array from searchEvents but received ${typeof response}`,
            );
        }
        return response;
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
            if (params.market.slug && !params.slug) {
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

        // Lookup mode: find matches for a specific market.
        const response = await this.client.getMarketMatches(params);
        const matches = response.matches ?? [];
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
        console.warn('[pmxt] fetchMatches is deprecated, use fetchMarketMatches instead');
        return this.fetchMarketMatches(params);
    }

    // -----------------------------------------------------------------------
    // Cross-exchange event matches
    // -----------------------------------------------------------------------

    async fetchEventMatches(params: FetchEventMatchesParams = {}): Promise<EventMatchResult[]> {
        if (params.event && !params.eventId) {
            if (params.event.slug && !params.slug) {
                params = { ...params, slug: params.event.slug };
            } else {
                params = { ...params, eventId: params.event.id };
            }
        }

        // Browse mode: no specific event identifier → return all matches
        const hasIdentifier = params.eventId || params.slug;
        if (!hasIdentifier) {
            const results = await this.client.browseEventMatches(params);
            return Array.isArray(results) ? results : [];
        }

        // Lookup mode: find matches for a specific event.
        const response = await this.client.getEventMatches(params);
        return response.matches ?? [];
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
        console.warn('[pmxt] fetchHedges is deprecated, use fetchRelatedMarkets instead');
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
        console.warn('[pmxt] fetchMatchedPrices is deprecated, use fetchMatchedMarkets instead');
        return this.fetchMatchedMarkets(params);
    }

    /** @deprecated Use {@link fetchMatchedMarkets} instead. */
    async fetchArbitrage(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]> {
        console.warn('[pmxt] fetchArbitrage is deprecated, use fetchMatchedPrices instead');
        return this.fetchArbitrageInternal(params);
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
                console.warn('[pmxt] Router: bulk arbitrage endpoint unavailable, falling back to N+1 approach');
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

        const res = await this.client.getArbitrage(query);
        // getArbitrage already unwraps .data — res is the opportunities array.
        const items: any[] = Array.isArray(res) ? res : (res?.data ?? []);

        return items.map((r: any) => {
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
