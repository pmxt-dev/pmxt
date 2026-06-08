import { MarketFilterParams, EventFetchParams, OHLCVParams, MyTradesParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { opinionErrorMapper } from './errors';
import { DEFAULT_OPINION_API_URL, OPINION_MAX_PAGE_SIZE } from './config';

// ----------------------------------------------------------------------------
// Raw venue-native types (what the Opinion Trade API returns)
// ----------------------------------------------------------------------------

export interface OpinionRawMarket {
    marketId: number;
    marketTitle: string;
    slug?: string;
    status: number;        // 1=Created, 2=Activated, 3=Resolving, 4=Resolved, 5=Failed, 6=Deleted
    statusEnum: string;
    marketType: number;    // 0=Binary, 1=Categorical
    childMarkets?: OpinionRawChildMarket[];
    yesLabel: string;
    noLabel: string;
    rules: string;
    yesTokenId: string;
    noTokenId: string;
    conditionId: string;
    resultTokenId?: string;
    volume: string;
    volume24h: string;
    volume7d?: string;
    quoteToken: string;
    chainId: string;
    questionId: string;
    collection?: OpinionRawCollection;
    createdAt: number;
    cutoffAt: number;
    resolvedAt?: number;
    [key: string]: unknown;
}

export interface OpinionRawChildMarket {
    marketId: number;
    marketTitle: string;
    slug?: string;
    status: number;
    statusEnum: string;
    yesLabel: string;
    noLabel: string;
    rules: string;
    yesTokenId: string;
    noTokenId: string;
    conditionId: string;
    resultTokenId?: string;
    volume: string;
    quoteToken: string;
    chainId: string;
    questionId: string;
    createdAt: number;
    cutoffAt: number;
    resolvedAt?: number;
    [key: string]: unknown;
}

export interface OpinionRawCollection {
    title: string;
    symbol: string;
    frequency: string;
    current?: OpinionRawCollectionPeriod;
    next?: OpinionRawCollectionPeriod[];
}

export interface OpinionRawCollectionPeriod {
    marketId: number;
    period: string;
    startTime: number;
    endTime: number;
    startPrice: string;
    endPrice: string;
}

export interface OpinionRawOrderBook {
    market: string;
    tokenId: string;
    timestamp: number;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
}

export interface OpinionRawPricePoint {
    t: number;  // Unix seconds
    p: string;  // Price string
}

export interface OpinionRawLatestPrice {
    tokenId: string;
    price: string;
    side: string;
    size: string;
    timestamp: number;
}

export interface OpinionRawUserTrade {
    txHash: string;
    marketId: number;
    marketTitle: string;
    rootMarketId?: number;
    rootMarketTitle?: string;
    side: string;          // "BUY" or "SELL"
    outcome: string;
    outcomeSide: number;   // 1=Yes, 2=No
    outcomeSideEnum: string;
    price: string;
    shares: string;
    amount: string;
    fee: string;
    profit: string;
    quoteToken: string;
    quoteTokenUsdPrice: string;
    usdAmount: string;
    status: number;        // 1=Pending, 2=Filled, 3=Canceled, 4=Expired, 5=Failed
    statusEnum: string;
    chainId: string;
    createdAt: number;
    [key: string]: unknown;
}

export interface OpinionRawPosition {
    marketId: number;
    marketTitle: string;
    marketStatus: number;
    marketStatusEnum: string;
    marketCutoffAt: number;
    rootMarketId?: number;
    rootMarketTitle?: string;
    outcome: string;
    outcomeSide: number;   // 1=Yes, 2=No
    outcomeSideEnum: string;
    sharesOwned: string;
    sharesFrozen: string;
    unrealizedPnl: string;
    unrealizedPnlPercent: string;
    dailyPnlChange: string;
    dailyPnlChangePercent: string;
    conditionId: string;
    tokenId: string;
    currentValueInQuoteToken: string;
    avgEntryPrice: string;
    claimStatus: number;
    claimStatusEnum: string;
    quoteToken: string;
    [key: string]: unknown;
}

export interface OpinionRawOrder {
    orderId: string;
    status: number;        // 1=pending, 2=filled, 3=canceled, 4=expired, 5=failed
    statusEnum: string;
    marketId: number;
    marketTitle: string;
    rootMarketId?: number;
    rootMarketTitle?: string;
    side: number;          // 1=buy, 2=sell
    sideEnum: string;
    tradingMethod: number; // 1=market, 2=limit
    tradingMethodEnum: string;
    outcome: string;
    outcomeSide: number;   // 1=yes, 2=no
    outcomeSideEnum: string;
    price: string;
    orderShares: string;
    orderAmount: string;
    filledShares: string;
    filledAmount: string;
    profit: string;
    quoteToken: string;
    createdAt: number;
    expiresAt?: number;
    [key: string]: unknown;
}

// ----------------------------------------------------------------------------
// Response envelope
// ----------------------------------------------------------------------------

interface OpinionApiResponse<T> {
    errno: number;
    errmsg: string;
    result: T;
}

interface PaginatedResult<T> {
    total: number;
    list: T[];
}

// ----------------------------------------------------------------------------
// Sort mapping
// ----------------------------------------------------------------------------

function mapSortBy(sort?: 'volume' | 'liquidity' | 'newest'): number | undefined {
    switch (sort) {
        case 'volume': return 3;   // volume desc
        case 'newest': return 1;   // new
        case 'liquidity': return 3; // no direct liquidity sort; fall back to volume desc
        default: return undefined;
    }
}

function mapStatusFilter(status?: string): string | undefined {
    switch (status) {
        case 'active': return 'activated';
        case 'closed':
        case 'inactive': return 'resolved';
        case 'all': return undefined; // fetch both
        default: return 'activated';
    }
}

// ----------------------------------------------------------------------------
// Max pages guard to avoid runaway pagination
// ----------------------------------------------------------------------------

const MAX_PAGES = 500;

// ----------------------------------------------------------------------------
// Fetcher
// ----------------------------------------------------------------------------

export class OpinionFetcher implements IExchangeFetcher<OpinionRawMarket, OpinionRawMarket> {
    private readonly ctx: FetcherContext;
    private readonly apiUrl: string;

    constructor(ctx: FetcherContext, apiUrl?: string) {
        this.ctx = ctx;
        this.apiUrl = apiUrl || DEFAULT_OPINION_API_URL;
    }

    // -- Markets --------------------------------------------------------------

    async fetchRawMarkets(params?: MarketFilterParams): Promise<OpinionRawMarket[]> {
        try {
            if (params?.marketId) {
                const idStr = String(params.marketId).trim();
                if (!/^\d+$/.test(idStr)) {
                    const err = new Error(
                        `Opinion market IDs must be integers, got: "${params.marketId}"`,
                    );
                    (err as any).status = 400;
                    throw err;
                }
                const id = Number(idStr);
                const market = await this.fetchRawMarketById(id);
                return market ? [market] : [];
            }

            const status = params?.status || 'active';

            if (status === 'all') {
                const [activated, resolved] = await Promise.all([
                    this.fetchMarketPages({ status: 'activated', sort: params?.sort, limit: params?.limit }),
                    this.fetchMarketPages({ status: 'resolved', sort: params?.sort, limit: params?.limit }),
                ]);
                return [...activated, ...resolved];
            }

            const apiStatus = mapStatusFilter(status);
            return this.fetchMarketPages({
                status: apiStatus,
                sort: params?.sort,
                limit: params?.limit,
            });
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- Events (categorical markets) -----------------------------------------

    async fetchRawEvents(params: EventFetchParams): Promise<OpinionRawMarket[]> {
        try {
            if (params.eventId) {
                const id = Number(params.eventId);
                if (Number.isNaN(id)) {
                    throw new Error(`Invalid Opinion event ID: "${params.eventId}"`);
                }
                const market = await this.fetchRawCategoricalMarketById(id);
                return market ? [market] : [];
            }

            const status = params.status || 'active';

            if (status === 'all') {
                const [activated, resolved] = await Promise.all([
                    this.fetchMarketPages({ status: 'activated', marketType: 1, sort: params.sort, limit: params.limit }),
                    this.fetchMarketPages({ status: 'resolved', marketType: 1, sort: params.sort, limit: params.limit }),
                ]);
                return [...activated, ...resolved];
            }

            const apiStatus = mapStatusFilter(status);
            return this.fetchMarketPages({
                status: apiStatus,
                marketType: 1,
                sort: params.sort,
                limit: params.limit,
            });
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- Single market detail -------------------------------------------------

    async fetchRawMarketById(marketId: number): Promise<OpinionRawMarket | null> {
        try {
            const response = await this.ctx.http.get<OpinionApiResponse<{ data: OpinionRawMarket }>>(
                `${this.apiUrl}/market/${marketId}`,
                { headers: this.ctx.getHeaders() },
            );
            this.assertSuccess(response.data);
            return response.data.result?.data ?? null;
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- Categorical market detail --------------------------------------------

    async fetchRawCategoricalMarketById(marketId: number): Promise<OpinionRawMarket | null> {
        try {
            const response = await this.ctx.http.get<OpinionApiResponse<{ data: OpinionRawMarket }>>(
                `${this.apiUrl}/market/categorical/${marketId}`,
                { headers: this.ctx.getHeaders() },
            );
            this.assertSuccess(response.data);
            return response.data.result?.data ?? null;
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- Order book -----------------------------------------------------------

    async fetchRawOrderBook(tokenId: string): Promise<OpinionRawOrderBook> {
        try {
            const response = await this.ctx.http.get<OpinionApiResponse<OpinionRawOrderBook>>(
                `${this.apiUrl}/token/orderbook`,
                {
                    params: { token_id: tokenId },
                    headers: this.ctx.getHeaders(),
                },
            );
            this.assertSuccess(response.data);
            return response.data.result;
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- Price history --------------------------------------------------------

    async fetchRawPriceHistory(
        tokenId: string,
        params: { interval?: string; startAt?: number; endAt?: number },
    ): Promise<OpinionRawPricePoint[]> {
        try {
            const queryParams: Record<string, any> = { token_id: tokenId };
            if (params.interval) queryParams.interval = params.interval;
            if (params.startAt !== undefined) queryParams.start_at = params.startAt;
            if (params.endAt !== undefined) queryParams.end_at = params.endAt;

            const response = await this.ctx.http.get<OpinionApiResponse<{ history: OpinionRawPricePoint[] }>>(
                `${this.apiUrl}/token/price-history`,
                { params: queryParams, headers: this.ctx.getHeaders() },
            );
            this.assertSuccess(response.data);
            return response.data.result?.history ?? [];
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- OHLCV (wraps price history for the interface) ------------------------

    async fetchRawOHLCV(id: string, params: OHLCVParams): Promise<OpinionRawPricePoint[]> {
        const intervalMap: Record<string, string> = {
            '1m': '1m',
            '5m': '1m',   // closest available
            '15m': '1m',
            '1h': '1h',
            '4h': '1h',
            '1d': '1d',
            '1w': '1w',
        };

        const interval = intervalMap[params.resolution] || '1d';
        const nowSec = Math.floor(Date.now() / 1000);

        let startAt = nowSec - 24 * 60 * 60;
        let endAt = nowSec;

        if (params.start) {
            startAt = Math.floor(new Date(params.start).getTime() / 1000);
        }
        if (params.end) {
            endAt = Math.floor(new Date(params.end).getTime() / 1000);
        }

        return this.fetchRawPriceHistory(id, { interval, startAt, endAt });
    }

    // -- Latest price ---------------------------------------------------------

    async fetchRawLatestPrice(tokenId: string): Promise<OpinionRawLatestPrice> {
        try {
            const response = await this.ctx.http.get<OpinionApiResponse<OpinionRawLatestPrice>>(
                `${this.apiUrl}/token/latest-price`,
                {
                    params: { token_id: tokenId },
                    headers: this.ctx.getHeaders(),
                },
            );
            this.assertSuccess(response.data);
            return response.data.result;
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- User trades ----------------------------------------------------------

    async fetchRawMyTrades(
        params: MyTradesParams,
        walletAddress: string,
    ): Promise<OpinionRawUserTrade[]> {
        try {
            const queryParams: Record<string, any> = {};
            if (params.marketId) queryParams.marketId = Number(params.marketId);
            if (params.limit) queryParams.limit = Math.min(params.limit, OPINION_MAX_PAGE_SIZE);

            return this.fetchAllPages<OpinionRawUserTrade>(
                `/trade/user/${walletAddress}`,
                queryParams,
                (result) => result.list,
                (result) => result.total,
                params.limit,
            );
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- User positions -------------------------------------------------------

    async fetchRawPositions(walletAddress: string): Promise<OpinionRawPosition[]> {
        try {
            return this.fetchAllPages<OpinionRawPosition>(
                `/positions/user/${walletAddress}`,
                {},
                (result) => result.list,
                (result) => result.total,
            );
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- User orders (authenticated) ------------------------------------------

    async fetchRawOrders(params: {
        marketId?: number;
        chainId?: string;
        status?: string;
        limit?: number;
    }): Promise<OpinionRawOrder[]> {
        try {
            const queryParams: Record<string, any> = {};
            if (params.marketId) queryParams.marketId = params.marketId;
            if (params.chainId) queryParams.chainId = params.chainId;
            if (params.status) queryParams.status = params.status;

            return this.fetchAllPages<OpinionRawOrder>(
                '/order',
                queryParams,
                (result) => result.list,
                (result) => result.total,
                params.limit,
            );
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- Single order detail (authenticated) ----------------------------------

    async fetchRawOrderById(orderId: string): Promise<OpinionRawOrder | null> {
        try {
            const response = await this.ctx.http.get<OpinionApiResponse<{ orderData: OpinionRawOrder }>>(
                `${this.apiUrl}/order/${orderId}`,
                { headers: this.ctx.getHeaders() },
            );
            this.assertSuccess(response.data);
            return response.data.result?.orderData ?? null;
        } catch (error: any) {
            throw opinionErrorMapper.mapError(error);
        }
    }

    // -- Private helpers ------------------------------------------------------

    /**
     * Fetches all pages of a paginated Opinion API endpoint.
     * Loops through pages until we have collected `targetCount` items
     * or the server reports no more data.
     */
    private async fetchAllPages<T>(
        path: string,
        baseParams: Record<string, any>,
        extractList: (result: any) => T[],
        extractTotal: (result: any) => number,
        targetCount?: number,
    ): Promise<T[]> {
        let allItems: T[] = [];
        let page = 1;
        let total = Infinity;

        while (page <= MAX_PAGES) {
            const params = {
                ...baseParams,
                page,
                limit: OPINION_MAX_PAGE_SIZE,
            };

            const response = await this.ctx.http.get<OpinionApiResponse<any>>(
                `${this.apiUrl}${path}`,
                { params, headers: this.ctx.getHeaders() },
            );

            this.assertSuccess(response.data);

            const result = response.data.result;
            if (!result) break;

            total = extractTotal(result);
            const list = extractList(result);

            if (!list || list.length === 0) break;

            allItems.push(...list);

            if (allItems.length >= total) break;
            if (targetCount !== undefined && allItems.length >= targetCount) break;

            page += 1;
        }

        if (targetCount !== undefined && allItems.length > targetCount) {
            return allItems.slice(0, targetCount);
        }

        return allItems;
    }

    /**
     * Fetches market list pages with the given filters.
     */
    private async fetchMarketPages(opts: {
        status?: string;
        marketType?: number;
        sort?: 'volume' | 'liquidity' | 'newest';
        limit?: number;
    }): Promise<OpinionRawMarket[]> {
        const baseParams: Record<string, any> = {
            marketType: opts.marketType ?? 2, // 2 = All types
        };

        if (opts.status) baseParams.status = opts.status;

        const sortBy = mapSortBy(opts.sort);
        if (sortBy !== undefined) baseParams.sortBy = sortBy;

        return this.fetchAllPages<OpinionRawMarket>(
            '/market',
            baseParams,
            (result) => result.list,
            (result) => result.total,
            opts.limit,
        );
    }

    /**
     * Validates that the API response envelope indicates success (code === 0).
     */
    private assertSuccess(data: OpinionApiResponse<any>): void {
        if (data.errno !== 0) {
            throw new Error(
                `Opinion API error (errno ${data.errno}): ${data.errmsg || 'Unknown error'}`,
            );
        }
    }
}
