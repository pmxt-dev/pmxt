import WebSocket from 'ws';
import axios, { AxiosInstance } from 'axios';
import { BaseDataFeed, DataFeedOptions } from '../base-feed';
import { Ticker, Tickers, OHLCV, OrderBook, Market, OracleRound, OracleParams, Dictionary } from '../types';
import { logger } from '../../utils/logger';
import { ExchangeNotAvailable, NotSupported } from '../../errors';
import {
    ChainlinkFeedConfig,
    ChainlinkLatestPricesResponse,
    ChainlinkPricesResponse,
    ChainlinkWsEvent,
    ChainlinkWsMessage,
    CHAINLINK_DEFAULTS,
    SUPPORTED_TOKENS,
    TOKEN_BY_PAIR,
} from './types';
import {
    normalizeLatestToTicker,
    normalizeWsEventToTicker,
    normalizePriceRecordToTicker,
    normalizePriceRecordToOracleRound,
} from './normalizer';

// ----------------------------------------------------------------------------
// ChainlinkFeed — CCXT-compatible interface over pmxt-ohlc Chainlink API.
// ----------------------------------------------------------------------------

interface Subscription {
    readonly symbol: string;
    readonly callback: (ticker: Ticker) => void;
}

export class ChainlinkFeed extends BaseDataFeed {
    readonly name = 'chainlink';
    readonly description = 'Chainlink price feeds (ETH, BTC, XRP, SOL) on Polygon via pmxt-ohlc';
    readonly has = {
        loadMarkets: true,
        fetchTicker: true,
        fetchTickers: true,
        watchTicker: true,
        fetchOHLCV: false,
        fetchOrderBook: false,
        fetchOracleRound: true,
        fetchOracleHistory: true,
        fetchHistoricalPrices: true,
    } as const;

    private readonly baseUrl: string;
    private readonly client: AxiosInstance;
    private readonly wsUrl: string;
    private readonly wsApiKey: string;
    private readonly reconnectIntervalMs: number;

    private ws: WebSocket | null = null;
    private subscriptions: Subscription[] = [];
    private latestTickers = new Map<string, Ticker>();
    private isTerminated = false;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private connectionPromise: Promise<void> | null = null;

    constructor(config: ChainlinkFeedConfig, options?: DataFeedOptions) {
        super(options);
        const baseURL = config.baseUrl ?? process.env.CHAINLINK_API_URL ?? CHAINLINK_DEFAULTS.baseUrl;
        this.baseUrl = baseURL;
        this.client = axios.create({
            baseURL,
            headers: { 'X-API-Key': config.apiKey },
            timeout: 10_000,
        });
        this.wsUrl = config.wsUrl ?? process.env.CHAINLINK_WS_URL ?? CHAINLINK_DEFAULTS.wsUrl;
        this.wsApiKey = config.wsApiKey ?? config.apiKey;
        this.reconnectIntervalMs = config.reconnectIntervalMs ?? CHAINLINK_DEFAULTS.reconnectIntervalMs;
    }

    // -- Lifecycle --

    async connect(): Promise<void> {
        if (this.ws) return;
        if (this.connectionPromise) return this.connectionPromise;
        this.isTerminated = false;
        this.connectionPromise = this.establishConnection();
        return this.connectionPromise;
    }

    async close(): Promise<void> {
        this.isTerminated = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close(1000, 'client_close');
            this.ws = null;
        }
        this.connectionPromise = null;
        this.subscriptions = [];
    }

    // -- CCXT: loadMarkets --

    async loadMarkets(): Promise<Dictionary<Market>> {
        const markets: Dictionary<Market> = {};
        for (const t of SUPPORTED_TOKENS) {
            markets[t.pair] = {
                id: t.short,
                symbol: t.pair,
                base: t.base,
                quote: t.quote,
                active: true,
                type: 'spot',
                spot: true,
                margin: false,
                swap: false,
                future: false,
                option: false,
                contract: false,
                precision: { amount: undefined, price: t.decimals },
                limits: {},
                info: { proxyAddress: t.proxyAddress, decimals: t.decimals },
            };
        }
        return markets;
    }

    // -- CCXT: fetchTicker --

    protected async fetchTickerImpl(symbol: string): Promise<Ticker> {
        const cached = this.latestTickers.get(symbol.toUpperCase());
        if (cached) return cached;
        this.ensureRestConfigured();

        const token = TOKEN_BY_PAIR.get(symbol.toUpperCase());
        if (!token) {
            throw new Error(`Unsupported Chainlink symbol: ${symbol}. Supported: ${SUPPORTED_TOKENS.map((t) => t.pair).join(', ')}`);
        }

        const { data } = await this.client.get<ChainlinkLatestPricesResponse>(
            '/v1/chainlink/latest-prices',
        );

        const now = Date.now();
        const record = data.data.find(
            (r) => r.token.toLowerCase() === token.short,
        );
        if (!record) {
            throw new Error(`No price data returned for ${symbol}`);
        }

        return normalizeLatestToTicker(record, now);
    }

    // -- CCXT: fetchTickers --

    protected async fetchTickersImpl(symbols?: string[]): Promise<Tickers> {
        this.ensureRestConfigured();
        const { data } = await this.client.get<ChainlinkLatestPricesResponse>(
            '/v1/chainlink/latest-prices',
        );

        const now = Date.now();
        const requested = symbols
            ? new Set(symbols.map((s) => s.toUpperCase()))
            : undefined;

        const result: Tickers = {};
        for (const record of data.data) {
            const token = SUPPORTED_TOKENS.find((t) => t.short === record.token.toLowerCase());
            if (!token) continue;
            if (requested && !requested.has(token.pair)) continue;
            if (record.price === null || record.price === undefined) continue;

            const ticker = normalizeLatestToTicker(record, now);
            result[ticker.symbol] = ticker;
        }
        return result;
    }

    // -- CCXT: watchTicker --

    protected watchTickerImpl(symbol: string, callback: (ticker: Ticker) => void): () => void {
        const sub: Subscription = { symbol: symbol.toUpperCase(), callback };
        this.subscriptions = [...this.subscriptions, sub];
        this.ensureConnected().catch((err: unknown) => {
            logger.error('[ChainlinkFeed] initial connect failed in watchTickerImpl', { error: err instanceof Error ? err.message : String(err) });
        });

        return () => {
            this.subscriptions = this.subscriptions.filter((s) => s !== sub);
        };
    }

    // -- CCXT: fetchOHLCV (not supported) --

    protected async fetchOHLCVImpl(_symbol: string, _timeframe?: string, _since?: number, _limit?: number): Promise<OHLCV[]> {
        throw new NotSupported(
            'Chainlink feed does not provide OHLCV candles. ' +
            'Use fetchOracleHistory() for raw AnswerUpdated records.',
            this.name,
        );
    }

    // -- CCXT: fetchOrderBook (not applicable) --

    protected async fetchOrderBookImpl(_symbol: string, _limit?: number): Promise<OrderBook> {
        throw new NotSupported('Chainlink oracle feeds do not have order books.', this.name);
    }

    // -- pmxt extensions: Oracle --

    async fetchOracleRound(params: OracleParams): Promise<OracleRound> {
        this.ensureRestConfigured();
        const token = TOKEN_BY_PAIR.get(params.feed.toUpperCase());
        if (!token) {
            throw new Error(`Unsupported Chainlink feed: ${params.feed}. Supported: ${SUPPORTED_TOKENS.map((t) => t.pair).join(', ')}`);
        }

        const { data } = await this.client.get<ChainlinkPricesResponse>(
            '/v1/chainlink/prices',
            { params: { token: token.short, max_size: 1, order: 'desc' } },
        );

        if (data.data.length === 0) {
            throw new Error(`No oracle data returned for ${params.feed}`);
        }

        return normalizePriceRecordToOracleRound(data.data[0]);
    }

    async fetchOracleHistory(params: OracleParams): Promise<OracleRound[]> {
        this.ensureRestConfigured();
        const token = TOKEN_BY_PAIR.get(params.feed.toUpperCase());
        if (!token) {
            throw new Error(`Unsupported Chainlink feed: ${params.feed}. Supported: ${SUPPORTED_TOKENS.map((t) => t.pair).join(', ')}`);
        }

        const { data } = await this.client.get<ChainlinkPricesResponse>(
            '/v1/chainlink/prices',
            { params: { token: token.short, max_size: params.limit ?? 500, order: 'desc' } },
        );

        return data.data.map(normalizePriceRecordToOracleRound);
    }

    async fetchHistoricalPrices(
        symbol: string,
        opts?: {
            fromTimestamp?: number;
            untilTimestamp?: number;
            maxSize?: number;
            order?: 'asc' | 'desc';
        },
    ): Promise<Ticker[]> {
        this.ensureRestConfigured();
        const token = TOKEN_BY_PAIR.get(symbol.toUpperCase());
        if (!token) {
            throw new Error(`Unsupported Chainlink symbol: ${symbol}. Supported: ${SUPPORTED_TOKENS.map((t) => t.pair).join(', ')}`);
        }

        const queryParams: Record<string, unknown> = { token: token.short };
        if (opts?.fromTimestamp !== undefined) queryParams.from_timestamp = opts.fromTimestamp;
        if (opts?.untilTimestamp !== undefined) queryParams.until_timestamp = opts.untilTimestamp;
        if (opts?.maxSize !== undefined) queryParams.max_size = opts.maxSize;
        if (opts?.order !== undefined) queryParams.order = opts.order;

        const { data } = await this.client.get<ChainlinkPricesResponse>(
            '/v1/chainlink/prices',
            { params: queryParams },
        );

        return data.data.map(normalizePriceRecordToTicker);
    }

    // -- Internal WebSocket --

    private async ensureConnected(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        await this.connect();
    }

    private ensureRestConfigured(): void {
        const rawUrl = this.baseUrl.trim();
        if (!rawUrl) {
            throw new ExchangeNotAvailable(
                'ChainlinkFeed requires CHAINLINK_API_URL to fetch oracle data.',
                this.name,
            );
        }

        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            throw new ExchangeNotAvailable(
                'ChainlinkFeed requires CHAINLINK_API_URL to be a valid HTTP URL.',
                this.name,
            );
        }

        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new ExchangeNotAvailable(
                'ChainlinkFeed requires CHAINLINK_API_URL to use http:// or https://.',
                this.name,
            );
        }
    }

    private establishConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            const wsUrl = this.validateWsUrl();
            if (this.wsApiKey) {
                wsUrl.searchParams.set('key', this.wsApiKey);
            }

            const ws = new WebSocket(wsUrl.toString());

            const connectionTimeout = setTimeout(() => {
                ws.close();
                this.ws = null;
                this.connectionPromise = null;
                reject(new Error('ChainlinkFeed: WebSocket connection timed out (30s)'));
            }, 30_000);

            ws.on('open', () => {
                clearTimeout(connectionTimeout);
                this.ws = ws;
                this.connectionPromise = null;
                ws.send(JSON.stringify({ op: 'subscribe_all' }));
                resolve();
            });

            ws.on('message', (data: WebSocket.Data) => {
                this.handleMessage(data);
            });

            ws.on('close', () => {
                clearTimeout(connectionTimeout);
                this.ws = null;
                this.connectionPromise = null;
                if (!this.isTerminated) this.scheduleReconnect();
            });

            ws.on('error', (err: Error) => {
                clearTimeout(connectionTimeout);
                this.ws = null;
                this.connectionPromise = null;
                if (!this.isTerminated) this.scheduleReconnect();
                reject(err);
            });
        });
    }

    private validateWsUrl(): URL {
        const rawUrl = this.wsUrl.trim();
        if (!rawUrl) {
            throw new ExchangeNotAvailable(
                'ChainlinkFeed requires CHAINLINK_WS_URL to stream live oracle data.',
                this.name,
            );
        }

        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            throw new ExchangeNotAvailable(
                'ChainlinkFeed requires CHAINLINK_WS_URL to be a valid WebSocket URL.',
                this.name,
            );
        }

        if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
            throw new ExchangeNotAvailable(
                'ChainlinkFeed requires CHAINLINK_WS_URL to use ws:// or wss://.',
                this.name,
            );
        }

        return url;
    }

    private handleMessage(data: WebSocket.Data): void {
        const text = typeof data === 'string' ? data : data.toString();

        let msg: ChainlinkWsMessage;
        try {
            msg = JSON.parse(text) as ChainlinkWsMessage;
        } catch {
            return;
        }

        if (msg.op !== 'event') return;

        const event = msg as ChainlinkWsEvent;
        const ticker = normalizeWsEventToTicker(event);

        this.latestTickers = new Map(this.latestTickers).set(ticker.symbol, ticker);

        for (const sub of this.subscriptions) {
            if (sub.symbol === ticker.symbol) {
                sub.callback(ticker);
            }
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.isTerminated) {
                this.connect().catch((err: unknown) => {
                    logger.error('[ChainlinkFeed] reconnect failed', { error: err instanceof Error ? err.message : String(err) });
                });
            }
        }, this.reconnectIntervalMs);
    }
}
