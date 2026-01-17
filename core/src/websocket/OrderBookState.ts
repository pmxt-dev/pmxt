import { OrderBook, OrderLevel } from '../types';

export class OrderBookState {
    private bids: OrderLevel[] = [];
    private asks: OrderLevel[] = [];
    private lastUpdateTime?: number;

    updateSnapshot(snapshot: OrderBook): void {
        this.bids = [...snapshot.bids].sort((a, b) => b.price - a.price);
        this.asks = [...snapshot.asks].sort((a, b) => a.price - b.price);
        this.lastUpdateTime = snapshot.timestamp || Date.now();
    }

    applyDelta(delta: OrderBook): void {
        if (delta.bids?.length > 0) {
            this.bids = this.mergeLevels(this.bids, delta.bids, 'bids');
        }

        if (delta.asks?.length > 0) {
            this.asks = this.mergeLevels(this.asks, delta.asks, 'asks');
        }

        this.lastUpdateTime = delta.timestamp || Date.now();
    }

    getSnapshot(): OrderBook {
        return {
            bids: [...this.bids],
            asks: [...this.asks],
            timestamp: this.lastUpdateTime
        };
    }

    clear(): void {
        this.bids = [];
        this.asks = [];
        this.lastUpdateTime = undefined;
    }

    private mergeLevels(
        existing: OrderLevel[],
        updates: OrderLevel[],
        side: 'bids' | 'asks'
    ): OrderLevel[] {
        const priceMap = new Map<number, number>();

        for (const level of existing) {
            priceMap.set(level.price, level.size);
        }

        for (const update of updates) {
            if (update.size === 0) {
                priceMap.delete(update.price);
            } else {
                priceMap.set(update.price, update.size);
            }
        }

        const result: OrderLevel[] = Array.from(priceMap.entries()).map(([price, size]) => ({
            price,
            size
        }));

        return side === 'bids'
            ? result.sort((a, b) => b.price - a.price)
            : result.sort((a, b) => a.price - b.price);
    }
}
