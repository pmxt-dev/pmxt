/**
 * Feed client — CCXT-compatible method names over /api/feeds/* endpoints.
 *
 * Usage:
 *   const feed = new FeedClient('chainlink', { pmxtApiKey: '...' });
 *   const ticker = await feed.fetchTicker('BTC/USD');
 */

import { resolvePmxtBaseUrl } from "./constants.js";
import { PmxtError } from "./errors.js";

export interface Ticker {
    symbol: string;
    info: Record<string, unknown>;
    timestamp: number | undefined;
    datetime: string | undefined;
    high: number | undefined;
    low: number | undefined;
    bid: number | undefined;
    bidVolume: number | undefined;
    ask: number | undefined;
    askVolume: number | undefined;
    vwap: number | undefined;
    open: number | undefined;
    close: number | undefined;
    last: number | undefined;
    previousClose: number | undefined;
    change: number | undefined;
    percentage: number | undefined;
    average: number | undefined;
    quoteVolume: number | undefined;
    baseVolume: number | undefined;
    indexPrice: number | undefined;
    markPrice: number | undefined;
}

export type Tickers = Record<string, Ticker>;
export type OHLCV = [number, number, number, number, number, number];

export interface Market {
    id: string;
    symbol: string;
    base: string;
    quote: string;
    active: boolean;
    type: string;
    info: Record<string, unknown>;
}

export interface OracleRound {
    feed: string;
    roundId: string;
    answer: number;
    startedAt: number;
    updatedAt: number;
    answeredInRound: string;
    decimals: number;
    description?: string;
}

export interface FeedClientOptions {
    pmxtApiKey?: string;
    baseUrl?: string;
}

export class FeedClient {
    private readonly feedName: string;
    private readonly baseUrl: string;
    private readonly headers: Record<string, string>;

    constructor(feedName: string, options: FeedClientOptions = {}) {
        this.feedName = feedName;
        const resolved = resolvePmxtBaseUrl({
            baseUrl: options.baseUrl,
            pmxtApiKey: options.pmxtApiKey,
        });
        this.baseUrl = resolved.baseUrl;
        this.headers = {
            ...(resolved.pmxtApiKey ? { 'Authorization': `Bearer ${resolved.pmxtApiKey}` } : {}),
        };
    }

    async listFeeds(): Promise<string[]> {
        return this.getRoot<string[]>();
    }

    async loadMarkets(): Promise<Record<string, Market>> {
        return this.get<Record<string, Market>>('loadMarkets', {});
    }

    async fetchTicker(symbol: string): Promise<Ticker> {
        return this.get<Ticker>('fetchTicker', { symbol });
    }

    async fetchTickers(symbols?: string[]): Promise<Tickers> {
        const params: Record<string, unknown> = {};
        if (symbols) params.symbols = symbols.join(',');
        return this.get<Tickers>('fetchTickers', params);
    }

    async fetchOHLCV(symbol: string, timeframe: string = '1h', since?: number, limit?: number): Promise<OHLCV[]> {
        return this.get<OHLCV[]>('fetchOHLCV', { symbol, timeframe, since, limit });
    }

    async fetchOracleRound(feed: string): Promise<OracleRound> {
        return this.get<OracleRound>('fetchOracleRound', { feed });
    }

    async fetchOracleHistory(feed: string, limit?: number): Promise<OracleRound[]> {
        const params: Record<string, unknown> = { feed };
        if (limit !== undefined) params.limit = limit;
        return this.get<OracleRound[]>('fetchOracleHistory', params);
    }

    async fetchHistoricalPrices(symbol: string, opts?: {
        fromTimestamp?: number;
        untilTimestamp?: number;
        maxSize?: number;
        order?: 'asc' | 'desc';
    }): Promise<Ticker[]> {
        return this.get<Ticker[]>('fetchHistoricalPrices', { symbol, ...opts });
    }

    private async get<T>(method: string, params: Record<string, unknown>): Promise<T> {
        return this.request<T>(`${this.baseUrl}/api/feeds/${this.feedName}/${method}`, params);
    }

    private async getRoot<T>(params: Record<string, unknown> = {}): Promise<T> {
        return this.request<T>(`${this.baseUrl}/api/feeds/`, params);
    }

    private async request<T>(url: string, params: Record<string, unknown>): Promise<T> {
        const qs = Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&');

        const requestUrl = `${url}${qs ? '?' + qs : ''}`;

        const response = await fetch(requestUrl, {
            headers: this.headers,
            signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new PmxtError(body.error || response.statusText);
        }

        const json = await response.json() as { success: boolean; data: T; error?: string };
        if (!json.success) {
            throw new PmxtError(json.error || 'Unknown feed error');
        }
        return json.data;
    }
}
