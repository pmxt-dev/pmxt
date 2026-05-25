import WebSocket from 'ws';
import { logger } from '../../utils/logger';
import { ExchangeNotAvailable, NotSupported } from '../../errors';
import { BaseDataFeed, DataFeedOptions } from '../base-feed';
import { Ticker, Tickers, OHLCV, OrderBook, Market, Dictionary } from '../types';
import { BinanceFeedConfig, BinanceRelayMessage, BinanceRelayTradeEvent, BINANCE_RELAY_DEFAULTS } from './types';
import { normalizeTradeToTicker, symbolToPair } from './normalizer';

// ----------------------------------------------------------------------------
// BinanceFeed — CCXT-compatible interface over the obdata Binance trade relay.
// ----------------------------------------------------------------------------

interface Subscription {
    readonly symbol: string;
    readonly callback: (ticker: Ticker) => void;
}

export class BinanceFeed extends BaseDataFeed {
    readonly name = 'binance';
    readonly description = 'Binance spot trade firehose via obdata relay';
    readonly has = {
        loadMarkets: true,
        fetchTicker: true,
        fetchTickers: true,
        watchTicker: true,
        fetchOHLCV: false,
        fetchOrderBook: false,
    } as const;

    private readonly wsUrl: string;
    private readonly apiKey: string;
    private readonly reconnectIntervalMs: number;

    private ws: WebSocket | null = null;
    private subscriptions: Subscription[] = [];
    private latestTickers = new Map<string, Ticker>();
    private isTerminated = false;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private connectionPromise: Promise<void> | null = null;

    constructor(config: BinanceFeedConfig = {}, options?: DataFeedOptions) {
        super(options);
        this.wsUrl = config.wsUrl ?? process.env.BINANCE_RELAY_WS_URL ?? BINANCE_RELAY_DEFAULTS.wsUrl;
        this.apiKey = config.apiKey ?? process.env.OBDATA_API_KEY ?? '';
        this.reconnectIntervalMs = config.reconnectIntervalMs ?? BINANCE_RELAY_DEFAULTS.reconnectIntervalMs;
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

    // -- CCXT-compatible implementations --

    async loadMarkets(): Promise<Dictionary<Market>> {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
        const markets: Dictionary<Market> = {};
        for (const sym of symbols) {
            const pair = symbolToPair(sym);
            const [base, quote] = pair.split('/');
            markets[pair] = {
                id: sym,
                symbol: pair,
                base,
                quote,
                active: true,
                type: 'spot',
                spot: true,
                margin: false,
                swap: false,
                future: false,
                option: false,
                contract: false,
                precision: { amount: undefined, price: undefined },
                limits: {},
                info: { symbol: sym, streamable: true },
            };
        }
        return markets;
    }

    protected async fetchTickerImpl(symbol: string): Promise<Ticker> {
        const cached = this.latestTickers.get(symbol);
        if (cached) return cached;

        await this.ensureConnected();
        return new Promise<Ticker>((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`BinanceFeed: timed out waiting for trade on ${symbol} (10s)`));
            }, 10_000);

            const cleanup = this.watchTickerImpl(symbol, (ticker) => {
                clearTimeout(timeout);
                cleanup();
                resolve(ticker);
            });
        });
    }

    protected async fetchTickersImpl(symbols?: string[]): Promise<Tickers> {
        await this.ensureConnected();
        const pairs = symbols ?? ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];
        const tickers = await Promise.all(pairs.map((s) => this.fetchTickerImpl(s)));
        const result: Tickers = {};
        for (const ticker of tickers) {
            result[ticker.symbol] = ticker;
        }
        return result;
    }

    protected watchTickerImpl(symbol: string, callback: (ticker: Ticker) => void): () => void {
        const sub: Subscription = { symbol, callback };
        this.subscriptions = [...this.subscriptions, sub];
        this.ensureConnected().catch((err: unknown) => {
            logger.error('[BinanceFeed] initial connect failed in watchTickerImpl', {
                error: err instanceof Error ? err.message : String(err),
            });
        });

        return () => {
            this.subscriptions = this.subscriptions.filter((s) => s !== sub);
        };
    }

    protected async fetchOHLCVImpl(_symbol: string, _timeframe?: string, _since?: number, _limit?: number): Promise<OHLCV[]> {
        throw new NotSupported('BinanceFeed does not support fetchOHLCV via the configured trade relay.', this.name);
    }

    protected async fetchOrderBookImpl(_symbol: string, _limit?: number): Promise<OrderBook> {
        throw new NotSupported('BinanceFeed does not support fetchOrderBook via the configured trade relay.', this.name);
    }

    // -- Internal --

    private async ensureConnected(): Promise<void> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        await this.connect();
    }

    private establishConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            const relayUrl = this.validateRelayWsUrl();
            if (this.apiKey) {
                relayUrl.searchParams.set('key', this.apiKey);
            }

            const ws = new WebSocket(relayUrl.toString());

            const connectionTimeout = setTimeout(() => {
                ws.close();
                this.ws = null;
                this.connectionPromise = null;
                reject(new Error('BinanceFeed: WebSocket connection timed out (30s)'));
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
                if (!this.isTerminated) {
                    this.scheduleReconnect();
                }
            });

            ws.on('error', (err: Error) => {
                clearTimeout(connectionTimeout);
                this.ws = null;
                this.connectionPromise = null;
                if (!this.isTerminated) {
                    this.scheduleReconnect();
                }
                reject(err);
            });
        });
    }

    private handleMessage(data: WebSocket.Data): void {
        const text = typeof data === 'string' ? data : data.toString();

        let msg: BinanceRelayMessage;
        try {
            msg = JSON.parse(text) as BinanceRelayMessage;
        } catch {
            return;
        }

        if (msg.op !== 'event') return;

        const event = msg as BinanceRelayTradeEvent;
        const ticker = normalizeTradeToTicker(event);

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
                    logger.error('[BinanceFeed] reconnect failed', {
                        error: err instanceof Error ? err.message : String(err),
                    });
                });
            }
        }, this.reconnectIntervalMs);
    }

    private validateRelayWsUrl(): URL {
        const rawUrl = this.wsUrl.trim();
        if (!rawUrl) {
            throw new ExchangeNotAvailable(
                'BinanceFeed requires BINANCE_RELAY_WS_URL to fetch live ticker data.',
                this.name,
            );
        }

        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            throw new ExchangeNotAvailable(
                'BinanceFeed requires BINANCE_RELAY_WS_URL to be a valid WebSocket URL.',
                this.name,
            );
        }

        if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
            throw new ExchangeNotAvailable(
                'BinanceFeed requires BINANCE_RELAY_WS_URL to use ws:// or wss://.',
                this.name,
            );
        }

        return url;
    }
}
