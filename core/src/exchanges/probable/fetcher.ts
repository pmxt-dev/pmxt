import { AxiosInstance } from 'axios';
import { MarketFetchParams, EventFetchParams, OHLCVParams, TradesParams, MyTradesParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { DEFAULT_BASE_URL, SEARCH_PATH, MARKETS_PATH, EVENTS_PATH } from './utils';
import { probableErrorMapper } from './errors';

// ---------------------------------------------------------------------------
// Raw venue-native types (what the Probable API returns)
// ---------------------------------------------------------------------------

export interface ProbableRawToken {
    token_id: string;
    outcome?: string;
    [key: string]: unknown;
}

export interface ProbableRawMarket {
    id: number | string;
    question?: string;
    title?: string;
    description?: string;
    slug?: string;
    market_slug?: string;
    endDate?: string;
    volume24hr?: number | string;
    volume?: number | string;
    liquidity?: number | string;
    icon?: string;
    category?: string;
    tags?: string[];
    tokens?: ProbableRawToken[];
    event_id?: number | string;
    event?: ProbableRawEvent;
    [key: string]: unknown;
}

export interface ProbableRawEvent {
    id: number | string;
    title?: string;
    description?: string;
    slug?: string;
    icon?: string;
    image?: string;
    category?: string;
    tags?: string[];
    markets?: ProbableRawMarket[];
    [key: string]: unknown;
}

export interface ProbableRawOrderBook {
    bids?: { price: string; size: string }[];
    asks?: { price: string; size: string }[];
    timestamp?: string | number;
    [key: string]: unknown;
}

export interface ProbableRawPricePoint {
    p: number | string;
    t: number | string;
    [key: string]: unknown;
}

export interface ProbableRawTrade {
    id?: string | number;
    tradeId?: string | number;
    time?: number;
    price?: string | number;
    size?: string | number;
    side?: string;
    orderId?: string;
    [key: string]: unknown;
}

export interface ProbableRawPosition {
    condition_id?: string;
    token_id?: string;
    outcome?: string;
    title?: string;
    size?: string | number;
    avg_price?: string | number;
    cur_price?: string | number;
    cash_pnl?: string | number;
    realized_pnl?: string | number;
    [key: string]: unknown;
}

export class ProbableFetcher implements IExchangeFetcher<ProbableRawMarket, ProbableRawEvent> {
    private readonly ctx: FetcherContext;
    private readonly baseUrl: string;

    constructor(ctx: FetcherContext, baseUrl?: string) {
        this.ctx = ctx;
        this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    }

    // -----------------------------------------------------------------------
    // Markets
    // -----------------------------------------------------------------------

    async fetchRawMarkets(params?: MarketFetchParams): Promise<ProbableRawMarket[]> {
        try {
            if (params?.marketId) {
                return this.fetchRawMarketByIdOrSlug(params.marketId);
            }
            if (params?.slug) {
                return this.fetchRawMarketByIdOrSlug(params.slug);
            }
            if (params?.outcomeId) {
                return this.fetchRawMarketsList(params);
            }
            if (params?.eventId) {
                return this.fetchRawMarketsList(params);
            }
            if (params?.query) {
                return this.fetchRawMarketsViaSearch(params.query, params);
            }
            return this.fetchRawMarketsList(params);
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    async fetchRawEvents(params: EventFetchParams): Promise<ProbableRawEvent[]> {
        try {
            if (params.eventId) {
                const event = await this.fetchRawEventById(params.eventId);
                return event ? [event] : [];
            }
            if (params.slug) {
                const event = await this.fetchRawEventBySlug(params.slug);
                return event ? [event] : [];
            }
            if (params.query) {
                return this.fetchRawEventsViaSearch(params);
            }
            return this.fetchRawEventsList(params);
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    async fetchRawEventById(id: string): Promise<ProbableRawEvent | null> {
        try {
            const numericId = Number(id);
            if (isNaN(numericId)) return null;
            const response = await this.ctx.http.get(`${this.baseUrl}${EVENTS_PATH}${numericId}`);
            return response.data || null;
        } catch (error: any) {
            if (isNotFoundError(error)) return null;
            throw probableErrorMapper.mapError(error);
        }
    }

    async fetchRawEventBySlug(slug: string): Promise<ProbableRawEvent | null> {
        try {
            const response = await this.ctx.http.get(`${this.baseUrl}${EVENTS_PATH}slug/${slug}`);
            return response.data || null;
        } catch (error: any) {
            if (isNotFoundError(error)) return null;
            throw probableErrorMapper.mapError(error);
        }
    }

    // -----------------------------------------------------------------------
    // Order Book
    // -----------------------------------------------------------------------

    async fetchRawOrderBook(id: string): Promise<ProbableRawOrderBook> {
        const data = await this.ctx.callApi('getPublicApiV1Book', { token_id: id });
        return data;
    }

    // -----------------------------------------------------------------------
    // OHLCV
    // -----------------------------------------------------------------------

    async fetchRawOHLCV(id: string, params: OHLCVParams): Promise<ProbableRawPricePoint[]> {
        const INTERVAL_MAP: Record<string, string> = {
            '1m': '1m',
            '5m': '1m',
            '15m': '1m',
            '1h': '1h',
            '6h': '6h',
            '1d': '1d',
        };

        const queryParams: Record<string, any> = {
            market: id,
            interval: INTERVAL_MAP[params.resolution] || '1h',
        };
        if (params.start) queryParams.startTs = Math.floor(params.start.getTime() / 1000);
        if (params.end) queryParams.endTs = Math.floor(params.end.getTime() / 1000);

        const data = await this.ctx.callApi('getPublicApiV1PricesHistory', queryParams);
        if (data != null && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.history)) {
            return data.history;
        }
        if (Array.isArray(data)) {
            return data;
        }
        throw new Error(
            `Probable OHLCV: unexpected response shape (got ${typeof data}). ` +
            `Expected { history: [...] } or an array.`
        );
    }

    // -----------------------------------------------------------------------
    // Trades
    // -----------------------------------------------------------------------

    async fetchRawTrades(id: string, params: TradesParams): Promise<ProbableRawTrade[]> {
        const queryParams: any = { tokenId: id };
        if (params.limit) queryParams.limit = params.limit;

        // Uses CLOB client via callApi -- the SDK class will pass the CLOB
        // client's getTrades through callApi or directly. For now, this goes
        // through the implicit API.
        const data = await this.ctx.callApi('getPublicApiV1Trades', queryParams);
        if (!Array.isArray(data)) {
            throw new Error(
                `Probable trades: unexpected response shape (got ${typeof data}). Expected an array.`
            );
        }
        return data;
    }

    async fetchRawMyTrades(params: MyTradesParams, walletAddress: string): Promise<ProbableRawTrade[]> {
        const queryParams: Record<string, any> = { user: walletAddress };
        if (params?.limit) queryParams.limit = params.limit;

        const data = await this.ctx.callApi('getPublicApiV1Trades', queryParams);
        if (!Array.isArray(data)) {
            throw new Error(
                `Probable myTrades: unexpected response shape (got ${typeof data}). Expected an array.`
            );
        }
        return data;
    }

    // -----------------------------------------------------------------------
    // Positions & Balance
    // -----------------------------------------------------------------------

    async fetchRawPositions(walletAddress: string): Promise<ProbableRawPosition[]> {
        const result = await this.ctx.callApi('getPublicApiV1PositionCurrent', { user: walletAddress, limit: 500 });
        if (!Array.isArray(result)) {
            throw new Error(
                `Probable positions: unexpected response shape (got ${typeof result}). Expected an array.`
            );
        }
        return result;
    }

    // -----------------------------------------------------------------------
    // Midpoint (price enrichment)
    // -----------------------------------------------------------------------

    async fetchRawMidpoint(tokenId: string): Promise<any> {
        return this.ctx.callApi('getPublicApiV1Midpoint', { token_id: tokenId });
    }

    async fetchRawSearch(queryParams: Record<string, any>): Promise<any> {
        return this.ctx.callApi('getPublicApiV1PublicSearch', queryParams);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private async fetchRawMarketByIdOrSlug(slug: string): Promise<ProbableRawMarket[]> {
        let cleanSlug = slug;
        let marketIdFromQuery: string | null = null;

        if (slug.includes('?')) {
            try {
                const urlParts = slug.split('?');
                cleanSlug = urlParts[0];
                const query = urlParts[1];
                const searchParams = new URLSearchParams(query);
                marketIdFromQuery = searchParams.get('market');

                if (marketIdFromQuery) {
                    const result = await this.fetchRawMarketByIdOrSlug(marketIdFromQuery);
                    if (result.length > 0) return result;
                }
            } catch {
                // Fall back to original slug if parsing fails
            }
        }

        const numericId = Number(cleanSlug);
        if (!isNaN(numericId) && String(numericId) === cleanSlug) {
            try {
                const response = await this.ctx.http.get(`${this.baseUrl}${MARKETS_PATH}${numericId}`);
                return response.data ? [response.data] : [];
            } catch (error: any) {
                if (isMarketNotFoundError(error)) {
                    const response = await this.ctx.http.get(`${this.baseUrl}${MARKETS_PATH}`, {
                        params: { page: 1, limit: 100, active: true },
                    });
                    if (!response.data?.markets || !Array.isArray(response.data.markets)) {
                        throw new Error(
                            `Probable markets list: unexpected response shape. Expected { markets: [...] }.`
                        );
                    }
                    const markets: ProbableRawMarket[] = response.data.markets;
                    return markets.filter(m => String(m.id) === cleanSlug);
                }
                throw error;
            }
        }

        return this.fetchRawMarketsViaSearch(cleanSlug, { slug: cleanSlug });
    }

    private async fetchRawMarketsList(params?: MarketFetchParams): Promise<ProbableRawMarket[]> {
        const limit = params?.limit || 20;
        const page = params?.offset ? Math.floor(params.offset / limit) + 1 : 1;

        const queryParams: Record<string, any> = { page, limit };

        if (params?.status) {
            switch (params.status) {
                case 'active':
                    queryParams.active = true;
                    break;
                case 'inactive':
                case 'closed':
                    queryParams.closed = true;
                    break;
                case 'all':
                    break;
            }
        } else {
            queryParams.active = true;
        }

        if ((params as any)?.eventId) {
            queryParams.event_id = (params as any).eventId;
        }

        const response = await this.ctx.http.get(`${this.baseUrl}${MARKETS_PATH}`, { params: queryParams });
        if (!response.data?.markets || !Array.isArray(response.data.markets)) {
            throw new Error(
                `Probable markets list: unexpected response shape. Expected { markets: [...] }.`
            );
        }
        return response.data.markets;
    }

    private async fetchRawMarketsViaSearch(
        query: string,
        params?: MarketFetchParams
    ): Promise<ProbableRawMarket[]> {
        const limit = params?.limit || 20;
        const page = params?.offset ? Math.floor(params.offset / limit) + 1 : 1;

        let searchQuery = query;
        if (query.includes('-')) {
            const tokens = query.split('-');
            searchQuery = tokens.slice(0, 3).join(' ');
        }

        const queryParams: Record<string, any> = { q: searchQuery, page, limit };

        if (params?.status) {
            switch (params.status) {
                case 'inactive':
                case 'closed':
                    queryParams.events_status = 'closed';
                    queryParams.keep_closed_markets = 1;
                    break;
                case 'all':
                    queryParams.events_status = 'all';
                    queryParams.keep_closed_markets = 1;
                    break;
                case 'active':
                default:
                    queryParams.events_status = 'active';
                    queryParams.keep_closed_markets = 0;
                    break;
            }
        } else if (params?.slug) {
            queryParams.events_status = 'all';
            queryParams.keep_closed_markets = 1;
        } else {
            queryParams.events_status = 'active';
            queryParams.keep_closed_markets = 0;
        }

        if (params?.sort) {
            switch (params.sort) {
                case 'volume':
                    queryParams.sort = 'volume';
                    break;
                case 'newest':
                    queryParams.sort = 'created_at';
                    queryParams.ascending = false;
                    break;
            }
        }

        const searchData = await this.ctx.callApi('getPublicApiV1PublicSearch', queryParams);
        if (!searchData?.events || !Array.isArray(searchData.events)) {
            throw new Error(
                `Probable search: unexpected response shape. Expected { events: [...] }.`
            );
        }
        const events: ProbableRawEvent[] = searchData.events;

        const rawMarkets: ProbableRawMarket[] = [];
        for (const event of events) {
            if (event.markets && Array.isArray(event.markets)) {
                for (const market of event.markets) {
                    rawMarkets.push({ ...market, _parentEvent: event } as any);
                }
            }
        }

        return rawMarkets;
    }

    private async fetchRawEventsList(params: EventFetchParams): Promise<ProbableRawEvent[]> {
        const limit = params.limit || 20;
        const page = params.offset ? Math.floor(params.offset / limit) + 1 : 1;

        const queryParams: Record<string, any> = { page, limit };

        if (params.status) {
            switch (params.status) {
                case 'active':
                    queryParams.status = 'active';
                    break;
                case 'inactive':
                case 'closed':
                    queryParams.status = 'closed';
                    break;
                case 'all':
                    queryParams.status = 'all';
                    break;
            }
        } else {
            queryParams.status = 'active';
        }

        queryParams.sort = 'volume';
        queryParams.ascending = false;

        const response = await this.ctx.http.get(`${this.baseUrl}${EVENTS_PATH}`, { params: queryParams });
        const data = response.data;
        if (!Array.isArray(data)) {
            throw new Error(
                `Probable events list: unexpected response shape (got ${typeof data}). Expected an array.`
            );
        }
        return data;
    }

    private async fetchRawEventsViaSearch(params: EventFetchParams): Promise<ProbableRawEvent[]> {
        const limit = params.limit || 20;
        const page = params.offset ? Math.floor(params.offset / limit) + 1 : 1;

        const queryParams: Record<string, any> = {
            q: params.query,
            page,
            limit,
            events_status: mapStatus(params.status),
            keep_closed_markets: params.status === 'all' || params.status === 'inactive' || params.status === 'closed' ? 1 : 0,
        };

        const searchData = await this.ctx.callApi('getPublicApiV1PublicSearch', queryParams);
        if (!searchData?.events || !Array.isArray(searchData.events)) {
            throw new Error(
                `Probable event search: unexpected response shape. Expected { events: [...] }.`
            );
        }
        return searchData.events;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNotFoundError(error: any): boolean {
    const status = error.response?.status;
    if (status === 404 || status === 400) return true;
    if (status === 500) {
        const data = error.response?.data;
        const msg = typeof data === 'string' ? data : (data?.detail || data?.message || '');
        return /not found/i.test(String(msg));
    }
    return false;
}

function isMarketNotFoundError(error: any): boolean {
    const status = error.response?.status;
    if (status === 404 || status === 400) return true;
    if (status === 500) {
        const data = error.response?.data;
        const msg = typeof data === 'string' ? data : (data?.detail || data?.message || '');
        return /not found|failed to retrieve/i.test(String(msg));
    }
    return false;
}

function mapStatus(status?: string): string {
    switch (status) {
        case 'inactive':
        case 'closed':
            return 'closed';
        case 'all':
            return 'all';
        case 'active':
        default:
            return 'active';
    }
}
