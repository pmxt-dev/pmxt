import { EventFetchParams, MarketFilterParams, MyTradesParams, OHLCVParams, TradesParams } from '../../BaseExchange';
import { FetcherContext, IExchangeFetcher } from '../interfaces';
import { kalshiErrorMapper } from './errors';
import { NotFound } from '../../errors';
import { validateIdFormat } from '../../utils/validation';
import { mapIntervalToKalshi } from './utils';
import { logger } from '../../utils/logger';

// ----------------------------------------------------------------------------
// Raw venue-native types
// ----------------------------------------------------------------------------

export interface KalshiRawMarket {
    ticker: string;
    title?: string;
    status?: string;
    last_price?: number;
    yes_ask?: number;
    yes_bid?: number;
    subtitle?: string;
    yes_sub_title?: string;
    previous_price_dollars?: string;
    last_price_dollars?: string;
    yes_ask_dollars?: string;
    yes_bid_dollars?: string;
    no_ask_dollars?: string;
    no_bid_dollars?: string;
    response_price_units?: string;
    market_type?: string;
    mve_collection_ticker?: string;
    mve_selected_legs?: Array<{
        event_ticker: string;
        market_ticker: string;
        side: string;
    }>;
    yes_ask_size_fp?: string;
    yes_bid_size_fp?: string;
    rules_primary?: string;
    rules_secondary?: string;
    expiration_time: string;
    volume_24h?: number;
    volume?: number;
    liquidity?: number;
    liquidity_dollars?: string;
    open_interest?: number;
    volume_24h_fp?: string;
    volume_fp?: string;
    open_interest_fp?: string;
    close_time?: string;

    [key: string]: unknown;
}

export interface KalshiRawEvent {
    event_ticker: string;
    title: string;
    sub_title?: string;
    image_url?: string;
    category?: string;
    tags?: string[];
    series_ticker?: string;
    series_title?: string;
    mutually_exclusive?: boolean;
    markets?: KalshiRawMarket[];

    [key: string]: unknown;
}

interface KalshiSeriesInfo {
    title?: string;
    tags?: string[];
}

export interface KalshiRawSeries {
    ticker: string;
    title?: string;
    tags?: string[];
    frequency?: string;
    category?: string;
    [key: string]: unknown;
}

export interface KalshiRawEventPage {
    events: KalshiRawEvent[];
    cursor?: string | null;
}

export interface KalshiRawCandlestick {
    end_period_ts: number;
    volume?: number;
    price?: { open?: number; high?: number; low?: number; close?: number; previous?: number };
    yes_ask?: { open?: number; high?: number; low?: number; close?: number };
    yes_bid?: { open?: number; high?: number; low?: number; close?: number };

    [key: string]: unknown;
}

export interface KalshiRawOrderBookFp {
    yes_dollars?: string[][];
    no_dollars?: string[][];
}

export interface KalshiRawOrderBook {
    ticker: string;
    orderbook_fp: KalshiRawOrderBookFp;
}

export interface KalshiRawOrderBooks {
    orderbooks: KalshiRawOrderBook[];
}

export interface KalshiRawTrade {
    trade_id: string;
    created_time: string;
    /** @deprecated Old API field — new API uses yes_price_dollars */
    yes_price?: number;
    /** New API field: price as a dollar string e.g. "0.4540" */
    yes_price_dollars?: string;
    /** @deprecated Old API field — new API uses count_fp */
    count?: number;
    /** New API field: count as a string e.g. "424.00" */
    count_fp?: string;
    taker_side: string;

    [key: string]: unknown;
}

export interface KalshiRawFill {
    fill_id: string;
    created_time: string;
    /** @deprecated Old API field */
    yes_price?: number;
    yes_price_dollars?: string;
    /** @deprecated Old API field */
    count?: number;
    count_fp?: string;
    side: string;
    order_id: string;

    [key: string]: unknown;
}

export interface KalshiRawOrder {
    order_id: string;
    ticker: string;
    side: string;
    type?: string;
    yes_price?: number;
    count: number;
    remaining_count?: number;
    status?: string;
    created_time: string;

    [key: string]: unknown;
}

export interface KalshiRawPosition {
    ticker: string;
    position: number;
    total_cost: number;
    market_price?: number;
    market_exposure?: number;
    realized_pnl?: number;

    [key: string]: unknown;
}

// ----------------------------------------------------------------------------
// Fetcher
// ----------------------------------------------------------------------------

const BATCH_SIZE = 200;
const MAX_PAGES = 1000;
const CACHE_TTL = 5 * 60 * 1000;

export class KalshiFetcher implements IExchangeFetcher<KalshiRawEvent, KalshiRawEvent> {
    private readonly ctx: FetcherContext;

    // Instance-level cache (moved from module-level)
    private cachedEvents: KalshiRawEvent[] | null = null;
    private cachedSeriesMap: Map<string, KalshiSeriesInfo> | null = null;
    private lastCacheTime: number = 0;

    constructor(ctx: FetcherContext) {
        this.ctx = ctx;
    }

    resetCache(): void {
        this.cachedEvents = null;
        this.cachedSeriesMap = null;
        this.lastCacheTime = 0;
    }

    // -- Markets (returns raw events containing nested markets) ----------------

    async fetchRawMarkets(params?: MarketFilterParams): Promise<KalshiRawEvent[]> {
        try {
            if (params?.marketId) {
                return this.fetchRawEventByTicker(params.marketId);
            }
            if (params?.slug) {
                return this.fetchRawEventByTicker(params.slug);
            }
            if (params?.outcomeId) {
                const ticker = params.outcomeId.replace(/-NO$/, '');
                return this.fetchRawEventByTicker(ticker);
            }
            if (params?.eventId) {
                return this.fetchRawEventByTicker(params.eventId);
            }
            // Default + query cases: fetch all events, caller does filtering
            return this.fetchRawEventsDefault(params);
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    // -- Events ---------------------------------------------------------------

    async fetchRawEvents(params: EventFetchParams): Promise<KalshiRawEvent[]> {
        try {
            if (params.eventId) {
                return this.fetchRawEventByTicker(params.eventId);
            }
            if (params.slug) {
                return this.fetchRawEventByTicker(params.slug);
            }

            // When a series filter is present, delegate to server-side filtering so
            // only events belonging to that series are returned — no double-filtering.
            if (params.series) {
                return this.fetchAllWithSeriesTicker(params.series);
            }

            const status = (params?.status as string | undefined) || 'active';
            const hasBoundedDefaultRead =
                status === 'active' &&
                (params.limit !== undefined || params.cursor !== undefined) &&
                !params.query &&
                params.offset === undefined &&
                params.sort === undefined &&
                params.searchIn === undefined &&
                params.category === undefined &&
                params.tags === undefined &&
                params.filter === undefined;
            if (hasBoundedDefaultRead) {
                const page = await this.fetchRawEventPage(params);
                return page.events;
            }

            if (status === 'all') {
                const openEvents = await this.fetchAllWithStatus('open');
                const closedEvents = await this.fetchAllWithStatus('closed');
                const settledEvents = await this.fetchAllWithStatus('settled');
                return this.enrichEventsWithSeriesList([...openEvents, ...closedEvents, ...settledEvents]);
            } else if (status === 'closed' || status === 'inactive') {
                const [closedEvents, settledEvents] = await Promise.all([
                    this.fetchAllWithStatus('closed'),
                    this.fetchAllWithStatus('settled'),
                ]);
                return this.enrichEventsWithSeriesList([...closedEvents, ...settledEvents]);
            }

            return this.enrichEventsWithSeriesList(await this.fetchAllWithStatus('open'));
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    async fetchRawEventPage(params: EventFetchParams = {}): Promise<KalshiRawEventPage> {
        try {
            const status = (params?.status as string | undefined) || 'active';
            if (status === 'all') {
                throw new Error('Kalshi cursor pagination supports a single status at a time.');
            }

            let apiStatus = 'open';
            if (status === 'closed' || status === 'inactive') apiStatus = 'closed';
            if (status === 'settled') apiStatus = 'settled';

            const limit = Math.max(1, Math.floor(params.limit || BATCH_SIZE));
            const page = await this.fetchPageWithStatus(apiStatus, limit, params.cursor);
            await this.enrichEventsWithSeriesList(page.events);
            return page;
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    // -- OHLCV ----------------------------------------------------------------

    async fetchRawOHLCV(id: string, params: OHLCVParams): Promise<KalshiRawCandlestick[]> {
        validateIdFormat(id, 'OHLCV');

        if (!params.resolution) {
            throw new Error('fetchOHLCV requires a resolution parameter.');
        }

        try {
            const cleanedId = id.replace(/-NO$/, '');
            const normalizedId = cleanedId.toUpperCase();
            const interval = mapIntervalToKalshi(params.resolution);

            const parts = normalizedId.split('-');
            if (parts.length < 2) {
                throw new Error(`Invalid Kalshi Ticker format: "${id}". Expected format like "FED-25JAN29-B4.75".`);
            }
            const seriesTicker = parts.slice(0, -1).join('-');

            const now = Math.floor(Date.now() / 1000);
            let startTs = now - 24 * 60 * 60;
            let endTs = now;

            const ensureDate = (d: any) => {
                if (typeof d === 'string') {
                    if (!d.endsWith('Z') && !d.match(/[+-]\d{2}:\d{2}$/)) {
                        return new Date(d + 'Z');
                    }
                    return new Date(d);
                }
                return d;
            };

            const pStart = params.start ? ensureDate(params.start) : undefined;
            const pEnd = params.end ? ensureDate(params.end) : undefined;

            if (pStart) startTs = Math.floor(pStart.getTime() / 1000);
            if (pEnd) {
                endTs = Math.floor(pEnd.getTime() / 1000);
                if (!pStart) startTs = endTs - 24 * 60 * 60;
            }

            const data = await this.ctx.callApi('GetMarketCandlesticks', {
                series_ticker: seriesTicker,
                ticker: normalizedId,
                period_interval: interval,
                start_ts: startTs,
                end_ts: endTs,
            });

            return data.candlesticks || [];
        } catch (error: any) {
            throw kalshiErrorMapper.mapError(error);
        }
    }

    // -- OrderBook -------------------------------------------------------------

    async fetchRawOrderBook(id: string): Promise<KalshiRawOrderBook> {
        validateIdFormat(id, 'OrderBook');
        const ticker = id.replace(/-NO$/, '');
        const data = await this.ctx.callApi('GetMarketOrderbook', { ticker });
        const book = data.orderbook_fp;
        if (!book || (!book.yes_dollars?.length && !book.no_dollars?.length)) {
            throw new NotFound(`Order book not found: ${id}`, 'Kalshi');
        }
        return data;
    }

    async fetchRawOrderBooks(ids: string[]): Promise<KalshiRawOrderBook[]> {
        ids.forEach((id) => validateIdFormat(id, 'OrderBook'));
        const tickers = [...new Set(ids.map(id => id.replace(/-NO$/, '')))];
        const data: KalshiRawOrderBooks = await this.ctx.callApi('GetMarketOrderbooks', { tickers });
        const orderBooks = data.orderbooks;
        if (tickers.length !== orderBooks.length) {
            const returned = new Set(orderBooks.map(item => item.ticker));
            const missing = tickers.filter(t => !returned.has(t));
            throw new NotFound(`Order book not found for tickers ${missing.join(', ')}`, 'Kalshi');
        }
        return orderBooks;
    }

    // -- Trades ----------------------------------------------------------------

    async fetchRawTrades(id: string, params: TradesParams): Promise<KalshiRawTrade[]> {
        const ticker = id.replace(/-NO$/, '');
        const query: Record<string, any> = { ticker };
        if (params.limit) query.limit = params.limit;
        const data = await this.ctx.callApi('GetTrades', query);
        return data.trades || [];
    }

    // -- User data -------------------------------------------------------------

    async fetchRawMyTrades(params: MyTradesParams): Promise<KalshiRawFill[]> {
        const queryParams: Record<string, any> = {};
        if (params?.outcomeId || params?.marketId) {
            queryParams.ticker = (params.outcomeId || params.marketId)!.replace(/-NO$/, '');
        }
        if (params?.since) queryParams.min_ts = Math.floor(params.since.getTime() / 1000);
        if (params?.until) queryParams.max_ts = Math.floor(params.until.getTime() / 1000);
        if (params?.limit) queryParams.limit = params.limit;
        if (params?.cursor) queryParams.cursor = params.cursor;

        const data = await this.ctx.callApi('GetFills', queryParams);
        return data.fills || [];
    }

    async fetchRawPositions(): Promise<KalshiRawPosition[]> {
        const data = await this.ctx.callApi('GetPositions');
        return data.market_positions || [];
    }

    async fetchRawBalance(): Promise<{ balance: number; portfolio_value: number }> {
        return this.ctx.callApi('GetBalance');
    }

    async fetchRawOrders(queryParams: Record<string, any>): Promise<KalshiRawOrder[]> {
        const data = await this.ctx.callApi('GetOrders', queryParams);
        return data.orders || [];
    }

    async fetchRawHistoricalOrders(queryParams: Record<string, any>): Promise<KalshiRawOrder[]> {
        const data = await this.ctx.callApi('GetHistoricalOrders', queryParams);
        return data.orders || [];
    }

    async fetchRawSeriesList(): Promise<KalshiRawSeries[]> {
        try {
            const data = await this.ctx.callApi('GetSeriesList');
            return (data.series || []) as KalshiRawSeries[];
        } catch (e: any) {
            throw kalshiErrorMapper.mapError(e);
        }
    }

    async fetchRawSeriesMap(): Promise<Map<string, KalshiSeriesInfo>> {
        try {
            const data = await this.ctx.callApi('GetSeriesList');
            const seriesList = data.series || [];
            const map = new Map<string, KalshiSeriesInfo>();
            for (const series of seriesList) {
                if (series.ticker) {
                    map.set(series.ticker, {
                        title: typeof series.title === 'string' ? series.title : undefined,
                        tags: Array.isArray(series.tags) ? series.tags : undefined,
                    });
                }
            }
            return map;
        } catch (e: any) {
            throw kalshiErrorMapper.mapError(e);
        }
    }

    // -- Private helpers -------------------------------------------------------

    async fetchRawEventByTicker(eventTicker: string): Promise<KalshiRawEvent[]> {
        const normalizedTicker = eventTicker.toUpperCase();
        const data = await this.ctx.callApi('GetEvent', {
            event_ticker: normalizedTicker,
            with_nested_markets: true,
        });

        const event = data.event;
        if (!event) return [];

        // Enrich with series metadata. The series title helps the normalizer
        // avoid polluted event titles on multi-market futures.
        if (event.series_ticker) {
            try {
                const seriesData = await this.ctx.callApi('GetSeries', {
                    series_ticker: event.series_ticker,
                });
                const series = seriesData.series;
                if (typeof series?.title === 'string' && series.title.trim()) {
                    event.series_title = series.title.trim();
                }
                if (series?.tags?.length > 0 && (!event.tags || event.tags.length === 0)) {
                    event.tags = series.tags;
                }
            } catch (err: unknown) {
                // Non-critical — series metadata is enrichment only.
                logger.warn('kalshi: series metadata fetch failed', {
                    series_ticker: event.series_ticker,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        return [event];
    }

    private async fetchRawEventsDefault(params?: MarketFilterParams): Promise<KalshiRawEvent[]> {
        const limit = params?.limit || 250000;
        const now = Date.now();
        const status = params?.status || 'active';

        let apiStatus = 'open';
        if (status === 'closed' || status === 'inactive') apiStatus = 'closed';

        const useCache = status === 'active' || !params?.status;

        if (useCache && this.cachedEvents && this.cachedSeriesMap && now - this.lastCacheTime < CACHE_TTL) {
            return this.cachedEvents;
        }

        const isSorted = params?.sort && (params.sort === 'volume' || params.sort === 'liquidity');
        const safetyCap = BATCH_SIZE * 10;
        const fetchLimit = isSorted ? Math.min(1000, safetyCap) : Math.min(limit, safetyCap);

        const [allEvents, fetchedSeriesMap] = await Promise.all([
            this.fetchActiveEvents(fetchLimit, apiStatus),
            this.fetchRawSeriesMap(),
        ]);

        this.enrichEventsWithSeriesMap(allEvents, fetchedSeriesMap);

        if (fetchLimit >= 1000 && useCache) {
            this.cachedEvents = allEvents;
            this.cachedSeriesMap = fetchedSeriesMap;
            this.lastCacheTime = now;
        }

        return allEvents;
    }

    private async enrichEventsWithSeriesList(events: KalshiRawEvent[]): Promise<KalshiRawEvent[]> {
        if (events.length === 0) return events;

        try {
            const seriesMap = await this.fetchRawSeriesMap();
            this.enrichEventsWithSeriesMap(events, seriesMap);
        } catch (err: unknown) {
            // Non-critical — callers can still normalize the venue-native title.
            logger.warn('kalshi: series list enrichment failed', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

        return events;
    }

    private enrichEventsWithSeriesMap(
        events: KalshiRawEvent[],
        seriesMap: Map<string, KalshiSeriesInfo>,
    ): void {
        for (const event of events) {
            if (!event.series_ticker) continue;
            const seriesInfo = seriesMap.get(event.series_ticker);
            if (!seriesInfo) continue;

            if (seriesInfo.title) {
                event.series_title = seriesInfo.title;
            }
            if (seriesInfo.tags?.length && (!event.tags || event.tags.length === 0)) {
                event.tags = seriesInfo.tags;
            }
        }
    }

    private async fetchActiveEvents(targetMarketCount?: number, status: string = 'open'): Promise<KalshiRawEvent[]> {
        let allEvents: KalshiRawEvent[] = [];
        let totalMarketCount = 0;
        let cursor = null;
        let page = 0;

        do {
            try {
                const queryParams: any = {
                    limit: BATCH_SIZE,
                    with_nested_markets: true,
                    status,
                };
                if (cursor) queryParams.cursor = cursor;

                const data = await this.ctx.callApi('GetEvents', queryParams);
                const events = data.events || [];
                if (events.length === 0) break;

                allEvents.push(...events);

                if (targetMarketCount) {
                    for (const event of events) {
                        totalMarketCount += (event.markets || []).length;
                    }
                    if (totalMarketCount >= targetMarketCount * 1.5) break;
                }

                cursor = data.cursor;
                page++;

                if (page >= 10) break;
            } catch (e: any) {
                throw kalshiErrorMapper.mapError(e);
            }
        } while (cursor && page < MAX_PAGES);

        return allEvents;
    }

    private async fetchAllWithStatus(apiStatus: string): Promise<KalshiRawEvent[]> {
        let allEvents: KalshiRawEvent[] = [];
        let cursor = null;
        let page = 0;

        do {
            const queryParams: any = {
                limit: BATCH_SIZE,
                with_nested_markets: true,
                status: apiStatus,
            };
            if (cursor) queryParams.cursor = cursor;

            const data = await this.ctx.callApi('GetEvents', queryParams);
            const events = data.events || [];
            if (events.length === 0) break;

            allEvents.push(...events);
            cursor = data.cursor;
            page++;
        } while (cursor && page < MAX_PAGES);

        return allEvents;
    }

    private async fetchAllWithSeriesTicker(seriesTicker: string): Promise<KalshiRawEvent[]> {
        let allEvents: KalshiRawEvent[] = [];
        let cursor = null;
        let page = 0;

        do {
            const queryParams: Record<string, unknown> = {
                series_ticker: seriesTicker,
                with_nested_markets: true,
                limit: BATCH_SIZE,
            };
            if (cursor) queryParams.cursor = cursor;

            const data = await this.ctx.callApi('GetEvents', queryParams);
            const events: KalshiRawEvent[] = data.events || [];
            if (events.length === 0) break;

            allEvents = [...allEvents, ...events];
            cursor = data.cursor;
            page++;
        } while (cursor && page < MAX_PAGES);

        return allEvents;
    }

    private async fetchPageWithStatus(
        apiStatus: string,
        maxEvents: number,
        initialCursor?: string,
    ): Promise<KalshiRawEventPage> {
        let allEvents: KalshiRawEvent[] = [];
        let cursor: string | null | undefined = initialCursor || null;
        let page = 0;

        do {
            const remaining = maxEvents - allEvents.length;
            if (remaining <= 0) break;

            const queryParams: any = {
                limit: Math.min(BATCH_SIZE, remaining),
                with_nested_markets: true,
                status: apiStatus,
            };
            if (cursor) queryParams.cursor = cursor;

            const data = await this.ctx.callApi('GetEvents', queryParams);
            const events = data.events || [];
            cursor = data.cursor || null;
            page++;

            if (events.length === 0) break;
            allEvents.push(...events);
        } while (cursor && allEvents.length < maxEvents && page < MAX_PAGES);

        return {
            events: allEvents.slice(0, maxEvents),
            cursor,
        };
    }
}
