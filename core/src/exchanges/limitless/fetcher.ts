import { AxiosInstance } from 'axios';
import { MarketFetchParams, EventFetchParams, OHLCVParams, TradesParams, MyTradesParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { DEFAULT_LIMITLESS_API_URL, paginateLimitlessMarkets } from './utils';
import { limitlessErrorMapper } from './errors';
import { validateIdFormat } from '../../utils/validation';

// ---------------------------------------------------------------------------
// Raw venue-native types (what the Limitless API / SDK returns)
// ---------------------------------------------------------------------------

export interface LimitlessRawMarket {
    slug: string;
    title?: string;
    question?: string;
    description?: string;
    tokens?: Record<string, string>;
    prices?: number[];
    tradePrices?: {
        buy?: { market?: number[]; limit?: number[] };
        sell?: { market?: number[]; limit?: number[] };
    };
    expirationTimestamp?: string;
    volumeFormatted?: number;
    volume?: number;
    logo?: string | null;
    categories?: string[];
    tags?: string[];
    markets?: LimitlessRawMarket[];
    expired?: boolean;
    winningOutcomeIndex?: number | null;
    tradeType?: string;
    [key: string]: unknown;
}

export interface LimitlessRawEvent {
    slug: string;
    title?: string;
    question?: string;
    description?: string;
    logo?: string | null;
    categories?: string[];
    tags?: string[];
    markets?: LimitlessRawMarket[];
    expired?: boolean;
    winningOutcomeIndex?: number | null;
    [key: string]: unknown;
}

export interface LimitlessRawPricePoint {
    price: number | string;
    timestamp: number | string;
    [key: string]: unknown;
}

export interface LimitlessRawOrderBookLevel {
    price: number | string;
    size: number | string;
    [key: string]: unknown;
}

export interface LimitlessRawOrderBook {
    bids: LimitlessRawOrderBookLevel[];
    asks: LimitlessRawOrderBookLevel[];
    timestamp?: number;
    [key: string]: unknown;
}

export interface LimitlessRawTrade {
    id?: string;
    timestamp?: number;
    createdAt?: string;
    price?: string;
    quantity?: string;
    amount?: string;
    side?: string;
    orderId?: string;
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export class LimitlessFetcher implements IExchangeFetcher<LimitlessRawMarket, LimitlessRawEvent> {
    private readonly ctx: FetcherContext;
    private readonly http: AxiosInstance;
    private readonly apiKey?: string;
    private readonly apiUrl: string;

    constructor(ctx: FetcherContext, http: AxiosInstance, apiKey?: string, apiUrl?: string) {
        this.ctx = ctx;
        this.http = http;
        this.apiKey = apiKey;
        this.apiUrl = apiUrl || DEFAULT_LIMITLESS_API_URL;
    }

    async fetchRawMarkets(params?: MarketFetchParams): Promise<LimitlessRawMarket[]> {
        if (params?.status === 'inactive' || params?.status === 'closed') {
            return [];
        }

        const { HttpClient, MarketFetcher } = await import('@limitless-exchange/sdk');

        try {
            const httpClient = new HttpClient({
                baseURL: this.apiUrl,
                apiKey: this.apiKey,
                timeout: 30000,
            });
            const marketFetcher = new MarketFetcher(httpClient);

            if (params?.marketId) {
                return this.fetchRawMarketBySlug(marketFetcher, params.marketId);
            }

            if (params?.slug) {
                return this.fetchRawMarketBySlug(marketFetcher, params.slug);
            }

            if (params?.eventId) {
                return this.fetchRawMarketBySlug(marketFetcher, params.eventId);
            }

            if (params?.query) {
                return this.searchRawMarkets(params.query, params);
            }

            return this.fetchRawMarketsDefault(marketFetcher, params);
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchRawEvents(params: EventFetchParams): Promise<LimitlessRawEvent[]> {
        try {
            if (params.eventId || params.slug) {
                const slug = params.eventId || params.slug!;
                return this.fetchRawEventBySlug(slug);
            }

            if (params.query) {
                return this.searchRawEvents(params);
            }

            return this.fetchRawEventsDefault(params);
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchRawOHLCV(id: string, params: OHLCVParams): Promise<LimitlessRawPricePoint[]> {
        validateIdFormat(id, 'OHLCV');

        if (!params.resolution) {
            throw new Error('fetchOHLCV requires a resolution parameter. Use OHLCVParams with resolution specified.');
        }

        try {
            const { mapIntervalToFidelity } = await import('./utils');
            const fidelity = mapIntervalToFidelity(params.resolution);
            const data = await this.ctx.callApi('MarketOrderbookController_getHistoricalPrice', { slug: id, fidelity });
            return data.prices || [];
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchRawOrderBook(id: string): Promise<LimitlessRawOrderBook> {
        validateIdFormat(id, 'OrderBook');

        try {
            const data = await this.ctx.callApi('MarketOrderbookController_getOrderbook', { slug: id });
            return {
                bids: data.bids || [],
                asks: data.asks || [],
                timestamp: data.timestamp,
            };
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchRawTrades(_id: string, _params: TradesParams): Promise<LimitlessRawTrade[]> {
        throw limitlessErrorMapper.mapError(
            new Error('Limitless fetchTrades not implemented: No public market trades API available.')
        );
    }

    async fetchRawMyTrades(_params: MyTradesParams, apiKey: string): Promise<LimitlessRawTrade[]> {
        try {
            const response = await this.http.get(`${this.apiUrl}/portfolio/trades`, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            const trades = Array.isArray(response.data) ? response.data : (response.data?.data || []);
            return trades;
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchRawPositions(account: string): Promise<unknown[]> {
        const result = await this.ctx.callApi('PublicPortfolioController_getPositions', { account });
        const raw: any[] = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
        return raw.filter((p: any) => p.market?.slug);
    }

    // -- Private helpers -------------------------------------------------------

    private async fetchRawMarketBySlug(marketFetcher: any, slug: string): Promise<LimitlessRawMarket[]> {
        const market = await marketFetcher.getMarket(slug);
        return market ? [market] : [];
    }

    private async searchRawMarkets(query: string, params?: MarketFetchParams): Promise<LimitlessRawMarket[]> {
        // Limitless search API caps limit at 100.
        const limit = Math.min(params?.limit || 100, 100);
        const data = await this.ctx.callApi('MarketSearchController_search', {
            query: query,
            limit,
            page: params?.page || 1,
            similarityThreshold: params?.similarityThreshold || 0.5,
        });

        const rawResults = data?.markets || [];
        const allRawMarkets: LimitlessRawMarket[] = [];

        for (const res of rawResults) {
            if (res.markets && Array.isArray(res.markets)) {
                for (const child of res.markets) {
                    allRawMarkets.push({
                        ...child,
                        __pmxtEventId: res.slug,
                        __pmxtEventTitle: res.title || res.question,
                        __pmxtEventDescription: res.description,
                        __pmxtCategories: res.categories,
                        __pmxtTags: res.tags,
                    });
                }
            } else {
                allRawMarkets.push(res);
            }
        }

        return allRawMarkets;
    }

    private async fetchRawMarketsDefault(marketFetcher: any, params?: MarketFetchParams): Promise<LimitlessRawMarket[]> {
        const limit = params?.limit || 250000;
        const offset = params?.offset || 0;

        let sortBy: 'lp_rewards' | 'ending_soon' | 'newest' | 'high_value' = 'lp_rewards';
        if (params?.sort === 'volume') {
            sortBy = 'high_value';
        }

        try {
            const totalToFetch = limit + offset;
            return await paginateLimitlessMarkets(marketFetcher, totalToFetch, sortBy);
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    private async fetchRawEventBySlug(slug: string): Promise<LimitlessRawEvent[]> {
        const { HttpClient, MarketFetcher } = await import('@limitless-exchange/sdk');
        const httpClient = new HttpClient({ baseURL: this.apiUrl, timeout: 30000 });
        const marketFetcher = new MarketFetcher(httpClient);

        const market = await marketFetcher.getMarket(slug);
        return market ? [market as any] : [];
    }

    private async searchRawEvents(params: EventFetchParams): Promise<LimitlessRawEvent[]> {
        // Limitless search API caps limit at 100.
        const limit = Math.min(params?.limit || 100, 100);
        const data = await this.ctx.callApi('MarketSearchController_search', {
            query: params.query,
            limit,
            similarityThreshold: 0.5,
        });

        let markets = data?.markets || [];

        const status = params?.status || 'active';
        if (status === 'active') {
            markets = markets.filter((m: any) => !m.expired && m.winningOutcomeIndex === null);
        } else if (status === 'inactive' || status === 'closed') {
            markets = markets.filter((m: any) => m.expired === true || m.winningOutcomeIndex !== null);
        }

        return markets;
    }

    private async fetchRawEventsDefault(params: EventFetchParams): Promise<LimitlessRawEvent[]> {
        const limit = params?.limit || 250000;
        const pageSize = 25;
        const MAX_PAGES = 40;
        const sortBy = params?.sort === 'newest' ? 'newest' : params?.sort === 'liquidity' ? 'lp_rewards' : 'high_value';

        // Fetch group events and all markets in parallel.
        // The second call omits tradeType so the API returns every trade type.
        const [groupEvents, allMarkets] = await Promise.all([
            this.fetchPaginatedActive({ tradeType: 'group', sortBy, pageSize, maxPages: MAX_PAGES, limit }),
            this.fetchPaginatedActive({ sortBy, pageSize, maxPages: MAX_PAGES, limit }),
        ]);

        // Collect slugs already covered by group events (the group slug
        // itself plus every child market slug inside it)
        const coveredSlugs = new Set<string>();
        for (const group of groupEvents) {
            coveredSlugs.add(group.slug);
            if (Array.isArray(group.markets)) {
                for (const child of group.markets) {
                    if (child.slug) coveredSlugs.add(child.slug);
                }
            }
        }

        // Keep only standalone markets not already part of a group.
        // Wrap each as a LimitlessRawEvent without a markets array so
        // normalizeEvent() treats it as a single-market event.
        const standaloneEvents: LimitlessRawEvent[] = allMarkets
            .filter((m: any) => !coveredSlugs.has(m.slug) && m.tradeType !== 'group')
            .map((m: any): LimitlessRawEvent => ({
                ...m,
                // Explicitly omit the markets array so the normalizer wraps
                // the top-level fields as a single-market event
                markets: undefined,
            }));

        const combined = [...groupEvents, ...standaloneEvents];
        return combined.slice(0, limit);
    }

    /**
     * Generic paginated fetch against /markets/active.
     * When tradeType is omitted the API returns all trade types.
     */
    private async fetchPaginatedActive(opts: {
        tradeType?: string;
        sortBy: string;
        pageSize: number;
        maxPages: number;
        limit: number;
    }): Promise<any[]> {
        const { tradeType, sortBy, pageSize, maxPages, limit } = opts;
        let page = 1;
        const results: any[] = [];

        while (results.length < limit && page <= maxPages) {
            const queryParams: Record<string, unknown> = {
                page,
                limit: pageSize,
                sortBy,
            };
            if (tradeType) {
                queryParams.tradeType = tradeType;
            }

            const response = await this.http.get(`${this.apiUrl}/markets/active`, {
                params: queryParams,
            });

            const items: any[] = response.data?.data || response.data || [];
            if (items.length === 0) break;

            for (const item of items) {
                if (results.length >= limit) break;
                results.push(item);
            }

            if (items.length < pageSize) break;
            page++;
        }

        return results;
    }
}
