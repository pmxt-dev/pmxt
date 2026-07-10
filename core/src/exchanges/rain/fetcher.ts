// Thin wrapper around @buidlrrr/rain-sdk. SDK is ESM-only; we use dynamic
// import() to stay CJS-friendly. All methods return raw Rain SDK types;
// the normalizer maps them into the Unified schema.

import { rainErrorMapper } from './errors';
import { logger } from '../../utils/logger';

// @buidlrrr/rain-sdk is ESM-only. TSC with module:"commonjs" rewrites a plain
// `await import(...)` to `Promise.resolve().then(() => require(...))`, which
// blows up at runtime on `"type": "module"` packages with no CJS export
// (`ERR_PACKAGE_PATH_NOT_EXPORTED`). The Function-wrapped string keeps the
// real ESM `import()` opaque to TSC's downleveller so Node executes it natively.
type RainSdk = typeof import('@buidlrrr/rain-sdk');
type RainClient = InstanceType<RainSdk['Rain']>;

const esmImportRainSdk: () => Promise<RainSdk> = new Function(
    'return import("@buidlrrr/rain-sdk")',
) as () => Promise<RainSdk>;

let sdkPromise: Promise<RainSdk> | undefined;
function loadSdk(): Promise<RainSdk> {
    if (!sdkPromise) sdkPromise = esmImportRainSdk();
    return sdkPromise;
}

export interface RainFetcherConfig {
    environment?: 'development' | 'stage' | 'production';
    subgraphUrl?: string;
    subgraphApiKey?: string;
    rpcUrl?: string;
    wsRpcUrl?: string;
    sdk?: RainSdk;
}

// Re-export raw SDK types as the fetcher's contract surface.
export type RainRawMarket = Awaited<ReturnType<RainClient['getPublicMarkets']>>[number];
export type RainRawMarketDetails = Awaited<ReturnType<RainClient['getMarketDetails']>>;
export type RainRawOptionPrice = Awaited<ReturnType<RainClient['getMarketPrices']>>[number];
export type RainRawPositions = Awaited<ReturnType<RainClient['getPositions']>>;
export type RainRawBalance = Awaited<ReturnType<RainClient['getSmartAccountBalance']>>;
export type RainRawPriceHistory = Awaited<ReturnType<RainClient['getPriceHistory']>>;
export type RainRawTransactions = Awaited<ReturnType<RainClient['getTransactions']>>;
export type RainRawMarketTransactions = Awaited<ReturnType<RainClient['getMarketTransactions']>>;

// What the fetcher returns: a market plus its enriched details (when available).
export interface RainMarketWithDetails {
    market: RainRawMarket;
    details?: RainRawMarketDetails;
}

const DETAIL_ENRICHMENT_LIMIT = 25;
const DETAIL_PARALLEL_BATCH = 5;

export class RainFetcher {
    private readonly config: RainFetcherConfig;
    private client?: RainClient;

    constructor(config: RainFetcherConfig) {
        this.config = config;
    }

    private async getClient(): Promise<RainClient> {
        if (!this.client) {
            const sdk = this.config.sdk ?? await loadSdk();
            this.client = new sdk.Rain({
                environment: this.config.environment ?? 'production',
                rpcUrl: this.config.rpcUrl,
                subgraphUrl: this.config.subgraphUrl,
                subgraphApiKey: this.config.subgraphApiKey,
                wsRpcUrl: this.config.wsRpcUrl,
            });
        }
        return this.client;
    }

    /**
     * List markets. Enriches the first `DETAIL_ENRICHMENT_LIMIT` with on-chain
     * details (options + prices) in bounded-parallel batches. Beyond that, only
     * the basic list-view fields are populated. ponytail: N+1 enrichment is
     * fine for the typical 25-market view; switch to a multicall bundler if a
     * larger feed needs full options on every row.
     */
    async fetchRawMarkets(params?: {
        limit?: number;
        offset?: number;
        sortBy?: 'Liquidity' | 'Volumn' | 'latest';
        status?: string;
    }): Promise<RainMarketWithDetails[]> {
        try {
            const client = await this.getClient();
            const markets = await client.getPublicMarkets({
                limit: params?.limit,
                offset: params?.offset,
                sortBy: params?.sortBy ?? 'Liquidity',
                status: params?.status as any,
            });

            const enrichUpTo = Math.min(markets.length, DETAIL_ENRICHMENT_LIMIT);
            const enriched: RainMarketWithDetails[] = [];

            const resolveId = (m: any): string | undefined => m?._id ?? m?.id;

            for (let i = 0; i < enrichUpTo; i += DETAIL_PARALLEL_BATCH) {
                const batch = markets.slice(i, i + DETAIL_PARALLEL_BATCH);
                const details = await Promise.all(
                    batch.map((m) => {
                        const mid = resolveId(m);
                        return mid ? this.safeFetchDetails(client, mid) : Promise.resolve(undefined);
                    }),
                );
                batch.forEach((m, j) => enriched.push({ market: m, details: details[j] }));
            }

            for (let i = enrichUpTo; i < markets.length; i++) {
                enriched.push({ market: markets[i] });
            }

            return enriched;
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    async fetchRawMarket(marketId: string): Promise<RainMarketWithDetails | null> {
        try {
            const client = await this.getClient();
            const details = await client.getMarketDetails(marketId);
            if (!details) return null;
            return {
                market: {
                    id: details.id,
                    title: details.title,
                    totalVolume: '0',
                    status: details.status,
                    contractAddress: details.contractAddress,
                } as RainRawMarket,
                details,
            };
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    async fetchRawOHLCV(marketAddress: string, optionIndex: number, _interval: string, _limit?: number): Promise<RainRawPriceHistory | null> {
        if (!this.config.subgraphUrl) return null;
        try {
            const client = await this.getClient();
            return await (client as any).getPriceHistory({
                marketAddress: marketAddress as `0x${string}`,
                interval: _interval,
                option: optionIndex,
            });
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    async fetchRawPositions(walletAddress: string): Promise<RainRawPositions> {
        try {
            const client = await this.getClient();
            return await client.getPositions(walletAddress as `0x${string}`);
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    async fetchRawBalance(walletAddress: string, tokenAddresses: string[]): Promise<RainRawBalance> {
        try {
            const client = await this.getClient();
            return await client.getSmartAccountBalance({
                address: walletAddress as `0x${string}`,
                tokenAddresses: tokenAddresses as `0x${string}`[],
            });
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    async fetchRawMarketTrades(marketAddress: string, limit?: number): Promise<RainRawMarketTransactions | null> {
        if (!this.config.subgraphUrl) return null;
        try {
            const client = await this.getClient();
            return await client.getMarketTransactions({
                marketAddress: marketAddress as `0x${string}`,
                first: limit,
            });
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    async fetchRawUserTrades(walletAddress: string, marketAddress?: string, limit?: number): Promise<RainRawTransactions | null> {
        if (!this.config.subgraphUrl) return null;
        try {
            const client = await this.getClient();
            return await client.getTransactions({
                address: walletAddress as `0x${string}`,
                first: limit,
                marketAddress: marketAddress as `0x${string}` | undefined,
            });
        } catch (error: any) {
            throw rainErrorMapper.mapError(error);
        }
    }

    /** Expose the underlying SDK client for trade-tx builders in index.ts. */
    async sdkClient(): Promise<RainClient> {
        return this.getClient();
    }

    private async safeFetchDetails(client: RainClient, marketId: string): Promise<RainRawMarketDetails | undefined> {
        try {
            return await client.getMarketDetails(marketId);
        } catch (err) {
            logger.warn('RainFetcher: getMarketDetails failed', { marketId, error: String(err) });
            return undefined;
        }
    }

    async close(): Promise<void> {
        if (this.client && typeof (this.client as any).destroyWebSocket === 'function') {
            try {
                await (this.client as any).destroyWebSocket();
            } catch { /* ignore */ }
        }
        this.client = undefined;
    }
}
