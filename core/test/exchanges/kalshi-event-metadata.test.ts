import { KalshiFetcher } from '../../src/exchanges/kalshi/fetcher';

describe('Kalshi event metadata', () => {
    it('fetches event metadata through the venue GetEventMetadata operation', async () => {
        const calls: Array<{ operation: string; params?: unknown }> = [];
        const ctx: any = {
            http: {},
            getHeaders: () => ({}),
            callApi: async (operation: string, params?: unknown) => {
                calls.push({ operation, params });
                return { event_metadata: { settlement_sources: ['kalshi'], foo: 'bar' } };
            },
        };
        const fetcher = new KalshiFetcher(ctx);

        await expect(fetcher.fetchRawEventMetadata('kxabc-26')).resolves.toEqual({
            event_metadata: { settlement_sources: ['kalshi'], foo: 'bar' },
        });
        expect(calls).toEqual([
            { operation: 'GetEventMetadata', params: { event_ticker: 'KXABC-26' } },
        ]);
    });
});
