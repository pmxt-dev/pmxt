import { BaseWebSocketManager } from '../../websocket/BaseWebSocketManager';
import { OrderBook } from '../../types';
import { OrderBookState } from '../../websocket/OrderBookState';

const POLYMARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const CONNECTION_READY_DELAY = 100;

interface BookEntry {
    market: string;
    asset_id: string;
    timestamp: string;
    hash: string;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
}

interface PriceChangeMessage {
    market: string;
    price_changes: Array<{
        asset_id: string;
        price: string;
        size: string;
        side: 'BUY' | 'SELL';
        hash: string;
        best_bid: string;
        best_ask: string;
    }>;
    timestamp: string;
    event_type: string;
}

type WebSocketMessage = BookEntry | PriceChangeMessage | BookEntry[];

export class PolymarketWebSocketManager extends BaseWebSocketManager {
    private readonly orderbookStates = new Map<string, OrderBookState>();
    private readonly subscriptions = new Set<string>();
    private readonly messageHandlers = new Map<string, (orderbook: OrderBook) => void>();

    constructor() {
        super({
            url: POLYMARKET_WS_URL,
            reconnectInterval: 1000,
            maxReconnectAttempts: Infinity,
            pingInterval: 30000,
            pingTimeout: 10000
        });
    }

    async *watchOrderBook(tokenId: string): AsyncGenerator<OrderBook> {
        if (!this.orderbookStates.has(tokenId)) {
            this.orderbookStates.set(tokenId, new OrderBookState());
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
                updateBuffer.push(orderbook);
            }
        };

        this.messageHandlers.set(tokenId, handler);

        if (!this.isConnected()) {
            try {
                await this.connect();
                await new Promise(resolve => setTimeout(resolve, CONNECTION_READY_DELAY));
            } catch (err) {
                isActive = false;
                this.messageHandlers.delete(tokenId);
                throw err;
            }
        }

        if (!this.subscriptions.has(tokenId)) {
            this.subscribe(tokenId);
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
            this.messageHandlers.delete(tokenId);

            if (this.messageHandlers.size === 0) {
                this.unsubscribe(tokenId);
            }
        }
    }

    setInitialSnapshot(tokenId: string, snapshot: OrderBook): void {
        let state = this.orderbookStates.get(tokenId);
        if (!state) {
            state = new OrderBookState();
            this.orderbookStates.set(tokenId, state);
        }
        state.updateSnapshot(snapshot);
    }

    protected onOpen(): void {
        if (this.subscriptions.size === 0) {
            return;
        }

        const subscribeMessage = {
            type: 'market' as const,
            assets_ids: Array.from(this.subscriptions)
        };
        this.send(JSON.stringify(subscribeMessage));
    }

    protected onMessage(message: string): void {
        const trimmed = message.trim();
        
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            if (trimmed.includes('INVALID OPERATION') || trimmed.includes('INVALID')) {
                this.emit('error', new Error(`Polymarket WebSocket: ${trimmed}`));
            }
            return;
        }

        try {
            const data: WebSocketMessage = JSON.parse(message);
            
            if (Array.isArray(data)) {
                for (const entry of data) {
                    if (this.isBookEntry(entry)) {
                        this.processBookEntry(entry);
                    }
                }
            } else if (this.isBookEntry(data)) {
                this.processBookEntry(data);
            }
        } catch (error) {
            this.emit('error', new Error(`Failed to parse WebSocket message: ${error}`));
        }
    }

    protected onClose(): void {
        // Reconnection handled by base class
    }

    cleanup(): void {
        this.messageHandlers.clear();
        this.subscriptions.clear();
        this.orderbookStates.clear();
        this.disconnect();
    }

    private processBookEntry(entry: BookEntry): void {
        let state = this.orderbookStates.get(entry.asset_id);
        if (!state) {
            state = new OrderBookState();
            this.orderbookStates.set(entry.asset_id, state);
        }

        const snapshot: OrderBook = {
            bids: (entry.bids || []).map(level => ({
                price: parseFloat(level.price),
                size: parseFloat(level.size)
            })),
            asks: (entry.asks || []).map(level => ({
                price: parseFloat(level.price),
                size: parseFloat(level.size)
            })),
            timestamp: entry.timestamp ? parseInt(entry.timestamp) : Date.now()
        };

        state.updateSnapshot(snapshot);
        const handler = this.messageHandlers.get(entry.asset_id);
        handler?.(state.getSnapshot());
    }

    private isBookEntry(data: any): data is BookEntry {
        return data?.asset_id && (data.bids || data.asks);
    }

    private subscribe(tokenIds: string | string[]): void {
        const ids = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
        ids.forEach(id => this.subscriptions.add(id));

        const subscribeMessage = {
            type: 'market' as const,
            assets_ids: Array.from(this.subscriptions)
        };

        this.send(JSON.stringify(subscribeMessage));
    }

    private unsubscribe(tokenId: string): void {
        this.subscriptions.delete(tokenId);

        if (this.subscriptions.size > 0) {
            const subscribeMessage = {
                type: 'market' as const,
                assets_ids: Array.from(this.subscriptions)
            };
            this.send(JSON.stringify(subscribeMessage));
        } else {
            const unsubscribeMessage = {
                assets_ids: [tokenId],
                operation: 'unsubscribe' as const
            };
            this.send(JSON.stringify(unsubscribeMessage));
        }
    }
}
