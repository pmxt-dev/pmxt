import { SmarketsFetcher } from '../../src/exchanges/smarkets/fetcher';

const RAW_EVENT = {
    id: 'event-1',
    name: 'Event 1',
    description: null,
    slug: 'event-1',
    full_slug: 'event-1',
    state: 'new',
    type: 'single_event',
    parent_id: null,
    start_datetime: null,
    start_date: null,
    end_date: null,
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
};

const RAW_MARKET = {
    id: 'market-1',
    event_id: 'event-1',
    name: 'Market 1',
    slug: 'market-1',
    state: 'new',
    description: null,
    bet_delay: 0,
    complete: false,
    winner_count: 1,
    hidden: false,
    display_type: 'default',
    display_order: null,
    cashout_enabled: false,
    market_type: null,
};

const RAW_CONTRACT = {
    id: 'contract-1',
    market_id: 'market-1',
    name: 'Yes',
    slug: 'yes',
    state_or_outcome: 'yes',
    created: '2026-01-01T00:00:00Z',
    modified: '2026-01-01T00:00:00Z',
    outcome_timestamp: null,
    display_order: null,
};

interface CallRecord {
    operation: string;
    params?: Record<string, unknown>;
}

function createFetcher(headers: Record<string, string> = {}) {
    let calls: ReadonlyArray<CallRecord> = [];
    const ctx: any = {
        http: { get: jest.fn() },
        getHeaders: () => headers,
        callApi: async (operation: string, params?: Record<string, unknown>) => {
            calls = [...calls, { operation, params }];
            if (operation === 'get_events') {
                return { events: [RAW_EVENT], pagination: { next_page: null } };
            }
            if (operation === 'get_markets_by_event_ids') {
                return { markets: [RAW_MARKET] };
            }
            if (operation === 'get_contracts_by_market_ids') {
                return { contracts: [RAW_CONTRACT] };
            }
            if (operation === 'get_volumes_by_market_ids') {
                throw new Error('volume endpoint requires authentication');
            }
            return {};
        },
    };
    return { fetcher: new SmarketsFetcher(ctx), calls: () => calls };
}

describe('SmarketsFetcher public read bounds', () => {
    it('forwards event limits into get_events pagination', async () => {
        const { fetcher, calls } = createFetcher();

        await fetcher.fetchRawEvents({ limit: 1 });

        expect(calls().find(call => call.operation === 'get_events')?.params).toMatchObject({
            limit: 1,
        });
    });

    it('skips unauthenticated volume enrichment for direct market lookup', async () => {
        const { fetcher, calls } = createFetcher();

        const events = await fetcher.fetchRawMarkets({ marketId: 'market-1' });

        expect(events).toHaveLength(1);
        expect(events[0].volumes).toEqual([]);
        expect(calls().map(call => call.operation)).not.toContain('get_volumes_by_market_ids');
    });
});
