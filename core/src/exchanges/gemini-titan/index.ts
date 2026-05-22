import {
    PredictionMarketExchange,
    MarketFilterParams,
    EventFetchParams,
    ExchangeCredentials,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    OrderBook,
    Trade,
    Order,
    Position,
    CreateOrderParams,
    BuiltOrder,
} from '../../types';
import { AuthenticationError } from '../../errors';
import { getGeminiConfig, GeminiApiConfig } from './config';
import { GeminiFetcher } from './fetcher';
import { GeminiNormalizer } from './normalizer';
import { GeminiAuth } from './auth';
import { geminiErrorMapper } from './errors';
import { FetcherContext } from '../interfaces';
import { GeminiWebSocket, GeminiWebSocketConfig } from './websocket';
import { fromOutcomeId, fromMarketId } from './utils';

export interface GeminiTitanExchangeOptions {
    credentials?: ExchangeCredentials;
    sandbox?: boolean;
}

export class GeminiTitanExchange extends PredictionMarketExchange {
    private readonly config: GeminiApiConfig;
    private readonly fetcher: GeminiFetcher;
    private readonly normalizer: GeminiNormalizer;
    private readonly geminiAuth?: GeminiAuth;
    private geminiWs?: GeminiWebSocket;

    constructor(credentials?: ExchangeCredentials | GeminiTitanExchangeOptions) {
        const opts = credentials && 'credentials' in credentials
            ? credentials as GeminiTitanExchangeOptions
            : { credentials: credentials as ExchangeCredentials | undefined };

        super(opts.credentials);
        this.rateLimit = 200;

        const sandbox = 'sandbox' in (opts as any) ? (opts as GeminiTitanExchangeOptions).sandbox : false;
        this.config = getGeminiConfig(opts.credentials?.baseUrl, sandbox);

        // Initialize auth if apiKey + apiSecret provided (needed for trading)
        if (opts.credentials?.apiKey && opts.credentials?.apiSecret) {
            this.geminiAuth = new GeminiAuth(opts.credentials);
        }

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => ({}),
        };

        this.fetcher = new GeminiFetcher(ctx, this.config.baseUrl, this.geminiAuth);
        this.normalizer = new GeminiNormalizer();
    }

    get name(): string {
        return 'GeminiTitan';
    }

    // -------------------------------------------------------------------------
    // Auth helpers
    // -------------------------------------------------------------------------

    private requireAuth(): GeminiAuth {
        if (!this.geminiAuth) {
            throw new AuthenticationError(
                'This operation requires authentication. ' +
                'Initialize GeminiTitanExchange with credentials including apiKey and apiSecret.',
                'GeminiTitan',
            );
        }
        return this.geminiAuth;
    }

    // -------------------------------------------------------------------------
    // Market Data
    // -------------------------------------------------------------------------

    protected async fetchMarketsImpl(
        params?: MarketFilterParams,
    ): Promise<UnifiedMarket[]> {
        const rawEvents = await this.fetcher.fetchRawMarkets(params);
        const markets: UnifiedMarket[] = [];
        for (const event of rawEvents) {
            const eventMarkets = this.normalizer.normalizeMarketsFromEvent(event);
            markets.push(...eventMarkets);
        }
        return markets;
    }

    protected async fetchEventsImpl(
        params: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        const rawEvents = await this.fetcher.fetchRawEvents(params);
        return rawEvents
            .map(e => this.normalizer.normalizeEventWithMarkets(e))
            .filter((e): e is UnifiedEvent => e !== null);
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const { instrumentSymbol } = fromOutcomeId(outcomeId);
        const raw = await this.fetcher.fetchRawOrderBook(instrumentSymbol);
        if (!raw) {
            return { bids: [], asks: [], timestamp: Date.now() };
        }
        return this.normalizer.normalizeOrderBook(raw, outcomeId);
    }

    // -------------------------------------------------------------------------
    // Trading
    // -------------------------------------------------------------------------

    async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        this.requireAuth();
        const { instrumentSymbol, side } = fromOutcomeId(params.outcomeId);

        const payload: Record<string, unknown> = {
            symbol: instrumentSymbol,
            orderType: 'limit',
            side: params.side,
            quantity: String(params.amount),
            price: params.price !== undefined ? params.price.toFixed(2) : '0.50',
            outcome: side,
            timeInForce: params.type === 'market' ? 'immediate-or-cancel' : 'good-til-cancel',
        };

        return {
            exchange: this.name,
            params,
            raw: payload,
        };
    }

    async submitOrder(built: BuiltOrder): Promise<Order> {
        this.requireAuth();
        const payload = built.raw as Record<string, unknown>;

        try {
            const rawOrder = await this.fetcher.submitRawOrder(payload);
            return this.normalizer.normalizeOrder(rawOrder);
        } catch (error: any) {
            throw geminiErrorMapper.mapError(error);
        }
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const built = await this.buildOrder(params);
        return this.submitOrder(built);
    }

    async cancelOrder(orderId: string): Promise<Order> {
        this.requireAuth();

        try {
            await this.fetcher.cancelRawOrder(parseInt(orderId, 10));
            return {
                id: orderId,
                marketId: '',
                outcomeId: '',
                side: 'buy',
                type: 'limit',
                amount: 0,
                status: 'cancelled',
                filled: 0,
                remaining: 0,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw geminiErrorMapper.mapError(error);
        }
    }

    // -------------------------------------------------------------------------
    // User Data
    // -------------------------------------------------------------------------

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        this.requireAuth();
        const symbol = marketId ? fromMarketId(marketId) : undefined;
        const raw = await this.fetcher.fetchRawActiveOrders(symbol);
        return raw.map(o => this.normalizer.normalizeOrder(o));
    }

    async fetchClosedOrders(): Promise<Order[]> {
        this.requireAuth();
        const raw = await this.fetcher.fetchRawOrderHistory();
        return raw.map(o => this.normalizer.normalizeOrder(o));
    }

    async fetchAllOrders(): Promise<Order[]> {
        this.requireAuth();
        const [open, closed] = await Promise.all([
            this.fetchOpenOrders(),
            this.fetchClosedOrders(),
        ]);
        return [...open, ...closed].sort((a, b) => b.timestamp - a.timestamp);
    }

    async fetchPositions(): Promise<Position[]> {
        this.requireAuth();
        const raw = await this.fetcher.fetchRawPositions();
        return raw.map(p => this.normalizer.normalizePosition(p));
    }

    // -------------------------------------------------------------------------
    // WebSocket
    // -------------------------------------------------------------------------

    private ensureWebSocket(): GeminiWebSocket {
        if (!this.geminiWs) {
            this.geminiWs = new GeminiWebSocket(this.geminiAuth, {
                wsUrl: this.config.wsUrl,
            });
        }
        return this.geminiWs;
    }

    async watchOrderBook(outcomeId: string, _limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        const { instrumentSymbol } = fromOutcomeId(outcomeId);
        return this.ensureWebSocket().watchOrderBook(instrumentSymbol);
    }

    async watchTrades(outcomeId: string): Promise<Trade[]> {
        const { instrumentSymbol } = fromOutcomeId(outcomeId);
        return this.ensureWebSocket().watchTrades(instrumentSymbol);
    }

    async close(): Promise<void> {
        if (this.geminiWs) {
            await this.geminiWs.close();
            this.geminiWs = undefined;
        }
    }
}
