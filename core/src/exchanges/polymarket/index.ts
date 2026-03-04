import { createHmac } from 'crypto';
import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams, OHLCVParams, TradesParams, ExchangeCredentials, EventFetchParams, MyTradesParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, UserTrade, Order, Position, Balance, CreateOrderParams } from '../../types';
import { parseOpenApiSpec } from '../../utils/openapi';
import { fetchMarkets } from './fetchMarkets';
import { fetchEvents } from './fetchEvents';
import { mapMarketToUnified } from './utils';
import { fetchOHLCV } from './fetchOHLCV';
import { fetchOrderBook } from './fetchOrderBook';
import { fetchTrades } from './fetchTrades';
import { PolymarketAuth } from './auth';
import { Side, OrderType, AssetType } from '@polymarket/clob-client';
import { PolymarketWebSocket, PolymarketWebSocketConfig } from './websocket';
import { polymarketErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { polymarketClobSpec } from './api-clob';
import { polymarketGammaSpec } from './api-gamma';
import { polymarketDataSpec } from './api-data';

// Re-export for external use
export type { PolymarketWebSocketConfig };

export interface PolymarketExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: PolymarketWebSocketConfig;
}

export class PolymarketExchange extends PredictionMarketExchange {
    override readonly has = {
        fetchMarkets: true as const,
        fetchEvents: true as const,
        fetchOHLCV: true as const,
        fetchOrderBook: true as const,
        fetchTrades: true as const,
        createOrder: true as const,
        cancelOrder: true as const,
        fetchOrder: true as const,
        fetchOpenOrders: true as const,
        fetchPositions: true as const,
        fetchBalance: true as const,
        watchOrderBook: true as const,
        watchTrades: true as const,
        fetchMyTrades: true as const,
        fetchClosedOrders: false as const,
        fetchAllOrders: false as const,
    };

    private auth?: PolymarketAuth;
    private wsConfig?: PolymarketWebSocketConfig;
    private cachedApiCreds?: { key: string; secret: string; passphrase: string };
    private cachedAddress?: string;

    constructor(options?: ExchangeCredentials | PolymarketExchangeOptions) {
        // Support both old signature (credentials only) and new signature (options object)
        let credentials: ExchangeCredentials | undefined;
        let wsConfig: PolymarketWebSocketConfig | undefined;

        if (options && 'credentials' in options) {
            // New signature: PolymarketExchangeOptions
            credentials = options.credentials;
            wsConfig = options.websocket;
        } else {
            // Old signature: ExchangeCredentials directly
            credentials = options as ExchangeCredentials | undefined;
        }

        super(credentials);
        this.rateLimit = 200;
        this.wsConfig = wsConfig;

        // Add browser-mimicking headers to help pass Cloudflare bot detection on the Gamma API.
        // Origin/Referer make requests look like same-site CORS calls from the Polymarket frontend.
        Object.assign(this.http.defaults.headers.common, {
            'Accept': 'application/json, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://polymarket.com',
            'Referer': 'https://polymarket.com/',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
        });

        // Initialize auth if credentials are provided
        if (credentials?.privateKey) {
            this.auth = new PolymarketAuth(credentials);
        }

        // If L2 API creds are provided directly, cache them for sync sign()
        if (credentials?.apiKey && credentials?.apiSecret && credentials?.passphrase) {
            this.cachedApiCreds = {
                key: credentials.apiKey,
                secret: credentials.apiSecret,
                passphrase: credentials.passphrase,
            };
        }

        // Register implicit APIs for all 3 Polymarket services
        const clobDescriptor = parseOpenApiSpec(polymarketClobSpec);
        this.defineImplicitApi(clobDescriptor);

        const gammaDescriptor = parseOpenApiSpec(polymarketGammaSpec);
        this.defineImplicitApi(gammaDescriptor);

        const dataDescriptor = parseOpenApiSpec(polymarketDataSpec);
        this.defineImplicitApi(dataDescriptor);
    }

    get name(): string {
        return 'Polymarket';
    }

    // ----------------------------------------------------------------------------
    // Implicit API Auth & Error Mapping
    // ----------------------------------------------------------------------------

    /**
     * Initialize L2 API credentials for implicit API signing.
     * Must be called before using private implicit API endpoints if only
     * a privateKey was provided (not apiKey/apiSecret/passphrase).
     */
    async initAuth(): Promise<void> {
        const auth = this.ensureAuth();
        const creds = await auth.getApiCredentials();
        this.cachedApiCreds = {
            key: creds.key,
            secret: creds.secret,
            passphrase: creds.passphrase,
        };
        this.cachedAddress = auth.getFunderAddress();
    }

    protected override sign(method: string, path: string, _params: Record<string, any>): Record<string, string> {
        if (!this.cachedApiCreds) {
            throw new AuthenticationError(
                'API credentials not initialized. Either provide apiKey/apiSecret/passphrase ' +
                'in credentials, or call initAuth() before using private implicit API endpoints.',
                'Polymarket'
            );
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const message = timestamp + method.toUpperCase() + path;

        // Decode the base64url secret
        const secretB64 = this.cachedApiCreds.secret
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const secretBuffer = Buffer.from(secretB64, 'base64');

        // HMAC-SHA256 -> base64url
        const hmac = createHmac('sha256', secretBuffer);
        hmac.update(message);
        const signature = hmac.digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');

        return {
            'POLY_ADDRESS': this.cachedAddress || (this.auth ? this.auth.getFunderAddress() : ''),
            'POLY_SIGNATURE': signature,
            'POLY_TIMESTAMP': timestamp,
            'POLY_API_KEY': this.cachedApiCreds.key,
            'POLY_PASSPHRASE': this.cachedApiCreds.passphrase,
        };
    }

    protected override mapImplicitApiError(error: any): any {
        throw polymarketErrorMapper.mapError(error);
    }

    // ----------------------------------------------------------------------------
    // Implementation methods for CCXT-style API
    // ----------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        return fetchMarkets(params, this.http);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        if (params.eventId || params.slug) {
            const queryParams = params.eventId ? { id: params.eventId } : { slug: params.slug };
            const events = await this.callApi('listEvents', queryParams);
            return (events || []).map((event: any) => {
                const markets: UnifiedMarket[] = [];
                if (event.markets && Array.isArray(event.markets)) {
                    for (const market of event.markets) {
                        const unified = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
                        if (unified) markets.push(unified);
                    }
                }
                const unifiedEvent = {
                    id: event.id || event.slug,
                    title: event.title,
                    description: event.description || '',
                    slug: event.slug,
                    markets,
                    volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
                    volume: markets.some(m => m.volume !== undefined) ? markets.reduce((sum, m) => sum + (m.volume ?? 0), 0) : undefined,
                    url: `https://polymarket.com/event/${event.slug}`,
                    image: event.image || `https://polymarket.com/api/og?slug=${event.slug}`,
                    category: event.category || event.tags?.[0]?.label,
                    tags: event.tags?.map((t: any) => t.label) || [],
                } as UnifiedEvent;
                return unifiedEvent;
            });
        }
        return fetchEvents(params, this.http);
    }

    async fetchOHLCV(id: string, params: OHLCVParams): Promise<PriceCandle[]> {
        return fetchOHLCV(id, params, this.callApi.bind(this));
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        return fetchOrderBook(id, this.callApi.bind(this));
    }

    async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        // Deprecation warning (also in base class, but adding here for consistency)
        if ('resolution' in params && params.resolution !== undefined) {
            console.warn(
                '[pmxt] Warning: The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.'
            );
        }
        return fetchTrades(id, params, this.callApi.bind(this));
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    /**
     * Ensure authentication is initialized before trading operations.
     */
    private ensureAuth(): PolymarketAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize PolymarketExchange with credentials: new PolymarketExchange({ privateKey: "0x..." })',
                'Polymarket'
            );
        }
        return this.auth;
    }

    /**
     * Pre-warm the SDK's internal caches for a market outcome.
     *
     * Fetches tick size, fee rate, and neg-risk in parallel so that subsequent
     * `createOrder` calls skip those lookups and hit only `POST /order`.
     * Call this when you start watching a market.
     *
     * @param outcomeId - The CLOB Token ID for the outcome (use `outcome.outcomeId`)
     *
     * @example-ts Pre-warm before placing orders
     * const markets = await exchange.fetchMarkets({ query: 'Trump' });
     * const outcomeId = markets[0].outcomes[0].outcomeId;
     * await exchange.preWarmMarket(outcomeId);
     * // Subsequent createOrder calls are faster
     *
     * @example-python Pre-warm before placing orders
     * markets = exchange.fetch_markets(query='Trump')
     * outcome_id = markets[0].outcomes[0].outcome_id
     * exchange.pre_warm_market(outcome_id)
     * # Subsequent create_order calls are faster
     */
    async preWarmMarket(outcomeId: string): Promise<void> {
        const auth = this.ensureAuth();
        const client = await auth.getClobClient();
        await Promise.all([
            client.getTickSize(outcomeId),
            client.getFeeRateBps(outcomeId),
            client.getNegRisk(outcomeId),
        ]);
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            // Map side to Polymarket enum
            const side = params.side.toUpperCase() === 'BUY' ? Side.BUY : Side.SELL;

            // For limit orders, price is required
            if (params.type === 'limit' && !params.price) {
                throw new Error('Price is required for limit orders');
            }

            // For market orders, use max slippage: 0.99 for BUY (willing to pay up to 99%), 0.01 for SELL (willing to accept down to 1%)
            const price = params.price || (side === Side.BUY ? 0.99 : 0.01);

            // Use provided tickSize, or let the SDK resolve it from its own cache / API
            const tickSize = params.tickSize ? params.tickSize.toString() : undefined;

            const orderArgs: any = {
                tokenID: params.outcomeId,
                price: price,
                side: side,
                size: params.amount,
            };

            if (params.fee !== undefined && params.fee !== null) {
                orderArgs.feeRateBps = params.fee;
            }

            const options: any = {};
            if (tickSize) {
                options.tickSize = tickSize;
            }
            if (params.negRisk !== undefined) {
                options.negRisk = params.negRisk;
            }

            // Build-only mode: create and sign the order without submitting to the network
            if (params.buildOnly) {
                const signedOrder = await client.createOrder(orderArgs, options);
                // Return the signed order data for the user to sign/broadcast themselves
                // The orderHash may be a BigInt or other type, so we convert to string
                const orderHash = signedOrder.orderHash ? String(signedOrder.orderHash) : 'unsigned';
                return {
                    id: orderHash,
                    marketId: params.marketId,
                    outcomeId: params.outcomeId,
                    side: params.side,
                    type: params.type,
                    price: price,
                    amount: params.amount,
                    status: 'pending',
                    filled: 0,
                    remaining: params.amount,
                    fee: params.fee,
                    timestamp: Date.now(),
                };
            }

            const response = await client.createAndPostOrder(orderArgs, options);

            if (!response || !response.success) {
                throw new Error(`${response?.errorMsg || 'Order placement failed'} (Response: ${JSON.stringify(response)})`);
            }

            return {
                id: response.orderID,
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                price: price,
                amount: params.amount,
                status: 'open',
                filled: 0,
                remaining: params.amount,
                fee: params.fee,
                timestamp: Date.now()
            };
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async cancelOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            await client.cancelOrder({ orderID: orderId });

            return {
                id: orderId,
                marketId: 'unknown',
                outcomeId: 'unknown',
                side: 'buy',
                type: 'limit',
                amount: 0,
                status: 'cancelled',
                filled: 0,
                remaining: 0,
                timestamp: Date.now()
            };
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            const order = await client.getOrder(orderId);
            if (!order || !order.id) {
                const errorMsg = (order as any)?.error || 'Order not found (Invalid ID)';
                throw new Error(errorMsg);
            }
            return {
                id: order.id,
                marketId: order.market || 'unknown',
                outcomeId: order.asset_id,
                side: (order.side || '').toLowerCase() as 'buy' | 'sell',
                type: order.order_type === 'GTC' ? 'limit' : 'market',
                price: parseFloat(order.price),
                amount: parseFloat(order.original_size),
                status: (typeof order.status === 'string' ? order.status.toLowerCase() : order.status) as any,
                filled: parseFloat(order.size_matched),
                remaining: parseFloat(order.original_size) - parseFloat(order.size_matched),
                timestamp: order.created_at * 1000
            };
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            const orders = await client.getOpenOrders({
                market: marketId
            });

            return orders.map((o: any) => ({
                id: o.id,
                marketId: o.market || 'unknown',
                outcomeId: o.asset_id,
                side: o.side.toLowerCase() as 'buy' | 'sell',
                type: 'limit',
                price: parseFloat(o.price),
                amount: parseFloat(o.original_size),
                status: 'open',
                filled: parseFloat(o.size_matched),
                remaining: parseFloat(o.size_left || (parseFloat(o.original_size) - parseFloat(o.size_matched))),
                timestamp: o.created_at * 1000
            }));
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const auth = this.ensureAuth();
        const address = await auth.getEffectiveFunderAddress();

        const queryParams: Record<string, any> = { user: address };
        if (params?.marketId) queryParams.market = params.marketId;
        if (params?.limit) queryParams.limit = params.limit;
        if (params?.since) queryParams.start = Math.floor(params.since.getTime() / 1000);
        if (params?.until) queryParams.end = Math.floor(params.until.getTime() / 1000);

        const data = await this.callApi('getTrades', queryParams);
        const trades = Array.isArray(data) ? data : (data.data || []);
        return trades.map((t: any) => ({
            id: t.id || t.transactionHash || String(t.timestamp),
            timestamp: typeof t.timestamp === 'number' ? t.timestamp * 1000 : Date.now(),
            price: parseFloat(t.price || '0'),
            amount: parseFloat(t.size || t.amount || '0'),
            side: t.side === 'BUY' ? 'buy' as const : t.side === 'SELL' ? 'sell' as const : 'unknown' as const,
            orderId: t.orderId,
        }));
    }

    async fetchPositions(): Promise<Position[]> {
        try {
            const auth = this.ensureAuth();
            const address = await auth.getEffectiveFunderAddress();
            const result = await this.callApi('getPositions', { user: address, limit: 100 });
            const data = Array.isArray(result) ? result : [];
            return data.map((p: any) => ({
                marketId: p.conditionId,
                outcomeId: p.asset,
                outcomeLabel: p.outcome || 'Unknown',
                size: parseFloat(p.size),
                entryPrice: parseFloat(p.avgPrice),
                currentPrice: parseFloat(p.curPrice || '0'),
                unrealizedPnL: parseFloat(p.cashPnl || '0'),
                realizedPnL: parseFloat(p.realizedPnl || '0'),
            }));
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    async fetchBalance(): Promise<Balance[]> {
        try {
            const auth = this.ensureAuth();
            const client = await auth.getClobClient();

            // Polymarket relies strictly on USDC (Polygon)
            const USDC_DECIMALS = 6;

            // Try fetching from CLOB client first
            let total = 0;
            try {
                const balRes = await client.getBalanceAllowance({
                    asset_type: AssetType.COLLATERAL
                });
                const rawBalance = parseFloat(balRes.balance);
                total = rawBalance / Math.pow(10, USDC_DECIMALS);
            } catch (clobError) {
                // If CLOB fails or returns 0 (suspiciously), we can try on-chain
                // but let's assume we proceed to on-chain check if total is 0
                // or just do on-chain check always for robustness if possible.
                // For now, let's trust CLOB but add On-Chain fallback if CLOB returns 0.
            }

            // On-Chain Fallback/Check (Robustness)
            // If CLOB reported 0, let's verify on-chain because sometimes CLOB is behind or confused about proxies
            if (total === 0) {
                try {
                    const { ethers } = require('ethers');
                    const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
                    const usdcAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e (Bridged)
                    const usdcAbi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
                    const usdcContract = new ethers.Contract(usdcAddress, usdcAbi, provider);

                    const targetAddress = await auth.getEffectiveFunderAddress();
                    // console.log(`[Polymarket] Checking on-chain balance for ${targetAddress}`);

                    const usdcBal = await usdcContract.balanceOf(targetAddress);
                    const decimals = await usdcContract.decimals();
                    const onChainTotal = parseFloat(ethers.utils.formatUnits(usdcBal, decimals));

                    if (onChainTotal > 0) {
                        // console.log(`[Polymarket] On-Chain balance found: ${onChainTotal} (CLOB reported 0)`);
                        total = onChainTotal;
                    }
                } catch (chainError: any) {
                    // console.warn("[Polymarket] On-chain balance check failed:", chainError.message);
                    // Swallow error and return 0 if both fail
                }
            }

            // 2. Fetch open orders to calculate locked funds
            // We only care about BUY orders for USDC balance locking
            const openOrders = await client.getOpenOrders({});

            let locked = 0;
            if (openOrders && Array.isArray(openOrders)) {
                for (const order of openOrders) {
                    if (order.side === Side.BUY) {
                        const remainingSize = parseFloat(order.original_size) - parseFloat(order.size_matched);
                        const price = parseFloat(order.price);
                        locked += remainingSize * price;
                    }
                }
            }

            return [{
                currency: 'USDC',
                total: total,
                available: total - locked, // Available for new trades
                locked: locked
            }];
        } catch (error: any) {
            throw polymarketErrorMapper.mapError(error);
        }
    }

    // ----------------------------------------------------------------------------
    // WebSocket Methods
    // ----------------------------------------------------------------------------

    private ws?: PolymarketWebSocket;

    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        if (!this.ws) {
            this.ws = new PolymarketWebSocket(this.wsConfig);
        }
        return this.ws.watchOrderBook(id);
    }

    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        if (!this.ws) {
            this.ws = new PolymarketWebSocket(this.wsConfig);
        }
        return this.ws.watchTrades(id);
    }

    async close(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
    }
}
