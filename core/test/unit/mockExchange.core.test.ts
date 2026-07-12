import { MockExchange } from '../../src/exchanges/mock';
import { SeededRng } from '../../src/exchanges/mock/seededRng';

const r3 = (n: number) => parseFloat(n.toFixed(3));

describe('MockExchange', () => {
    test('fetchMarkets is deterministic for same marketCount', async () => {
        const a = new MockExchange({ marketCount: 5 });
        const b = new MockExchange({ marketCount: 5 });
        const m1 = await a.fetchMarkets();
        const m2 = await b.fetchMarkets();
        expect(m1[0]!.marketId).toBe(m2[0]!.marketId);
        expect(m1[0]!.title).toBe(m2[0]!.title);
    });

    test('market order price matches _bookMidPrice seeding', async () => {
        const ex = new MockExchange({ marketCount: 1, orderLatencyMs: 0 });
        const markets = await ex.fetchMarkets();
        const m0 = markets[0]!;
        const y = m0.yes?.outcomeId ?? m0.outcomes[0]!.outcomeId;
        const r = new SeededRng(y);
        const expectedMid = r3(r.float(0.1, 0.9));
        const o = await ex.createOrder({
            marketId: m0.marketId,
            outcomeId: y,
            side: 'buy',
            type: 'market',
            amount: 2,
        });
        expect(o.status).toBe('filled');
        expect(o.price).toBeCloseTo(expectedMid, 5);
    });

    test('fetchOrderBook resolves yes/no outcome aliases from market id', async () => {
        const ex = new MockExchange({ marketCount: 3, orderLatencyMs: 0 });
        const market = (await ex.fetchMarkets()).find((m) => m.yes && m.no)!;

        const yesByAlias = await ex.fetchOrderBook(market.marketId, undefined, { outcome: 'yes' });
        const yesByToken = await ex.fetchOrderBook(market.yes!.outcomeId);
        const noByAlias = await ex.fetchOrderBook(market.marketId, undefined, { outcome: 'no' });
        const noByToken = await ex.fetchOrderBook(market.no!.outcomeId);

        expect(yesByAlias.bids).toEqual(yesByToken.bids);
        expect(yesByAlias.asks).toEqual(yesByToken.asks);
        expect(noByAlias.bids).toEqual(noByToken.bids);
        expect(noByAlias.asks).toEqual(noByToken.asks);
    });

    test('fetchOrderBook accepts raw outcome id in params.outcome', async () => {
        const ex = new MockExchange({ marketCount: 3, orderLatencyMs: 0 });
        const market = (await ex.fetchMarkets()).find((m) => m.yes)!;

        const byParam = await ex.fetchOrderBook(market.marketId, undefined, { outcome: market.yes!.outcomeId });
        const byToken = await ex.fetchOrderBook(market.yes!.outcomeId);

        expect(byParam.bids).toEqual(byToken.bids);
        expect(byParam.asks).toEqual(byToken.asks);
    });

    test('fetchOrderBook honors limit depth', async () => {
        const ex = new MockExchange({ marketCount: 1, orderLatencyMs: 0 });
        const market = (await ex.fetchMarkets())[0]!;
        const outcomeId = market.outcomes[0]!.outcomeId;

        const limited = await ex.fetchOrderBook(outcomeId, 5);

        expect(limited.bids).toHaveLength(5);
        expect(limited.asks).toHaveLength(5);
    });

    test('fetchOrderBooks returns books keyed by requested outcome IDs', async () => {
        const ex = new MockExchange({ marketCount: 1, orderLatencyMs: 0 });
        const market = (await ex.fetchMarkets())[0]!;
        const outcomeIds = market.outcomes.slice(0, 2).map((outcome) => outcome.outcomeId);

        const books = await ex.fetchOrderBooks(outcomeIds);

        expect(Object.keys(books)).toEqual(outcomeIds);
        expect(books[outcomeIds[0]!]!.bids.length).toBeGreaterThan(0);
        expect(books[outcomeIds[1]!]!.asks.length).toBeGreaterThan(0);
        expect(ex.has.fetchOrderBooks).toBe(true);
    });

    test('fetchTrades honors limit', async () => {
        const ex = new MockExchange({ marketCount: 1, orderLatencyMs: 0 });
        const market = (await ex.fetchMarkets())[0]!;
        const outcomeId = market.outcomes[0]!.outcomeId;

        const trades = await ex.fetchTrades(outcomeId, { limit: 3 });

        expect(trades).toHaveLength(3);
    });

    test('fetchTrades applies start and end filters before limit', async () => {
        const nowSpy = jest
            .spyOn(Date, 'now')
            .mockReturnValue(Date.parse('2026-01-01T00:00:00.000Z'));

        try {
            const ex = new MockExchange({ marketCount: 1, orderLatencyMs: 0 });
            const market = (await ex.fetchMarkets())[0]!;
            const outcomeId = market.outcomes[0]!.outcomeId;
            const allTrades = await ex.fetchTrades(outcomeId);
            const ascendingTrades = [...allTrades].sort((a, b) => a.timestamp - b.timestamp);
            const start = new Date(ascendingTrades[1]!.timestamp);
            const end = new Date(ascendingTrades[ascendingTrades.length - 2]!.timestamp);
            const expectedIds = allTrades
                .filter((trade) => trade.timestamp >= start.getTime() && trade.timestamp <= end.getTime())
                .slice(0, 2)
                .map((trade) => trade.id);

            const filteredTrades = await ex.fetchTrades(outcomeId, {
                start,
                end,
                limit: 2,
            });

            expect(filteredTrades.map((trade) => trade.id)).toEqual(expectedIds);
            expect(filteredTrades.every((trade) => trade.timestamp >= start.getTime())).toBe(true);
            expect(filteredTrades.every((trade) => trade.timestamp <= end.getTime())).toBe(true);
        } finally {
            nowSpy.mockRestore();
        }
    });

    test('instant limit buy debits free cash and creates position', async () => {
        const ex = new MockExchange({ marketCount: 1, orderLatencyMs: 0, balance: 10_000 });
        const m = (await ex.fetchMarkets()).find(x => x.yes) ?? (await ex.fetchMarkets())[0]!;
        const oc = m.yes?.outcomeId ?? m.outcomes[0]!.outcomeId;
        const p = 0.4;
        const amt = 10;
        const before = await ex.fetchBalance();
        await ex.createOrder({
            marketId: m.marketId,
            outcomeId: oc,
            side: 'buy',
            type: 'limit',
            price: p,
            amount: amt,
        });
        const [after] = await ex.fetchBalance();
        expect(after.available).toBeCloseTo(before[0]!.available - p * amt, 4);
        const pos = await ex.fetchPositions();
        expect(pos.length).toBe(1);
        expect(pos[0]!.size).toBeCloseTo(amt, 3);
    });

    test('resting limit: open, fillOrder, then filled and locked released', async () => {
        const ex = new MockExchange({
            marketCount: 1,
            orderLatencyMs: 0,
            balance: 10_000,
            limitOrderMode: 'resting',
        });
        const m = (await ex.fetchMarkets()).find(x => x.yes) ?? (await ex.fetchMarkets())[0]!;
        const oc = m.yes?.outcomeId ?? m.outcomes[0]!.outcomeId;
        const p = 0.5;
        const amt = 4;
        const o = await ex.createOrder({
            marketId: m.marketId,
            outcomeId: oc,
            side: 'buy',
            type: 'limit',
            price: p,
            amount: amt,
        });
        expect(o.status).toBe('open');
        const [b1] = await ex.fetchBalance();
        expect(b1.locked).toBeCloseTo(p * amt, 3);
        const open0 = await ex.fetchOpenOrders();
        expect(open0).toHaveLength(1);
        const filled = await ex.fillOrder(o.id);
        expect(filled.status).toBe('filled');
        const [b2] = await ex.fetchBalance();
        expect(b2.locked).toBe(0);
        expect((await ex.fetchOpenOrders()).length).toBe(0);
    });

    test('resting: partial fill then second fill', async () => {
        const ex = new MockExchange({
            marketCount: 1,
            orderLatencyMs: 0,
            balance: 10_000,
            limitOrderMode: 'resting',
        });
        const m = (await ex.fetchMarkets()).find(x => x.yes) ?? (await ex.fetchMarkets())[0]!;
        const oc = m.yes?.outcomeId ?? m.outcomes[0]!.outcomeId;
        const o = await ex.createOrder({
            marketId: m.marketId,
            outcomeId: oc,
            side: 'buy',
            type: 'limit',
            price: 0.6,
            amount: 10,
        });
        const p1 = await ex.fillOrder(o.id, 3);
        expect(p1.status).toBe('open');
        expect(p1.filled).toBe(3);
        const p2 = await ex.fillOrder(o.id, 7);
        expect(p2.status).toBe('filled');
    });

    test('fetchOpenOrders filters resting orders by market id', async () => {
        const ex = new MockExchange({
            marketCount: 2,
            orderLatencyMs: 0,
            balance: 10_000,
            limitOrderMode: 'resting',
        });
        const markets = await ex.fetchMarkets({ limit: 2 });
        const first = markets[0]!;
        const second = markets[1]!;
        const firstOutcome = first.yes?.outcomeId ?? first.outcomes[0]!.outcomeId;
        const secondOutcome = second.yes?.outcomeId ?? second.outcomes[0]!.outcomeId;

        const firstOrder = await ex.createOrder({
            marketId: first.marketId,
            outcomeId: firstOutcome,
            side: 'buy',
            type: 'limit',
            price: 0.5,
            amount: 4,
        });
        const secondOrder = await ex.createOrder({
            marketId: second.marketId,
            outcomeId: secondOutcome,
            side: 'buy',
            type: 'limit',
            price: 0.5,
            amount: 4,
        });

        const firstMarketOpen = await ex.fetchOpenOrders(first.marketId);

        expect(firstMarketOpen.map((order) => order.id)).toEqual([firstOrder.id]);
        expect(firstMarketOpen.map((order) => order.id)).not.toContain(secondOrder.id);
    });

    test('resting: cancel buy unlocks USDC', async () => {
        const ex = new MockExchange({ marketCount: 1, orderLatencyMs: 0, limitOrderMode: 'resting', balance: 1000 });
        const m = (await ex.fetchMarkets()).find(x => x.yes) ?? (await ex.fetchMarkets())[0]!;
        const oc = m.yes?.outcomeId ?? m.outcomes[0]!.outcomeId;
        const o = await ex.createOrder({
            marketId: m.marketId,
            outcomeId: oc,
            side: 'buy',
            type: 'limit',
            price: 0.5,
            amount: 10,
        });
        const [b1] = await ex.fetchBalance();
        await ex.cancelOrder(o.id);
        const [b2] = await ex.fetchBalance();
        expect(b2.locked).toBe(0);
        expect(b2.available).toBeCloseTo(b1.total, 2);
    });

    test('cancel filled order throws', async () => {
        const ex = new MockExchange({ marketCount: 1, orderLatencyMs: 0 });
        const m = (await ex.fetchMarkets()).find(x => x.yes) ?? (await ex.fetchMarkets())[0]!;
        const oc = m.yes?.outcomeId ?? m.outcomes[0]!.outcomeId;
        const o = await ex.createOrder({
            marketId: m.marketId,
            outcomeId: oc,
            side: 'buy',
            type: 'limit',
            price: 0.45,
            amount: 2,
        });
        await expect(ex.cancelOrder(o.id)).rejects.toThrow();
    });

    test('reset clears session', async () => {
        const ex = new MockExchange({ marketCount: 1, orderLatencyMs: 0, balance: 5000 });
        const m = (await ex.fetchMarkets()).find(x => x.yes) ?? (await ex.fetchMarkets())[0]!;
        const oc = m.yes?.outcomeId ?? m.outcomes[0]!.outcomeId;
        await ex.createOrder({
            marketId: m.marketId,
            outcomeId: oc,
            side: 'buy',
            type: 'limit',
            price: 0.3,
            amount: 5,
        });
        ex.reset();
        const [b] = await ex.fetchBalance();
        expect(b.available).toBe(5000);
        expect(await ex.fetchOpenOrders()).toHaveLength(0);
    });
});
