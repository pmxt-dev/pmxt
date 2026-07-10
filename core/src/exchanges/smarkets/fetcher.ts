import { MarketFilterParams, EventFetchParams, TradesParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { smarketsErrorMapper } from './errors';
import { NotFound } from '../../errors';
import { validateIdFormat } from '../../utils/validation';
import { logger } from '../../utils/logger';

// ----------------------------------------------------------------------------
// Raw venue-native types
// ----------------------------------------------------------------------------

export interface SmarketsRawEvent {
    id: string;
    name: string;
    description: string | null;
    slug: string;
    full_slug: string;
    state: string;
    type: string | { domain: string; scope: string };
    parent_id: string | null;
    start_datetime: string | null;
    start_date: string | null;
    end_date: string | null;
    created: string;
    modified: string;
    bettable?: boolean;
    hidden?: boolean;
    inplay_enabled?: boolean;
    short_name?: string | null;
    seo_description?: string | null;
    special_rules?: string | null;
    chart_time_period?: string | null;
    [key: string]: unknown;
}

export interface SmarketsRawMarket {
    id: string;
    event_id: string;
    name: string;
    slug: string;
    state: string;
    description: string | null;
    bet_delay: number;
    complete: boolean;
    winner_count: number;
    hidden: boolean;
    display_type: string;
    display_order: number | null;
    cashout_enabled: boolean;
    inplay_enabled?: boolean;
    created: string;
    modified: string;
    market_type: { name: string; param?: string; params?: Record<string, string> } | null;
    category?: string;
    categories?: string[];
    info?: Record<string, unknown> | null;
    [key: string]: unknown;
}

export interface SmarketsRawContract {
    id: string;
    market_id: string;
    name: string;
    slug: string;
    state_or_outcome: string;
    created: string;
    modified: string;
    outcome_timestamp: string | null;
    display_order: number | null;
    hidden?: boolean;
    competitor_id?: number | null;
    contract_type?: { name: string; param?: string } | null;
    reduction_factor?: string;
    info?: { color_primary?: string; color_secondary?: string; primary?: boolean } | null;
    [key: string]: unknown;
}

export interface SmarketsRawQuote {
    bids: Array<{ price: number; quantity: number }>;
    offers: Array<{ price: number; quantity: number }>;
}

export interface SmarketsRawOrder {
    id: string;
    market_id: string;
    contract_id: string;
    side: string;
    state: string;
    type: string;
    price: number;
    quantity: number;
    quantity_filled: number;
    quantity_unfilled: number;
    created_datetime: string;
    last_modified_datetime: string;
    average_price_matched?: number;
    label?: string | null;
    [key: string]: unknown;
}

export interface SmarketsRawVolume {
    market_id: string;
    volume: number;
    double_stake_volume: number;
}

export interface SmarketsRawLastExecutedPrice {
    contract_id: string;
    last_executed_price: string | null;
    timestamp: string | null;
}

export interface SmarketsRawBalance {
    account_id: string;
    balance: string;
    available_balance: string;
    exposure: string;
    currency: string;
    bonus_balance?: string;
    commission_type?: string;
    signup_date?: string;
}

export interface SmarketsRawActivityRow {
    amount: string | null;
    commission: string | null;
    contract_id: string | null;
    event_id: string | null;
    market_id: string | null;
    order_id: string | null;
    price: number | null;
    quantity: number | null;
    quantity_change: number | null;
    side: string | null;
    source: string;
    timestamp: string;
    seq: number;
    subseq: number;
    money: string | null;
    money_change: string | null;
    exposure: string | null;
    label: string | null;
    [key: string]: unknown;
}

// ----------------------------------------------------------------------------
// Composite types used by the fetcher
// ----------------------------------------------------------------------------

export interface SmarketsRawEventWithMarkets {
    event: SmarketsRawEvent;
    markets: SmarketsRawMarket[];
    contracts: SmarketsRawContract[];
    volumes: SmarketsRawVolume[];
}

// ----------------------------------------------------------------------------
// Fetcher
// ----------------------------------------------------------------------------

const BATCH_SIZE = 200;
const MAX_PAGES = 100;
const EVENT_ID_BATCH_SIZE = 50;
const MARKET_ID_BATCH_SIZE = 100;

export class SmarketsFetcher implements IExchangeFetcher<SmarketsRawEventWithMarkets, SmarketsRawEventWithMarkets> {
    private readonly ctx: FetcherContext;
    private readonly baseUrl: string;

    constructor(ctx: FetcherContext, baseUrl?: string) {
        this.ctx = ctx;
        this.baseUrl = baseUrl || 'https://api.smarkets.com';
    }

    // -- Markets (returns enriched events with nested markets/contracts) ------

    async fetchRawMarkets(params?: MarketFilterParams): Promise<SmarketsRawEventWithMarkets[]> {
        try {
            if (params?.eventId) {
                return this.fetchEnrichedEventById(params.eventId);
            }
            if (params?.marketId) {
                return this.fetchEnrichedEventByMarketId(params.marketId);
            }
            return this.fetchAllEnrichedEvents(params);
        } catch (error: any) {
            throw smarketsErrorMapper.mapError(error);
        }
    }

    // -- Events ---------------------------------------------------------------

    async fetchRawEvents(params: EventFetchParams): Promise<SmarketsRawEventWithMarkets[]> {
        try {
            if (params.eventId) {
                return this.fetchEnrichedEventById(params.eventId);
            }
            if (params.limit !== undefined && params.limit <= 0) {
                return [];
            }

            const stateFilter = this.mapEventStatus(params?.status || 'active');
            const requestedLimit = params.limit === undefined
                ? undefined
                : Math.max(1, Math.floor(params.limit));
            const rawEvents = await this.fetchPaginatedEvents({
                state: stateFilter,
                type_scope: ['single_event'],
                with_new_type: true,
                ...(requestedLimit === undefined ? {} : { limit: Math.min(requestedLimit, BATCH_SIZE) }),
            }, requestedLimit);
            return this.enrichEvents(rawEvents);
        } catch (error: any) {
            throw smarketsErrorMapper.mapError(error);
        }
    }

    // -- OrderBook ------------------------------------------------------------

    async fetchRawOrderBook(id: string): Promise<Record<string, SmarketsRawQuote>> {
        validateIdFormat(id, 'OrderBook');

        // get_quotes is marked as private in the spec but works without auth
        // (returns delayed data). Use a direct HTTP call so it works without credentials.
        const url = `${this.baseUrl}/v3/markets/${encodeURIComponent(id)}/quotes/`;
        const headers: Record<string, string> = {
            ...this.ctx.getHeaders(),
        };
        const response = await this.ctx.http.get(url, { headers });
        const data = response.data;

        if (!data || Object.keys(data).length === 0) {
            throw new NotFound(`Order book not found: ${id}`, 'Smarkets');
        }

        return data;
    }

    // -- Trades (account activity) --------------------------------------------

    async fetchRawTradeActivity(
        marketId: string,
        params: TradesParams,
    ): Promise<SmarketsRawActivityRow[]> {
        const query: Record<string, any> = {
            market_id: [marketId],
            source: ['order.execute', 'order.execute.confirm'],
            sort: '-seq,-subseq',
        };
        if (params.limit) query.limit = params.limit;
        const data = await this.ctx.callApi('get_activity', query);

        return (data.account_activity || []) as SmarketsRawActivityRow[];
    }

    async fetchRawMyTradeActivity(
        params: Record<string, any> = {},
    ): Promise<SmarketsRawActivityRow[]> {
        const queryParams: Record<string, any> = {
            source: ['order.execute', 'order.execute.confirm'],
            limit: params.limit || 100,
            sort: '-seq,-subseq',
        };
        if (params.marketId) queryParams.market_id = [params.marketId];
        if (params.since) queryParams.timestamp_min = params.since;
        if (params.until) queryParams.timestamp_max = params.until;

        const data = await this.ctx.callApi('get_activity', queryParams);
        return (data.account_activity || []) as SmarketsRawActivityRow[];
    }

    // -- User data ------------------------------------------------------------

    async fetchRawBalance(): Promise<SmarketsRawBalance> {
        const data = await this.ctx.callApi('get_account');
        return data.account;
    }

    async fetchRawOrders(queryParams: Record<string, any> = {}): Promise<SmarketsRawOrder[]> {
        const data = await this.ctx.callApi('get_orders', {
            limit: 100,
            ...queryParams,
        });
        return data.orders || [];
    }

    async fetchRawOrderById(orderId: string): Promise<SmarketsRawOrder> {
        const data = await this.ctx.callApi('get_orders', {
            id: [orderId],
            limit: 1,
        });
        const orders = data.orders || [];
        if (orders.length === 0) {
            throw new NotFound(`Order not found: ${orderId}`, 'Smarkets');
        }
        return orders[0];
    }

    async fetchRawPositions(): Promise<SmarketsRawOrder[]> {
        // Smarkets does not have a dedicated positions endpoint.
        // Derive positions from open/partial orders.
        return this.fetchRawOrders({ state: ['created', 'partial'] });
    }

    async fetchRawClosedOrders(params: Record<string, any> = {}): Promise<SmarketsRawOrder[]> {
        const queryParams: Record<string, any> = {
            state: ['filled', 'settled'],
        };
        if (params.marketId) queryParams.market_id = [params.marketId];
        if (params.limit) queryParams.limit = params.limit;
        if (params.since) queryParams.created_datetime_min = params.since;
        if (params.until) queryParams.created_datetime_max = params.until;
        return this.fetchRawOrders(queryParams);
    }

    // -- Private helpers ------------------------------------------------------

    private async fetchEnrichedEventById(eventId: string): Promise<SmarketsRawEventWithMarkets[]> {
        const data = await this.ctx.callApi('get_events', { id: [eventId] });
        const events: SmarketsRawEvent[] = data.events || [];
        if (events.length === 0) return [];
        return this.enrichEvents(events);
    }

    private async fetchEnrichedEventByMarketId(marketId: string): Promise<SmarketsRawEventWithMarkets[]> {
        // Step 1: Fetch contracts for this market to confirm it exists
        const contractsData = await this.ctx.callApi('get_contracts_by_market_ids', {
            market_ids: [marketId],
        });
        const contracts: SmarketsRawContract[] = contractsData.contracts || [];
        if (contracts.length === 0) return [];

        // Step 2: Fetch optional authenticated volumes for this market.
        const volumes = await this.fetchVolumesByMarketIds([marketId]);

        // Step 3: We need the event_id. The contracts have market_id but not event_id.
        // Use the events/markets endpoint by searching for events that contain this market.
        // The most reliable approach: fetch all active events and find the one that owns
        // this market. But that's expensive. Instead, we can search events with the market
        // contracts and use the get_events endpoint with filtering.
        //
        // Actually, the Smarkets API returns market_id on contracts but event_id on markets.
        // We need to get the market object itself. The get_markets_by_event_ids endpoint
        // requires event_ids. So we iterate: get events that are bettable and look for our market.
        //
        // Better approach: use get_events with no filter and check pagination.
        // But the simplest correct approach is: get ALL bettable events, enrich them,
        // and filter for the market. This is too expensive.
        //
        // Practical approach: The Smarkets API doesn't expose a direct market->event lookup.
        // We paginate through recent events and check if any contain our market.
        // For now, fetch a reasonable batch and search.
        const rawEvents = await this.fetchPaginatedEvents({
            state: ['new', 'upcoming', 'live'],
            type_scope: ['single_event'],
            with_new_type: true,
            limit: BATCH_SIZE,
        }, BATCH_SIZE * 3);

        // Fetch markets for these events and find the one containing our marketId
        const eventIds = rawEvents.map(e => e.id);
        const allMarkets = await this.fetchMarketsByEventIds(eventIds);
        const targetMarket = allMarkets.find(m => m.id === marketId);

        if (!targetMarket) {
            return [];
        }

        // Now we have the event_id
        const eventData = await this.ctx.callApi('get_events', { id: [targetMarket.event_id] });
        const events: SmarketsRawEvent[] = eventData.events || [];
        if (events.length === 0) return [];

        return [{
            event: events[0],
            markets: [targetMarket],
            contracts,
            volumes,
        }];
    }

    private async fetchAllEnrichedEvents(params?: MarketFilterParams): Promise<SmarketsRawEventWithMarkets[]> {
        if (params?.limit !== undefined && params.limit <= 0) return [];
        const stateFilter = this.mapEventStatus(params?.status || 'active');
        const limit = params?.limit || 1000;

        const rawEvents = await this.fetchPaginatedEvents({
            state: stateFilter,
            type_scope: ['single_event'],
            with_new_type: true,
            limit: Math.min(limit, BATCH_SIZE),
        }, limit);

        return this.enrichEvents(rawEvents);
    }

    private async enrichEvents(events: SmarketsRawEvent[]): Promise<SmarketsRawEventWithMarkets[]> {
        if (events.length === 0) return [];

        const eventIds = events.map(e => e.id);
        const allMarkets = await this.fetchMarketsByEventIds(eventIds);
        const marketIds = allMarkets.map(m => m.id);

        const [allContracts, fetchedVolumes] = await Promise.all([
            this.fetchContractsByMarketIds(marketIds),
            this.fetchVolumesByMarketIds(marketIds),
        ]);

        const marketsByEvent = new Map<string, SmarketsRawMarket[]>();
        for (const market of allMarkets) {
            const existing = marketsByEvent.get(market.event_id);
            if (existing) {
                existing.push(market);
            } else {
                marketsByEvent.set(market.event_id, [market]);
            }
        }

        const contractsByMarket = new Map<string, SmarketsRawContract[]>();
        for (const contract of allContracts) {
            const existing = contractsByMarket.get(contract.market_id);
            if (existing) {
                existing.push(contract);
            } else {
                contractsByMarket.set(contract.market_id, [contract]);
            }
        }

        const volumesByMarket = new Map<string, SmarketsRawVolume>();
        for (const volume of fetchedVolumes) {
            volumesByMarket.set(volume.market_id, volume);
        }

        return events.map(event => {
            const eventMarkets = marketsByEvent.get(event.id) || [];
            const eventContracts: SmarketsRawContract[] = [];
            const eventVolumes: SmarketsRawVolume[] = [];

            for (const market of eventMarkets) {
                const mc = contractsByMarket.get(market.id) || [];
                eventContracts.push(...mc);
                const vol = volumesByMarket.get(market.id);
                if (vol) eventVolumes.push(vol);
            }

            return {
                event,
                markets: eventMarkets,
                contracts: eventContracts,
                volumes: eventVolumes,
            };
        });
    }

    private async fetchPaginatedEvents(
        queryParams: Record<string, any>,
        targetCount?: number
    ): Promise<SmarketsRawEvent[]> {
        const allEvents: SmarketsRawEvent[] = [];
        let lastId: string | undefined;
        let page = 0;

        do {
            const params: Record<string, any> = {
                limit: BATCH_SIZE,
                sort: 'id',
                ...queryParams,
            };
            if (lastId) {
                params.pagination_last_id = lastId;
            }

            const data = await this.ctx.callApi('get_events', params);
            const events: SmarketsRawEvent[] = data.events || [];
            if (events.length === 0) break;

            allEvents.push(...events);

            // Check pagination: next_page is null when there are no more results
            const nextPage = data.pagination?.next_page;
            if (!nextPage) break;

            lastId = events[events.length - 1].id;
            page++;

            if (targetCount && allEvents.length >= targetCount) break;
        } while (page < MAX_PAGES);

        return allEvents;
    }

    private async fetchMarketsByEventIds(eventIds: string[]): Promise<SmarketsRawMarket[]> {
        const batches = this.batchArray(eventIds, EVENT_ID_BATCH_SIZE);
        const results = await Promise.all(
            batches.map(async (batch) => {
                const data = await this.ctx.callApi('get_markets_by_event_ids', {
                    event_ids: batch,
                });
                return (data.markets || []) as SmarketsRawMarket[];
            })
        );
        return results.flat();
    }

    private async fetchContractsByMarketIds(marketIds: string[]): Promise<SmarketsRawContract[]> {
        if (marketIds.length === 0) return [];
        const batches = this.batchArray(marketIds, MARKET_ID_BATCH_SIZE);
        const results = await Promise.all(
            batches.map(async (batch) => {
                const data = await this.ctx.callApi('get_contracts_by_market_ids', {
                    market_ids: batch,
                });
                return (data.contracts || []) as SmarketsRawContract[];
            })
        );
        return results.flat();
    }

    private async fetchVolumesByMarketIds(marketIds: string[]): Promise<SmarketsRawVolume[]> {
        if (marketIds.length === 0) return [];
        const headers = this.ctx.getHeaders();
        const hasAuthHeader = Object.entries(headers).some(([key, value]) =>
            key.toLowerCase() === 'authorization' && String(value).trim().length > 0
        );
        if (!hasAuthHeader) return [];

        const batches = this.batchArray(marketIds, MARKET_ID_BATCH_SIZE);
        const results = await Promise.all(
            batches.map(async (batch) => {
                try {
                    const data = await this.ctx.callApi('get_volumes_by_market_ids', {
                        market_ids: batch,
                    });
                    return (data.volumes || []) as SmarketsRawVolume[];
                } catch (err: unknown) {
                    // Volumes are non-critical; return empty on failure but log it.
                    logger.warn('smarkets: volume fetch failed for batch', {
                        marketIds: batch.join(','),
                        error: err instanceof Error ? err.message : String(err),
                    });
                    return [] as SmarketsRawVolume[];
                }
            })
        );
        return results.flat();
    }

    private mapEventStatus(status: string): string[] {
        switch (status) {
            case 'active':
                return ['new', 'upcoming', 'live'];
            case 'closed':
            case 'inactive':
                return ['ended', 'settled'];
            case 'all':
                return ['new', 'upcoming', 'live', 'ended', 'settled', 'cancelled', 'suspended'];
            default:
                return ['new', 'upcoming', 'live'];
        }
    }

    private batchArray<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
}
