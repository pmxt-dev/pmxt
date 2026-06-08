import { OpinionExchange } from '../../src/exchanges/opinion';
import { UnifiedMarket } from '../../src/types';

const RUN_LIVE = process.env.RUN_OPINION_READONLY_E2E === '1';
const describeLive = RUN_LIVE ? describe : describe.skip;

jest.setTimeout(120_000);

describeLive('Opinion read-only live E2E', () => {
    const exchange = new OpinionExchange();

    afterAll(async () => {
        await exchange.close();
    });

    test('fetchMarkets returns outcomes with opinionMarketId in metadata', async () => {
        const markets: UnifiedMarket[] = await exchange.fetchMarkets({ limit: 3 });
        expect(markets.length).toBeGreaterThan(0);
        for (const market of markets) {
            expect(market.outcomes.length).toBeGreaterThan(0);
            for (const outcome of market.outcomes) {
                expect(typeof outcome.metadata?.opinionMarketId).toBe('number');
                expect(Number.isInteger(outcome.metadata?.opinionMarketId)).toBe(true);
                // opinionMarketId should match the market's integer marketId
                expect(outcome.metadata?.opinionMarketId).toBe(Number(market.marketId));
            }
        }
    });

    test('fetchMarkets with integer marketId returns that exact market', async () => {
        const markets = await exchange.fetchMarkets({ limit: 1 });
        const first = markets[0];
        const fetched = await exchange.fetchMarkets({ marketId: first.marketId });
        expect(fetched).toHaveLength(1);
        expect(fetched[0].marketId).toBe(first.marketId);
        expect(fetched[0].outcomes[0].metadata?.opinionMarketId).toBe(Number(first.marketId));
    });

    test('fetchMarkets with UUID marketId rejects with a 400-class error', async () => {
        await expect(
            exchange.fetchMarkets({ marketId: '550e8400-e29b-41d4-a716-446655440000' }),
        ).rejects.toThrow(/Opinion market IDs must be integers/);
    });
});
