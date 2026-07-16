import { LimitlessExchange } from '../../src/exchanges/limitless';
import type { OrderBook } from '../../src/types';

/**
 * Regression for #1660: LimitlessExchange never overrode `unwatchOrderBook`,
 * so calling it always threw "unwatchOrderBook() is not supported by Limitless"
 * even though `LimitlessWebSocket.unsubscribe()` already exists. The override
 * must resolve the outcome slug (same as `watchOrderBook`) and forward it to
 * the websocket's `unsubscribe()`.
 */
describe('LimitlessExchange.unwatchOrderBook', () => {
    const SLUG = 'some-market-slug';

    function makeExchangeWithFakeWs() {
        const exchange = new LimitlessExchange();
        const calls = { watch: [] as string[], unsubscribe: [] as string[] };
        const emptyBook: OrderBook = { bids: [], asks: [] } as OrderBook;
        const fakeWs = {
            watchOrderBook: async (slug: string): Promise<OrderBook> => {
                calls.watch.push(slug);
                return emptyBook;
            },
            unsubscribe: async (slug: string): Promise<void> => {
                calls.unsubscribe.push(slug);
            },
        };
        // Inject the fake websocket so ensureWs() returns it without opening a
        // real connection. A non-numeric outcome id is treated as a slug by
        // resolveSlug(), so no network lookup happens.
        (exchange as any).ws = fakeWs;
        return { exchange, calls };
    }

    test('forwards the resolved slug to LimitlessWebSocket.unsubscribe()', async () => {
        const { exchange, calls } = makeExchangeWithFakeWs();

        await exchange.watchOrderBook(SLUG);
        expect(calls.watch).toEqual([SLUG]);

        await exchange.unwatchOrderBook(SLUG);
        expect(calls.unsubscribe).toEqual([SLUG]);
    });

    test('reports unwatchOrderBook as a supported capability', () => {
        const exchange = new LimitlessExchange();
        expect(exchange.has.unwatchOrderBook).toBe(true);
    });
});
