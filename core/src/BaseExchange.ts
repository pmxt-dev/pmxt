import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { EventNotFound, MarketNotFound } from './errors';
import { SubscribedAddressSnapshot, SubscriptionOption } from './subscriber/base';
import {
    Balance,
    BuiltOrder,
    CandleInterval,
    CreateOrderParams,
    Order,
    OrderBook,
    Position,
    PriceCandle,
    Trade,
    UnifiedEvent,
    UnifiedMarket,
    UnifiedSeries,
    UserTrade,
} from './types';
import { ExecutionPriceResult, getExecutionPrice, getExecutionPriceDetailed } from './utils/math';
import { logger } from './utils/logger';
import { Throttler } from './utils/throttler';
import type {
    FetchMarketMatchesParams,
    FetchMatchesParams,
    FetchEventMatchesParams,
    FetchArbitrageParams,
    FetchMatchedMarketsParams,
    FetchMatchedPricesParams,
    MatchResult,
    EventMatchResult,
    PriceComparison,
    ArbitrageOpportunity,
    MatchedMarketPair,
    MatchedPricePair,
} from './router/types';

// ----------------------------------------------------------------------------
// Implicit API Types (OpenAPI-driven method generation)
// ----------------------------------------------------------------------------

export interface ApiEndpoint {
    /** HTTP verb for the endpoint (e.g. GET, POST). */
    method: string;
    /** URL path template, relative to the descriptor's baseUrl. */
    path: string;
    /** Whether this endpoint requires authenticated credentials. */
    isPrivate?: boolean;
    /** Identifier used to generate the implicit API method name. */
    operationId?: string;
    /**
     * When set, requests use this base URL instead of the descriptor default
     * (OpenAPI path- or operation-level `servers` override).
     */
    baseUrl?: string;
}

export interface ApiDescriptor {
    /** Base URL that all endpoint paths are resolved against. */
    baseUrl: string;
    /** Map of endpoint key to endpoint definition used by the implicit API machinery. */
    endpoints: Record<string, ApiEndpoint>;
}

export interface ImplicitApiMethodInfo {
    /** Generated method name exposed on the exchange instance. */
    name: string;
    /** HTTP verb for the underlying endpoint. */
    method: string;
    /** URL path template for the underlying endpoint. */
    path: string;
    /** Whether the underlying endpoint requires authenticated credentials. */
    isPrivate: boolean;
}

export interface MarketFilterParams {
    /** Maximum number of results to return */
    limit?: number;
    /** Pagination offset — number of results to skip */
    offset?: number;
    /** Sort order for results */
    sort?: 'volume' | 'liquidity' | 'newest';
    status?: 'active' | 'inactive' | 'closed' | 'all'; // Filter by market status (default: 'active', 'inactive' and 'closed' are interchangeable)
    searchIn?: 'title' | 'description' | 'both'; // Where to search (default: 'title')
    query?: string;  // For keyword search
    slug?: string;   // For slug/ticker lookup
    marketId?: string;    // Direct lookup by market ID
    outcomeId?: string;   // Reverse lookup -- find market containing this outcome
    eventId?: string;     // Find markets belonging to an event
    page?: number;   // For pagination (used by Limitless)
    similarityThreshold?: number; // For semantic search (used by Limitless)
    /** Filter by source venue (e.g. 'polymarket', 'kalshi', 'myriad'). `exchange` is an alias. */
    sourceExchange?: string;
    /** Alias for `sourceExchange`. */
    exchange?: string;
}

export interface MarketFetchParams extends MarketFilterParams {
    /** Optional client-side filter applied after fetching */
    filter?: MarketFilterCriteria;
    /** Filter by category. Each market belongs to a venue-assigned category such as "Sports", "Politics", "Crypto", "Bitcoin", "Soccer", "Economic Policy" (Polymarket) or "Sports", "Mentions" (Kalshi). */
    category?: string;
    /** Filter by tags. Returns markets matching ANY of the provided tags. Tags are more specific than categories -- for example a "Sports" market might carry tags ["Sports", "FIFA World Cup", "2026 FIFA World Cup"]. Common tags include "Crypto", "Politics", "Elections", "Geopolitics", "Fed Rates", "Trump". */
    tags?: string[];
}

export interface EventFetchParams {
    query?: string;  // For keyword search
    /** Maximum number of results to return */
    limit?: number;
    /** Opaque venue pagination cursor, where supported. */
    cursor?: string;
    /** Pagination offset — number of results to skip */
    offset?: number;
    /** Sort order for results */
    sort?: 'volume' | 'liquidity' | 'newest';
    status?: 'active' | 'inactive' | 'closed' | 'all'; // Filter by event status (default: 'active', 'inactive' and 'closed' are interchangeable)
    /** Where to search (default: 'title') */
    searchIn?: 'title' | 'description' | 'both';
    eventId?: string;    // Direct lookup by event ID
    slug?: string;       // Lookup by event slug
    /** Filter events by their parent series. Accepts the venue-native series id / ticker / slug (e.g. Kalshi `"KXATPMATCH"`, Polymarket `"wta"`). Passed through to the vendor where supported, otherwise applied to `sourceMetadata` after fetch. */
    series?: string;
    /** Optional client-side filter applied after fetching */
    filter?: EventFilterCriteria;
    /** Filter by category. Each event belongs to a venue-assigned category such as "Sports", "Politics", "Crypto", "Bitcoin", "Soccer", "Economic Policy" (Polymarket) or "Sports", "Mentions" (Kalshi). */
    category?: string;
    /** Filter by tags. Returns events matching ANY of the provided tags. Tags are more specific than categories -- for example a "Politics" event might carry tags ["Politics", "Geopolitics", "Middle East", "Iran"]. Common tags include "Crypto", "Elections", "Fed Rates", "FIFA World Cup", "Trump". */
    tags?: string[];
    /** Filter by source venue (e.g. 'polymarket', 'kalshi', 'myriad'). `exchange` is an alias. */
    sourceExchange?: string;
    /** Alias for `sourceExchange`. */
    exchange?: string;
}

/**
 * Parameters for `fetchSeries`. Venues that don't expose a series concept
 * return an empty array regardless of the filters.
 */
export interface SeriesFetchParams {
    /** Direct lookup by venue-native series id (e.g. "KXATPMATCH" on Kalshi, "atp" or "1" on Polymarket Gamma). When set, the result is the matching series with its events populated where the venue supports it. */
    id?: string;
    /** Lookup by series slug (e.g. "wta", "nfl"). */
    slug?: string;
    /** Keyword search across series title / description. */
    query?: string;
    /** Filter by recurrence cadence ('daily', 'weekly', 'annual', ...). */
    recurrence?: string;
    /** Maximum number of results to return. */
    limit?: number;
    /** Pagination offset. */
    offset?: number;
}

/**
 * Deprecated - use OHLCVParams or TradesParams instead. Resolution is optional for backward compatibility.
 */
export interface HistoryFilterParams {
    resolution?: CandleInterval; // Optional for backward compatibility
    /** Start of the time range */
    start?: Date;
    /** End of the time range */
    end?: Date;
    /** Maximum number of results to return */
    limit?: number;
}

export interface OHLCVParams {
    resolution: CandleInterval; // Required for candle aggregation
    /** Start of the time range */
    start?: Date;
    /** End of the time range */
    end?: Date;
    /** Maximum number of results to return */
    limit?: number;
}

/**
 * Parameters for fetching trade history. No resolution parameter - trades are discrete events.
 */
/** Maximum allowed value for `TradesParams.limit`. */
export const MAX_TRADES_LIMIT = 1000;

export interface TradesParams {
    // No resolution - trades are discrete events, not aggregated
    /** Start of the time range */
    start?: Date;
    /** End of the time range */
    end?: Date;
    /** Maximum number of results to return (max {@link MAX_TRADES_LIMIT}) */
    limit?: number;
}

export interface MyTradesParams {
    outcomeId?: string;  // filter to specific outcome/ticker
    marketId?: string;   // filter to specific market
    /** Only return records after this date */
    since?: Date;
    /** Only return records before this date */
    until?: Date;
    /** Maximum number of results to return */
    limit?: number;
    cursor?: string;     // for Kalshi cursor pagination
}

export interface FetchOrderBookParams {
    /** Outcome side: 'yes' or 'no'. Required for exchanges like Limitless
     *  where the API returns a single orderbook per market. */
    side?: 'yes' | 'no';
    /** Outcome alias: 'yes' or 'no', or an outcome token ID. When set,
     *  the first argument is treated as a market ID and this value selects
     *  which outcome's order book to fetch. Accepts the literal strings
     *  'yes'/'no' (resolved via a market lookup) or a raw outcome token ID. */
    outcome?: string;
    /** Unix timestamp (ms) — fetch a historical snapshot at or before this
     *  time, or the start of a range when combined with `until` (hosted API only). */
    since?: number;
    /** Unix timestamp (ms) — end of a historical range. When combined with
     *  `since`, returns an array of reconstructed L2 OrderBook snapshots
     *  between `since` and `until` (hosted API only). */
    until?: number;
}

export interface OrderHistoryParams {
    marketId?: string;   // required for Limitless (slug)
    /** Only return records after this date */
    since?: Date;
    /** Only return records before this date */
    until?: Date;
    /** Maximum number of results to return */
    limit?: number;
    /** Opaque pagination cursor from a previous response */
    cursor?: string;
}

// ----------------------------------------------------------------------------
// Filtering Types
// ----------------------------------------------------------------------------

export interface MarketFilterCriteria {
    // Text search
    text?: string;
    searchIn?: ('title' | 'description' | 'category' | 'tags' | 'outcomes')[]; // Default: ['title']

    // Numeric range filters
    volume24h?: { min?: number; max?: number };
    /** Filter by total (lifetime) volume range */
    volume?: { min?: number; max?: number };
    /** Filter by current liquidity range */
    liquidity?: { min?: number; max?: number };
    /** Filter by open interest range */
    openInterest?: { min?: number; max?: number };

    // Date filters
    resolutionDate?: {
        before?: Date;
        after?: Date;
    };

    // Category/tag filters
    /** Filter by category. Common values: "Sports", "Politics", "Crypto", "Bitcoin", "Soccer", "Economic Policy" (Polymarket) or "Sports", "Mentions" (Kalshi). */
    category?: string;
    /** Match markets that have ANY of these tags. Examples: ["Crypto", "Crypto Prices"], ["Politics", "Elections"], ["Sports", "FIFA World Cup"]. */
    tags?: string[];

    // Price filters (for binary markets)
    price?: {
        outcome: 'yes' | 'no' | 'up' | 'down';
        min?: number; // 0.0 to 1.0
        max?: number;
    };

    // Price change filters
    priceChange24h?: {
        outcome: 'yes' | 'no' | 'up' | 'down';
        min?: number; // e.g., -0.1 for 10% drop
        max?: number;
    };
}

export type MarketFilterFunction = (market: UnifiedMarket) => boolean;

export interface EventFilterCriteria {
    // Text search
    text?: string;
    searchIn?: ('title' | 'description' | 'category' | 'tags')[]; // Default: ['title']

    // Category/tag filters
    /** Filter by category. Common values: "Sports", "Politics", "Crypto", "Bitcoin", "Soccer", "Economic Policy" (Polymarket) or "Sports", "Mentions" (Kalshi). */
    category?: string;
    /** Match events that have ANY of these tags. Examples: ["Crypto"], ["Politics", "Geopolitics", "Middle East"], ["Sports", "FIFA World Cup"]. */
    tags?: string[];

    // Filter by contained markets
    marketCount?: { min?: number; max?: number };
    totalVolume?: { min?: number; max?: number }; // Sum of market volumes
}

export type EventFilterFunction = (event: UnifiedEvent) => boolean;

// ----------------------------------------------------------------------------
// Capability Map (ccxt-style exchange.has)
// ----------------------------------------------------------------------------

export type ExchangeCapability = true | false | 'emulated';

export interface ExchangeHas {
    /** Whether this exchange supports fetching markets. */
    fetchMarkets: ExchangeCapability;
    /** Whether this exchange supports fetching events. */
    fetchEvents: ExchangeCapability;
    /** Whether this exchange exposes a recurring-series concept (Series -> Event -> Market -> Outcome). Venues without one return `false` and an empty array from `fetchSeries`. */
    fetchSeries: ExchangeCapability;
    /** Whether this exchange supports fetching OHLCV candles. */
    fetchOHLCV: ExchangeCapability;
    /** Whether this exchange supports fetching the order book. */
    fetchOrderBook: ExchangeCapability;
    /** Whether this exchange supports fetching multiple market order books. */
    fetchOrderBooks: ExchangeCapability;
    /** Whether this exchange supports fetching public trades. */
    fetchTrades: ExchangeCapability;
    /** Whether this exchange supports creating orders. */
    createOrder: ExchangeCapability;
    /** Whether this exchange supports cancelling orders. */
    cancelOrder: ExchangeCapability;
    /** Whether this exchange supports fetching a single order by id. */
    fetchOrder: ExchangeCapability;
    /** Whether this exchange supports fetching open orders. */
    fetchOpenOrders: ExchangeCapability;
    /** Whether this exchange supports fetching account positions. */
    fetchPositions: ExchangeCapability;
    /** Whether this exchange supports fetching account balances. */
    fetchBalance: ExchangeCapability;
    /** Whether this exchange supports subscribing to an on-chain address for updates. */
    watchAddress: ExchangeCapability;
    /** Whether this exchange supports unsubscribing from a watched address. */
    unwatchAddress: ExchangeCapability;
    /** Whether this exchange supports streaming order book updates. */
    watchOrderBook: ExchangeCapability;
    /** Whether this exchange supports batch-subscribing to multiple order book streams. */
    watchOrderBooks: ExchangeCapability;
    /** Whether this exchange supports unsubscribing from an order book stream. */
    unwatchOrderBook: ExchangeCapability;
    /** Whether this exchange supports streaming trade updates. */
    watchTrades: ExchangeCapability;
    /** Whether this exchange supports fetching the authenticated user's trade history. */
    fetchMyTrades: ExchangeCapability;
    /** Whether this exchange supports fetching closed orders. */
    fetchClosedOrders: ExchangeCapability;
    /** Whether this exchange supports fetching all orders (open and closed). */
    fetchAllOrders: ExchangeCapability;
    /** Whether this exchange supports building a signed order without submitting it. */
    buildOrder: ExchangeCapability;
    /** Whether this exchange supports submitting a pre-built order. */
    submitOrder: ExchangeCapability;
    /** Whether this exchange supports fetching cross-venue market matches. */
    fetchMarketMatches: ExchangeCapability;
    /** @deprecated Use {@link fetchMarketMatches} instead. */
    fetchMatches: ExchangeCapability;
    /** Whether this exchange supports fetching cross-venue event matches. */
    fetchEventMatches: ExchangeCapability;
    /** Whether this exchange supports comparing prices across venues. */
    compareMarketPrices: ExchangeCapability;
    /** Whether this exchange supports finding related markets across venues. */
    fetchRelatedMarkets: ExchangeCapability;
    /** Whether this exchange supports fetching matched markets across venues. */
    fetchMatchedMarkets: ExchangeCapability;
    /** @deprecated Use {@link fetchMatchedMarkets} instead. */
    fetchMatchedPrices: ExchangeCapability;
    /** @deprecated Use {@link fetchRelatedMarkets} instead. */
    fetchHedges: ExchangeCapability;
    /** @deprecated Use {@link fetchMatchedMarkets} instead. */
    fetchArbitrage: ExchangeCapability;
}

/**
 * Optional authentication credentials for exchange operations.
 */
export interface ExchangeCredentials {
    // Standard API authentication (Kalshi, etc.)
    apiKey?: string;
    /** Standard API secret for HMAC-authenticated exchanges */
    apiSecret?: string;
    /** Standard API passphrase for HMAC-authenticated exchanges */
    passphrase?: string;
    /** Metaculus: `Authorization: Token <apiToken>` for higher rate limits */
    apiToken?: string;

    // Blockchain-based authentication (Polymarket)
    privateKey?: string;  // Required for Polymarket L1 auth

    // Polymarket-specific L2 fields
    signatureType?: number | string;  // 0 = EOA, 1 = Poly Proxy, 2 = Gnosis Safe (Can also use 'eoa', 'polyproxy', 'gnosis_safe')
    funderAddress?: string;  // The address funding the trades (defaults to signer address)

    // Limitless: wallet address for delegated signing profile lookup
    walletAddress?: string;

    // Optional base URL override for venue API (e.g., proxy for geo-restricted venues)
    baseUrl?: string;
}

export interface ExchangeOptions {
    /**
     * How long (ms) a market snapshot created by `fetchMarketsPaginated` remains valid
     * before being discarded and re-fetched from the API on the next call.
     * Defaults to 0 (no TTL — the snapshot is re-fetched on every initial call).
     */
    snapshotTTL?: number;
}

/** Shape returned by fetchMarketsPaginated */
export interface PaginatedMarketsResult {
    /** The page of unified markets */
    data: UnifiedMarket[];
    /** Total number of markets in the snapshot */
    total: number;
    /** Cursor to pass to the next call, or undefined if this is the last page */
    nextCursor?: string;
}

/** Shape returned by fetchEventsPaginated */
export interface PaginatedEventsResult {
    /** The page of unified events */
    data: UnifiedEvent[];
    /** Total number of events in the snapshot */
    total: number;
    /** Cursor to pass to the next call, or undefined if this is the last page */
    nextCursor?: string;
}

// ----------------------------------------------------------------------------
// Base Exchange Class
// ----------------------------------------------------------------------------

export abstract class PredictionMarketExchange {
    [key: string]: any; // Allow dynamic method assignment for implicit API

    public verbose: boolean = false;
    public http: AxiosInstance;
    public enableRateLimit: boolean = true;
    // Market Cache
    public markets: Record<string, UnifiedMarket> = {};
    public marketsBySlug: Record<string, UnifiedMarket> = {};
    public loadedMarkets: boolean = false;
    /**
     * Capability map derived automatically from method overrides at runtime.
     * Exchanges do NOT need to declare this manually -- if a subclass overrides
     * a method (and the override does not throw "not supported"), it is `true`.
     * To mark a capability as `'emulated'`, add its key to `emulatedCapabilities`.
     */
    get has(): ExchangeHas {
        if (!this._has) {
            this._has = this._deriveCapabilities();
        }
        return this._has;
    }
    private _has?: ExchangeHas;

    /**
     * Override in subclasses to force specific capability values.
     * Use `'emulated'` for methods backed by a non-native mechanism,
     * or `false` for methods that override the base only to throw a
     * better error message (e.g. "pari-mutuel bets cannot be cancelled").
     */
    protected readonly capabilityOverrides: Partial<Record<keyof ExchangeHas, ExchangeCapability>> = {};

    protected credentials?: ExchangeCredentials;
    // Implicit API (merged across multiple defineImplicitApi calls)
    protected apiDescriptor?: ApiDescriptor;
    private _throttler: Throttler;
    // Snapshot state for cursor-based pagination
    private _snapshotTTL: number;
    private _snapshot?: { markets: UnifiedMarket[]; takenAt: number; id: string };
    private _eventSnapshot?: { events: UnifiedEvent[]; takenAt: number; id: string };
    private apiDescriptors: ApiDescriptor[] = [];

    constructor(credentials?: ExchangeCredentials, options?: ExchangeOptions) {
        this.credentials = credentials;
        this._snapshotTTL = options?.snapshotTTL ?? 0;
        this.http = axios.create({
            headers: {
                'User-Agent': `pmxt (https://github.com/pmxt-dev/pmxt)`
            },
            paramsSerializer: {
                serialize: (params) => {
                    const sp = new URLSearchParams();
                    for (const [k, v] of Object.entries(params)) {
                        if (v === undefined || v === null) continue;
                        if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
                        else sp.append(k, String(v));
                    }
                    return sp.toString();
                },
            },
        });
        this._throttler = new Throttler({
            refillRate: 1 / this._rateLimit,
            capacity: 1,
            delay: 1,
        });

        // Rate Limit Interceptor
        this.http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
            if (this.enableRateLimit) {
                await this._throttler.throttle();
            }
            return config;
        });

        // Request Interceptor
        this.http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
            if (this.verbose) {
                logger.debug(`-> ${config.method?.toUpperCase()} ${config.url}`);
                if (config.params) logger.debug('params:', { params: config.params });
                if (config.data) logger.debug('body:', { body: config.data });
            }
            return config;
        });

        // Response Interceptor
        this.http.interceptors.response.use(
            (response: AxiosResponse) => {
                if (this.verbose) {
                    logger.debug(`<- ${response.status} ${response.statusText} ${response.config.url}`);
                }
                return response;
            },
            (error: any) => {
                if (this.verbose) {
                    logger.debug(`REQUEST FAILED: ${error.config?.url}`, {
                        error: error.message,
                        status: error.response?.status,
                        data: error.response?.data,
                    });
                }
                return Promise.reject(error);
            }
        );
    }

    private _rateLimit: number = 1000;

    get rateLimit(): number {
        return this._rateLimit;
    }

    set rateLimit(value: number) {
        this._rateLimit = value;
        this._throttler = new Throttler({
            refillRate: 1 / value,
            capacity: 1,
            delay: 1,
        });
    }

    abstract get name(): string;

    /**
     * Introspection getter: returns info about all implicit API methods.
     */
    get implicitApi(): ImplicitApiMethodInfo[] {
        if (!this.apiDescriptor) return [];

        return Object.entries(this.apiDescriptor.endpoints).map(([name, endpoint]) => ({
            name,
            method: endpoint.method,
            path: endpoint.path,
            isPrivate: !!endpoint.isPrivate,
        }));
    }

    /**
     * Load and cache all markets from the exchange into `this.markets` and `this.marketsBySlug`.
     * Subsequent calls return the cached result without hitting the API again.
     *
     * This is the correct way to paginate or iterate over markets without drift.
     * Because `fetchMarkets()` always hits the API, repeated calls with different `offset`
     * values may return inconsistent results if the exchange reorders or adds markets between
     * requests. Use `loadMarkets()` once to get a stable snapshot, then paginate over
     * `Object.values(exchange.markets)` locally.
     *
     * @param reload - Force a fresh fetch from the API even if markets are already loaded
     * @returns Dictionary of markets indexed by marketId
     */
    async loadMarkets(reload: boolean = false): Promise<Record<string, UnifiedMarket>> {
        if (this.loadedMarkets && !reload) {
            return this.markets;
        }

        // Fetch all markets (implementation dependent, usually fetches active markets)
        const markets = await this.fetchMarkets();

        // Reset caches
        this.markets = {};
        this.marketsBySlug = {};

        for (const market of markets) {
            this.markets[market.marketId] = market;
            // Some exchanges provide slugs, if so cache them
            if (market.slug) {
                this.marketsBySlug[market.slug] = market;
            }
        }

        this.loadedMarkets = true;
        return this.markets;
    }

    /**
     * Fetch markets with optional filtering, search, or slug lookup.
     * Always hits the exchange API — results reflect the live state at the time of the call.
     *
     * @param params - Optional parameters for filtering and search
     * @param params.query - Search keyword to filter markets
     * @param params.slug - Market slug/ticker for direct lookup
     * @param params.limit - Maximum number of results
     * @param params.offset - Pagination offset
     * @param params.sort - Sort order ('volume' | 'liquidity' | 'newest')
     * @param params.searchIn - Where to search ('title' | 'description' | 'both')
     * @returns Array of unified markets
     *
     * @note Calling this repeatedly with different `offset` values does not guarantee stable
     * ordering — exchanges may reorder or add markets between requests. For stable iteration
     * across pages, use `loadMarkets()` and paginate over `Object.values(exchange.markets)`.
     *
     * @note Some exchanges (like Limitless) may only support status 'active' for search results.
     */
    async fetchMarkets(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        const { filter, category, tags, ...fetchParams } = params ?? {};
        // Merge explicit category/tags into the filter (explicit params take precedence)
        const mergedFilter: MarketFilterCriteria = {
            ...(filter ?? {}),
            ...(category !== undefined ? { category } : {}),
            ...(tags !== undefined ? { tags } : {}),
        };
        const hasFilter = Object.keys(mergedFilter).length > 0;
        if (hasFilter) {
            // When filtering, pull limit/offset out of the venue fetch so
            // the venue returns enough data for the filter to work with.
            // Apply limit/offset after filtering so the caller gets the
            // number of results they asked for.
            const { limit, offset, ...venueParams } = fetchParams;
            const markets = await this.fetchMarketsImpl(
                Object.keys(venueParams).length > 0 ? venueParams : undefined
            );
            const filtered = this.filterMarkets(markets, mergedFilter);
            const start = offset ?? 0;
            return limit !== undefined ? filtered.slice(start, start + limit) : filtered.slice(start);
        }
        const { limit, offset, ...venueParams } = fetchParams;
        const hasVenueParams = Object.keys(venueParams).length > 0;
        const shouldForwardSimpleLimit = limit !== undefined && offset === undefined && !hasVenueParams;
        const markets = await this.fetchMarketsImpl(
            shouldForwardSimpleLimit
                ? { limit }
                : hasVenueParams
                  ? venueParams
                  : undefined
        );
        const start = offset ?? 0;
        return limit !== undefined ? markets.slice(start, start + limit) : markets.slice(start);
    }

    /**
     * Fetch markets with cursor-based pagination backed by a stable in-memory snapshot.
     *
     * On the first call (or when no cursor is supplied), fetches all markets once and
     * caches them. Subsequent calls with a cursor returned from a previous call slice
     * directly from the cached snapshot — no additional API calls are made.
     *
     * The snapshot is invalidated after `snapshotTTL` ms (configured via `ExchangeOptions`
     * in the constructor). A request using a cursor from an expired snapshot throws
     * `'Cursor has expired'`.
     *
     * @param params.limit      - Page size (default: return all markets)
     * @param params.cursor     - Opaque cursor returned by a previous call
     * @returns PaginatedMarketsResult with data, total, and optional nextCursor
     */
    async fetchMarketsPaginated(params?: { limit?: number; cursor?: string; filter?: MarketFilterCriteria }): Promise<PaginatedMarketsResult> {
        const limit = params?.limit;
        const cursor = params?.cursor;
        const filter = params?.filter;

        const applyFilter = (markets: UnifiedMarket[]): UnifiedMarket[] =>
            filter ? this.filterMarkets(markets, filter) : markets;

        if (cursor) {
            // Cursor encodes: snapshotId:offset
            const sep = cursor.indexOf(':');
            const snapshotId = cursor.substring(0, sep);
            const offset = parseInt(cursor.substring(sep + 1), 10);

            if (
                !this._snapshot ||
                this._snapshot.id !== snapshotId ||
                (this._snapshotTTL > 0 && Date.now() - this._snapshot.takenAt > this._snapshotTTL)
            ) {
                throw new Error('Cursor has expired');
            }

            const markets = this._snapshot.markets;
            const slice = limit !== undefined ? markets.slice(offset, offset + limit) : markets.slice(offset);
            const nextOffset = offset + slice.length;
            const nextCursor = nextOffset < markets.length ? `${snapshotId}:${nextOffset}` : undefined;

            return { data: applyFilter(slice), total: markets.length, nextCursor };
        }

        // No cursor — (re)fetch snapshot
        if (
            !this._snapshot ||
            this._snapshotTTL === 0 ||
            Date.now() - this._snapshot.takenAt > this._snapshotTTL
        ) {
            const markets = await this.fetchMarketsImpl();
            this._snapshot = {
                markets,
                takenAt: Date.now(),
                id: Math.random().toString(36).slice(2),
            };
        }

        const markets = this._snapshot.markets;
        if (!limit) {
            return { data: applyFilter(markets), total: markets.length, nextCursor: undefined };
        }

        const slice = markets.slice(0, limit);
        const nextCursor = limit < markets.length ? `${this._snapshot.id}:${limit}` : undefined;
        return { data: applyFilter(slice), total: markets.length, nextCursor };
    }

    /**
     * Paginated variant of {@link fetchEvents}.
     *
     * On the first call (no `cursor`), all events are fetched from the exchange
     * and cached in an in-memory snapshot. A cursor is returned along with the
     * first page. Subsequent calls with that cursor serve additional pages
     * directly from the cached snapshot -- no additional API calls are made.
     *
     * The snapshot is invalidated after `snapshotTTL` ms (configured via `ExchangeOptions`
     * in the constructor). A request using a cursor from an expired snapshot throws
     * `'Cursor has expired'`.
     *
     * @param params.limit      - Page size (default: return all events)
     * @param params.cursor     - Opaque cursor returned by a previous call
     * @returns PaginatedEventsResult with data, total, and optional nextCursor
     */
    async fetchEventsPaginated(params?: { limit?: number; cursor?: string; filter?: EventFilterCriteria }): Promise<PaginatedEventsResult> {
        const limit = params?.limit;
        const cursor = params?.cursor;
        const filter = params?.filter;

        const applyFilter = (events: UnifiedEvent[]): UnifiedEvent[] =>
            filter ? this.filterEvents(events, filter) : events;

        if (cursor) {
            const sep = cursor.indexOf(':');
            const snapshotId = cursor.substring(0, sep);
            const offset = parseInt(cursor.substring(sep + 1), 10);

            if (
                !this._eventSnapshot ||
                this._eventSnapshot.id !== snapshotId ||
                (this._snapshotTTL > 0 && Date.now() - this._eventSnapshot.takenAt > this._snapshotTTL)
            ) {
                throw new Error('Cursor has expired');
            }

            const events = this._eventSnapshot.events;
            const slice = limit !== undefined ? events.slice(offset, offset + limit) : events.slice(offset);
            const nextOffset = offset + slice.length;
            const nextCursor = nextOffset < events.length ? `${snapshotId}:${nextOffset}` : undefined;

            return { data: applyFilter(slice), total: events.length, nextCursor };
        }

        // No cursor -- (re)fetch snapshot
        if (
            !this._eventSnapshot ||
            this._snapshotTTL === 0 ||
            Date.now() - this._eventSnapshot.takenAt > this._snapshotTTL
        ) {
            const events = await this.fetchEventsImpl({});
            this._eventSnapshot = {
                events,
                takenAt: Date.now(),
                id: Math.random().toString(36).slice(2),
            };
        }

        const events = this._eventSnapshot.events;
        if (!limit) {
            return { data: applyFilter(events), total: events.length, nextCursor: undefined };
        }

        const slice = events.slice(0, limit);
        const nextCursor = limit < events.length ? `${this._eventSnapshot.id}:${limit}` : undefined;
        return { data: applyFilter(slice), total: events.length, nextCursor };
    }

    /**
     * Fetch events with optional keyword search.
     * Events group related markets together (e.g., "Who will be Fed Chair?" contains multiple candidate markets).
     *
     * @param params - Optional parameters for search and filtering
     * @param params.query - Search keyword to filter events. If omitted, returns top events by volume.
     * @param params.limit - Maximum number of results
     * @param params.offset - Pagination offset
     * @param params.searchIn - Where to search ('title' | 'description' | 'both')
     * @returns Array of unified events
     *
     * @note Some exchanges (like Limitless) may only support status 'active' for search results.
     */
    async fetchEvents(params?: EventFetchParams): Promise<UnifiedEvent[]> {
        const { filter, category, tags, ...fetchParams } = params ?? {};
        // Merge explicit category/tags into the filter (explicit params take precedence)
        const mergedFilter: EventFilterCriteria = {
            ...(filter ?? {}),
            ...(category !== undefined ? { category } : {}),
            ...(tags !== undefined ? { tags } : {}),
        };
        const hasFilter = Object.keys(mergedFilter).length > 0;
        if (hasFilter) {
            const { limit, offset, ...venueParams } = fetchParams;
            const events = await this.fetchEventsImpl(venueParams);
            const filtered = this.filterEvents(events, mergedFilter);
            const start = offset ?? 0;
            return limit !== undefined ? filtered.slice(start, start + limit) : filtered.slice(start);
        }
        const { limit, offset, ...venueParams } = fetchParams;
        const hasVenueParams = Object.keys(venueParams).length > 0;
        const shouldForwardSimpleLimit = limit !== undefined && offset === undefined && !hasVenueParams;
        const events = await this.fetchEventsImpl(
            shouldForwardSimpleLimit ? { limit } : venueParams
        );
        const start = offset ?? 0;
        return limit !== undefined ? events.slice(start, start + limit) : events.slice(start);
    }

    /**
     * Fetch the recurring series (fourth tier above Event -> Market -> Outcome)
     * that this venue exposes. Returns an empty array on venues without a
     * series concept (Limitless, Smarkets, Probable, Metaculus, Baozi,
     * Hyperliquid, SuiBets, Polymarket US).
     *
     * - `params.id` -> a single matching series with its events populated where supported.
     * - no params -> the full list, typically without nested events for payload size.
     *
     * @returns Array of unified series. Always an array, including the singular-lookup case.
     */
    async fetchSeries(params?: SeriesFetchParams): Promise<UnifiedSeries[]> {
        const { limit, offset, ...venueParams } = params ?? {};
        const series = await this.fetchSeriesImpl(venueParams);
        const start = offset ?? 0;
        return limit !== undefined ? series.slice(start, start + limit) : series.slice(start);
    }

    /**
     * Fetch a single market by lookup parameters.
     * Convenience wrapper around fetchMarkets() that returns a single result or throws MarketNotFound.
     *
     * @param params - Lookup parameters (marketId, outcomeId, slug, etc.)
     * @returns A single unified market
     * @throws MarketNotFound if no market matches the parameters
     */
    async fetchMarket(params?: MarketFetchParams): Promise<UnifiedMarket> {
        // Try to fetch from cache first if we have loaded markets and have an ID/slug
        if (this.loadedMarkets) {
            if (params?.marketId && this.markets[params.marketId]) {
                return this.markets[params.marketId];
            }
            if (params?.slug && this.marketsBySlug[params.slug]) {
                return this.marketsBySlug[params.slug];
            }
        }

        const markets = await this.fetchMarkets(params);
        if (markets.length === 0) {
            const identifier = params?.marketId || params?.outcomeId || params?.slug || params?.eventId || params?.query || 'unknown';
            throw new MarketNotFound(identifier, this.name);
        }
        return markets[0];
    }

    private cacheMarketLookup(market: UnifiedMarket): void {
        this.markets[market.marketId] = market;
        if (market.slug) {
            this.marketsBySlug[market.slug] = market;
        }
    }

    private marketMatchesIdentifier(market: UnifiedMarket, id: string): boolean {
        return market.marketId === id
            || market.slug === id
            || market.contractAddress === id
            || (market as any).id === id;
    }

    private getCachedMarketForOutcomeAlias(id: string): UnifiedMarket | undefined {
        const direct = this.markets[id] ?? this.marketsBySlug[id];
        if (direct && this.marketMatchesIdentifier(direct, id)) return direct;
        return Object.values(this.markets).find((market) => this.marketMatchesIdentifier(market, id));
    }

    private async fetchMarketForOutcomeAlias(id: string): Promise<UnifiedMarket> {
        const cached = this.getCachedMarketForOutcomeAlias(id);
        if (cached) return cached;

        for (const params of [{ marketId: id }, { slug: id }]) {
            const markets = await this.fetchMarkets(params);
            const exact = markets.find((market) => this.marketMatchesIdentifier(market, id));
            const market = exact ?? (markets.length === 1 ? markets[0] : undefined);
            if (market) {
                this.cacheMarketLookup(market);
                return market;
            }
        }

        throw new MarketNotFound(id, this.name);
    }

    /**
     * Resolve an outcome alias ('yes'/'no') to an actual outcome token ID.
     * When params.outcome is set, treats `id` as a market ID, looks up the
     * market, and returns the resolved outcome token ID plus cleaned params.
     * When params.outcome is already a token ID (not 'yes'/'no'), returns it
     * directly. When params.outcome is not set, returns `id` unchanged.
     */
    protected async resolveOutcomeAlias(
        id: string,
        params?: FetchOrderBookParams,
    ): Promise<{ outcomeId: string; params?: FetchOrderBookParams }> {
        if (!params?.outcome) return { outcomeId: id, params };

        const outcome = String(params.outcome);
        const alias = outcome.toLowerCase();
        const { outcome: _, ...rest } = params;

        if (alias === 'yes' || alias === 'no') {
            const market = await this.fetchMarketForOutcomeAlias(id);
            const selected = alias === 'yes' ? market.yes : market.no;
            if (!selected) {
                throw new Error(
                    `Market "${id}" has no '${alias}' outcome on ${this.name}`,
                );
            }
            return { outcomeId: selected.outcomeId, params: rest };
        }

        // outcome is already a raw token ID — use it directly
        return { outcomeId: outcome, params: rest };
    }

    // ----------------------------------------------------------------------------
    // Implementation methods (to be overridden by exchanges)
    // ----------------------------------------------------------------------------

    /**
     * Fetch a single event by lookup parameters.
     * Convenience wrapper around fetchEvents() that returns a single result or throws EventNotFound.
     *
     * @param params - Lookup parameters (eventId, slug, query)
     * @returns A single unified event
     * @throws EventNotFound if no event matches the parameters
     */
    async fetchEvent(params?: EventFetchParams): Promise<UnifiedEvent> {
        const events = await this.fetchEvents(params);
        if (events.length === 0) {
            const identifier = params?.eventId || params?.slug || params?.query || 'unknown';
            throw new EventNotFound(identifier, this.name);
        }
        return events[0];
    }

    /**
     * Fetch historical OHLCV (candlestick) price data for a specific market outcome.
     *
     * @param outcomeId - The Outcome ID (outcomeId). Use outcome.outcomeId, NOT market.marketId
     * @param params - OHLCV parameters including resolution (required)
     * @returns Array of price candles
     *
     * @notes **CRITICAL**: Use `outcome.outcomeId` (TS) / `outcome.outcome_id` (Python), not the market ID.
     * @notes Polymarket: outcomeId is the CLOB Token ID. Kalshi: outcomeId is the Market Ticker.
     * @notes Common resolutions: '1m' | '5m' | '15m' | '1h' | '6h' | '1d'. Arbitrary intervals (e.g. '30s', '120s', '3h') accepted by venues that support them.
     */
    async fetchOHLCV(outcomeId: string, params: OHLCVParams): Promise<PriceCandle[]> {
        throw new Error("Method fetchOHLCV not implemented.");
    }

    /**
     * Fetch the order book (bids/asks) for a specific outcome.
     *
     * Supports live and historical queries. For historical data, pass `since`
     * to get a single snapshot, or `since` + `until` to get an array of fully
     * reconstructed L2 books from the archive. Range queries return up to
     * `limit` snapshots (default 100, max 1000).
     *
     * @param outcomeId - The Outcome ID (outcomeId) or market slug
     * @param limit - Max number of bid/ask levels to return. For range
     *   queries (since + until), limits the number of snapshots returned
     *   (default 100, max 1000).
     * @param params - Optional parameters:
     *   - `side`: 'yes' or 'no' — explicitly indicate the outcome side
     *     (required for exchanges like Limitless where the API returns a
     *     single orderbook per market).
     *   - `since`: Unix timestamp (ms) — fetch a historical snapshot from
     *     the archive at or before this time (hosted API only).
     *   - `until`: Unix timestamp (ms) — when combined with `since`,
     *     returns an array of OrderBook snapshots between `since` and
     *     `until` (hosted API only).
     * @returns Order book with bids and asks. Returns OrderBook[] when
     *   both `since` and `until` are provided.
     */
    async fetchOrderBook(outcomeId: string, limit?: number, params?: FetchOrderBookParams): Promise<OrderBook> {
        throw new Error("Method fetchOrderBook not implemented.");
    }

    /**
     * Batch variant of {@link fetchOrderBook}. Fetches order books for
     * multiple outcomes in a single request where the exchange supports it.
     *
     * @param outcomeIds - List of Outcome IDs (outcomeId). Each id must be in the
     *   exchange's native format; market slugs are not accepted here.
     * @returns A map keyed by the input id (preserving the caller's exact
     *   string) to its order book. Throws `NotFound` if any id has no book.
     */
    async fetchOrderBooks(outcomeIds: string[]): Promise<Record<string, OrderBook>> {
        throw new Error("Method fetchOrderBooks not implemented.");
    }

    /**
     * Fetch raw trade history for a specific outcome.
     *
     * @param outcomeId - The Outcome ID (outcomeId)
     * @param params - Trade filter parameters
     * @returns Array of recent trades
     *
     * @notes Polymarket requires an API key for trade history. Use fetchOHLCV for public historical data.
     */
    async fetchTrades(outcomeId: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        // Deprecation warning for resolution parameter
        if ('resolution' in params && params.resolution !== undefined) {
            logger.warn('The "resolution" parameter is deprecated for fetchTrades() and will be ignored. It will be removed in v3.0.0.');
        }
        throw new Error("Method fetchTrades not implemented.");
    }

    /**
     * Place a new order on the exchange.
     *
     * @param params - Order parameters
     * @returns The created order
     */
    async createOrder(params: CreateOrderParams): Promise<Order> {
        throw new Error("Method createOrder not implemented.");
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    /**
     * Build an order payload without submitting it to the exchange.
     * Returns the exchange-native signed order or request body for inspection,
     * forwarding through a middleware layer, or deferred submission via submitOrder().
     *
     * @param params - Order parameters (same as createOrder)
     * @returns A BuiltOrder containing the exchange-native payload
     */
    async buildOrder(params: CreateOrderParams): Promise<BuiltOrder> {
        throw new Error('Method buildOrder not implemented.');
    }

    /**
     * Submit a pre-built order returned by buildOrder().
     *
     * @param built - A BuiltOrder from buildOrder()
     * @returns The submitted order
     */
    async submitOrder(built: BuiltOrder): Promise<Order> {
        throw new Error('Method submitOrder not implemented.');
    }

    /**
     * Cancel an existing open order.
     *
     * @param orderId - The order ID to cancel
     * @returns The cancelled order
     */
    async cancelOrder(orderId: string): Promise<Order> {
        throw new Error("Method cancelOrder not implemented.");
    }

    /**
     * Fetch a specific order by ID.
     *
     * @param orderId - The order ID to look up
     * @returns The order details
     */
    async fetchOrder(orderId: string): Promise<Order> {
        throw new Error("Method fetchOrder not implemented.");
    }

    /**
     * Fetch all open orders, optionally filtered by market.
     *
     * @param marketId - Optional market ID to filter by
     * @returns Array of open orders
     */
    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        throw new Error("Method fetchOpenOrders not implemented.");
    }

    /**
     * Fetch authenticated user trade history.
     *
     * @param params - Optional trade history filters
     * @param params.outcomeId - Filter by outcome token ID
     * @param params.marketId - Filter by market ID or ticker
     * @param params.since - Start timestamp or ISO date
     * @param params.until - End timestamp or ISO date
     * @param params.limit - Maximum number of trades
     * @param params.cursor - Pagination cursor
     * @returns Array of user trades
     */
    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        throw new Error("Method fetchMyTrades not implemented.");
    }

    /**
     * Fetch authenticated closed orders.
     *
     * @param params - Optional order history filters
     * @param params.marketId - Filter by market ID or ticker
     * @param params.since - Start timestamp or ISO date
     * @param params.until - End timestamp or ISO date
     * @param params.limit - Maximum number of orders
     * @param params.cursor - Pagination cursor
     * @returns Array of closed orders
     */
    async fetchClosedOrders(params?: OrderHistoryParams): Promise<Order[]> {
        throw new Error("Method fetchClosedOrders not implemented.");
    }

    /**
     * Fetch authenticated order history across open and closed orders.
     *
     * @param params - Optional order history filters
     * @param params.marketId - Filter by market ID or ticker
     * @param params.since - Start timestamp or ISO date
     * @param params.until - End timestamp or ISO date
     * @param params.limit - Maximum number of orders
     * @param params.cursor - Pagination cursor
     * @returns Array of orders
     */
    async fetchAllOrders(params?: OrderHistoryParams): Promise<Order[]> {
        throw new Error("Method fetchAllOrders not implemented.");
    }

    /**
     * Fetch current user positions across all markets.
     *
     * @param address - Optional public wallet address
     * @returns Array of user positions
     */
    async fetchPositions(address?: string): Promise<Position[]> {
        throw new Error("Method fetchPositions not implemented.");
    }

    /**
     * Fetch account balances.
     *
     * @param address - Optional public wallet address
     * @returns Array of account balances
     */
    async fetchBalance(address?: string): Promise<Balance[]> {
        throw new Error("Method fetchBalance not implemented.");
    }

    /**
     * Calculate the volume-weighted average execution price for a given order size.
     * Returns 0 if the order cannot be fully filled.
     *
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - Number of contracts to simulate
     * @returns Average execution price, or 0 if insufficient liquidity
     */
    getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): number {
        return getExecutionPrice(orderBook, side, amount);
    }

    /**
     * Calculate detailed execution price information including partial fill data.
     *
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - Number of contracts to simulate
     * @returns Detailed execution result with price, filled amount, and fill status
     */
    getExecutionPriceDetailed(
        orderBook: OrderBook,
        side: 'buy' | 'sell',
        amount: number
    ): ExecutionPriceResult {
        return getExecutionPriceDetailed(orderBook, side, amount);
    }

    /**
     * Filter a list of markets by criteria.
     * Can filter by string query, structured criteria object, or custom filter function.
     *
     * @param markets - Array of markets to filter
     * @param criteria - Filter criteria: string (text search), object (structured), or function (predicate)
     * @returns Filtered array of markets
     */
    filterMarkets(
        markets: UnifiedMarket[],
        criteria: string | MarketFilterCriteria | MarketFilterFunction
    ): UnifiedMarket[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return markets.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return markets.filter(m =>
                m.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return markets.filter(market => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && market.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && market.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && market.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && market.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'outcomes' && market.outcomes?.some(o => o.label.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && market.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    market.tags?.some(marketTag =>
                        marketTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Volume24h filter
            if (criteria.volume24h) {
                if (criteria.volume24h.min !== undefined && market.volume24h < criteria.volume24h.min) {
                    return false;
                }
                if (criteria.volume24h.max !== undefined && market.volume24h > criteria.volume24h.max) {
                    return false;
                }
            }

            // Volume filter
            if (criteria.volume) {
                if (criteria.volume.min !== undefined && (market.volume || 0) < criteria.volume.min) {
                    return false;
                }
                if (criteria.volume.max !== undefined && (market.volume || 0) > criteria.volume.max) {
                    return false;
                }
            }

            // Liquidity filter
            if (criteria.liquidity) {
                if (criteria.liquidity.min !== undefined && market.liquidity < criteria.liquidity.min) {
                    return false;
                }
                if (criteria.liquidity.max !== undefined && market.liquidity > criteria.liquidity.max) {
                    return false;
                }
            }

            // OpenInterest filter
            if (criteria.openInterest) {
                if (criteria.openInterest.min !== undefined && (market.openInterest || 0) < criteria.openInterest.min) {
                    return false;
                }
                if (criteria.openInterest.max !== undefined && (market.openInterest || 0) > criteria.openInterest.max) {
                    return false;
                }
            }

            // ResolutionDate filter
            if (criteria.resolutionDate) {
                const resDate = market.resolutionDate;
                if (!resDate) return false;
                if (criteria.resolutionDate.before && resDate >= criteria.resolutionDate.before) {
                    return false;
                }
                if (criteria.resolutionDate.after && resDate <= criteria.resolutionDate.after) {
                    return false;
                }
            }

            // Price filter (for binary markets)
            if (criteria.price) {
                const outcome = market[criteria.price.outcome];
                if (!outcome) return false;

                if (criteria.price.min !== undefined && outcome.price < criteria.price.min) {
                    return false;
                }
                if (criteria.price.max !== undefined && outcome.price > criteria.price.max) {
                    return false;
                }
            }

            // Price change filter
            if (criteria.priceChange24h) {
                const outcome = market[criteria.priceChange24h.outcome];
                if (!outcome || outcome.priceChange24h === undefined) return false;

                if (criteria.priceChange24h.min !== undefined && outcome.priceChange24h < criteria.priceChange24h.min) {
                    return false;
                }
                if (criteria.priceChange24h.max !== undefined && outcome.priceChange24h > criteria.priceChange24h.max) {
                    return false;
                }
            }

            return true;
        });
    }

    // ----------------------------------------------------------------------------
    // Filtering Methods
    // ----------------------------------------------------------------------------

    /**
     * Filter a list of events by criteria.
     * Can filter by string query, structured criteria object, or custom filter function.
     *
     * @param events - Array of events to filter
     * @param criteria - Filter criteria: string (text search), object (structured), or function (predicate)
     * @returns Filtered array of events
     */
    filterEvents(
        events: UnifiedEvent[],
        criteria: string | EventFilterCriteria | EventFilterFunction
    ): UnifiedEvent[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return events.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return events.filter(e =>
                e.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return events.filter(event => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && event.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && event.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && event.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && event.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && event.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    event.tags?.some(eventTag =>
                        eventTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Market count filter
            if (criteria.marketCount) {
                const count = event.markets.length;
                if (criteria.marketCount.min !== undefined && count < criteria.marketCount.min) {
                    return false;
                }
                if (criteria.marketCount.max !== undefined && count > criteria.marketCount.max) {
                    return false;
                }
            }

            // Total volume filter
            if (criteria.totalVolume) {
                const totalVolume = event.markets.reduce((sum, m) => sum + m.volume24h, 0);
                if (criteria.totalVolume.min !== undefined && totalVolume < criteria.totalVolume.min) {
                    return false;
                }
                if (criteria.totalVolume.max !== undefined && totalVolume > criteria.totalVolume.max) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Watch order book updates in real-time via WebSocket.
     * Returns a promise that resolves with the next order book update. Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param outcomeId - The Outcome ID to watch
     * @param limit - Optional limit for orderbook depth
     * @param params - Optional exchange-specific parameters
     * @returns Promise that resolves with the current orderbook state
     */
    async watchOrderBook(outcomeId: string, limit?: number, params: Record<string, any> = {}): Promise<OrderBook> {
        throw new Error(`watchOrderBook() is not supported by ${this.name}`);
    }

    /**
     * Watch multiple order books simultaneously via WebSocket.
     * Returns a promise that resolves with a record of order book snapshots keyed by ID.
     * Exchanges with native batch support (e.g. Kalshi) send a single subscribe message
     * for all tickers; others fall back to individual watchOrderBook calls.
     *
     * @param outcomeIds - Array of Outcome IDs to watch
     * @param limit - Optional limit for orderbook depth
     * @param params - Optional exchange-specific parameters
     * @returns Promise that resolves with order books keyed by ID
     */
    async watchOrderBooks(outcomeIds: string[], limit?: number, params: Record<string, any> = {}): Promise<Record<string, OrderBook>> {
        // Default implementation: subscribe to each ID individually.
        // Exchanges with native batch support (e.g. Kalshi) override this
        // to send a single subscribe message for all tickers.
        const entries = await Promise.all(
            outcomeIds.map(async (oid): Promise<[string, OrderBook]> => {
                const book = await this.watchOrderBook(oid, limit, params);
                return [oid, book];
            }),
        );
        const result: Record<string, OrderBook> = {};
        for (const [oid, book] of entries) {
            result[oid] = book;
        }
        return result;
    }

    /**
     * Unsubscribe from a previously watched order book stream.
     *
     * @param outcomeId - The Outcome ID to stop watching
     */
    async unwatchOrderBook(outcomeId: string): Promise<void> {
        throw new Error(`unwatchOrderBook() is not supported by ${this.name}`);
    }

    // ----------------------------------------------------------------------------
    // WebSocket Streaming Methods
    // ----------------------------------------------------------------------------

    /**
     * Watch trade executions in real-time via WebSocket.
     * Returns a promise that resolves with the next trade(s). Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param outcomeId - The Outcome ID to watch
     * @param address - Public wallet address
     * @param since - Optional timestamp to filter trades from
     * @param limit - Optional limit for number of trades
     * @returns Promise that resolves with recent trades
     */
    async watchTrades(outcomeId: string, address?: string, since?: number, limit?: number): Promise<Trade[]> {
        throw new Error(`watchTrades() is not supported by ${this.name}`);
    }

    /**
     * Stream activity for a public wallet address
     * Returns a promise that resolves with the next activity snapshot whenever a change
     * is detected. Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param address - Public wallet address to watch
     * @param types - Subset of activity to watch (default: all types)
     * @returns Promise that resolves with the latest SubscribedAddressSnapshot snapshot
     */
    async watchAddress(address: string, types?: SubscriptionOption[]): Promise<SubscribedAddressSnapshot> {
        throw new Error(`watchAddress() is not supported by ${this.name}`);
    }

    /**
     * Stop watching a previously registered wallet address and release its resource updates.
     *
     * @param address - Public wallet address to stop watching
     */
    async unwatchAddress(address: string): Promise<void> {
        throw new Error(`unwatchAddress() is not supported by ${this.name}`);
    }

    /**
     * Close all WebSocket connections and clean up resources.
     * Call this when you're done streaming to properly release connections.
     */

    async close(): Promise<void> {
        // Default implementation: no-op
        // Exchanges with WebSocket support should override this
    }

    // ----------------------------------------------------------------------------
    // Matching Methods (Router-only; stubs throw for standard exchanges)
    // ----------------------------------------------------------------------------

    /**
     * Find the same or related market on other venues. Two modes:
     *
     * **Lookup mode** (marketId/slug/url provided): Given a market on one venue, discover
     * semantically equivalent markets across every other venue PMXT ingests.
     *
     * **Browse mode** (no identifier): Returns all matched market pairs from the catalog.
     * Supports query, category, minDifference, and sort params for filtering.
     *
     * @param params - Match filter parameters
     * @returns Array of matched markets with relation and confidence
     */
    async fetchMarketMatches(params?: FetchMarketMatchesParams): Promise<MatchResult[]> {
        throw new Error("Method fetchMarketMatches not implemented.");
    }

    /**
     * @deprecated Use {@link fetchMarketMatches} instead.
     */
    async fetchMatches(params: FetchMatchesParams): Promise<MatchResult[]> {
        logger.warn('fetchMatches is deprecated, use fetchMarketMatches instead');
        return this.fetchMarketMatches(params);
    }

    /**
     * Find the same or related event on other venues. Two modes:
     *
     * **Lookup mode** (eventId/slug provided): Given an event on one venue, discover
     * semantically equivalent events across every other venue PMXT ingests.
     *
     * **Browse mode** (no identifier): Returns all matched event pairs from the catalog.
     * Supports query and category params for filtering.
     *
     * @param params - Event match filter parameters
     * @returns Array of matched events with market-level match details
     */
    async fetchEventMatches(params?: FetchEventMatchesParams): Promise<EventMatchResult[]> {
        throw new Error("Method fetchEventMatches not implemented.");
    }

    /**
     * Compare live prices for the same market across venues. Finds identity matches and returns side-by-side best bid/ask prices so you can spot price differences at a glance.
     *
     * @param params - Match filter parameters (uses relation: 'identity' internally)
     * @returns Array of price comparisons across venues
     */
    async compareMarketPrices(params: FetchMatchesParams): Promise<PriceComparison[]> {
        throw new Error("Method compareMarketPrices not implemented.");
    }

    /**
     * Find related markets across venues. Discovers subset/superset market relationships
     * where one market's outcome implies another, with live prices.
     *
     * @param params - Match filter parameters
     * @returns Array of subset/superset matches with live prices
     */
    async fetchRelatedMarkets(params: FetchMatchesParams): Promise<PriceComparison[]> {
        throw new Error("Method fetchRelatedMarkets not implemented.");
    }

    /**
     * @deprecated Use {@link fetchMarketMatches} without a marketId instead.
     * Fetch matched markets across venues.
     */
    async fetchMatchedMarkets(params?: FetchMatchedMarketsParams): Promise<MatchedMarketPair[]> {
        throw new Error("Method fetchMatchedMarkets not implemented.");
    }

    /**
     * @deprecated Use {@link fetchMatchedMarkets} instead. Compare matched market prices across venues. Finds markets listed on multiple venues
     * and returns side-by-side pricing data.
     *
     * @param params - Price comparison parameters (minDifference, category, limit)
     * @returns Array of matched market pairs with prices from each venue
     */
    async fetchMatchedPrices(params?: FetchMatchedPricesParams): Promise<MatchedPricePair[]> {
        throw new Error("Method fetchMatchedPrices not implemented.");
    }

    /**
     * @deprecated Use {@link fetchRelatedMarkets} instead. Find hedging opportunities across venues. Discovers subset/superset market relationships where one market's outcome implies another, enabling cross-venue hedging strategies with live prices.
     *
     * @param params - Match filter parameters
     * @returns Array of subset/superset matches with live prices
     */
    async fetchHedges(params: FetchMatchesParams): Promise<PriceComparison[]> {
        throw new Error("Method fetchHedges not implemented.");
    }

    /**
     * @deprecated Use {@link fetchMatchedPrices} instead. Scan for arbitrage opportunities across venues. Finds identity matches where the same market is priced differently on different venues, returning opportunities sorted by spread size.
     *
     * @param params - Arbitrage scan parameters (minSpread, category, limit)
     * @returns Array of arbitrage opportunities sorted by spread
     */
    async fetchArbitrage(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]> {
        throw new Error("Method fetchArbitrage not implemented.");
    }

    /**
     * @internal
     * Implementation for fetching/searching markets.
     * Exchanges should handle query, slug, and plain fetch cases based on params.
     */
    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        throw new Error("Method fetchMarketsImpl not implemented.");
    }

    // ----------------------------------------------------------------------------
    // Implicit API (OpenAPI-driven method generation)
    // ----------------------------------------------------------------------------

    /**
     * @internal
     * Implementation for searching events by keyword.
     */
    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        throw new Error("Method fetchEventsImpl not implemented.");
    }

    /**
     * @internal
     * Implementation for fetching recurring series. Override in venue adapters
     * that expose a series concept; the default returns an empty array so
     * venues without one are silently a no-op.
     */
    protected async fetchSeriesImpl(_params: SeriesFetchParams): Promise<UnifiedSeries[]> {
        return [];
    }

    /**
     * Call an implicit API method by its operationId (or auto-generated name).
     * Provides a typed entry point so unified methods can delegate to the implicit API
     * without casting to `any` everywhere.
     */
    protected async callApi(operationId: string, params?: Record<string, any> | any[]): Promise<any> {
        const method = (this as any)[operationId];
        if (typeof method !== 'function') {
            throw new Error(`Implicit API method "${operationId}" not found on ${this.name}`);
        }
        return method.call(this, params);
    }

    /**
     * Parse an API descriptor and generate callable methods on this instance.
     * Existing methods (unified API) are never overwritten.
     */
    protected defineImplicitApi(descriptor: ApiDescriptor): void {
        this.apiDescriptors.push(descriptor);

        // Merge into a single apiDescriptor for the implicitApi getter
        if (!this.apiDescriptor) {
            this.apiDescriptor = { baseUrl: descriptor.baseUrl, endpoints: { ...descriptor.endpoints } };
        } else {
            Object.assign(this.apiDescriptor.endpoints, descriptor.endpoints);
        }

        for (const [name, endpoint] of Object.entries(descriptor.endpoints)) {
            // Never overwrite existing methods (unified API wins)
            if (name in this) {
                continue;
            }
            (this as any)[name] = this.createImplicitMethod(
                name,
                endpoint,
                endpoint.baseUrl ?? descriptor.baseUrl
            );
        }
    }

    /**
     * Returns auth headers for a private API call.
     * Exchanges should override this to provide authentication.
     */
    protected sign(_method: string, _path: string, _params: Record<string, any>): Record<string, string> {
        return {};
    }

    /**
     * Maps errors from implicit API calls through the exchange's error mapper.
     * Exchanges should override this to use their specific error mapper.
     */
    protected mapImplicitApiError(error: any): any {
        throw error;
    }

    /**
     * Creates an async function for an implicit API endpoint.
     */
    private createImplicitMethod(
        name: string,
        endpoint: ApiEndpoint,
        resolvedBaseUrl: string
    ): (params?: Record<string, any> | any[]) => Promise<any> {
        return async (params?: Record<string, any> | any[]): Promise<any> => {
            const isArray = Array.isArray(params);
            const allParams: Record<string, any> = isArray ? {} : { ...(params || {}) };

            // Substitute path parameters like {ticker} from params
            let resolvedPath = endpoint.path.replace(/\{([^}]+)\}/g, (_match, key) => {
                const value = allParams[key];
                if (value === undefined) {
                    throw new Error(
                        `Missing required path parameter "${key}" for ${name}(). ` +
                        `Path: ${endpoint.path}`
                    );
                }
                delete allParams[key];
                return encodeURIComponent(String(value));
            });

            // Get auth headers for private endpoints
            let headers: Record<string, string> = {};
            if (endpoint.isPrivate) {
                headers = this.sign(endpoint.method, resolvedPath, allParams);
            }

            const url = `${resolvedBaseUrl}${resolvedPath}`;
            const method = endpoint.method.toUpperCase();

            try {
                let response;
                if (method === 'GET' || method === 'DELETE') {
                    // Remaining params go to query string
                    response = await this.http.request({
                        method: method as any,
                        url,
                        params: Object.keys(allParams).length > 0 ? allParams : undefined,
                        headers,
                    });
                } else {
                    // POST/PUT/PATCH: array payloads go through as-is; object
                    // payloads send remaining params.
                    const body = isArray
                        ? params
                        : (Object.keys(allParams).length > 0 ? allParams : undefined);
                    response = await this.http.request({
                        method: method as any,
                        url,
                        data: body,
                        headers: { 'Content-Type': 'application/json', ...headers },
                    });
                }

                return response.data;
            } catch (error: any) {
                throw this.mapImplicitApiError(error);
            }
        };
    }

    // ----------------------------------------------------------------------------
    // Capability Derivation
    // ----------------------------------------------------------------------------

    /** All keys that appear in ExchangeHas -- kept in sync via the exhaustive check below. */
    private static readonly _capabilityKeys: readonly (keyof ExchangeHas)[] = [
        'fetchMarkets', 'fetchEvents', 'fetchSeries', 'fetchOHLCV', 'fetchOrderBook', 'fetchOrderBooks',
        'fetchTrades', 'createOrder', 'cancelOrder', 'fetchOrder',
        'fetchOpenOrders', 'fetchPositions', 'fetchBalance',
        'watchAddress', 'unwatchAddress', 'watchOrderBook', 'watchOrderBooks',
        'unwatchOrderBook', 'watchTrades', 'fetchMyTrades',
        'fetchClosedOrders', 'fetchAllOrders', 'buildOrder', 'submitOrder',
        'fetchMarketMatches', 'fetchMatches', 'fetchEventMatches', 'compareMarketPrices',
        'fetchRelatedMarkets', 'fetchMatchedMarkets', 'fetchMatchedPrices', 'fetchHedges', 'fetchArbitrage',
    ];

    // Compile-time exhaustiveness check: fails tsc if a key exists in
    // ExchangeHas but is missing from _capabilityKeys above.
    private static readonly _exhaustiveCheck: Record<keyof ExchangeHas, true> = {
        fetchMarkets: true, fetchEvents: true, fetchSeries: true, fetchOHLCV: true,
        fetchOrderBook: true, fetchOrderBooks: true, fetchTrades: true, createOrder: true,
        cancelOrder: true, fetchOrder: true, fetchOpenOrders: true,
        fetchPositions: true, fetchBalance: true, watchAddress: true,
        unwatchAddress: true, watchOrderBook: true, watchOrderBooks: true, unwatchOrderBook: true,
        watchTrades: true, fetchMyTrades: true, fetchClosedOrders: true,
        fetchAllOrders: true, buildOrder: true, submitOrder: true,
        fetchMarketMatches: true, fetchMatches: true, fetchEventMatches: true, compareMarketPrices: true,
        fetchRelatedMarkets: true, fetchMatchedMarkets: true, fetchMatchedPrices: true, fetchHedges: true, fetchArbitrage: true,
    };

    /**
     * Map from capability keys to the actual method(s) whose override status
     * determines support. Most map 1:1, but `fetchMarkets` and `fetchEvents`
     * are implemented in the base class and delegate to `*Impl` methods that
     * exchanges override instead.
     */
    private static readonly _capabilityDelegates: Partial<Record<keyof ExchangeHas, string>> = {
        fetchMarkets: 'fetchMarketsImpl',
        fetchEvents: 'fetchEventsImpl',
        fetchSeries: 'fetchSeriesImpl',
        watchOrderBooks: 'watchOrderBook',
        fetchMatches: 'fetchMarketMatches',
        fetchHedges: 'fetchRelatedMarkets',
        fetchMatchedPrices: 'fetchMatchedMarkets',
        fetchArbitrage: 'fetchMatchedMarkets',
    };

    /**
     * Derive the capability map by comparing this instance's prototype chain
     * against the base class stubs. A method that is overridden (i.e. not the
     * same function reference as the base stub) is considered supported.
     *
     * Explicit `capabilityOverrides` take precedence over introspection.
     */
    private _deriveCapabilities(): ExchangeHas {
        const base = PredictionMarketExchange.prototype;
        const result = {} as Record<keyof ExchangeHas, ExchangeCapability>;

        for (const key of PredictionMarketExchange._capabilityKeys) {
            // Explicit override wins unconditionally
            if (key in this.capabilityOverrides) {
                result[key] = this.capabilityOverrides[key]!;
                continue;
            }

            // Check the delegate method (usually same name, but fetchMarkets -> fetchMarketsImpl)
            const methodName = PredictionMarketExchange._capabilityDelegates[key] ?? key;
            result[key] = (this as any)[methodName] !== (base as any)[methodName];
        }

        return result as ExchangeHas;
    }
}
