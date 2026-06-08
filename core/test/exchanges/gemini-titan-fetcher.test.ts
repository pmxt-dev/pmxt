import { GeminiFetcher } from '../../src/exchanges/gemini-titan/fetcher';
import { FetcherContext } from '../../src/exchanges/interfaces';

function makeFetcher(responses: unknown[]) {
    const post = jest.fn(async () => ({ data: responses.shift() }));
    const buildHeaders = jest.fn(() => ({ 'X-GEMINI-APIKEY': 'test-key' }));
    const auth = {
        nonce: jest.fn(() => 12345),
        buildHeaders,
    } as any;
    const ctx: FetcherContext = {
        http: { post } as any,
        callApi: jest.fn() as any,
        getHeaders: jest.fn(() => ({})),
    };

    return {
        fetcher: new GeminiFetcher(ctx, 'https://api.gemini.test', auth),
        post,
        buildHeaders,
    };
}

describe('GeminiFetcher authenticated orders', () => {
    it('reads paginated order history envelopes', async () => {
        const { fetcher, buildHeaders } = makeFetcher([
            {
                orders: [{ orderId: 1, status: 'filled' }],
                pagination: { limit: 100, offset: 0, count: 2 },
            },
            {
                orders: [{ orderId: 2, status: 'cancelled' }],
                pagination: { limit: 100, offset: 1, count: 2 },
            },
        ]);

        await expect(fetcher.fetchRawOrderHistory()).resolves.toEqual([
            { orderId: 1, status: 'filled' },
            { orderId: 2, status: 'cancelled' },
        ]);

        expect(buildHeaders).toHaveBeenNthCalledWith(1, expect.objectContaining({
            request: '/v1/prediction-markets/orders/history',
            limit: 100,
            offset: 0,
        }));
        expect(buildHeaders).toHaveBeenNthCalledWith(2, expect.objectContaining({
            request: '/v1/prediction-markets/orders/history',
            limit: 100,
            offset: 1,
        }));
    });

    it('passes limit and offset when fetching active orders', async () => {
        const { fetcher, buildHeaders } = makeFetcher([
            {
                orders: [],
                pagination: { limit: 100, offset: 0, count: 0 },
            },
        ]);

        await expect(fetcher.fetchRawActiveOrders('BTCUSD-PERP')).resolves.toEqual([]);

        expect(buildHeaders).toHaveBeenCalledWith(expect.objectContaining({
            request: '/v1/prediction-markets/orders/active',
            symbol: 'BTCUSD-PERP',
            limit: 100,
            offset: 0,
        }));
    });

    it('returns the full raw cancel order response', async () => {
        const rawOrder = {
            orderId: 123,
            symbol: 'BTCUSD-PERP',
            side: 'buy',
            outcome: 'yes',
            status: 'cancelled',
        };
        const { fetcher } = makeFetcher([rawOrder]);

        await expect(fetcher.cancelRawOrder(123)).resolves.toBe(rawOrder);
    });
});
