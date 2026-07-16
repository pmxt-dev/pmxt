import { RainExchange } from '../../src/exchanges/rain';
import type { OrderBook } from '../../src/types';

/**
 * Regression for #1666: RainExchange exposed a working single-outcome
 * `fetchOrderBook` but never overrode the batch `fetchOrderBooks`, so calling
 * it threw "Method fetchOrderBooks not implemented." and `has.fetchOrderBooks`
 * reported false. The batch override loops the already-working single fetch and
 * is reported as an emulated capability (matching `fetchOrderBook: 'emulated'`).
 */
describe('RainExchange.fetchOrderBooks', () => {
    const BOOK_A: OrderBook = {
        bids: [{ price: 0.4, size: 10 }],
        asks: [],
        timestamp: 1,
    } as OrderBook;
    const BOOK_B: OrderBook = {
        bids: [],
        asks: [{ price: 0.6, size: 5 }],
        timestamp: 2,
    } as OrderBook;

    test('loops the single-outcome fetchOrderBook for each outcome id', async () => {
        const exchange = new RainExchange();
        const books: Record<string, OrderBook> = {
            'rain:1:0': BOOK_A,
            'rain:2:1': BOOK_B,
        };
        const calls: string[] = [];
        // Stub the already-working single-outcome fetch so no network is hit.
        (exchange as any).fetchOrderBook = async (outcomeId: string): Promise<OrderBook> => {
            calls.push(outcomeId);
            return books[outcomeId];
        };

        const ids = ['rain:1:0', 'rain:2:1'];
        const result = await exchange.fetchOrderBooks(ids);

        expect(calls).toEqual(ids);
        expect(result).toEqual({ 'rain:1:0': BOOK_A, 'rain:2:1': BOOK_B });
    });

    test('reports fetchOrderBooks as a supported (emulated) capability', () => {
        const exchange = new RainExchange();
        expect(exchange.has.fetchOrderBooks).toBe('emulated');
    });
});
