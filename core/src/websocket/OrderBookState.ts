import { OrderBook, OrderLevel } from '../types';

/**
 * Manages the state of an orderbook, applying incremental updates (deltas)
 * to maintain a current snapshot.
 */
export class OrderBookState {
    private bids: OrderLevel[] = [];
    private asks: OrderLevel[] = [];
    private lastUpdateTime?: number;

    /**
     * Initialize or update the orderbook with a full snapshot.
     */
    updateSnapshot(snapshot: OrderBook): void {
        this.bids = [...snapshot.bids].sort((a, b) => b.price - a.price); // Descending
        this.asks = [...snapshot.asks].sort((a, b) => a.price - b.price); // Ascending
        this.lastUpdateTime = snapshot.timestamp || Date.now();
    }

    /**
     * Apply incremental updates (deltas) to the orderbook.
     * Polymarket sends updates with bids/asks that need to be merged.
     */
    applyDelta(delta: OrderBook): void {
        // Apply bid updates
        if (delta.bids && delta.bids.length > 0) {
            this.bids = this.mergeLevels(this.bids, delta.bids, 'bids');
        }

        // Apply ask updates
        if (delta.asks && delta.asks.length > 0) {
            this.asks = this.mergeLevels(this.asks, delta.asks, 'asks');
        }

        this.lastUpdateTime = delta.timestamp || Date.now();
    }

    /**
     * Merge new levels into existing levels.
     * If size is 0, remove the level. Otherwise, update or add the level.
     */
    private mergeLevels(
        existing: OrderLevel[],
        updates: OrderLevel[],
        side: 'bids' | 'asks'
    ): OrderLevel[] {
        const map = new Map<number, number>();

        // Build map from existing levels
        for (const level of existing) {
            map.set(level.price, level.size);
        }

        // Apply updates
        for (const update of updates) {
            if (update.size === 0) {
                // Remove level if size is 0
                map.delete(update.price);
            } else {
                // Update or add level
                map.set(update.price, update.size);
            }
        }

        // Convert back to array and sort
        const result: OrderLevel[] = Array.from(map.entries()).map(([price, size]) => ({
            price,
            size
        }));

        if (side === 'bids') {
            return result.sort((a, b) => b.price - a.price); // Descending
        } else {
            return result.sort((a, b) => a.price - b.price); // Ascending
        }
    }

    /**
     * Get the current orderbook snapshot.
     */
    getSnapshot(): OrderBook {
        return {
            bids: [...this.bids],
            asks: [...this.asks],
            timestamp: this.lastUpdateTime
        };
    }

    /**
     * Clear the orderbook state.
     */
    clear(): void {
        this.bids = [];
        this.asks = [];
        this.lastUpdateTime = undefined;
    }
}
