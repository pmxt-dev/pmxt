import WebSocket from 'ws';
import { OrderBook, Trade, OrderLevel } from '../../types';
import { KalshiAuth } from './auth';

interface QueuedPromise<T> {
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
}

export interface KalshiWebSocketConfig {
    /** WebSocket URL (default: wss://api.elections.kalshi.com/trade-api/ws/v2) */
    wsUrl?: string;
    /** Reconnection interval in milliseconds (default: 5000) */
    reconnectIntervalMs?: number;
}

/**
 * Kalshi WebSocket implementation for real-time order book and trade streaming.
 * Follows CCXT Pro-style async iterator pattern.
 */
export class KalshiWebSocket {
    private ws?: WebSocket;
    private auth: KalshiAuth;
    private config: KalshiWebSocketConfig;
    private orderBookResolvers = new Map<string, QueuedPromise<OrderBook>[]>();
    private tradeResolvers = new Map<string, QueuedPromise<Trade[]>[]>();
    private orderBooks = new Map<string, OrderBook>();
    private subscribedTickers = new Set<string>();
    private messageIdCounter = 1;
    private isConnecting = false;
    private isConnected = false;
    private reconnectTimer?: NodeJS.Timeout;

    constructor(auth: KalshiAuth, config: KalshiWebSocketConfig = {}) {
        this.auth = auth;
        this.config = {
            wsUrl: config.wsUrl || 'wss://api.elections.kalshi.com/trade-api/ws/v2',
            reconnectIntervalMs: config.reconnectIntervalMs || 5000
        };
    }

    private async connect(): Promise<void> {
        if (this.isConnected || this.isConnecting) {
            return;
        }

        this.isConnecting = true;

        return new Promise((resolve, reject) => {
            try {
                // Extract path from URL for signature
                const url = new URL(this.config.wsUrl!);
                const path = url.pathname;

                console.log(`Kalshi WS: Connecting to ${this.config.wsUrl} (using path ${path} for signature)`);

                // Get authentication headers
                const headers = this.auth.getHeaders('GET', path);

                this.ws = new WebSocket(this.config.wsUrl!, { headers });

                this.ws.on('open', () => {
                    this.isConnected = true;
                    this.isConnecting = false;
                    console.log('Kalshi WebSocket connected');

                    // Resubscribe to all tickers if reconnecting
                    if (this.subscribedTickers.size > 0) {
                        this.subscribeToOrderbook(Array.from(this.subscribedTickers));
                    }

                    resolve();
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleMessage(message);
                    } catch (error) {
                        console.error('Error parsing Kalshi WebSocket message:', error);
                    }
                });

                this.ws.on('error', (error: Error) => {
                    console.error('Kalshi WebSocket error:', error);
                    this.isConnecting = false;
                    reject(error);
                });

                this.ws.on('close', () => {
                    console.log('Kalshi WebSocket closed');
                    this.isConnected = false;
                    this.isConnecting = false;
                    this.scheduleReconnect();
                });

            } catch (error) {
                this.isConnecting = false;
                reject(error);
            }
        });
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectTimer = setTimeout(() => {
            console.log('Attempting to reconnect Kalshi WebSocket...');
            this.connect().catch(console.error);
        }, this.config.reconnectIntervalMs);
    }

    private subscribeToOrderbook(marketTickers: string[]) {
        if (!this.ws || !this.isConnected) {
            return;
        }

        const subscription = {
            id: this.messageIdCounter++,
            cmd: 'subscribe',
            params: {
                channels: ['orderbook_delta'],
                market_tickers: marketTickers
            }
        };

        this.ws.send(JSON.stringify(subscription));
    }

    private subscribeToTrades(marketTickers: string[]) {
        if (!this.ws || !this.isConnected) {
            return;
        }

        const subscription = {
            id: this.messageIdCounter++,
            cmd: 'subscribe',
            params: {
                channels: ['trade'],
                market_tickers: marketTickers
            }
        };

        this.ws.send(JSON.stringify(subscription));
    }

    private handleMessage(message: any) {
        const msgType = message.type;
        // Kalshi V2 uses 'data' field for payloads
        const data = message.data || message.msg;

        if (!data && msgType !== 'subscribed' && msgType !== 'pong') {
            return;
        }

        // Add message-level timestamp as a fallback for handlers
        if (data && typeof data === 'object' && !data.ts && !data.created_time) {
            data.message_ts = message.ts || message.time;
        }

        switch (msgType) {
            case 'orderbook_snapshot':
                this.handleOrderbookSnapshot(data);
                break;

            case 'orderbook_delta':
            case 'orderbook_update': // Some versions use update
                this.handleOrderbookDelta(data);
                break;

            case 'trade':
                this.handleTrade(data);
                break;

            case 'error':
                console.error('Kalshi WebSocket error:', message.msg || message.error || message.data);
                break;

            case 'subscribed':
                console.log('Kalshi subscription confirmed:', JSON.stringify(message));
                break;

            case 'pong':
                // Ignore keep-alive
                break;

            default:
                // Ignore unknown message types
                break;
        }
    }

    private handleOrderbookSnapshot(data: any) {
        const ticker = data.market_ticker;

        // Kalshi orderbook structure:
        // yes: [{ price: number (cents), quantity: number }, ...]
        // no: [{ price: number (cents), quantity: number }, ...]

        const bids: OrderLevel[] = (data.yes || []).map((level: any) => {
            const price = (level.price || level[0]) / 100;
            const size = (level.quantity !== undefined ? level.quantity : (level.size !== undefined ? level.size : level[1])) || 0;
            return { price, size };
        }).sort((a: OrderLevel, b: OrderLevel) => b.price - a.price);

        const asks: OrderLevel[] = (data.no || []).map((level: any) => {
            const price = (100 - (level.price || level[0])) / 100;
            const size = (level.quantity !== undefined ? level.quantity : (level.size !== undefined ? level.size : level[1])) || 0;
            return { price, size };
        }).sort((a: OrderLevel, b: OrderLevel) => a.price - b.price);

        const orderBook: OrderBook = {
            bids,
            asks,
            timestamp: Date.now()
        };

        this.orderBooks.set(ticker, orderBook);
        this.resolveOrderBook(ticker, orderBook);
    }

    private handleOrderbookDelta(data: any) {
        const ticker = data.market_ticker;
        const existing = this.orderBooks.get(ticker);

        if (!existing) {
            // No snapshot yet, skip delta
            return;
        }

        // Apply delta updates
        // Kalshi sends: { price: number, delta: number, side: 'yes' | 'no' }
        const price = (data.price) / 100;
        const delta = data.delta !== undefined ? data.delta : (data.quantity !== undefined ? data.quantity : 0);
        const side = data.side;

        if (side === 'yes') {
            this.applyDelta(existing.bids, price, delta, 'desc');
        } else {
            const yesPrice = (100 - data.price) / 100;
            this.applyDelta(existing.asks, yesPrice, delta, 'asc');
        }

        existing.timestamp = Date.now();
        this.resolveOrderBook(ticker, existing);
    }

    private applyDelta(levels: OrderLevel[], price: number, delta: number, sortOrder: 'asc' | 'desc') {
        const existingIndex = levels.findIndex(l => Math.abs(l.price - price) < 0.001);

        if (delta === 0) {
            // Remove level
            if (existingIndex !== -1) {
                levels.splice(existingIndex, 1);
            }
        } else {
            // Update or add level
            if (existingIndex !== -1) {
                levels[existingIndex].size += delta;
                if (levels[existingIndex].size <= 0) {
                    levels.splice(existingIndex, 1);
                }
            } else {
                levels.push({ price, size: delta });
                // Re-sort
                if (sortOrder === 'desc') {
                    levels.sort((a, b) => b.price - a.price);
                } else {
                    levels.sort((a, b) => a.price - b.price);
                }
            }
        }
    }

    private handleTrade(data: any) {
        const ticker = data.market_ticker;

        // Kalshi trade structure:
        // { trade_id, market_ticker, yes_price, no_price, count, created_time, taker_side }
        // The timestamp could be in created_time, created_at, or ts.
        let timestamp = Date.now();
        const rawTime = data.created_time || data.created_at || data.ts || data.time || data.message_ts;

        if (rawTime) {
            const parsed = new Date(rawTime).getTime();
            if (!isNaN(parsed)) {
                timestamp = parsed;
                // If the timestamp is too small, it might be in seconds
                if (timestamp < 10000000000) {
                    timestamp *= 1000;
                }
            } else if (typeof rawTime === 'number') {
                // If it's already a number but new Date() failed (maybe it's a large timestamp)
                timestamp = rawTime;
                if (timestamp < 10000000000) {
                    timestamp *= 1000;
                }
            }
        }

        const trade: Trade = {
            id: data.trade_id || `${timestamp}-${Math.random()}`,
            timestamp,
            price: (data.yes_price || data.price) ? (data.yes_price || data.price) / 100 : 0.5,
            amount: data.count || data.size || 0,
            side: data.taker_side === 'yes' || data.side === 'buy' ? 'buy' : data.taker_side === 'no' || data.side === 'sell' ? 'sell' : 'unknown'
        };

        const resolvers = this.tradeResolvers.get(ticker);
        if (resolvers && resolvers.length > 0) {
            resolvers.forEach(r => r.resolve([trade]));
            this.tradeResolvers.set(ticker, []);
        }
    }

    private resolveOrderBook(ticker: string, orderBook: OrderBook) {
        const resolvers = this.orderBookResolvers.get(ticker);
        if (resolvers && resolvers.length > 0) {
            resolvers.forEach(r => r.resolve(orderBook));
            this.orderBookResolvers.set(ticker, []);
        }
    }

    async watchOrderBook(ticker: string): Promise<OrderBook> {
        // Ensure connection
        if (!this.isConnected) {
            await this.connect();
        }

        // Subscribe if not already subscribed
        if (!this.subscribedTickers.has(ticker)) {
            this.subscribedTickers.add(ticker);
            this.subscribeToOrderbook([ticker]);
        }

        // Return a promise that resolves on the next orderbook update
        return new Promise<OrderBook>((resolve, reject) => {
            if (!this.orderBookResolvers.has(ticker)) {
                this.orderBookResolvers.set(ticker, []);
            }
            this.orderBookResolvers.get(ticker)!.push({ resolve, reject });
        });
    }

    async watchTrades(ticker: string): Promise<Trade[]> {
        // Ensure connection
        if (!this.isConnected) {
            await this.connect();
        }

        // Subscribe if not already subscribed
        if (!this.subscribedTickers.has(ticker)) {
            this.subscribedTickers.add(ticker);
            this.subscribeToTrades([ticker]);
        }

        // Return a promise that resolves on the next trade
        return new Promise<Trade[]>((resolve, reject) => {
            if (!this.tradeResolvers.has(ticker)) {
                this.tradeResolvers.set(ticker, []);
            }
            this.tradeResolvers.get(ticker)!.push({ resolve, reject });
        });
    }

    async close() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }

        this.isConnected = false;
        this.isConnecting = false;
    }
}
