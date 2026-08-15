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

describe('GeminiFetcher order book symbol index', () => {
    const eventsResponse = {
        data: [
            {
                ticker: 'EVT-1',
                contracts: [
                    {
                        instrumentSymbol: 'ABC-YES',
                        ticker: 'ABC-YES',
                        prices: { bestBid: '0.60', bestAsk: '0.62' },
                    },
                ],
            },
        ],
        pagination: { total: 1 },
    };

    const singleEventResponse = {
        ticker: 'EVT-1',
        contracts: [
            {
                instrumentSymbol: 'ABC-YES',
                prices: { bestBid: '0.60', bestAsk: '0.62' },
            },
        ],
    };

    function makeGetFetcher(getResponses: unknown[]) {
        const get = jest.fn(async () => ({ data: getResponses.shift() }));
        const ctx: FetcherContext = {
            http: { get } as any,
            callApi: jest.fn() as any,
            getHeaders: jest.fn(() => ({})),
        };

        return { fetcher: new GeminiFetcher(ctx, 'https://api.gemini.test'), get };
    }

    it('lazily builds the symbol index when fetchRawOrderBook is called first', async () => {
        // Regression for #2037: a freshly constructed fetcher has an empty
        // symbolToEventTicker index. fetchRawOrderBook must populate it lazily
        // instead of throwing when fetchMarkets/fetchEvents was not called first.
        const { fetcher, get } = makeGetFetcher([eventsResponse, singleEventResponse]);

        const book = await fetcher.fetchRawOrderBook('ABC-YES');

        expect(book).toEqual({
            bids: [{ price: '0.60', size: '0' }],
            asks: [{ price: '0.62', size: '0' }],
            timestamp: expect.any(Number),
        });
        // One GET to list events (build the index) + one GET for the single event.
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('still throws when the symbol is unknown even after building the index', async () => {
        const { fetcher } = makeGetFetcher([eventsResponse]);

        await expect(fetcher.fetchRawOrderBook('UNKNOWN-YES')).rejects.toThrow(
            /no event ticker found for UNKNOWN-YES/,
        );
    });
});
