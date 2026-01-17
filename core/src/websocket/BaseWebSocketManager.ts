import WebSocket from 'ws';
import { EventEmitter } from 'events';

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

export abstract class BaseWebSocketManager extends EventEmitter {
    protected ws: WebSocket | null = null;
    protected state: WebSocketState = WebSocketState.DISCONNECTED;
    protected config: Required<WebSocketConfig>;
    protected reconnectAttempts = 0;
    protected reconnectTimer?: NodeJS.Timeout;
    protected pingTimer?: NodeJS.Timeout;
    protected messageQueue: string[] = [];

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

        return new Promise((resolve, reject) => {
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
                        this.onMessage(data.toString());
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
                    // Acknowledged
                });

            } catch (error) {
                this.setState(WebSocketState.ERROR);
                reject(error);
            }
        });
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

    protected abstract onOpen(): void;
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
}
