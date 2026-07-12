/**
 * Polymarket US WebSocket wrapper.
 *
 * Provides CCXT Pro-style `watchOrderBook()` and `watchTrades()` on top of
 * the `polymarket-us` SDK's `MarketsWebSocket` class. Each call awaits the
 * next matching event for the requested market slug (the last segment of a
 * PMXT outcomeId is stripped before subscribing).
 *
 * Notes:
 *   - The SDK's WebSocket factory requires `keyId` + `secretKey` even for
 *     the public `markets()` socket, so callers must instantiate the exchange
 *     with credentials before calling any watch method.
 *   - Order book and trade prices are reported as LONG-SIDE prices, matching
 *     the convention used by `normalizeOrderBook` and `normalizeOrder`.
 */

import type {
    PolymarketUS as PolymarketUSClient,
    MarketsWebSocket,
    MarketData,
    Trade as SdkTrade,
    MarketBook,
} from 'polymarket-us';
import { OrderBook, QueuedPromise, Trade } from '../../types';
import { logger } from '../../utils/logger';
import { DEFAULT_WATCH_TIMEOUT_MS, withWatchTimeout } from '../../utils/watch-timeout';
import { fromAmount } from './price';
import { PolymarketUSNormalizer } from './normalizer';

export interface PolymarketUSWebSocketConfig {
    /** Timeout in ms for watch methods to receive data (default: 30000). 0 = no timeout. */
    watchTimeoutMs?: number;
}

function sideFromOrderSide(raw: string | undefined): 'buy' | 'sell' | 'unknown' {
    if (raw === 'ORDER_SIDE_BUY') return 'buy';
    if (raw === 'ORDER_SIDE_SELL') return 'sell';
    return 'unknown';
}

function parseTradeTimeMs(value: string | undefined): number {
    if (!value) return Date.now();
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : Date.now();
}

/**
 * Strip a trailing `:long` or `:short` from a PMXT identifier to recover
 * the bare Polymarket US market slug.
 */
function slugFromId(id: string): string {
    if (id.endsWith(':long')) return id.slice(0, -':long'.length);
    if (id.endsWith(':short')) return id.slice(0, -':short'.length);
    return id;
}

export class PolymarketUSWebSocket {
    private readonly client: PolymarketUSClient;
    private readonly normalizer: PolymarketUSNormalizer;
    private readonly config: PolymarketUSWebSocketConfig;
    private socket: MarketsWebSocket | null = null;
    private initializationPromise?: Promise<void>;
    private readonly bookSubscriptions = new Set<string>();
    private readonly tradeSubscriptions = new Set<string>();
    private readonly orderBookResolvers = new Map<string, QueuedPromise<OrderBook>[]>();
    private readonly tradeResolvers = new Map<string, QueuedPromise<Trade[]>[]>();

    constructor(client: PolymarketUSClient, normalizer: PolymarketUSNormalizer, config: PolymarketUSWebSocketConfig = {}) {
        this.client = client;
        this.normalizer = normalizer;
        this.config = config;
    }

    async watchOrderBook(outcomeId: string): Promise<OrderBook> {
        const slug = slugFromId(outcomeId);
        await this.ensureInitialized();

        if (!this.bookSubscriptions.has(slug)) {
            if (!this.socket) {
                throw new Error('[polymarket_us] Socket not available after connect');
            }
            this.bookSubscriptions.add(slug);
            this.socket.subscribeMarketData(`book:${slug}`, [slug]);
        }

        const dataPromise = new Promise<OrderBook>((resolve, reject) => {
            const queue = this.orderBookResolvers.get(slug) ?? [];
            queue.push({ resolve, reject });
            this.orderBookResolvers.set(slug, queue);
        });

        return withWatchTimeout(
            dataPromise,
            this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
            `watchOrderBook('${outcomeId}')`,
        );
    }

    async watchTrades(outcomeId: string): Promise<Trade[]> {
        const slug = slugFromId(outcomeId);
        await this.ensureInitialized();

        if (!this.tradeSubscriptions.has(slug)) {
            if (!this.socket) {
                throw new Error('[polymarket_us] Socket not available after connect');
            }
            this.tradeSubscriptions.add(slug);
            this.socket.subscribeTrades(`trade:${slug}`, [slug]);
        }

        const dataPromise = new Promise<Trade[]>((resolve, reject) => {
            const queue = this.tradeResolvers.get(slug) ?? [];
            queue.push({ resolve, reject });
            this.tradeResolvers.set(slug, queue);
        });

        return withWatchTimeout(
            dataPromise,
            this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
            `watchTrades('${outcomeId}')`,
        );
    }

    async close(): Promise<void> {
        if (this.socket) {
            try {
                this.socket.close();
            } catch (error) {
                logger.debug('[polymarket_us] error during socket close', { error: String(error) });
            }
            this.socket = null;
        }
        this.bookSubscriptions.clear();
        this.tradeSubscriptions.clear();
        this.rejectAllPending(new Error('PolymarketUS WebSocket closed'));
        this.initializationPromise = undefined;
    }

    private async ensureInitialized(): Promise<void> {
        if (this.initializationPromise) return this.initializationPromise;

        this.initializationPromise = (async () => {
            const socket = this.client.ws.markets();
            socket.on('marketData', (msg: MarketData) => this.handleMarketData(msg));
            socket.on('trade', (msg: SdkTrade) => this.handleTrade(msg));
            socket.on('error', (err: Error) => this.handleError(err));
            socket.on('close', () => this.handleClose());
            // Wrap connection in a timeout with proper garbage collection
            const CONNECTION_TIMEOUT_MS = 15000; // 15s is standard for trading API handshakes
            let timeoutHandle: NodeJS.Timeout;

            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(`PolymarketUS WebSocket connection timed out after ${CONNECTION_TIMEOUT_MS}ms`));
                }, CONNECTION_TIMEOUT_MS);
            });

            try {
                await Promise.race([
                    socket.connect(),
                    timeoutPromise
                ]);
            } finally {
                clearTimeout(timeoutHandle!); // Always clear the timer so the event loop can breathe
            }
            this.socket = socket;
        })();

        try {
            await this.initializationPromise;
        } catch (err) {
            this.initializationPromise = undefined;
            throw err;
        }
    }

    private handleMarketData(msg: MarketData): void {
        const payload = msg.marketData;
        if (!payload) return;
        const slug = payload.marketSlug;

        // The WS MarketData payload shape is structurally compatible with
        // the REST MarketBook shape used by normalizeOrderBook.
        const book = this.normalizer.normalizeOrderBook(
            payload as unknown as MarketBook,
            slug,
        );
        this.resolveOrderBook(slug, book);
    }

    private handleTrade(msg: SdkTrade): void {
        const payload = msg.trade;
        if (!payload) return;
        const slug = payload.marketSlug;
        const timestamp = parseTradeTimeMs(payload.tradeTime);
        const priceValue = payload.price?.value ?? '0';

        const trade: Trade = {
            id: `${slug}-${timestamp}-${priceValue}`,
            timestamp,
            price: fromAmount(payload.price),
            amount: fromAmount(payload.quantity),
            side: sideFromOrderSide(payload.taker?.side),
        };

        const queue = this.tradeResolvers.get(slug);
        if (queue && queue.length > 0) {
            for (const { resolve } of queue) resolve([trade]);
            this.tradeResolvers.set(slug, []);
        }
    }

    private handleError(err: Error): void {
        // Surface the error to any waiting callers rather than losing it.
        this.rejectAllPending(err);
    }

    private handleClose(): void {
        this.rejectAllPending(new Error('PolymarketUS WebSocket closed'));
        this.socket = null;
        this.initializationPromise = undefined;
        this.bookSubscriptions.clear();
        this.tradeSubscriptions.clear();
    }

    private resolveOrderBook(slug: string, book: OrderBook): void {
        const queue = this.orderBookResolvers.get(slug);
        if (queue && queue.length > 0) {
            for (const { resolve } of queue) resolve(book);
            this.orderBookResolvers.set(slug, []);
        }
    }

    private rejectAllPending(err: Error): void {
        for (const queue of this.orderBookResolvers.values()) {
            for (const { reject } of queue) reject(err);
        }
        this.orderBookResolvers.clear();
        for (const queue of this.tradeResolvers.values()) {
            for (const { reject } of queue) reject(err);
        }
        this.tradeResolvers.clear();
    }
}
