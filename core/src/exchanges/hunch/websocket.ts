import { OrderBook, Trade } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Hunch exposes SSE at /api/agent/v1/events for resolution awareness, but no
 * market-data WebSocket. watchOrderBook / watchTrades are emulated with a
 * poll-based fallback (matching the CCXT Pro async pattern + Myriad's adapter).
 */

const DEFAULT_POLL_INTERVAL = 5000; // 5s
const MAX_CONSECUTIVE_FAILURES = 5;

export type FetchOrderBookFn = (id: string) => Promise<OrderBook>;
export type FetchTradesFn = (id: string, limit: number) => Promise<Trade[]>;

export class HunchWebSocket {
    private readonly fetchOrderBook: FetchOrderBookFn;
    private readonly fetchTrades: FetchTradesFn;
    private readonly pollInterval: number;
    private orderBookTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
    private tradeTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
    private orderBookResolvers: Map<string, ((value: OrderBook) => void)[]> = new Map();
    private orderBookRejecters: Map<string, ((reason: unknown) => void)[]> = new Map();
    private tradeResolvers: Map<string, ((value: Trade[]) => void)[]> = new Map();
    private tradeRejecters: Map<string, ((reason: unknown) => void)[]> = new Map();
    private seenTradeIds: Map<string, Set<string>> = new Map();
    private orderBookFailureCount: Map<string, number> = new Map();
    private tradeFailureCount: Map<string, number> = new Map();
    private closed = false;

    constructor(fetchOrderBook: FetchOrderBookFn, fetchTrades: FetchTradesFn, pollInterval?: number) {
        this.fetchOrderBook = fetchOrderBook;
        this.fetchTrades = fetchTrades;
        this.pollInterval = pollInterval || DEFAULT_POLL_INTERVAL;
    }

    async watchOrderBook(outcomeId: string): Promise<OrderBook> {
        if (this.closed) throw new Error('Hunch watch connection is closed');
        return new Promise<OrderBook>((resolve, reject) => {
            if (!this.orderBookResolvers.has(outcomeId)) {
                this.orderBookResolvers.set(outcomeId, []);
                this.orderBookRejecters.set(outcomeId, []);
            }
            this.orderBookResolvers.get(outcomeId)!.push(resolve);
            this.orderBookRejecters.get(outcomeId)!.push(reject);
            if (!this.orderBookTimers.has(outcomeId)) this.startOrderBookPolling(outcomeId);
        });
    }

    async watchTrades(outcomeId: string): Promise<Trade[]> {
        if (this.closed) throw new Error('Hunch watch connection is closed');
        return new Promise<Trade[]>((resolve, reject) => {
            if (!this.tradeResolvers.has(outcomeId)) {
                this.tradeResolvers.set(outcomeId, []);
                this.tradeRejecters.set(outcomeId, []);
            }
            this.tradeResolvers.get(outcomeId)!.push(resolve);
            this.tradeRejecters.get(outcomeId)!.push(reject);
            if (!this.tradeTimers.has(outcomeId)) this.startTradePolling(outcomeId);
        });
    }

    async close(): Promise<void> {
        this.closed = true;
        for (const timer of this.orderBookTimers.values()) clearInterval(timer);
        for (const timer of this.tradeTimers.values()) clearInterval(timer);
        this.orderBookTimers.clear();
        this.tradeTimers.clear();
        this.orderBookResolvers.clear();
        this.orderBookRejecters.clear();
        this.tradeResolvers.clear();
        this.tradeRejecters.clear();
        this.seenTradeIds.clear();
    }

    private startOrderBookPolling(id: string): void {
        const poll = async () => {
            try {
                const book = await this.fetchOrderBook(id);
                this.orderBookFailureCount.set(id, 0);
                const resolvers = this.orderBookResolvers.get(id) || [];
                this.orderBookResolvers.set(id, []);
                this.orderBookRejecters.set(id, []);
                for (const resolve of resolvers) resolve(book);
            } catch (error: unknown) {
                this.handleFailure(id, error, 'watchOrderBook', this.orderBookFailureCount, this.orderBookTimers, this.orderBookResolvers, this.orderBookRejecters);
            }
        };
        poll();
        this.orderBookTimers.set(id, setInterval(poll, this.pollInterval));
    }

    private startTradePolling(id: string): void {
        const poll = async () => {
            try {
                const trades = await this.fetchTrades(id, 50);
                let seen = this.seenTradeIds.get(id);
                if (!seen) {
                    seen = new Set<string>();
                    this.seenTradeIds.set(id, seen);
                }
                const fresh = trades.filter((t) => !seen!.has(t.id));
                for (const t of fresh) seen.add(t.id);

                this.tradeFailureCount.set(id, 0);
                const resolvers = this.tradeResolvers.get(id) || [];
                this.tradeResolvers.set(id, []);
                this.tradeRejecters.set(id, []);
                for (const resolve of resolvers) resolve(fresh);
            } catch (error: unknown) {
                this.handleFailure(id, error, 'watchTrades', this.tradeFailureCount, this.tradeTimers, this.tradeResolvers, this.tradeRejecters);
            }
        };
        poll();
        this.tradeTimers.set(id, setInterval(poll, this.pollInterval));
    }

    private handleFailure(
        id: string,
        error: unknown,
        label: string,
        failures: Map<string, number>,
        timers: Map<string, ReturnType<typeof setInterval>>,
        resolvers: Map<string, ((value: never) => void)[]>,
        rejecters: Map<string, ((reason: unknown) => void)[]>,
    ): void {
        const count = (failures.get(id) || 0) + 1;
        failures.set(id, count);
        logger.warn(`Hunch ${label} poll failed for outcomeId=${id} (consecutive failures: ${count})`, {
            error: String(error),
        });
        if (count >= MAX_CONSECUTIVE_FAILURES) {
            const timer = timers.get(id);
            if (timer) clearInterval(timer);
            timers.delete(id);
            failures.delete(id);
            const rej = rejecters.get(id) || [];
            resolvers.set(id, []);
            rejecters.set(id, []);
            for (const reject of rej) reject(error);
        }
    }
}
