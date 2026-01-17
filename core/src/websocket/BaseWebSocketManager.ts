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
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    pingInterval?: number;
    pingTimeout?: number;
}

/**
 * Base WebSocket manager with automatic reconnection and heartbeat support.
 */
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
            reconnectInterval: 1000,
            maxReconnectAttempts: Infinity,
            pingInterval: 30000, // 30 seconds
            pingTimeout: 10000, // 10 seconds
            ...config
        };
    }

    /**
     * Connect to the WebSocket server.
     */
    async connect(): Promise<void> {
        if (this.state === WebSocketState.CONNECTED || this.state === WebSocketState.CONNECTING) {
            return;
        }

        this.setState(WebSocketState.CONNECTING);

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.config.url);

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
                        const message = data.toString();
                        this.onMessage(message);
                    } catch (error) {
                        this.emit('error', error);
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
                    // Server responded to ping
                });

            } catch (error) {
                this.setState(WebSocketState.ERROR);
                reject(error);
            }
        });
    }

    /**
     * Disconnect from the WebSocket server.
     */
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

    /**
     * Send a message to the WebSocket server.
     * If not connected, queue the message.
     */
    send(message: string): void {
        if (this.state === WebSocketState.CONNECTED && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(message);
        } else {
            this.messageQueue.push(message);
        }
    }

    /**
     * Get the current connection state.
     */
    getState(): WebSocketState {
        return this.state;
    }

    /**
     * Check if the WebSocket is connected.
     */
    isConnected(): boolean {
        return this.state === WebSocketState.CONNECTED && 
               this.ws !== null && 
               this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Abstract method called when connection opens.
     */
    protected abstract onOpen(): void;

    /**
     * Abstract method called when a message is received.
     */
    protected abstract onMessage(message: string): void;

    /**
     * Abstract method called when connection closes.
     */
    protected abstract onClose(code: number, reason: string): void;

    /**
     * Set the connection state and emit event.
     */
    protected setState(newState: WebSocketState): void {
        if (this.state !== newState) {
            this.state = newState;
            this.emit('stateChange', newState);
        }
    }

    /**
     * Handle reconnection logic with exponential backoff.
     */
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
            30000 // Max 30 seconds
        );

        this.reconnectTimer = setTimeout(() => {
            this.connect().catch((error) => {
                this.emit('reconnectError', error);
            });
        }, delay);
    }

    /**
     * Start ping timer to keep connection alive.
     */
    protected startPingTimer(): void {
        this.stopPingTimer();
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, this.config.pingInterval);
    }

    /**
     * Stop ping timer.
     */
    protected stopPingTimer(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = undefined;
        }
    }

    /**
     * Clear reconnect timer.
     */
    protected clearReconnectTimer(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }

    /**
     * Flush queued messages when connection is established.
     */
    protected flushMessageQueue(): void {
        while (this.messageQueue.length > 0 && this.isConnected()) {
            const message = this.messageQueue.shift();
            if (message) {
                this.ws!.send(message);
            }
        }
    }
}
