// Thin wrapper around Rain SDK's subscribePriceUpdates. Provides the
// CCXT-Pro-style "next snapshot" promise pattern PMXT expects.

import { OrderBook, Trade } from '../../types';
import { RainNormalizer } from './normalizer';
import { logger } from '../../utils/logger';

type RainSdk = typeof import('@buidlrrr/rain-sdk');
type RainClient = InstanceType<RainSdk['Rain']>;
type Unsubscribe = () => void;

// See note in fetcher.ts on why we Function-wrap the import().
const esmImportRainSdk: () => Promise<RainSdk> = new Function(
    'return import("@buidlrrr/rain-sdk")',
) as () => Promise<RainSdk>;

export interface RainWebSocketConfig {
    wsRpcUrl: string;
    environment?: 'development' | 'stage' | 'production';
}

export class RainWebSocket {
    private readonly config: RainWebSocketConfig;
    private client?: RainClient;
    private readonly subs = new Map<string, Unsubscribe>();
    private readonly normalizer = new RainNormalizer();

    constructor(config: RainWebSocketConfig) {
        this.config = config;
    }

    private async getClient(): Promise<RainClient> {
        if (!this.client) {
            const sdk = await esmImportRainSdk();
            this.client = new sdk.Rain({
                environment: this.config.environment ?? 'production',
                wsRpcUrl: this.config.wsRpcUrl,
            });
        }
        return this.client;
    }

    /**
     * Resolves to the next OrderBook snapshot after a price-affecting event.
     * Stays subscribed for the connection lifetime; same caller can re-await
     * to get subsequent snapshots.
     */
    async watchOrderBook(marketAddress: string, outcomeId: string): Promise<OrderBook> {
        const client = await this.getClient();
        return new Promise<OrderBook>((resolve, reject) => {
            const key = `book:${marketAddress}:${outcomeId}`;
            const existing = this.subs.get(key);
            if (existing) existing();

            const unsubscribe = client.subscribePriceUpdates({
                marketAddress: marketAddress as `0x${string}`,
                onPriceUpdate: () => {
                    resolve(this.normalizer.normalizeOrderBook(
                        { market: { contractAddress: marketAddress } as any, details: undefined },
                        outcomeId,
                    ));
                },
                onError: (err) => {
                    logger.warn('RainWebSocket: price update error', { err: String(err) });
                    reject(err);
                },
            });
            this.subs.set(key, unsubscribe);
        });
    }

    async watchTrades(marketAddress: string): Promise<Trade[]> {
        const client = await this.getClient();
        return new Promise<Trade[]>((resolve, reject) => {
            const key = `trades:${marketAddress}`;
            const existing = this.subs.get(key);
            if (existing) existing();

            const unsubscribe = client.subscribeToMarketEvents({
                marketAddress: marketAddress as `0x${string}`,
                eventNames: ['EnterOption', 'ExecuteBuyOrder', 'ExecuteSellOrder'],
                onEvent: (event) => {
                    const isBuy = event.eventName === 'EnterOption' || event.eventName === 'ExecuteBuyOrder';
                    resolve([{
                        id: event.transactionHash,
                        timestamp: Number(event.blockNumber) * 1000,
                        price: 0,
                        amount: 0,
                        side: isBuy ? 'buy' : 'sell',
                    }]);
                },
                onError: (err) => {
                    logger.warn('RainWebSocket: trade subscription error', { err: String(err) });
                    reject(err);
                },
            });
            this.subs.set(key, unsubscribe);
        });
    }

    async close(): Promise<void> {
        for (const unsub of this.subs.values()) {
            try { unsub(); } catch { /* ignore */ }
        }
        this.subs.clear();
        if (this.client && typeof (this.client as any).destroyWebSocket === 'function') {
            try { await (this.client as any).destroyWebSocket(); } catch { /* ignore */ }
        }
        this.client = undefined;
    }
}
