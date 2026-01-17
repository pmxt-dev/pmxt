import { BaseWebSocketManager, WebSocketState } from '../../websocket/BaseWebSocketManager';
import { OrderBook, OrderLevel } from '../../types';
import { OrderBookState } from '../../websocket/OrderBookState';

const POLYMARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

interface PolymarketBookMessage {
    type: 'book';
    asset_id: string;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    timestamp?: string;
}

interface PolymarketPriceChangeMessage {
    type: 'price_change';
    asset_id: string;
    price: string;
}

interface PolymarketTradeMessage {
    type: 'last_trade_price';
    asset_id: string;
    price: string;
    side: 'buy' | 'sell';
}

type PolymarketMessage = PolymarketBookMessage | PolymarketPriceChangeMessage | PolymarketTradeMessage;

/**
 * WebSocket manager for Polymarket CLOB orderbook streaming.
 */
export class PolymarketWebSocketManager extends BaseWebSocketManager {
    private orderbookStates: Map<string, OrderBookState> = new Map();
    private subscriptions: Set<string> = new Set();
    private messageHandlers: Map<string, (orderbook: OrderBook) => void> = new Map();

    constructor() {
        super({
            url: POLYMARKET_WS_URL,
            reconnectInterval: 1000,
            maxReconnectAttempts: Infinity,
            pingInterval: 30000,
            pingTimeout: 10000
        });
    }

    /**
     * Subscribe to orderbook updates for a specific token ID.
     * Returns an async generator that yields OrderBook updates.
     */
    async *watchOrderBook(tokenId: string): AsyncGenerator<OrderBook> {
        // Initialize orderbook state if not exists
        if (!this.orderbookStates.has(tokenId)) {
            this.orderbookStates.set(tokenId, new OrderBookState());
        }

        // Buffer queue for orderbook updates
        const updateBuffer: OrderBook[] = [];
        const waiters: Array<{ resolve: (value: OrderBook) => void; reject: (error: Error) => void }> = [];
        let isActive = true;
        let error: Error | null = null;

        // Register handler
        const handler = (orderbook: OrderBook) => {
            if (!isActive) return;

            if (waiters.length > 0) {
                // Resolve waiting promise
                const { resolve } = waiters.shift()!;
                resolve(orderbook);
            } else {
                // Buffer the update
                updateBuffer.push(orderbook);
            }
        };

        this.messageHandlers.set(tokenId, handler);

        // Subscribe if not already subscribed
        if (!this.subscriptions.has(tokenId)) {
            this.subscribe(tokenId);
        }

        // Ensure connection
        if (!this.isConnected()) {
            try {
                await this.connect();
            } catch (err) {
                isActive = false;
                this.messageHandlers.delete(tokenId);
                throw err;
            }
        }

        try {
            while (isActive) {
                // Check for buffered updates first
                if (updateBuffer.length > 0) {
                    const orderbook = updateBuffer.shift()!;
                    yield orderbook;
                    continue;
                }

                // Check for error
                if (error) {
                    throw error;
                }

                // Wait for next update
                const orderbook = await new Promise<OrderBook>((resolve, reject) => {
                    waiters.push({ resolve, reject });
                });

                yield orderbook;
            }
        } catch (err) {
            // Reject all waiting promises
            while (waiters.length > 0) {
                const { reject } = waiters.shift()!;
                reject(err instanceof Error ? err : new Error(String(err)));
            }
            throw err;
        } finally {
            // Cleanup
            isActive = false;
            this.messageHandlers.delete(tokenId);

            // Unsubscribe if no other handlers
            if (this.messageHandlers.size === 0) {
                this.unsubscribe(tokenId);
            }
        }
    }

    /**
     * Update the orderbook state with an initial snapshot.
     * This should be called before starting to watch.
     */
    setInitialSnapshot(tokenId: string, snapshot: OrderBook): void {
        const state = this.orderbookStates.get(tokenId);
        if (state) {
            state.updateSnapshot(snapshot);
        } else {
            const newState = new OrderBookState();
            newState.updateSnapshot(snapshot);
            this.orderbookStates.set(tokenId, newState);
        }
    }

    protected onOpen(): void {
        // Resubscribe to all active subscriptions
        const tokenIds = Array.from(this.subscriptions);
        if (tokenIds.length > 0) {
            this.subscribe(tokenIds);
        }
    }

    protected onMessage(message: string): void {
        try {
            const data: PolymarketMessage = JSON.parse(message);

            if (data.type === 'book') {
                this.handleBookMessage(data);
            }
            // We can handle price_change and last_trade_price in the future if needed
        } catch (error) {
            this.emit('error', new Error(`Failed to parse message: ${error}`));
        }
    }

    protected onClose(code: number, reason: string): void {
        // Connection closed, will reconnect automatically
    }

    /**
     * Handle book update message from Polymarket.
     */
    private handleBookMessage(message: PolymarketBookMessage): void {
        const { asset_id, bids, asks, timestamp } = message;

        // Get or create orderbook state
        let state = this.orderbookStates.get(asset_id);
        if (!state) {
            state = new OrderBookState();
            this.orderbookStates.set(asset_id, state);
        }

        // Convert Polymarket format to unified format
        const orderbookDelta: OrderBook = {
            bids: bids.map(level => ({
                price: parseFloat(level.price),
                size: parseFloat(level.size)
            })),
            asks: asks.map(level => ({
                price: parseFloat(level.price),
                size: parseFloat(level.size)
            })),
            timestamp: timestamp ? new Date(timestamp).getTime() : Date.now()
        };

        // Apply delta to state
        state.applyDelta(orderbookDelta);

        // Get current snapshot
        const snapshot = state.getSnapshot();

        // Notify handlers
        const handler = this.messageHandlers.get(asset_id);
        if (handler) {
            handler(snapshot);
        }
    }

    /**
     * Subscribe to orderbook updates for one or more token IDs.
     */
    private subscribe(tokenIds: string | string[]): void {
        const ids = Array.isArray(tokenIds) ? tokenIds : [tokenIds];

        // Add to subscriptions set
        ids.forEach(id => this.subscriptions.add(id));

        // Send subscribe message
        const subscribeMessage = {
            type: 'market' as const,
            asset_ids: Array.from(this.subscriptions)
        };

        this.send(JSON.stringify(subscribeMessage));
    }

    /**
     * Unsubscribe from orderbook updates for a token ID.
     */
    private unsubscribe(tokenId: string): void {
        this.subscriptions.delete(tokenId);

        if (this.subscriptions.size > 0) {
            // Update subscription with remaining token IDs
            const subscribeMessage = {
                type: 'market' as const,
                asset_ids: Array.from(this.subscriptions)
            };
            this.send(JSON.stringify(subscribeMessage));
        } else {
            // No more subscriptions, could disconnect or keep connection alive
            // For now, we'll keep the connection alive in case new subscriptions come in
        }
    }

    /**
     * Clean up resources.
     */
    cleanup(): void {
        this.messageHandlers.clear();
        this.subscriptions.clear();
        this.orderbookStates.clear();
        this.disconnect();
    }
}
