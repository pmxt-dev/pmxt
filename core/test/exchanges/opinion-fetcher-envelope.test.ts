import { OpinionFetcher } from '../../src/exchanges/opinion/fetcher';
import { FetcherContext } from '../../src/exchanges/interfaces';

function makeFetcher(data: unknown) {
    const get = jest.fn(async () => ({ data }));
    const ctx: FetcherContext = {
        http: { get } as any,
        callApi: jest.fn() as any,
        getHeaders: jest.fn(() => ({ Authorization: 'Bearer test' })),
    };
    return new OpinionFetcher(ctx, 'https://api.opinion.test');
}

describe('OpinionFetcher response envelopes', () => {
    it('accepts documented code/msg success envelopes', async () => {
        const rawMarket = { id: 42, question: 'Will it work?' } as any;
        const fetcher = makeFetcher({
            code: 0,
            msg: 'success',
            result: { data: rawMarket },
        });

        await expect(fetcher.fetchRawMarketById(42)).resolves.toBe(rawMarket);
    });

    it('rejects documented code/msg error envelopes', async () => {
        const fetcher = makeFetcher({
            code: 123,
            msg: 'bad request',
            result: null,
        });

        await expect(fetcher.fetchRawMarketById(42)).rejects.toThrow('Opinion API error (code 123): bad request');
    });

    it('continues to accept legacy errno/errmsg envelopes', async () => {
        const rawMarket = { id: 43, question: 'Legacy?' } as any;
        const fetcher = makeFetcher({
            errno: 0,
            errmsg: 'success',
            result: { data: rawMarket },
        });

        await expect(fetcher.fetchRawMarketById(43)).resolves.toBe(rawMarket);
    });
});
