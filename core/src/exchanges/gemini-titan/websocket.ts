import WebSocket from 'ws';
import { OrderBook, Trade, OrderLevel } from '../../types';
import { logger } from '../../utils/logger';
import { DEFAULT_WATCH_TIMEOUT_MS, withWatchTimeout } from '../../utils/watch-timeout';
import { GeminiAuth } from './auth';

interface QueuedPromise<T> {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
}

export interface GeminiWebSocketConfig {
    wsUrl: string;
    reconnectIntervalMs?: number;
    watchTimeoutMs?: number;
}

/**
 * Gemini Titan WebSocket for real-time order book and trade streaming.
 *
 * Subscribes to:
 *   - {symbol}@depth20  (L2 partial depth snapshots at 1s intervals)
 *   - {symbol}@trade    (executed trades)
 *
 * Auth headers are sent during the handshake if credentials are provided
 * (needed for account-scoped streams, optional for public data).
 */
export class GeminiWebSocket {
    private ws?: WebSocket;
    private readonly auth: GeminiAuth | undefined;
    private readonly config: GeminiWebSocketConfig;
    private readonly orderBookResolvers = new Map<string, QueuedPromise<OrderBook>[]>();
    private readonly tradeResolvers = new Map<string, QueuedPromise<Trade[]>[]>();
    private readonly orderBooks = new Map<string, OrderBook>();
    private readonly subscribedDepthSymbols = new Set<string>();
    private readonly subscribedTradeSymbols = new Set<string>();
    private messageIdCounter = 1;
    private isConnecting = false;
    private isConnected = false;
    private reconnectTimer?: NodeJS.Timeout;
    private connectionPromise?: Promise<void>;
    private isTerminated = false;

    constructor(auth: GeminiAuth | undefined, config: GeminiWebSocketConfig) {
        this.auth = auth;
        this.config = config;
    }

    // -------------------------------------------------------------------------
    // Connection
    // -------------------------------------------------------------------------

    private async connect(): Promise<void> {
        if (this.isConnected || this.isTerminated) return;
        if (this.connectionPromise) return this.connectionPromise;

        this.isConnecting = true;

        this.connectionPromise = new Promise((resolve, reject) => {
            try {
                const headers: Record<string, string> = this.auth
                    ? this.auth.buildWsHeaders()
                    : {};

                this.ws = new WebSocket(this.config.wsUrl, {
                    headers,
                    handshakeTimeout: 30_000,
                });

                this.ws.on('open', () => {
                    this.isConnected = true;
                    this.isConnecting = false;
                    this.connectionPromise = undefined;

                    // Resubscribe on reconnect
                    const allStreams: string[] = [];
                    for (const sym of this.subscribedDepthSymbols) {
                        allStreams.push(`${sym}@depth20`);
                    }
                    for (const sym of this.subscribedTradeSymbols) {
                        allStreams.push(`${sym}@trade`);
                    }
                    if (allStreams.length > 0) {
                        this.sendSubscribe(allStreams);
                    }

                    resolve();
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleMessage(message);
                    } catch (error) {
                        logger.warn('[gemini-titan] failed to parse or handle message', {
                            error: error instanceof Error ? error.message : String(error),
                        });
                    }
                });

                this.ws.on('error', (error: Error) => {
                    this.isConnecting = false;
                    this.connectionPromise = undefined;
                    reject(error);
                });

                this.ws.on('close', () => {
                    this.isConnected = false;
                    this.isConnecting = false;
                    this.connectionPromise = undefined;
                    if (!this.isTerminated) {
                        this.scheduleReconnect();
                    }
                });
            } catch (error) {
                this.isConnecting = false;
                this.connectionPromise = undefined;
                reject(error);
            }
        });

        return this.connectionPromise;
    }

    private scheduleReconnect(): void {
        if (this.isTerminated) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

        this.reconnectTimer = setTimeout(() => {
            this.connect().catch((err: unknown) => {
                logger.warn(`[gemini-titan] reconnect failed: ${err instanceof Error ? err.message : String(err)}`);
            });
        }, this.config.reconnectIntervalMs ?? 5000);
    }

    // -------------------------------------------------------------------------
    // Subscription
    // -------------------------------------------------------------------------

    private sendSubscribe(streams: string[]): void {
        if (!this.ws || !this.isConnected) return;
        this.ws.send(JSON.stringify({
            id: String(this.messageIdCounter++),
            method: 'subscribe',
            params: streams,
        }));
    }

    // -------------------------------------------------------------------------
    // Message handling
    // -------------------------------------------------------------------------

    private handleMessage(message: any): void {
        // Gemini sends flat objects, NOT wrapped in { stream, data }.
        // Depth snapshots: { lastUpdateId, symbol, bids, asks }
        // Depth deltas:    { e, E, s, U, u, b, a }
        // Trades:          { E, s, t, p, q, m }
        // Confirmations:   { id, status: 200 }

        if (message.lastUpdateId !== undefined && message.bids) {
            // Depth snapshot — symbol comes back lowercase
            this.handleDepthSnapshot(message);
        } else if (message.e === 'depthUpdate' || (message.U !== undefined && message.b)) {
            this.handleDepthUpdate(message);
        } else if (message.t !== undefined && message.p !== undefined && message.q !== undefined) {
            this.handleTrade(message);
        }
        // Subscription confirmations ({ id, status }) are ignored
    }

    private handleDepthSnapshot(data: any): void {
        // symbol comes back lowercase from the API, but we subscribed with
        // uppercase. Normalize to uppercase for resolver lookup.
        const symbol = (data.symbol as string).toUpperCase();

        const bids: OrderLevel[] = (data.bids ?? []).map((level: [string, string]) => ({
            price: parseFloat(level[0]),
            size: parseFloat(level[1]),
        }));

        const asks: OrderLevel[] = (data.asks ?? []).map((level: [string, string]) => ({
            price: parseFloat(level[0]),
            size: parseFloat(level[1]),
        }));

        bids.sort((a, b) => b.price - a.price);
        asks.sort((a, b) => a.price - b.price);

        const orderBook: OrderBook = { bids, asks, timestamp: Date.now() };
        this.orderBooks.set(symbol, orderBook);
        this.resolveOrderBook(symbol, orderBook);
    }

    private handleDepthUpdate(data: any): void {
        const symbol = (data.s as string).toUpperCase();
        const existing = this.orderBooks.get(symbol);
        if (!existing) return; // No snapshot yet, discard delta

        for (const [priceStr, sizeStr] of (data.b ?? [])) {
            this.applyDelta(existing.bids, parseFloat(priceStr), parseFloat(sizeStr), 'desc');
        }

        for (const [priceStr, sizeStr] of (data.a ?? [])) {
            this.applyDelta(existing.asks, parseFloat(priceStr), parseFloat(sizeStr), 'asc');
        }

        existing.timestamp = Date.now();
        this.resolveOrderBook(symbol, existing);
    }

    private applyDelta(
        levels: OrderLevel[],
        price: number,
        size: number,
        sortOrder: 'asc' | 'desc',
    ): void {
        const idx = levels.findIndex(l => l.price === price);

        if (size === 0) {
            if (idx !== -1) levels.splice(idx, 1);
        } else if (idx !== -1) {
            levels[idx] = { price, size };
        } else {
            levels.push({ price, size });
            if (sortOrder === 'desc') {
                levels.sort((a, b) => b.price - a.price);
            } else {
                levels.sort((a, b) => a.price - b.price);
            }
        }
    }

    private handleTrade(data: any): void {
        const symbol = (data.s as string).toUpperCase();

        const trade: Trade = {
            id: String(data.t ?? Date.now()),
            timestamp: data.E ? Math.floor(data.E / 1_000_000) : Date.now(), // E is nanoseconds
            price: parseFloat(data.p),
            amount: parseFloat(data.q),
            side: data.m ? 'sell' : 'buy', // m = true means buyer is maker (taker sold)
        };

        const resolvers = this.tradeResolvers.get(symbol);
        if (resolvers && resolvers.length > 0) {
            resolvers.forEach(r => r.resolve([trade]));
            this.tradeResolvers.set(symbol, []);
        }
    }

    private resolveOrderBook(symbol: string, orderBook: OrderBook): void {
        const resolvers = this.orderBookResolvers.get(symbol);
        if (resolvers && resolvers.length > 0) {
            resolvers.forEach(r => r.resolve(orderBook));
            this.orderBookResolvers.set(symbol, []);
        }
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    async watchOrderBook(symbol: string): Promise<OrderBook> {
        if (this.isTerminated) {
            throw new Error(`WebSocket terminated, cannot watch ${symbol}`);
        }

        this.subscribedDepthSymbols.add(symbol);

        if (!this.isConnected) {
            this.connect().catch((err: unknown) => {
                logger.warn(`[gemini-titan] connect failed during watchOrderBook('${symbol}')`, {
                    error: err instanceof Error ? err.message : String(err),
                });
                if (!this.isTerminated) {
                    this.scheduleReconnect();
                }
            });
        } else {
            this.sendSubscribe([`${symbol}@depth20`]);
        }

        const dataPromise = new Promise<OrderBook>((resolve, reject) => {
            if (!this.orderBookResolvers.has(symbol)) {
                this.orderBookResolvers.set(symbol, []);
            }
            const resolvers = this.orderBookResolvers.get(symbol);
            if (!resolvers) {
                reject(new Error(`[gemini-titan] resolver queue missing for ${symbol}`));
                return;
            }
            resolvers.push({ resolve, reject });
        });

        return withWatchTimeout(
            dataPromise,
            this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
            `watchOrderBook('${symbol}')`,
        );
    }

    async watchTrades(symbol: string): Promise<Trade[]> {
        if (this.isTerminated) {
            throw new Error(`WebSocket terminated, cannot watch trades for ${symbol}`);
        }

        this.subscribedTradeSymbols.add(symbol);

        if (!this.isConnected) {
            this.connect().catch((err: unknown) => {
                logger.warn(`[gemini-titan] connect failed during watchTrades('${symbol}')`, {
                    error: err instanceof Error ? err.message : String(err),
                });
                if (!this.isTerminated) {
                    this.scheduleReconnect();
                }
            });
        } else {
            this.sendSubscribe([`${symbol}@trade`]);
        }

        const dataPromise = new Promise<Trade[]>((resolve, reject) => {
            if (!this.tradeResolvers.has(symbol)) {
                this.tradeResolvers.set(symbol, []);
            }
            const resolvers = this.tradeResolvers.get(symbol);
            if (!resolvers) {
                reject(new Error(`[gemini-titan] resolver queue missing for ${symbol}`));
                return;
            }
            resolvers.push({ resolve, reject });
        });

        return withWatchTimeout(
            dataPromise,
            this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
            `watchTrades('${symbol}')`,
        );
    }

    async close(): Promise<void> {
        this.isTerminated = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }

        for (const [symbol, resolvers] of this.orderBookResolvers) {
            resolvers.forEach(r => r.reject(new Error(`WebSocket closed for ${symbol}`)));
        }
        this.orderBookResolvers.clear();

        for (const [symbol, resolvers] of this.tradeResolvers) {
            resolvers.forEach(r => r.reject(new Error(`WebSocket closed for ${symbol}`)));
        }
        this.tradeResolvers.clear();

        if (this.ws) {
            const ws = this.ws;
            this.ws = undefined;

            if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
                return new Promise<void>((resolve) => {
                    ws.once('close', () => {
                        this.isConnected = false;
                        this.isConnecting = false;
                        resolve();
                    });
                    ws.close();
                });
            }
        }

        this.isConnected = false;
        this.isConnecting = false;
    }
}
