import request from 'supertest';
import { MockExchange } from '../../src/exchanges/mock';
import { Router } from '../../src/router';
import { createApp } from '../../src/server/app';
import type { TradesParams } from '../../src/BaseExchange';
import type { Order, Trade, UnifiedMarket } from '../../src/types';

interface ApiSuccess<T> {
    success: true;
    data: T;
}

function routeWithQuery(path: string, params: Record<string, string | number | boolean>): string {
    return `${path}?${new URLSearchParams(
        Object.entries(params).map(([key, value]) => [key, String(value)]),
    ).toString()}`;
}

async function get<T>(
    targetApp: ReturnType<typeof createApp>,
    path: string,
): Promise<T> {
    const res = await request(targetApp).get(path);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    return (res.body as ApiSuccess<T>).data;
}

async function post<T>(
    targetApp: ReturnType<typeof createApp>,
    method: string,
    args: unknown[] = [],
): Promise<T> {
    const res = await request(targetApp)
        .post(`/api/mock/${method}`)
        .send({ args });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    return (res.body as ApiSuccess<T>).data;
}

function buildLimitOrder(market: UnifiedMarket) {
    const outcome = market.yes ?? market.outcomes[0]!;
    return {
        marketId: market.marketId,
        outcomeId: outcome.outcomeId,
        side: 'buy' as const,
        type: 'limit' as const,
        price: 0.5,
        amount: 4,
    };
}

class DateAssertingMockExchange extends MockExchange {
    constructor(private readonly assertTradesParams: (params: TradesParams) => void) {
        super({ marketCount: 1, orderLatencyMs: 0 });
    }

    override async fetchTrades(outcomeId: string, params: TradesParams = {}): Promise<Trade[]> {
        this.assertTradesParams(params);
        return super.fetchTrades(outcomeId, params);
    }
}

class LocalRouter extends Router {
    async fetchArbitrage(): Promise<Array<{ id: string }>> {
        return [{ id: 'local-router-hit' }];
    }
}

describe('HTTP route regressions', () => {
    test('createApp localExchanges isolates mock route state for resting orders', async () => {
        const app = createApp({
            accessToken: undefined,
            localExchanges: {
                mock: new MockExchange({
                    marketCount: 2,
                    orderLatencyMs: 0,
                    limitOrderMode: 'resting',
                    balance: 1000,
                }),
            },
        });
        const markets = await post<UnifiedMarket[]>(app, 'fetchMarkets', [{ limit: 2 }]);
        const first = markets[0]!;
        const second = markets[1]!;

        const firstOrder = await post<Order>(app, 'createOrder', [buildLimitOrder(first)]);
        const secondOrder = await post<Order>(app, 'createOrder', [buildLimitOrder(second)]);

        const firstOpen = await get<Order[]>(
            app,
            routeWithQuery('/api/mock/fetchOpenOrders', { marketId: first.marketId }),
        );

        expect(firstOrder.status).toBe('open');
        expect(secondOrder.status).toBe('open');
        expect(firstOpen.map((order) => order.id)).toEqual([firstOrder.id]);
    });

    test('fetchTrades normalizes start and end query strings before dispatch', async () => {
        const assertTradesParams = jest.fn((params: TradesParams) => {
            expect(params.start).toBeInstanceOf(Date);
            expect(params.end).toBeInstanceOf(Date);
        });
        const app = createApp({
            accessToken: undefined,
            localExchanges: {
                mock: new DateAssertingMockExchange(assertTradesParams),
            },
        });
        const markets = await get<UnifiedMarket[]>(
            app,
            routeWithQuery('/api/mock/fetchMarkets', { limit: 1 }),
        );
        const outcomeId = markets[0]!.outcomes[0]!.outcomeId;

        await get<Trade[]>(
            app,
            routeWithQuery('/api/mock/fetchTrades', {
                outcomeId,
                start: '2026-01-01T00:00:00.000Z',
                end: '2026-01-01T01:00:00.000Z',
            }),
        );

        expect(assertTradesParams).toHaveBeenCalledTimes(1);
    });

    test('fetchMarkets normalizes single tags query values to arrays', async () => {
        const app = createApp({ accessToken: undefined });
        const markets = await get<UnifiedMarket[]>(
            app,
            routeWithQuery('/api/mock/fetchMarkets', { limit: 8 }),
        );
        const target = markets.find((market) => market.tags?.length)!;
        const tag = target.tags![0]!;

        const byTag = await get<UnifiedMarket[]>(
            app,
            routeWithQuery('/api/mock/fetchMarkets', { tags: tag }),
        );

        expect(byTag.length).toBeGreaterThan(0);
        expect(byTag.every((market) => market.tags?.includes(tag))).toBe(true);
    });

    test('router route uses app-local router overrides', async () => {
        const app = createApp({
            accessToken: undefined,
            localExchanges: {
                router: new LocalRouter({ apiKey: 'test' }),
            },
        });

        await expect(get<Array<{ id: string }>>(app, '/api/router/fetchArbitrage')).resolves.toEqual([
            { id: 'local-router-hit' },
        ]);
    });

    test('HTTP fetchSeries returns empty arrays for venues without series support', async () => {
        const app = createApp({ accessToken: undefined });

        await expect(get<unknown[]>(app, '/api/limitless/fetchSeries')).resolves.toEqual([]);
    });
});
