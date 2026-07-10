import { KalshiFetcher } from '../../src/exchanges/kalshi/fetcher';

function buildEvents(count: number, offset = 0) {
    return Array.from({ length: count }, (_, i) => ({
        event_ticker: `KXTEST-${offset + i}`,
        title: `Test event ${offset + i}`,
        markets: [],
    }));
}

function createFetcher(responses: Array<{ events: unknown[]; cursor?: string | null }>) {
    const calls: unknown[] = [];
    const ctx: any = {
        http: {},
        getHeaders: () => ({}),
        callApi: async (operation: string, params?: unknown) => {
            if (operation === 'GetSeriesList') return { series: [] };
            calls.push(params ?? {});
            const response = responses.shift();
            if (!response) return { events: [], cursor: null };
            return response;
        },
    };

    return { fetcher: new KalshiFetcher(ctx), calls };
}

function createSeriesFetcher() {
    const calls: Array<{ operation: string; params?: unknown }> = [];
    const ctx: any = {
        http: {},
        getHeaders: () => ({}),
        callApi: async (operation: string, params?: unknown) => {
            calls.push({ operation, params });
            if (operation === 'GetEvents') {
                return {
                    events: [{
                        event_ticker: 'KXUCL-26',
                        title: 'Champions League Winner: PSG vs Arsenal',
                        series_ticker: 'KXUCL',
                        markets: [],
                    }],
                    cursor: null,
                };
            }
            if (operation === 'GetSeriesList') {
                return {
                    series: [{
                        ticker: 'KXUCL',
                        title: 'UEFA Champions League',
                        tags: ['Soccer'],
                    }],
                };
            }
            return {};
        },
    };

    return { fetcher: new KalshiFetcher(ctx), calls };
}

describe('Kalshi cursor pagination', () => {
    it('fetches exactly the requested event count and returns the next cursor', async () => {
        const { fetcher, calls } = createFetcher([
            { events: buildEvents(200), cursor: 'cursor-200' },
            { events: buildEvents(200, 200), cursor: 'cursor-400' },
            { events: buildEvents(50, 400), cursor: 'cursor-500' },
        ]);

        const page = await fetcher.fetchRawEventPage({ limit: 450 });

        expect(page.events).toHaveLength(450);
        expect(page.cursor).toBe('cursor-500');
        expect(calls).toEqual([
            { limit: 200, with_nested_markets: true, status: 'open' },
            { limit: 200, with_nested_markets: true, status: 'open', cursor: 'cursor-200' },
            { limit: 50, with_nested_markets: true, status: 'open', cursor: 'cursor-400' },
        ]);
    });

    it('caps the default fetch limit at 10 pages', async () => {
        const { fetcher, calls } = createFetcher([
            { events: buildEvents(200), cursor: 'cursor-200' },
            { events: buildEvents(200, 200), cursor: 'cursor-400' },
            { events: buildEvents(200, 400), cursor: 'cursor-600' },
            { events: buildEvents(200, 600), cursor: 'cursor-800' },
            { events: buildEvents(200, 800), cursor: 'cursor-1000' },
            { events: buildEvents(200, 1000), cursor: 'cursor-1200' },
            { events: buildEvents(200, 1200), cursor: 'cursor-1400' },
            { events: buildEvents(200, 1400), cursor: 'cursor-1600' },
            { events: buildEvents(200, 1600), cursor: 'cursor-1800' },
            { events: buildEvents(200, 1800), cursor: 'cursor-2000' },
            { events: buildEvents(200, 2000), cursor: 'cursor-2200' },
        ]);

        const events = await fetcher.fetchRawMarkets();

        expect(events).toHaveLength(2000);
        expect(calls).toHaveLength(10);
        expect(calls[0]).toEqual({ limit: 200, with_nested_markets: true, status: 'open' });
        expect(calls[9]).toEqual({ limit: 200, with_nested_markets: true, status: 'open', cursor: 'cursor-1800' });
    });

    it('starts from a supplied cursor', async () => {
        const { fetcher, calls } = createFetcher([
            { events: buildEvents(25, 500), cursor: 'cursor-525' },
        ]);

        const page = await fetcher.fetchRawEventPage({ limit: 25, cursor: 'cursor-500' });

        expect(page.events).toHaveLength(25);
        expect(page.cursor).toBe('cursor-525');
        expect(calls).toEqual([
            { limit: 25, with_nested_markets: true, status: 'open', cursor: 'cursor-500' },
        ]);
    });

    it('runs status=all fetches sequentially instead of concurrently', async () => {
        const active = { count: 0, max: 0 };
        const responses: Array<{ events: unknown[]; cursor?: string | null }> = [
            { events: buildEvents(1), cursor: null },
            { events: buildEvents(1, 100), cursor: null },
            { events: buildEvents(1, 200), cursor: null },
        ];
        const calls: Array<Record<string, unknown>> = [];
        const ctx: any = {
            http: {},
            getHeaders: () => ({}),
            callApi: async (operation: string, params?: Record<string, unknown>) => {
                if (operation === 'GetSeriesList') return { series: [] };
                if (operation !== 'GetEvents') return {};
                calls.push(params ?? {});
                active.count += 1;
                active.max = Math.max(active.max, active.count);
                await new Promise((resolve) => setTimeout(resolve, 0));
                active.count -= 1;
                return responses.shift() ?? { events: [], cursor: null };
            },
        };
        const fetcher = new KalshiFetcher(ctx);

        const events = await fetcher.fetchRawEvents({ status: 'all' } as any);

        expect(events).toHaveLength(3);
        expect(active.max).toBe(1);
        expect(calls.map(call => call.status)).toEqual(['open', 'closed', 'settled']);
    });

    it('enriches paginated events with series title and tags', async () => {
        const { fetcher, calls } = createSeriesFetcher();

        const page = await fetcher.fetchRawEventPage({ limit: 1 });

        expect(page.events[0].series_title).toBe('UEFA Champions League');
        expect(page.events[0].tags).toEqual(['Soccer']);
        expect(calls.map(call => call.operation)).toEqual(['GetEvents', 'GetSeriesList']);
    });

    it('uses a bounded event page for default active limited event reads', async () => {
        const { fetcher, calls } = createFetcher([
            { events: buildEvents(1), cursor: 'cursor-1' },
            { events: buildEvents(1, 1), cursor: null },
        ]);

        const events = await fetcher.fetchRawEvents({ limit: 1 } as any);

        expect(events).toHaveLength(1);
        expect(calls).toEqual([
            { limit: 1, with_nested_markets: true, status: 'open' },
        ]);
    });
});
