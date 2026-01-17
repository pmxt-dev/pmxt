import { OrderBookState } from '../../src/websocket/OrderBookState';
import { OrderBook } from '../../src/types';

describe('OrderBookState', () => {
    let state: OrderBookState;

    beforeEach(() => {
        state = new OrderBookState();
    });

    describe('updateSnapshot', () => {
        it('should initialize orderbook with snapshot', () => {
            const snapshot: OrderBook = {
                bids: [
                    { price: 0.52, size: 100 },
                    { price: 0.51, size: 200 },
                    { price: 0.50, size: 300 }
                ],
                asks: [
                    { price: 0.53, size: 150 },
                    { price: 0.54, size: 250 },
                    { price: 0.55, size: 350 }
                ],
                timestamp: 1000
            };

            state.updateSnapshot(snapshot);
            const result = state.getSnapshot();

            expect(result.bids).toHaveLength(3);
            expect(result.asks).toHaveLength(3);
            expect(result.timestamp).toBe(1000);
        });

        it('should sort bids in descending order', () => {
            const snapshot: OrderBook = {
                bids: [
                    { price: 0.50, size: 100 },
                    { price: 0.52, size: 200 },
                    { price: 0.51, size: 150 }
                ],
                asks: []
            };

            state.updateSnapshot(snapshot);
            const result = state.getSnapshot();

            expect(result.bids[0].price).toBe(0.52);
            expect(result.bids[1].price).toBe(0.51);
            expect(result.bids[2].price).toBe(0.50);
        });

        it('should sort asks in ascending order', () => {
            const snapshot: OrderBook = {
                bids: [],
                asks: [
                    { price: 0.55, size: 100 },
                    { price: 0.53, size: 200 },
                    { price: 0.54, size: 150 }
                ]
            };

            state.updateSnapshot(snapshot);
            const result = state.getSnapshot();

            expect(result.asks[0].price).toBe(0.53);
            expect(result.asks[1].price).toBe(0.54);
            expect(result.asks[2].price).toBe(0.55);
        });
    });

    describe('applyDelta', () => {
        beforeEach(() => {
            state.updateSnapshot({
                bids: [
                    { price: 0.52, size: 100 },
                    { price: 0.51, size: 200 }
                ],
                asks: [
                    { price: 0.53, size: 150 },
                    { price: 0.54, size: 250 }
                ],
                timestamp: 1000
            });
        });

        it('should add new price levels', () => {
            const delta: OrderBook = {
                bids: [{ price: 0.53, size: 50 }],
                asks: [{ price: 0.52, size: 75 }],
                timestamp: 2000
            };

            state.applyDelta(delta);
            const result = state.getSnapshot();

            expect(result.bids).toHaveLength(3);
            expect(result.asks).toHaveLength(3);
            expect(result.timestamp).toBe(2000);
        });

        it('should update existing price levels', () => {
            const delta: OrderBook = {
                bids: [{ price: 0.52, size: 150 }],
                asks: [],
                timestamp: 2000
            };

            state.applyDelta(delta);
            const result = state.getSnapshot();

            const updatedBid = result.bids.find(b => b.price === 0.52);
            expect(updatedBid?.size).toBe(150);
            expect(result.bids).toHaveLength(2);
        });

        it('should remove price levels with size 0', () => {
            const delta: OrderBook = {
                bids: [{ price: 0.52, size: 0 }],
                asks: [],
                timestamp: 2000
            };

            state.applyDelta(delta);
            const result = state.getSnapshot();

            expect(result.bids).toHaveLength(1);
            expect(result.bids[0].price).toBe(0.51);
        });

        it('should handle multiple updates in one delta', () => {
            const delta: OrderBook = {
                bids: [
                    { price: 0.52, size: 0 },
                    { price: 0.50, size: 300 },
                    { price: 0.51, size: 250 }
                ],
                asks: [
                    { price: 0.53, size: 0 },
                    { price: 0.55, size: 400 }
                ],
                timestamp: 2000
            };

            state.applyDelta(delta);
            const result = state.getSnapshot();

            expect(result.bids).toHaveLength(2);
            expect(result.bids[0].price).toBe(0.51);
            expect(result.bids[0].size).toBe(250);
            expect(result.bids[1].price).toBe(0.50);
            
            expect(result.asks).toHaveLength(2);
            expect(result.asks[0].price).toBe(0.54);
            expect(result.asks[1].price).toBe(0.55);
        });

        it('should maintain sort order after delta', () => {
            const delta: OrderBook = {
                bids: [
                    { price: 0.49, size: 50 },
                    { price: 0.53, size: 75 }
                ],
                asks: [],
                timestamp: 2000
            };

            state.applyDelta(delta);
            const result = state.getSnapshot();

            for (let i = 0; i < result.bids.length - 1; i++) {
                expect(result.bids[i].price).toBeGreaterThanOrEqual(result.bids[i + 1].price);
            }
        });
    });

    describe('clear', () => {
        it('should clear all orderbook data', () => {
            state.updateSnapshot({
                bids: [{ price: 0.52, size: 100 }],
                asks: [{ price: 0.53, size: 150 }],
                timestamp: 1000
            });

            state.clear();
            const result = state.getSnapshot();

            expect(result.bids).toEqual([]);
            expect(result.asks).toEqual([]);
            expect(result.timestamp).toBeUndefined();
        });
    });

    describe('edge cases', () => {
        it('should handle empty snapshot', () => {
            state.updateSnapshot({ bids: [], asks: [] });
            const result = state.getSnapshot();

            expect(result.bids).toEqual([]);
            expect(result.asks).toEqual([]);
        });

        it('should handle delta with empty arrays', () => {
            state.updateSnapshot({
                bids: [{ price: 0.52, size: 100 }],
                asks: [{ price: 0.53, size: 150 }]
            });

            state.applyDelta({ bids: [], asks: [] });
            const result = state.getSnapshot();

            expect(result.bids).toHaveLength(1);
            expect(result.asks).toHaveLength(1);
        });

        it('should handle missing timestamp', () => {
            const snapshot: OrderBook = {
                bids: [{ price: 0.52, size: 100 }],
                asks: []
            };

            state.updateSnapshot(snapshot);
            const result = state.getSnapshot();

            expect(result.timestamp).toBeDefined();
            expect(typeof result.timestamp).toBe('number');
        });
    });
});
