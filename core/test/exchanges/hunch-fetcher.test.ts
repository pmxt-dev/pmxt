import { HunchFetcher } from '../../src/exchanges/hunch/fetcher';
import { FetcherContext } from '../../src/exchanges/interfaces';

// Sprint 6 (pmxt surfacing): the Hunch list now paginates via nextCursor. A
// catalog crawl (no explicit limit) must follow the cursor to drain the WHOLE
// catalogue — else it silently truncates at the first page once Hunch grows.

function fetcherWithPages(pages: Array<{ markets: unknown[]; nextCursor: string | null }>) {
    let calls = 0;
    const ctx = {
        http: {
            get: async () => {
                const page = pages[calls] ?? { markets: [], nextCursor: null };
                calls += 1;
                return { data: page };
            },
        } as unknown as FetcherContext['http'],
        callApi: async () => ({}),
        getHeaders: () => ({}),
    } as FetcherContext;
    return { fetcher: new HunchFetcher(ctx), getCalls: () => calls };
}

describe('HunchFetcher.fetchRawMarkets — cursor draining', () => {
    it('drains every page via nextCursor when no explicit limit is set', async () => {
        const { fetcher, getCalls } = fetcherWithPages([
            { markets: [{ id: 'a' }, { id: 'b' }], nextCursor: 'cur-1' },
            { markets: [{ id: 'c' }], nextCursor: null },
        ]);
        const all = await fetcher.fetchRawMarkets();
        expect(all.map((m) => m.id)).toEqual(['a', 'b', 'c']);
        expect(getCalls()).toBe(2);
    });

    it('fetches only a single page when an explicit limit is set', async () => {
        const { fetcher, getCalls } = fetcherWithPages([
            { markets: [{ id: 'a' }], nextCursor: 'cur-1' },
            { markets: [{ id: 'b' }], nextCursor: null },
        ]);
        const all = await fetcher.fetchRawMarkets({ limit: 1 });
        expect(all.map((m) => m.id)).toEqual(['a']);
        expect(getCalls()).toBe(1);
    });
});
