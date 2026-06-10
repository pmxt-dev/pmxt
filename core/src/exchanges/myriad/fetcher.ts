import { MarketFilterParams, EventFetchParams, OHLCVParams, TradesParams, MyTradesParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { DEFAULT_BASE_URL, mapStatusToMyriad } from './utils';
import { myriadErrorMapper } from './errors';
import { logger } from '../../utils/logger';

const MAX_PAGE_SIZE = 100;

// Raw venue-native types (what the Myriad API returns)
export interface MyriadRawMarket {
    id: number;
    networkId: number;
    title?: string;
    shortName?: string;
    description?: string;
    slug?: string;
    imageUrl?: string;
    expiresAt?: string;
    publishedAt?: string;
    volume24h?: number;
    volume?: number;
    volumeNotional?: number;
    volumeNotional24h?: number;
    liquidity?: number;
    eventId?: number;
    outcomeIndex?: number;
    tradingModel?: string;
    negRisk?: boolean;
    executionMode?: string;
    oracle?: Record<string, unknown>;
    topics?: string[];
    tags?: string[];
    outcomes?: MyriadRawOutcome[];
    [key: string]: unknown;
}

export interface MyriadRawOutcome {
    id: number;
    title?: string;
    price?: number;
    priceChange24h?: number;
    price_charts?: Record<string, { timeframe: string; prices: { value: number; timestamp: number }[] }>;
    [key: string]: unknown;
}

export interface MyriadRawQuestion {
    id: number;
    title?: string;
    markets?: MyriadRawMarket[];
    [key: string]: unknown;
}

export interface MyriadRawTradeEvent {
    action?: string;
    blockNumber?: number;
    txId?: string;
    timestamp?: number;
    value?: number;
    shares?: number;
    outcomeId?: number;
    [key: string]: unknown;
}

export interface MyriadRawPortfolioItem {
    networkId: number;
    marketId: number;
    outcomeId: number;
    outcomeTitle?: string;
    shares?: number;
    price?: number;
    profit?: number;
    value?: number;
    [key: string]: unknown;
}

export class MyriadFetcher implements IExchangeFetcher<MyriadRawMarket, MyriadRawQuestion> {
    private readonly ctx: FetcherContext;
    private readonly baseUrl: string;

    constructor(ctx: FetcherContext, baseUrl?: string) {
        this.ctx = ctx;
        this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    }

    async fetchRawMarkets(params?: MarketFilterParams): Promise<MyriadRawMarket[]> {
        try {
            if (params?.marketId) {
                return this.fetchRawMarketById(params.marketId);
            }

            if (params?.slug) {
                return this.fetchRawMarketBySlug(params.slug);
            }

            const limit = params?.limit || 100;
            const queryParams: Record<string, any> = {
                page: params?.page || 1,
                limit: Math.min(limit, MAX_PAGE_SIZE),
            };

            if (params?.query) {
                queryParams.keyword = params.query;
            }

            const myriadState = mapStatusToMyriad(params?.status);
            if (myriadState) {
                queryParams.state = myriadState;
            }

            if (params?.sort === 'volume') {
                queryParams.sort = 'volume';
                queryParams.order = 'desc';
            } else if (params?.sort === 'liquidity') {
                queryParams.sort = 'liquidity';
                queryParams.order = 'desc';
            } else if (params?.sort === 'newest') {
                queryParams.sort = 'published_at';
                queryParams.order = 'desc';
            }

            if (limit <= MAX_PAGE_SIZE) {
                const response = await this.ctx.http.get(`${this.baseUrl}/markets`, {
                    params: queryParams,
                    headers: this.ctx.getHeaders(),
                });
                return response.data.data || response.data.markets || [];
            }

            // Paginate through multiple pages
            const allMarkets: MyriadRawMarket[] = [];
            let page = 1;
            const maxPages = Math.ceil(limit / MAX_PAGE_SIZE);

            while (page <= maxPages) {
                queryParams.page = page;
                queryParams.limit = MAX_PAGE_SIZE;

                const response = await this.ctx.http.get(`${this.baseUrl}/markets`, {
                    params: queryParams,
                    headers: this.ctx.getHeaders(),
                });

                const data = response.data;
                const markets: MyriadRawMarket[] = data.data || data.markets || [];
                allMarkets.push(...markets);

                const pagination = data.pagination;
                if (!pagination?.hasNext || markets.length === 0) break;

                page++;
            }

            return allMarkets.slice(0, limit);
        } catch (error: any) {
            throw myriadErrorMapper.mapError(error);
        }
    }

    async fetchRawEvents(params: EventFetchParams): Promise<MyriadRawQuestion[]> {
        try {
            if (params.eventId) {
                return this.fetchRawQuestionById(params.eventId);
            }

            if (params.slug) {
                return this.fetchRawQuestionById(params.slug);
            }

            // Use /markets (complete endpoint) instead of /questions (only
            // returns BNB-chain candle markets). Each market is wrapped as a
            // synthetic single-market question for compatibility with the
            // event-based ingest pipeline.
            const limit = params.limit || 100;
            const markets = await this.fetchRawMarkets({
                limit,
                status: params.status || 'active',
                sort: 'volume',
                query: params.query,
            });

            return markets.map((m): MyriadRawQuestion => ({
                id: m.id,
                title: m.title,
                markets: [m],
            }));
        } catch (error: any) {
            throw myriadErrorMapper.mapError(error);
        }
    }

    async fetchRawOHLCV(id: string, _params: OHLCVParams): Promise<MyriadRawMarket> {
        try {
            const parts = id.split(':');
            if (parts.length < 2) {
                throw new Error(`Invalid Myriad outcome ID format: "${id}". Expected "{networkId}:{marketId}:{outcomeId}".`);
            }

            const [networkId, marketId] = parts;
            const response = await this.ctx.callApi('getMarkets', { id: marketId, network_id: Number(networkId) });
            return response.data || response;
        } catch (error: any) {
            throw myriadErrorMapper.mapError(error);
        }
    }

    async fetchClobOrderBook(networkId: string, marketId: string, outcome: number): Promise<{ bids: [string, string][]; asks: [string, string][] } | null> {
        try {
            const response = await this.ctx.http.get(`${this.baseUrl}/markets/${marketId}/orderbook`, {
                params: { network_id: Number(networkId), outcome },
                headers: this.ctx.getHeaders(),
            });
            const data = response.data;
            if (data.error) return null;
            return { bids: data.bids || [], asks: data.asks || [] };
        } catch (err) {
            logger.warn('MyriadFetcher: fetchClobOrderBook failed', { marketId, error: String(err) });
            return null;
        }
    }

    async fetchRawOrderBook(id: string): Promise<MyriadRawMarket> {
        try {
            const parts = id.split(':');
            if (parts.length < 3) {
                throw new Error(`Invalid Myriad outcome ID format: "${id}". Expected "{networkId}:{marketId}:{outcomeId}".`);
            }

            const [networkId, marketId] = parts;
            const response = await this.ctx.callApi('getMarkets', { id: marketId, network_id: Number(networkId) });
            return response.data || response;
        } catch (error: any) {
            throw myriadErrorMapper.mapError(error);
        }
    }

    async fetchRawTrades(id: string, params: TradesParams): Promise<MyriadRawTradeEvent[]> {
        const parts = id.split(':');
        if (parts.length < 2) {
            throw new Error(`Invalid Myriad ID format: "${id}". Expected "{networkId}:{marketId}" or "{networkId}:{marketId}:{outcomeId}".`);
        }

        const [networkId, marketId] = parts;
        const outcomeId = parts.length >= 3 ? parts[2] : undefined;

        const ensureDate = (d: any): Date => {
            if (typeof d === 'string') {
                if (!d.endsWith('Z') && !d.match(/[+-]\d{2}:\d{2}$/)) return new Date(d + 'Z');
                return new Date(d);
            }
            return d;
        };

        const queryParams: Record<string, any> = {
            id: marketId,
            network_id: Number(networkId),
            page: 1,
        };
        if (params.limit) queryParams.limit = params.limit;

        if (params.start) queryParams.since = Math.floor(ensureDate(params.start).getTime() / 1000);
        if (params.end) queryParams.until = Math.floor(ensureDate(params.end).getTime() / 1000);

        const data = await this.ctx.callApi('getMarketsEvents', queryParams);
        const events: MyriadRawTradeEvent[] = data.data || data.events || [];

        const tradeEvents = events.filter((e) => e.action === 'buy' || e.action === 'sell');
        return outcomeId
            ? tradeEvents.filter((e) => String(e.outcomeId) === outcomeId)
            : tradeEvents;
    }

    async fetchRawMyTrades(params: MyTradesParams, walletAddress: string): Promise<MyriadRawTradeEvent[]> {
        const queryParams: Record<string, any> = { address: walletAddress };
        if (params?.marketId) {
            const parts = params.marketId.split(':');
            if (parts.length >= 2) queryParams.market_id = parts[1];
        }
        if (params?.since) queryParams.since = Math.floor(params.since.getTime() / 1000);
        if (params?.until) queryParams.until = Math.floor(params.until.getTime() / 1000);
        if (params?.limit) queryParams.limit = params.limit;

        const data = await this.ctx.callApi('getUsersEvents', queryParams);
        const events: MyriadRawTradeEvent[] = data.data || data.events || [];
        return events.filter((e) => e.action === 'buy' || e.action === 'sell');
    }

    async fetchRawPositions(walletAddress: string): Promise<MyriadRawPortfolioItem[]> {
        const data = await this.ctx.callApi('getUsersPortfolio', { address: walletAddress, limit: 100 });
        return data.data || data.items || [];
    }

    async fetchRawBalance(walletAddress: string): Promise<MyriadRawPortfolioItem[]> {
        const data = await this.ctx.callApi('getUsersPortfolio', { address: walletAddress, limit: 100 });
        return data.data || data.items || [];
    }

    // -- Private helpers -------------------------------------------------------

    private async fetchRawMarketById(marketId: string): Promise<MyriadRawMarket[]> {
        const parts = marketId.split(':');
        if (parts.length !== 2) {
            return this.fetchRawMarketBySlug(marketId);
        }

        const [networkId, id] = parts;
        const response = await this.ctx.http.get(`${this.baseUrl}/markets/${id}`, {
            params: { network_id: Number(networkId) },
            headers: this.ctx.getHeaders(),
        });

        const market = response.data.data || response.data;
        return market ? [market] : [];
    }

    private async fetchRawMarketBySlug(slug: string): Promise<MyriadRawMarket[]> {
        const response = await this.ctx.http.get(`${this.baseUrl}/markets/${slug}`, {
            headers: this.ctx.getHeaders(),
        });
        const market = response.data.data || response.data;
        return market ? [market] : [];
    }

    private async fetchRawQuestionById(id: string): Promise<MyriadRawQuestion[]> {
        const response = await this.ctx.http.get(`${this.baseUrl}/questions/${id}`, {
            headers: this.ctx.getHeaders(),
        });
        const question = response.data.data || response.data;
        return question ? [question] : [];
    }
}
