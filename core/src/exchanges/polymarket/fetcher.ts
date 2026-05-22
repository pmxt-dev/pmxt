import { AxiosInstance } from 'axios';
import { MarketFilterParams, EventFetchParams, OHLCVParams, TradesParams, MyTradesParams } from '../../BaseExchange';
import { NotFound, OrderNotFound } from '../../errors';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { GAMMA_API_URL, GAMMA_SEARCH_URL, paginateParallel, paginateSearchParallel } from './utils';
import { polymarketErrorMapper } from './errors';

/**
 * Coerce a value that should be a Date into an actual Date instance.
 * Handles strings (ISO 8601), epoch numbers (seconds or milliseconds),
 * and passthrough for values that are already Date objects.
 */
function ensureDate(d: unknown): Date {
    if (d instanceof Date) return d;
    if (typeof d === 'number') {
        // Heuristic: values < 1e12 are epoch seconds, otherwise ms
        return new Date(d < 1e12 ? d * 1000 : d);
    }
    if (typeof d === 'string') {
        if (!d.endsWith('Z') && !d.match(/[+-]\d{2}:\d{2}$/)) {
            return new Date(d + 'Z');
        }
        return new Date(d);
    }
    return new Date(d as any);
}

// ----------------------------------------------------------------------------
// Raw venue-native types (what the Polymarket API returns)
// ----------------------------------------------------------------------------

export interface PolymarketRawEvent {
    id?: string;
    slug?: string;
    title?: string;
    description?: string;
    image?: string;
    category?: string;
    active?: boolean;
    closed?: boolean;
    tags?: Array<{ label: string }>;
    markets?: PolymarketRawMarket[];
    [key: string]: unknown;
}

export interface PolymarketRawMarket {
    id?: string;
    question?: string;
    description?: string;
    outcomes?: string | string[];
    outcomePrices?: string | string[];
    clobTokenIds?: string | string[];
    groupItemTitle?: string;
    endDate?: string;
    end_date_iso?: string;
    volume24hr?: number | string;
    volume_24h?: number | string;
    volume?: number | string;
    liquidity?: number | string;
    openInterest?: number | string;
    open_interest?: number | string;
    oneDayPriceChange?: number | string;
    image?: string;
    rewards?: { liquidity?: number };
    events?: PolymarketRawEvent[];
    [key: string]: unknown;
}

export interface PolymarketRawOHLCVPoint {
    t: number;
    p: number;
    s?: number;
    v?: number;
}

export interface PolymarketRawOrderBookLevel {
    price: string;
    size: string;
}

export interface PolymarketRawOrderBook {
    asset_id: string;
    bids?: PolymarketRawOrderBookLevel[];
    asks?: PolymarketRawOrderBookLevel[];
    timestamp?: string | number;
}

export interface PolymarketRawTrade {
    id?: string;
    transactionHash?: string;
    timestamp: number;
    price: string;
    size?: string;
    amount?: string;
    side?: string;
    orderId?: string;
    asset?: string;
}

export interface PolymarketRawPosition {
    conditionId?: string;
    /** Gamma market ID resolved from conditionId. Set by enrichPositionsWithMarketIds. */
    resolvedMarketId?: string;
    asset?: string;
    outcome?: string;
    size: string;
    avgPrice: string;
    curPrice?: string;
    cashPnl?: string;
    realizedPnl?: string;
}

const GAMMA_MARKETS_URL = process.env.POLYMARKET_GAMMA_MARKETS_URL || 'https://gamma-api.polymarket.com/markets';

export class PolymarketFetcher implements IExchangeFetcher<PolymarketRawEvent, PolymarketRawEvent> {
    private readonly ctx: FetcherContext;
    private readonly http: AxiosInstance;

    constructor(ctx: FetcherContext, http: AxiosInstance) {
        this.ctx = ctx;
        this.http = http;
    }

    // ------------------------------------------------------------------------
    // Markets
    // ------------------------------------------------------------------------

    async fetchRawMarkets(params?: MarketFilterParams): Promise<PolymarketRawEvent[]> {
        try {
            if (params?.marketId) {
                return this.fetchRawMarketById(params.marketId);
            }

            if (params?.slug) {
                return this.fetchRawMarketsBySlug(params.slug);
            }

            if (params?.eventId) {
                return this.fetchRawMarketsByEventId(params.eventId);
            }

            if (params?.query) {
                return this.fetchRawMarketsSearch(params);
            }

            return this.fetchRawMarketsDefault(params);
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    // ------------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------------

    async fetchRawEvents(params: EventFetchParams): Promise<PolymarketRawEvent[]> {
        try {
            if (params.eventId || params.slug) {
                const queryParams = params.eventId ? { id: params.eventId } : { slug: params.slug };
                const response = await this.http.get(GAMMA_API_URL, { params: queryParams });
                const events = response.data;
                if (!events || events.length === 0) return [];
                return events.slice(0, params.limit || 10000);
            }

            if (params.query) {
                return this.fetchRawEventsSearch(params);
            }

            return this.fetchRawEventsDefault(params);
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    // ------------------------------------------------------------------------
    // OHLCV
    // ------------------------------------------------------------------------

    async fetchRawOHLCV(id: string, params: OHLCVParams): Promise<{ history: PolymarketRawOHLCVPoint[] }> {
        try {
            const { mapIntervalToFidelity } = await import('./utils');
            const fidelity = mapIntervalToFidelity(params.resolution);
            const nowTs = Math.floor(Date.now() / 1000);

            const pStart = params.start ? ensureDate(params.start) : undefined;
            const pEnd = params.end ? ensureDate(params.end) : undefined;

            let startTs = pStart ? Math.floor(pStart.getTime() / 1000) : 0;
            const endTs = pEnd ? Math.floor(pEnd.getTime() / 1000) : nowTs;

            if (!pStart) {
                const count = params.limit || 100;
                const durationSeconds = count * fidelity * 60;
                startTs = endTs - durationSeconds;
            }

            const queryParams: Record<string, any> = {
                market: id,
                fidelity: fidelity,
                startTs: startTs,
                endTs: endTs,
            };

            const data = await this.ctx.callApi('getPricesHistory', queryParams);
            return { history: data.history || [] };
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    // ------------------------------------------------------------------------
    // Order Book
    // ------------------------------------------------------------------------

    async fetchRawOrderBook(id: string): Promise<PolymarketRawOrderBook> {
        try {
            const data = await this.ctx.callApi('getBook', { token_id: id });
            return data;
        } catch (error: any) {
            const mapped = polymarketErrorMapper.mapError(error);
            // The CLOB returns a generic "order not found" for missing books,
            // which the heuristic mapper mis-categorises as OrderNotFound.
            // Normalise to NotFound so all venues behave the same for order-book lookups.
            if (mapped instanceof OrderNotFound) {
                throw new NotFound(
                    `Order book not found: ${id}. ` +
                    `fetchOrderBook requires an outcome token ID (market.yes.outcomeId or market.no.outcomeId from fetchMarkets), ` +
                    `not a market slug or condition ID.`,
                    'Polymarket',
                );
            }
            throw mapped;
        }
    }

    async fetchRawOrderBooks(ids: string[]): Promise<PolymarketRawOrderBook[]> {
        try {
            const payload = ids.map(id => ({token_id: id}));
            const books: PolymarketRawOrderBook[] = await this.ctx.callApi('postBooks', payload);
            if (books.length !== ids.length) {
                const returned = new Set(books.map(b => b.asset_id));
                const missing = ids.filter(id => !returned.has(id));
                throw new NotFound(`Order book not found for token IDs ${missing.join(', ')}`, 'Polymarket');
            }
            return books;
        } catch (error: any) {
            if (error instanceof NotFound) throw error;
            const mapped = polymarketErrorMapper.mapError(error);
            if (mapped instanceof OrderNotFound) {
                throw new NotFound(
                    `${mapped.message}. ` +
                    `fetchRawOrderBooks requires a list of outcome token IDs` +
                    `(market.yes.outcomeId or market.no.outcomeId from fetchMarkets), ` +
                    `not a market slug or condition ID.`,
                    'Polymarket',
                );
            }
            throw mapped;
        }
    }

    // ------------------------------------------------------------------------
    // Trades
    // ------------------------------------------------------------------------

    async fetchRawTrades(id: string, params: TradesParams): Promise<PolymarketRawTrade[]> {
        try {
            const queryParams: Record<string, any> = {
                asset_id: id,
            };

            if (params.start) {
                queryParams.after = Math.floor(ensureDate(params.start).getTime() / 1000);
            }
            if (params.end) {
                queryParams.before = Math.floor(ensureDate(params.end).getTime() / 1000);
            }

            const trades = await this.ctx.callApi('getTrades', queryParams) || [];
            return trades;
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async fetchRawMyTrades(params: MyTradesParams, walletAddress: string): Promise<PolymarketRawTrade[]> {
        const queryParams: Record<string, any> = { user: walletAddress };
        if (params?.marketId) queryParams.market = params.marketId;
        if (params?.limit) queryParams.limit = params.limit;
        if (params?.since) queryParams.start = Math.floor(ensureDate(params.since).getTime() / 1000);
        if (params?.until) queryParams.end = Math.floor(ensureDate(params.until).getTime() / 1000);

        const data = await this.ctx.callApi('getTrades', queryParams);
        const trades = Array.isArray(data) ? data : (data.data || []);
        return trades;
    }

    // ------------------------------------------------------------------------
    // Positions
    // ------------------------------------------------------------------------

    async fetchRawPositions(walletAddress: string): Promise<PolymarketRawPosition[]> {
        const result = await this.ctx.callApi('getPositions', { user: walletAddress, limit: 100, sizeThreshold: 0 });
        const raw: PolymarketRawPosition[] = Array.isArray(result) ? result : [];
        return this.enrichPositionsWithMarketIds(raw);
    }

    /**
     * Resolve conditionIds to Gamma market IDs in a single batch request.
     * Throws if the Gamma lookup fails — positions must have correct market IDs.
     */
    private async enrichPositionsWithMarketIds(positions: PolymarketRawPosition[]): Promise<PolymarketRawPosition[]> {
        const conditionIds = [...new Set(
            positions.map(p => p.conditionId).filter((id): id is string => !!id),
        )];
        if (conditionIds.length === 0) return positions;

        const conditionToMarketId = await this.resolveConditionIds(conditionIds);

        return positions
            .map(p => ({
                ...p,
                resolvedMarketId: conditionToMarketId.get(p.conditionId ?? '') ?? undefined,
            }));
    }

    private async resolveConditionIds(conditionIds: string[]): Promise<Map<string, string>> {
        const response = await this.http.get(GAMMA_MARKETS_URL, {
            params: { condition_ids: conditionIds.join(',') },
        });
        const markets: any[] = Array.isArray(response.data) ? response.data : [];
        const result = new Map<string, string>();
        for (const market of markets) {
            if (market.conditionId && market.id) {
                result.set(market.conditionId, String(market.id));
            }
        }
        return result;
    }

    // ------------------------------------------------------------------------
    // Private helpers -- Markets
    // ------------------------------------------------------------------------

    private async fetchRawMarketById(marketId: string): Promise<PolymarketRawEvent[]> {
        const response = await this.http.get(GAMMA_MARKETS_URL, {
            params: { id: marketId },
        });

        const markets = response.data;
        if (!markets || markets.length === 0) return [];

        // Wrap each market in an event-like shape for consistent normalizer input
        return markets.map((market: any) => {
            const event = market.events?.[0] || market;
            return { ...event, markets: [market] };
        });
    }

    private async fetchRawMarketsByEventId(eventId: string): Promise<PolymarketRawEvent[]> {
        const response = await this.http.get(GAMMA_API_URL, {
            params: { id: eventId },
        });
        return response.data || [];
    }

    private async fetchRawMarketsBySlug(slug: string): Promise<PolymarketRawEvent[]> {
        const response = await this.http.get(`${GAMMA_MARKETS_URL}/slug/${slug}`);
        const market = response.data;
        if (!market) return [];

        // Wrap in event-like shape for consistent normalizer input
        const event = market.events?.[0] || market;
        return [{ ...event, markets: [market] }];
    }

    private async fetchRawMarketsSearch(params: MarketFilterParams): Promise<PolymarketRawEvent[]> {
        const limit = params?.limit || 250000;

        const queryParams: Record<string, any> = {
            q: params.query,
            limit_per_type: 50,
            events_status: params?.status === 'all' ? undefined : (params?.status === 'inactive' || params?.status === 'closed' ? 'closed' : 'active'),
            sort: 'volume',
            ascending: false,
        };

        return paginateSearchParallel(GAMMA_SEARCH_URL, queryParams, limit * 5, this.http);
    }

    private async fetchRawMarketsDefault(params?: MarketFilterParams): Promise<PolymarketRawEvent[]> {
        const limit = params?.limit || 250000;
        const offset = params?.offset || 0;

        const queryParams: Record<string, any> = {
            limit: limit,
            offset: offset,
        };

        const status = params?.status || 'active';

        if (status === 'active') {
            queryParams.active = 'true';
            queryParams.closed = 'false';
        } else if (status === 'closed' || status === 'inactive') {
            queryParams.active = 'false';
            queryParams.closed = 'true';
        }

        if (params?.sort === 'volume') {
            queryParams.order = 'volume';
            queryParams.ascending = 'false';
        } else if (params?.sort === 'newest') {
            queryParams.order = 'startDate';
            queryParams.ascending = 'false';
        } else {
            queryParams.order = 'volume';
            queryParams.ascending = 'false';
        }

        return paginateParallel(GAMMA_API_URL, queryParams, this.http);
    }

    // ------------------------------------------------------------------------
    // Private helpers -- Events
    // ------------------------------------------------------------------------

    private async fetchRawEventsSearch(params: EventFetchParams): Promise<PolymarketRawEvent[]> {
        const limit = params.limit || 25000;

        let sortParam = 'volume';
        if (params.sort === 'newest') sortParam = 'startDate';
        if (params.sort === 'liquidity') sortParam = 'liquidity';

        const queryParams: Record<string, any> = {
            q: params.query,
            limit_per_type: 50,
            sort: sortParam,
            ascending: false,
        };

        const status = params.status || 'active';

        const fetchWithStatus = async (eventStatus: string | undefined) => {
            const currentParams = { ...queryParams, events_status: eventStatus };
            return paginateSearchParallel(GAMMA_SEARCH_URL, currentParams, limit * 10, this.http);
        };

        const filterActive = (e: any) => e.active === true;
        const filterClosed = (e: any) => e.closed === true;

        let events: any[] = [];
        if (status === 'all') {
            const [activeEvents, closedEvents] = await Promise.all([
                fetchWithStatus('active'),
                fetchWithStatus('closed'),
            ]);
            const seenIds = new Set<string>();
            events = [...activeEvents, ...closedEvents].filter(event => {
                const id = event.id || event.slug;
                if (seenIds.has(id)) return false;
                seenIds.add(id);
                return true;
            });
        } else if (status === 'active') {
            const rawEvents = await fetchWithStatus('active');
            events = rawEvents.filter(filterActive);
        } else if (status === 'inactive' || status === 'closed') {
            const rawEvents = await fetchWithStatus('closed');
            events = rawEvents.filter(filterClosed);
        }

        const lowerQuery = params.query!.toLowerCase();
        const searchIn = params.searchIn || 'title';

        return events.filter((event: any) => {
            const titleMatch = (event.title || '').toLowerCase().includes(lowerQuery);
            const descMatch = (event.description || '').toLowerCase().includes(lowerQuery);
            if (searchIn === 'title') return titleMatch;
            if (searchIn === 'description') return descMatch;
            return titleMatch || descMatch;
        }).slice(0, limit);
    }

    private async fetchRawEventsDefault(params: EventFetchParams): Promise<PolymarketRawEvent[]> {
        const limit = params.limit || 25000;
        const status = params.status || 'active';

        let sortParam = 'volume';
        if (params.sort === 'newest') sortParam = 'startDate';
        else if (params.sort === 'liquidity') sortParam = 'liquidity';

        const queryParams: Record<string, any> = {
            order: sortParam,
            ascending: false,
        };

        if (status === 'active') {
            queryParams.active = 'true';
            queryParams.closed = 'false';
        } else if (status === 'closed' || status === 'inactive') {
            queryParams.active = 'false';
            queryParams.closed = 'true';
        }

        return paginateParallel(GAMMA_API_URL, queryParams, this.http, limit);
    }
}
