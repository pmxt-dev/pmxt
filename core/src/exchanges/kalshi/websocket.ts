import { BaseWebSocketManager } from '../../websocket/BaseWebSocketManager';
import { OrderBook } from '../../types';
import { OrderBookState } from '../../websocket/OrderBookState';
import { KalshiAuth } from './auth';
import { ExchangeCredentials } from '../../BaseExchange';
import { KALSHI_WS_URL } from './utils';

interface OrderbookSnapshot {
    type: 'orderbook_snapshot';
    market_ticker: string;
    yes: Array<[number, number]>;
    no: Array<[number, number]>;
    timestamp?: number;
}

interface OrderbookDelta {
    type: 'orderbook_delta';
    market_ticker: string;
    yes: Array<[number, number]>;
    no: Array<[number, number]>;
    timestamp?: number;
}

type KalshiWebSocketMessage = OrderbookSnapshot | OrderbookDelta;

interface KalshiWebSocketResponse {
    type: string;
    id?: number;
    sid?: number;
    seq?: number;
    msg?: {
        channel?: string;
        market_ticker?: string;
        yes?: Array<[number, number]>;
        no?: Array<[number, number]>;
        timestamp?: number;
    };
    market_ticker?: string;
    yes?: Array<[number, number]>;
    no?: Array<[number, number]>;
    timestamp?: number;
}

const MAX_PENDING_MESSAGES = 50;

export class KalshiWebSocketManager extends BaseWebSocketManager {
    private pendingMessages: KalshiWebSocketMessage[] = [];
    private messageId = 1;

    constructor(credentials: ExchangeCredentials) {
        const auth = new KalshiAuth(credentials);
        const headers = auth.getHeaders('GET', '/trade-api/ws/v2');

        super({
            url: KALSHI_WS_URL,
            headers,
            reconnectInterval: 1000,
            maxReconnectAttempts: Infinity,
            pingInterval: 30000,
            pingTimeout: 10000
        });
    }

    setInitialSnapshot(ticker: string, snapshot: OrderBook): void {
        let state = this.orderbookStates.get(ticker);
        if (!state) {
            state = new OrderBookState();
            this.orderbookStates.set(ticker, state);
        }
        state.updateSnapshot(snapshot);
        this.snapshotApplied.add(ticker);

        const messagesToFlush = this.pendingMessages.filter(msg => msg.market_ticker === ticker);
        messagesToFlush.forEach(msg => this.processKalshiMessage(msg));
        this.pendingMessages = this.pendingMessages.filter(msg => msg.market_ticker !== ticker);
    }

    protected subscribe(tickers: string | string[]): void {
        const ids = Array.isArray(tickers) ? tickers : [tickers];
        ids.forEach(id => this.subscriptions.add(id));

        const subscribeMessage = {
            id: this.messageId++,
            cmd: 'subscribe',
            params: {
                channels: ['orderbook_delta'],
                market_tickers: Array.from(this.subscriptions)
            }
        };

        this.send(JSON.stringify(subscribeMessage));
    }


    protected onMessage(message: string): void {
        const trimmed = message.trim();

        if (!trimmed.startsWith('{')) {
            return;
        }

        try {
            const data: KalshiWebSocketResponse = JSON.parse(message);

            if (data.type === 'subscribed') {
                return;
            }

            if (data.type === 'error') {
                let errorMsg = 'Unknown error from Kalshi WebSocket';
                if (data.msg && typeof data.msg === 'object') {
                    const msgObj = data.msg as any;
                    if ('msg' in msgObj && typeof msgObj.msg === 'string') {
                        errorMsg = msgObj.msg;
                    } else if ('code' in msgObj) {
                        errorMsg = `Error code: ${msgObj.code}`;
                    }
                } else if (data.msg) {
                    errorMsg = String(data.msg);
                }
                this.emit('error', new Error(`Kalshi WebSocket error: ${errorMsg}`));
                return;
            }

            if (data.type === 'orderbook_snapshot' || data.type === 'orderbook_delta') {
                let orderbookData: Partial<KalshiWebSocketMessage>;
                
                if (data.msg) {
                    orderbookData = { ...data.msg, type: data.type as 'orderbook_snapshot' | 'orderbook_delta' };
                } else if (data.market_ticker) {
                    orderbookData = { 
                        market_ticker: data.market_ticker,
                        yes: data.yes,
                        no: data.no,
                        timestamp: data.timestamp,
                        type: data.type as 'orderbook_snapshot' | 'orderbook_delta'
                    };
                } else {
                    return;
                }
                
                if (this.isOrderbookMessage(orderbookData)) {
                    const ticker = orderbookData.market_ticker;
                    const state = this.orderbookStates.get(ticker);
                    const snapshotApplied = this.snapshotApplied.has(ticker);

                    if (!state || !snapshotApplied) {
                        if (this.pendingMessages.length >= MAX_PENDING_MESSAGES) {
                            this.pendingMessages.shift();
                        }
                        this.pendingMessages.push(orderbookData);
                        return;
                    }

                    this.processKalshiMessage(orderbookData);
                }
            }
        } catch (error) {
            this.emit('error', new Error(`Failed to parse WebSocket message: ${error}`));
        }
    }

    protected onClose(): void {
    }

    private processKalshiMessage(message: KalshiWebSocketMessage): void {
        const ticker = message.market_ticker;
        let state = this.orderbookStates.get(ticker);
        if (!state) {
            state = new OrderBookState();
            this.orderbookStates.set(ticker, state);
        }

        const bids = (message.yes || []).map(([price, size]) => ({
            price: price / 100,
            size
        }));

        const asks = (message.no || []).map(([price, size]) => ({
            price: (100 - price) / 100,
            size
        }));

        const timestamp = message.timestamp ? message.timestamp * 1000 : Date.now();

        if (message.type === 'orderbook_snapshot') {
            state.updateSnapshot({ bids, asks, timestamp });
        } else if (message.type === 'orderbook_delta') {
            state.applyDelta({ bids, asks, timestamp });
        }

        const handlers = this.messageHandlers.get(ticker);
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

    private isOrderbookMessage(data: unknown): data is KalshiWebSocketMessage {
        if (typeof data !== 'object' || data === null) {
            return false;
        }
        const obj = data as Record<string, unknown>;
        return (obj.type === 'orderbook_snapshot' || obj.type === 'orderbook_delta') &&
               typeof obj.market_ticker === 'string';
    }

    protected unsubscribe(ticker: string): void {
        this.subscriptions.delete(ticker);

        if (this.subscriptions.size > 0) {
            const subscribeMessage = {
                id: this.messageId++,
                cmd: 'subscribe',
                params: {
                    channels: ['orderbook_delta'],
                    market_tickers: Array.from(this.subscriptions)
                }
            };
            this.send(JSON.stringify(subscribeMessage));
        } else {
            const unsubscribeMessage = {
                id: this.messageId++,
                cmd: 'unsubscribe',
                params: {
                    channels: ['orderbook_delta'],
                    market_tickers: [ticker]
                }
            };
            this.send(JSON.stringify(unsubscribeMessage));
        }
    }
}
