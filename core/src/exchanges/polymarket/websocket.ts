import { BaseWebSocketManager } from '../../websocket/BaseWebSocketManager';
import { OrderBook } from '../../types';
import { OrderBookState } from '../../websocket/OrderBookState';
import { POLYMARKET_WS_URL } from './utils';

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

const MAX_PENDING_MESSAGES = 50;

export class PolymarketWebSocketManager extends BaseWebSocketManager {
    private pendingMessages: WebSocketMessage[] = [];

    constructor() {
        super({
            url: POLYMARKET_WS_URL,
            reconnectInterval: 1000,
            maxReconnectAttempts: Infinity,
            pingInterval: 30000,
            pingTimeout: 10000
        });
    }


    setInitialSnapshot(tokenId: string, snapshot: OrderBook): void {
        let state = this.orderbookStates.get(tokenId);
        if (!state) {
            state = new OrderBookState();
            this.orderbookStates.set(tokenId, state);
        }
        state.updateSnapshot(snapshot);
        this.snapshotApplied.add(tokenId);

        const messagesToFlush = this.pendingMessages.filter(msg => {
            if (Array.isArray(msg)) {
                return msg.some((e: any) => this.isBookEntry(e) && e.asset_id === tokenId);
            }
            if (this.isBookEntry(msg) && msg.asset_id === tokenId) {
                return true;
            }
            if (this.isPriceChangeMessage(msg)) {
                return msg.price_changes.some(change => change.asset_id === tokenId);
            }
            return false;
        });

        messagesToFlush.forEach(msg => {
            if (Array.isArray(msg)) {
                msg.forEach(entry => {
                    if (this.isBookEntry(entry) && entry.asset_id === tokenId) {
                        this.processBookEntry(entry);
                    }
                });
            } else if (this.isBookEntry(msg) && msg.asset_id === tokenId) {
                this.processBookEntry(msg);
            } else if (this.isPriceChangeMessage(msg)) {
                this.processPriceChangeMessage(msg);
            }
        });

        this.pendingMessages = this.pendingMessages.filter(msg => {
            if (Array.isArray(msg)) {
                return !msg.some((e: any) => this.isBookEntry(e) && e.asset_id === tokenId);
            }
            if (this.isBookEntry(msg) && msg.asset_id === tokenId) {
                return false;
            }
            if (this.isPriceChangeMessage(msg)) {
                return !msg.price_changes.some(change => change.asset_id === tokenId);
            }
            return true;
        });
    }

    protected subscribe(tokenIds: string | string[]): void {
        const ids = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
        ids.forEach(id => this.subscriptions.add(id));

        const subscribeMessage = {
            type: 'market' as const,
            assets_ids: Array.from(this.subscriptions)
        };

        this.send(JSON.stringify(subscribeMessage));
    }


    protected onMessage(message: string): void {
        const trimmed = message.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            if (/INVALID(\sOPERATION)?/.test(trimmed)) {
                this.emit('error', new Error(`Polymarket WebSocket: ${trimmed}`));
            }
            return;
        }

        try {
            const data: WebSocketMessage = JSON.parse(message);
            const handleEntry = (entry: BookEntry) => {
                const state = this.orderbookStates.get(entry.asset_id);
                if (!state || !this.snapshotApplied.has(entry.asset_id)) {
                    if (this.pendingMessages.length >= MAX_PENDING_MESSAGES) {
                        this.pendingMessages.shift();
                    }
                    this.pendingMessages.push(entry);
                    return;
                }
                this.processBookEntry(entry);
            };

            if (Array.isArray(data)) {
                data.forEach(entry => {
                    if (this.isBookEntry(entry)) {
                        handleEntry(entry);
                    }
                });
            } else if (this.isPriceChangeMessage(data)) {
                const hasUnappliedSnapshot = data.price_changes.some(change => {
                    const assetId = change.asset_id;
                    const state = this.orderbookStates.get(assetId);
                    return !state || !this.snapshotApplied.has(assetId);
                });
                
                if (hasUnappliedSnapshot) {
                    if (this.pendingMessages.length >= MAX_PENDING_MESSAGES) {
                        this.pendingMessages.shift();
                    }
                    this.pendingMessages.push(data);
                } else {
                    this.processPriceChangeMessage(data);
                }
            } else if (this.isBookEntry(data)) {
                handleEntry(data);
            }
        } catch (error) {
            this.emit('error', new Error(`Failed to parse WebSocket message: ${error}`));
        }
    }

    protected onClose(): void {
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
        const handlers = this.messageHandlers.get(entry.asset_id);
        if (handlers) {
            handlers.forEach(h => {
                try {
                    h(state.getSnapshot());
                } catch (err) {
                    this.emit('error', err instanceof Error ? err : new Error(String(err)));
                }
            });
        }
    }

    private isBookEntry(data: any): data is BookEntry {
        return data?.asset_id && (data.bids || data.asks);
    }

    private isPriceChangeMessage(data: any): data is PriceChangeMessage {
        return data?.price_changes && Array.isArray(data.price_changes) && data.market;
    }

    private processPriceChangeMessage(message: PriceChangeMessage): void {
        for (const change of message.price_changes) {
            const assetId = change.asset_id;
            let state = this.orderbookStates.get(assetId);
            
            if (!state) {
                state = new OrderBookState();
                this.orderbookStates.set(assetId, state);
            }

            const price = parseFloat(change.price);
            const size = parseFloat(change.size);
            
            const delta: OrderBook = {
                bids: change.side === 'BUY' ? [{ price, size }] : [],
                asks: change.side === 'SELL' ? [{ price, size }] : [],
                timestamp: message.timestamp ? parseInt(message.timestamp) : Date.now()
            };

            state.applyDelta(delta);
            
            const handlers = this.messageHandlers.get(assetId);
            if (handlers) {
                handlers.forEach(h => {
                    try {
                        h(state.getSnapshot());
                    } catch (err) {
                        this.emit('error', err instanceof Error ? err : new Error(String(err)));
                    }
                });
            }
        }
    }

    protected unsubscribe(tokenId: string): void {
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
