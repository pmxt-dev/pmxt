import type { createClobClient } from '@prob/clob';
import { OrderBook, OrderLevel } from '../../types';
import { DEFAULT_WATCH_TIMEOUT_MS, withWatchTimeout } from '../../utils/watch-timeout';
import { PROBABLE_CHAIN_ID } from './config';

interface QueuedPromise<T> {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
}

export interface ProbableWebSocketConfig {
    /** WebSocket URL (default: wss://ws.probable.markets/public/api/v1) */
    wsUrl?: string;
    /** Base URL for the CLOB client (default: https://api.probable.markets/public/api/v1) */
    baseUrl?: string;
    /** Chain ID (default: 56 for BSC mainnet) */
    chainId?: number;
    /** Timeout in ms for watch methods to receive data (default: 30000). 0 = no timeout. */
    watchTimeoutMs?: number;
}

/**
 * Probable WebSocket implementation for real-time order book streaming.
 * Uses the @prob/clob SDK's subscribePublicStream (no auth required).
 * Follows CCXT Pro-style async pattern with watchOrderBook().
 */
export class ProbableWebSocket {
    private client?: ReturnType<typeof createClobClient>;
    private config: ProbableWebSocketConfig;
    private orderBookResolvers = new Map<string, QueuedPromise<OrderBook>[]>();
    private orderBooks = new Map<string, OrderBook>();
    private subscriptions = new Map<string, { unsubscribe: () => void }>();

    constructor(config: ProbableWebSocketConfig = {}) {
        this.config = config;
    }

    private async ensureClient(): Promise<ReturnType<typeof createClobClient>> {
        if (this.client) return this.client;

        const chainId = this.config.chainId || parseInt(process.env.PROBABLE_CHAIN_ID || String(PROBABLE_CHAIN_ID), 10);
        const wsUrl = this.config.wsUrl || process.env.PROBABLE_WS_URL || 'wss://ws.probable.markets/public/api/v1';
        const baseUrl = this.config.baseUrl || process.env.PROBABLE_BASE_URL || 'https://api.probable.markets/public/api/v1';

        // Dynamically import @prob/clob using eval to bypass TS compilation to require()
        // which forces native import() usage, resolving ESM/CJS issues
        const { createClobClient: createClient } = await (eval('import("@prob/clob")') as Promise<typeof import('@prob/clob')>);

        // For public streams, always provide baseUrl, wsUrl, and chainId
        this.client = createClient({
            baseUrl,
            wsUrl,
            chainId,
        });

        return this.client;
    }

    async watchOrderBook(tokenId: string): Promise<OrderBook> {
        const client = await this.ensureClient();

        // Subscribe if not already subscribed
        if (!this.subscriptions.has(tokenId)) {
            const sub = client.subscribePublicStream(
                [`book:${tokenId}`],
                (data: any) => {
                    this.handleOrderBookUpdate(tokenId, data);
                }
            );
            this.subscriptions.set(tokenId, sub);
        }

        // Return a promise that resolves on the next orderbook update
        let resolver: QueuedPromise<OrderBook>;
        const dataPromise = new Promise<OrderBook>((resolve, reject) => {
            resolver = { resolve, reject };
            this.getOrderBookQueue(tokenId).push(resolver);
        });

        return withWatchTimeout(
            dataPromise,
            this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
            `watchOrderBook('${tokenId}')`,
        ).finally(() => {
            const queue = this.orderBookResolvers.get(tokenId);
            if (queue) {
                const idx = queue.indexOf(resolver!);
                if (idx !== -1) {
                    queue.splice(idx, 1);
                }
            }
        });
    }

    private handleOrderBookUpdate(tokenId: string, data: any) {
        const bids: OrderLevel[] = (data.bids || []).map((b: any) => ({
            price: parseFloat(b.price),
            size: parseFloat(b.size),
        })).sort((a: OrderLevel, b: OrderLevel) => b.price - a.price);

        const asks: OrderLevel[] = (data.asks || []).map((a: any) => ({
            price: parseFloat(a.price),
            size: parseFloat(a.size),
        })).sort((a: OrderLevel, b: OrderLevel) => a.price - b.price);

        let timestamp = Date.now();
        if (data.timestamp) {
            const parsed = typeof data.timestamp === 'number' ? data.timestamp : new Date(data.timestamp).getTime();
            if (!isNaN(parsed)) {
                timestamp = parsed;
                if (timestamp < 10000000000) {
                    timestamp *= 1000;
                }
            }
        }

        const orderBook: OrderBook = { bids, asks, timestamp };

        this.orderBooks.set(tokenId, orderBook);
        this.resolveOrderBook(tokenId, orderBook);
    }

    private resolveOrderBook(tokenId: string, orderBook: OrderBook) {
        const resolvers = this.orderBookResolvers.get(tokenId);
        if (resolvers && resolvers.length > 0) {
            resolvers.forEach(r => r.resolve(orderBook));
            this.orderBookResolvers.set(tokenId, []);
        }
    }

    private getOrderBookQueue(tokenId: string): QueuedPromise<OrderBook>[] {
        const resolvers = this.orderBookResolvers.get(tokenId);
        if (resolvers) {
            return resolvers;
        }

        const queue: QueuedPromise<OrderBook>[] = [];
        this.orderBookResolvers.set(tokenId, queue);
        return queue;
    }

    async close() {
        // Unsubscribe from all streams
        for (const [tokenId, sub] of this.subscriptions) {
            try {
                sub.unsubscribe();
            } catch {
                // Ignore cleanup errors
            }
        }
        this.subscriptions.clear();

        // Reject all pending resolvers
        this.orderBookResolvers.forEach((resolvers, tokenId) => {
            resolvers.forEach(r => r.reject(new Error(`WebSocket closed for ${tokenId}`)));
        });
        this.orderBookResolvers.clear();
        this.orderBooks.clear();
        this.client = undefined;
    }
}
