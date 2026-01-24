import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { OrderBook } from '../types';
import { OrderBookState } from './OrderBookState';

export enum WebSocketState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    ERROR = 'error'
}

export interface WebSocketConfig {
    url: string;
    headers?: Record<string, string>;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    pingInterval?: number;
    pingTimeout?: number;
}

const DEFAULT_HEADERS = {};

const DEFAULT_RECONNECT_INTERVAL = 1000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = Infinity;
const DEFAULT_PING_INTERVAL = 30000;
const DEFAULT_PING_TIMEOUT = 10000;
const MAX_RECONNECT_DELAY = 30000;
const MAX_UPDATE_BUFFER_SIZE = 100;
const CONNECTION_TIMEOUT = 30000;

export abstract class BaseWebSocketManager extends EventEmitter {
    protected ws: WebSocket | null = null;
    protected state: WebSocketState = WebSocketState.DISCONNECTED;
    protected config: Required<WebSocketConfig>;
    protected reconnectAttempts = 0;
    protected reconnectTimer?: NodeJS.Timeout;
    protected pingTimer?: NodeJS.Timeout;
    protected messageQueue: string[] = [];
    protected readonly orderbookStates = new Map<string, OrderBookState>();
    protected readonly subscriptions = new Set<string>();
    protected readonly messageHandlers = new Map<string, Array<(orderbook: OrderBook) => void>>();
    protected readonly snapshotApplied = new Set<string>();

    constructor(config: WebSocketConfig) {
        super();
        this.config = {
            reconnectInterval: DEFAULT_RECONNECT_INTERVAL,
            maxReconnectAttempts: DEFAULT_MAX_RECONNECT_ATTEMPTS,
            pingInterval: DEFAULT_PING_INTERVAL,
            pingTimeout: DEFAULT_PING_TIMEOUT,
            headers: DEFAULT_HEADERS,
            ...config
        };
    }

    async connect(): Promise<void> {
        if (this.state === WebSocketState.CONNECTED || this.state === WebSocketState.CONNECTING) {
            return;
        }

        this.setState(WebSocketState.CONNECTING);

        const connectPromise = new Promise<void>((resolve, reject) => {
            try {
                const options: WebSocket.ClientOptions = {
                    headers: this.config.headers
                };
                this.ws = new WebSocket(this.config.url, options);

                this.ws.on('open', () => {
                    this.setState(WebSocketState.CONNECTED);
                    this.reconnectAttempts = 0;
                    this.startPingTimer();
                    this.flushMessageQueue();
                    this.onOpen();
                    resolve();
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    try {
                        const messageStr = data.toString();
                        this.onMessage(messageStr);
                    } catch (error) {
                        if (error instanceof Error && !error.message.includes('Failed to parse message')) {
                            this.emit('error', error);
                        }
                    }
                });

                this.ws.on('error', (error) => {
                    this.emit('error', error);
                    if (this.state === WebSocketState.CONNECTING) {
                        reject(error);
                    }
                });

                this.ws.on('close', (code, reason) => {
                    this.stopPingTimer();
                    this.onClose(code, reason.toString());
                    this.handleReconnect();
                });

                this.ws.on('pong', () => {
                });

            } catch (error) {
                this.setState(WebSocketState.ERROR);
                reject(error);
            }
        });

        const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('WebSocket connection timeout')), CONNECTION_TIMEOUT);
        });

        return Promise.race([connectPromise, timeoutPromise]);
    }

    disconnect(): void {
        this.clearReconnectTimer();
        this.stopPingTimer();

        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }

        this.setState(WebSocketState.DISCONNECTED);
    }

    send(message: string): void {
        if (this.isConnected() && this.ws) {
            this.ws.send(message);
        } else {
            this.messageQueue.push(message);
        }
    }

    getState(): WebSocketState {
        return this.state;
    }

    isConnected(): boolean {
        return this.state === WebSocketState.CONNECTED && 
               this.ws !== null && 
               this.ws.readyState === WebSocket.OPEN;
    }

    protected onOpen(): void {
        this.snapshotApplied.clear();

        if (this.subscriptions.size > 0) {
            this.subscribe(Array.from(this.subscriptions));
            this.emit('reconnected', Array.from(this.subscriptions));
        }
    }
    protected abstract onMessage(message: string): void;
    protected abstract onClose(code: number, reason: string): void;

    protected setState(newState: WebSocketState): void {
        if (this.state !== newState) {
            this.state = newState;
            this.emit('stateChange', newState);
        }
    }

    protected handleReconnect(): void {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            this.setState(WebSocketState.ERROR);
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        this.setState(WebSocketState.RECONNECTING);
        this.reconnectAttempts++;

        const delay = Math.min(
            this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
            MAX_RECONNECT_DELAY
        );

        this.reconnectTimer = setTimeout(() => {
            this.connect().catch((error) => {
                this.emit('reconnectError', error);
            });
        }, delay);
    }

    protected startPingTimer(): void {
        this.stopPingTimer();
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, this.config.pingInterval);
    }

    protected stopPingTimer(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = undefined;
        }
    }

    protected clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }

    protected flushMessageQueue(): void {
        while (this.messageQueue.length > 0 && this.isConnected() && this.ws) {
            const message = this.messageQueue.shift();
            if (message) {
                this.ws.send(message);
            }
        }
    }

    hasSubscription(id: string): boolean {
        return this.subscriptions.has(id);
    }

    async *watchOrderBook(id: string): AsyncGenerator<OrderBook> {
        if (!this.orderbookStates.has(id)) {
            this.orderbookStates.set(id, new OrderBookState());
        }

        const updateBuffer: OrderBook[] = [];
        const waiters: Array<{ resolve: (value: OrderBook) => void; reject: (error: Error) => void }> = [];
        let isActive = true;
        let error: Error | null = null;

        const errorListener = (err: Error) => {
            error = err;
            while (waiters.length > 0) {
                waiters.shift()!.reject(err);
            }
        };
        this.on('error', errorListener);

        const handler = (orderbook: OrderBook) => {
            if (!isActive) return;

            if (waiters.length > 0) {
                waiters.shift()!.resolve(orderbook);
            } else {
                if (updateBuffer.length >= MAX_UPDATE_BUFFER_SIZE) {
                    updateBuffer.shift();
                }
                updateBuffer.push(orderbook);
            }
        };

        if (!this.messageHandlers.has(id)) {
            this.messageHandlers.set(id, []);
        }
        this.messageHandlers.get(id)!.push(handler);

        if (!this.isConnected()) {
            try {
                await this.connect();
            } catch (err) {
                isActive = false;
                const handlers = this.messageHandlers.get(id);
                if (handlers) {
                    const index = handlers.indexOf(handler);
                    if (index > -1) handlers.splice(index, 1);
                    if (handlers.length === 0) {
                        this.messageHandlers.delete(id);
                    }
                }
                throw err;
            }
        }

        if (!this.subscriptions.has(id)) {
            this.subscribe(id);
        }

        try {
            while (isActive) {
                if (updateBuffer.length > 0) {
                    yield updateBuffer.shift()!;
                    continue;
                }

                if (error) {
                    throw error;
                }

                const orderbook = await new Promise<OrderBook>((resolve, reject) => {
                    waiters.push({ resolve, reject });
                });

                yield orderbook;
            }
        } catch (err) {
            while (waiters.length > 0) {
                waiters.shift()!.reject(err instanceof Error ? err : new Error(String(err)));
            }
            throw err;
        } finally {
            this.removeListener('error', errorListener);
            isActive = false;
            
            const handlers = this.messageHandlers.get(id);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) handlers.splice(index, 1);
                if (handlers.length === 0) {
                    this.messageHandlers.delete(id);
                    this.unsubscribe(id);
                    this.subscriptions.delete(id);
                    this.orderbookStates.delete(id);
                    this.snapshotApplied.delete(id);
                }
            }
        }
    }

    cleanup(): void {
        this.messageHandlers.clear();
        this.subscriptions.clear();
        this.orderbookStates.clear();
        this.disconnect();
    }

    protected abstract subscribe(ids: string | string[]): void;
    protected abstract unsubscribe(id: string): void;
}
