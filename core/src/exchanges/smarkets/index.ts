import {
    PredictionMarketExchange,
    MarketFilterParams,
    HistoryFilterParams,
    TradesParams,
    ExchangeCredentials,
    EventFetchParams,
    MyTradesParams,
    OrderHistoryParams,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    OrderBook,
    Trade,
    UserTrade,
    Balance,
    Order,
    Position,
    CreateOrderParams,
    BuiltOrder,
} from '../../types';
import { SmarketsAuth } from './auth';
import { smarketsErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { parseOpenApiSpec } from '../../utils/openapi';
import { smarketsApiSpec } from './api';
import { getSmarketsConfig, SmarketsApiConfig } from './config';
import { SmarketsFetcher } from './fetcher';
import { SmarketsNormalizer } from './normalizer';
import { FetcherContext } from '../interfaces';
import { toBasisPoints, toQuantityUnits } from './price';

export class SmarketsExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchPositions: 'emulated' as const,
    };

    private auth?: SmarketsAuth;
    private loginPromise: Promise<void> | null = null;
    private readonly config: SmarketsApiConfig;
    private readonly fetcher: SmarketsFetcher;
    private readonly normalizer: SmarketsNormalizer;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);
        this.rateLimit = 100;
        this.config = getSmarketsConfig(credentials?.baseUrl);

        // Smarkets API expects repeated keys for arrays (e.g. state=new&state=live)
        // rather than the axios default bracket format (state[]=new&state[]=live)
        this.http.defaults.paramsSerializer = (params: Record<string, any>) => {
            const parts: string[] = [];
            for (const [key, value] of Object.entries(params)) {
                if (value === undefined || value === null) continue;
                if (Array.isArray(value)) {
                    for (const item of value) {
                        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
                    }
                } else {
                    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
                }
            }
            return parts.join('&');
        };

        if (credentials?.apiKey && credentials?.privateKey) {
            this.auth = new SmarketsAuth(credentials);
        }

        const descriptor = parseOpenApiSpec(
            smarketsApiSpec,
            this.config.apiUrl,
        );
        this.defineImplicitApi(descriptor);

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => this.auth?.getHeaders('', '') ?? {},
        };

        this.fetcher = new SmarketsFetcher(ctx, this.config.apiUrl);
        this.normalizer = new SmarketsNormalizer();
    }

    get name(): string {
        return 'Smarkets';
    }

    // -------------------------------------------------------------------------
    // Session Management
    // -------------------------------------------------------------------------

    private async ensureSession(): Promise<void> {
        const auth = this.requireAuth();

        if (auth.isAuthenticated()) {
            return;
        }

        // Deduplicate concurrent login attempts
        if (this.loginPromise) {
            return this.loginPromise;
        }

        this.loginPromise = this.performLogin(auth);
        try {
            await this.loginPromise;
        } finally {
            this.loginPromise = null;
        }
    }

    private async performLogin(auth: SmarketsAuth): Promise<void> {
        const response = await this.http.post(
            `${this.config.apiUrl}/v3/sessions/`,
            {
                username: auth.getUsername(),
                password: auth.getPassword(),
            },
            { headers: { 'Content-Type': 'application/json' } },
        );

        const data = response.data;

        if (data.factor && data.factor !== 'complete') {
            throw new AuthenticationError(
                `Smarkets requires additional authentication factor: ${data.factor}. ` +
                'MFA (TOTP/NemID) is not yet supported by pmxt.',
                'Smarkets',
            );
        }

        if (!data.token) {
            throw new AuthenticationError(
                'Smarkets login succeeded but no session token was returned.',
                'Smarkets',
            );
        }

        auth.setToken(data.token, data.stop || '');
    }

    // -------------------------------------------------------------------------
    // Implicit API Auth & Error Mapping
    // -------------------------------------------------------------------------

    protected override sign(
        _method: string,
        _path: string,
        _params: Record<string, any>,
    ): Record<string, string> {
        const auth = this.requireAuth();
        return auth.getHeaders(_method, _path);
    }

    protected override mapImplicitApiError(error: any): any {
        throw smarketsErrorMapper.mapError(error);
    }

    private requireAuth(): SmarketsAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'This operation requires authentication. ' +
                'Initialize SmarketsExchange with credentials (apiKey and privateKey).',
                'Smarkets',
            );
        }
        return this.auth;
    }

    // -------------------------------------------------------------------------
    // Market Data (fetcher -> normalizer)
    // -------------------------------------------------------------------------

    protected async fetchMarketsImpl(
        params?: MarketFilterParams,
    ): Promise<UnifiedMarket[]> {
        const rawEvents = await this.fetcher.fetchRawMarkets(params);

        const allMarkets: UnifiedMarket[] = [];
        for (const event of rawEvents) {
            const markets = this.normalizer.normalizeMarketsFromEvent(event);
            allMarkets.push(...markets);
        }

        // Query-based search (client-side filtering)
        if (params?.query) {
            const lowerQuery = params.query.toLowerCase();
            const searchIn = params?.searchIn || 'title';
            const filtered = allMarkets.filter((market) => {
                const titleMatch = (market.title || '').toLowerCase().includes(lowerQuery);
                const descMatch = (market.description || '').toLowerCase().includes(lowerQuery);
                if (searchIn === 'title') return titleMatch;
                if (searchIn === 'description') return descMatch;
                return titleMatch || descMatch;
            });
            return filtered.slice(0, params?.limit || 250000);
        }

        // Client-side sort
        if (params?.sort === 'volume') {
            allMarkets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (params?.sort === 'liquidity') {
            allMarkets.sort((a, b) => b.liquidity - a.liquidity);
        }

        const offset = params?.offset || 0;
        const limit = params?.limit || 250000;
        return allMarkets.slice(offset, offset + limit);
    }

    protected async fetchEventsImpl(
        params: EventFetchParams,
    ): Promise<UnifiedEvent[]> {
        const rawEvents = await this.fetcher.fetchRawEvents(params);
        const limit = params?.limit || 250000;
        const query = (params?.query || '').toLowerCase();

        const filtered = query
            ? rawEvents.filter((event) => (event.event.name || '').toLowerCase().includes(query))
            : rawEvents;

        return filtered
            .map((raw) => this.normalizer.normalizeEvent(raw))
            .filter((e): e is UnifiedEvent => e !== null)
            .slice(0, limit);
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const raw = await this.fetcher.fetchRawOrderBook(outcomeId);
        return this.normalizer.normalizeOrderBook(raw, outcomeId);
    }

    async fetchTrades(
        outcomeId: string,
        params: TradesParams | HistoryFilterParams,
    ): Promise<Trade[]> {
        if ('resolution' in params && params.resolution !== undefined) {
            console.warn(
                '[pmxt] Warning: The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.',
            );
        }
        const rawActivity = await this.fetcher.fetchRawTradeActivity(outcomeId, params);
        return rawActivity.map((raw, i) => this.normalizer.normalizeActivityTrade(raw, i));
    }

    // -------------------------------------------------------------------------
    // User Data (fetcher -> normalizer)
    // -------------------------------------------------------------------------

    async fetchBalance(): Promise<Balance[]> {
        await this.ensureSession();
        const raw = await this.fetcher.fetchRawBalance();
        return this.normalizer.normalizeBalance(raw);
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        await this.ensureSession();
        const rawActivity = await this.fetcher.fetchRawMyTradeActivity(params || {});
        return rawActivity.map((raw, i) => this.normalizer.normalizeActivityUserTrade(raw, i));
    }

    async fetchPositions(): Promise<Position[]> {
        await this.ensureSession();
        const rawPositions = await this.fetcher.fetchRawPositions();
        return rawPositions.map((raw) => this.normalizer.normalizePosition(raw));
    }

    async fetchClosedOrders(params?: OrderHistoryParams): Promise<Order[]> {
        await this.ensureSession();
        const rawOrders = await this.fetcher.fetchRawClosedOrders(params || {});
        return rawOrders.map((o) => this.normalizer.normalizeOrder(o));
    }

    async fetchAllOrders(params?: OrderHistoryParams): Promise<Order[]> {
        await this.ensureSession();
        const [openOrders, closedOrders] = await Promise.all([
            this.fetcher.fetchRawOrders({}),
            this.fetcher.fetchRawClosedOrders(params || {}),
        ]);

        const seen = new Set<string>();
        const all: Order[] = [];
        for (const o of [...openOrders, ...closedOrders]) {
            const id = String(o.id || o.order_id);
            if (!seen.has(id)) {
                seen.add(id);
                all.push(this.normalizer.normalizeOrder(o));
            }
        }
        return all.sort((a, b) => b.timestamp - a.timestamp);
    }

    // -------------------------------------------------------------------------
    // Trading
    // -------------------------------------------------------------------------

    async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        const smarketsType = params.type === 'market'
            ? 'immediate_or_cancel'
            : 'good_til_halted';

        const body: Record<string, any> = {
            market_id: params.marketId,
            contract_id: params.outcomeId,
            side: params.side === 'buy' ? 'buy' : 'sell',
            quantity: toQuantityUnits(params.amount),
            type: smarketsType,
        };

        if (params.price !== undefined) {
            body.price = toBasisPoints(params.price);
        }

        return { exchange: this.name, params, raw: body };
    }

    async submitOrder(built: BuiltOrder): Promise<Order> {
        await this.ensureSession();
        const data = await this.callApi('create_order', built.raw as Record<string, any>);
        return this.normalizer.normalizeCreateOrderResponse(data);
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const built = await this.buildOrder(params);
        return this.submitOrder(built);
    }

    async cancelOrder(orderId: string): Promise<Order> {
        await this.ensureSession();
        await this.callApi('cancel_order', { order_id: orderId });
        // cancel_order returns empty {} on success; fetch the order to get its state
        return this.fetchOrder(orderId);
    }

    async fetchOrder(orderId: string): Promise<Order> {
        await this.ensureSession();
        const data = await this.fetcher.fetchRawOrderById(orderId);
        return this.normalizer.normalizeOrder(data);
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        await this.ensureSession();
        const queryParams: Record<string, any> = {
            state: ['created', 'partial'],
        };
        if (marketId) queryParams.market_id = [marketId];
        const rawOrders = await this.fetcher.fetchRawOrders(queryParams);
        return rawOrders.map((o) => this.normalizer.normalizeOrder(o));
    }

    async close(): Promise<void> {
        // No WebSocket or persistent connections to clean up
    }
}
