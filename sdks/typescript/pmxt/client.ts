/**
 * Exchange client implementations.
 *
 * This module provides clean, TypeScript-friendly wrappers around the auto-generated
 * OpenAPI client, matching the Python API exactly.
 */

import {
    Configuration,
    CreateOrderRequest,
    DefaultApi,
    ExchangeCredentials,
    BuildOrderRequest,
    SubmitOrderRequest,
} from "../generated/src/index.js";

import {
    Balance,
    BuiltOrder,
    CreateOrderInput,
    EventFetchParams,
    EventFilterCriteria,
    EventFilterFunction,
    ExecutionPriceResult,
    FetchOrderBookParams,
    MarketFetchParams,
    MarketFilterCriteria,
    MarketFilterFunction,
    MarketList,
    MarketOutcome,
    MyTradesParams,
    Order,
    OrderBook,
    OrderHistoryParams,
    OrderLevel,
    PaginatedMarketsResult,
    PaginatedEventsResult,
    Position,
    SeriesFetchParams,
    PriceCandle,
    SubscribedAddressSnapshot,
    SubscriptionOption,
    Trade,
    UnifiedEvent,
    UnifiedMarket,
    UnifiedSeries,
    UserTrade,
    FirehoseEvent,
    FetchMatchedMarketClustersParams,
} from "./models.js";

import { ServerManager } from "./server-manager.js";
import { buildArgsWithOptionalOptions } from "./args.js";
import { PmxtError, fromServerError, InvalidOrder, NotSupported } from "./errors.js";
import { ENV, LOCAL_URL, resolvePmxtBaseUrl } from "./constants.js";
import { SidecarWsClient } from "./ws-client.js";
import { logger } from "./logger.js";

// Hosted-mode trading dispatch.
// These modules are introduced as part of the hosted trading mode rollout.
// Some of them may be authored by parallel agents; until they all land, the
// import names below are the conventional ones from the plan. Cross-module
// "Cannot find module" errors during the parallel landing window resolve
// once the matching files exist.
import {
    HOSTED_TRADING_VENUES,
    _tradingRequest,
    resolveWalletAddress,
    ensureHostedTradingSupported,
    formatRoutePath,
    HOSTED_METHOD_ROUTES,
} from "./hosted-routing.js";
import {
    orderFromV0,
    positionFromV0,
    balanceFromV0,
    userTradeFromV0,
    to6dec,
} from "./hosted-mappers.js";
import {
    validateTypedData,
    validateEconomics,
    verifySignature,
} from "./hosted-typed-data.js";
import type { HostedRoute } from "./hosted-typed-data.js";
import type { Signer, TypedData } from "./signers.js";
import { signerFromPrivateKey, EthersSigner } from "./signers.js";
import { Escrow } from "./escrow.js";
import {
    MissingWalletAddress,
    InvalidSignature as HostedInvalidSignature,
} from "./hosted-errors.js";

interface RawWebSocketLike {
    send(data: string): void;
}

interface SidecarWsClientInternals {
    ensureConnected(): Promise<void>;
    ws: RawWebSocketLike | null;
    activeSubs: Map<string, string>;
    subscriptions: Map<string, { reject: ((error: Error) => void) | null }>;
    dataQueues: Map<string, any[]>;
    dataStore: Map<string, any>;
}

/**
 * Resolve a MarketOutcome shorthand to a plain outcome ID string.
 * Accepts either a raw string ID or a MarketOutcome object.
 */
function resolveOutcomeId(input: string | MarketOutcome): string {
    if (typeof input === 'string') return input;
    return input.outcomeId;
}

/**
 * Build a URL-encoded query string from a plain record.
 *
 * - `undefined` / `null` values are skipped (they shouldn't appear in the URL).
 * - Arrays are serialised as repeated `key=v1&key=v2` pairs.
 * - Nested objects are skipped here; callers should route such queries through
 *   POST instead (see `queryHasNestedObject`).
 */
function buildSidecarQueryString(query: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
            for (const v of value) {
                if (v === undefined || v === null) continue;
                parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
            }
        } else if (typeof value === 'object') {
            // Nested objects don't round-trip through query strings. Caller
            // should have detected this and POSTed instead.
            continue;
        } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
        }
    }
    return parts.join('&');
}

/**
 * True if any top-level value in the query is a nested object (not an array).
 * Such queries can't be safely expressed in a query string, so we fall back
 * to POST to preserve the original argument shape.
 */
function queryHasNestedObject(query: Record<string, unknown>): boolean {
    for (const value of Object.values(query)) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'object' && !Array.isArray(value)) return true;
    }
    return false;
}

// Converter functions
function convertMarket(raw: any): UnifiedMarket {
    const market: UnifiedMarket = {
        ...raw,
        resolutionDate: raw.resolutionDate ? new Date(raw.resolutionDate) : undefined,
        outcomes: (raw.outcomes || []).map((o: any) => ({ ...o })),
        yes: raw.yes ? { ...raw.yes } : undefined,
        no: raw.no ? { ...raw.no } : undefined,
        up: raw.up ? { ...raw.up } : undefined,
        down: raw.down ? { ...raw.down } : undefined,
    };
    Object.defineProperty(market, 'question', {
        get() { return this.title; },
        enumerable: false,
        configurable: true,
    });
    return market;
}


function convertCandle(raw: any): PriceCandle {
    return { ...raw };
}

function convertOrderBook(raw: any): OrderBook {
    return {
        ...raw,
        bids: (raw.bids || []).map((b: any) => ({ ...b })),
        asks: (raw.asks || []).map((a: any) => ({ ...a })),
    };
}

function convertTrade(raw: any): Trade {
    return { ...raw, side: raw.side || "unknown" };
}

function convertOrder(raw: any): Order {
    return { ...raw };
}

function convertPosition(raw: any): Position {
    return { ...raw };
}

function convertBalance(raw: any): Balance {
    return { ...raw };
}

function convertUserTrade(raw: any): UserTrade {
    return { ...raw, side: raw.side || "unknown" };
}

function convertEvent(raw: any): UnifiedEvent {
    const markets = MarketList.from((raw.markets || []).map(convertMarket)) as MarketList;
    return { ...raw, markets };
}

function convertSeries(raw: any): UnifiedSeries {
    const events = Array.isArray(raw.events) ? raw.events.map(convertEvent) : undefined;
    return { ...raw, ...(events !== undefined ? { events } : {}) };
}

function convertSubscriptionSnapshot(raw: any): SubscribedAddressSnapshot {
    return {
        ...raw,
        trades: (raw.trades ?? []).map(convertTrade),
        balances: (raw.balances ?? []).map(convertBalance),
        positions: (raw.positions ?? []).map(convertPosition),
    };
}

/**
 * Base exchange client options.
 */
export interface ExchangeOptions {
    /** Venue-specific API key (e.g. Polymarket CLOB key). Optional. */
    apiKey?: string;

    /** Venue-specific private key. Optional. */
    privateKey?: string;

    /**
     * Hosted pmxt API key.
     *
     * When set (either as this kwarg or via the `PMXT_API_KEY` env
     * variable), and no explicit `baseUrl` / `PMXT_BASE_URL` is set,
     * the Exchange will default to the hosted pmxt endpoint
     * (`https://api.pmxt.dev`) instead of the local sidecar, and send
     * `Authorization: Bearer <pmxtApiKey>` on every request.
     *
     * The local sidecar ignores this header, so it is safe to set in
     * both local and hosted modes.
     */
    pmxtApiKey?: string;

    /**
     * Base URL of the pmxt server.
     *
     * Resolution precedence:
     *   1. Explicit `baseUrl` kwarg.
     *   2. `PMXT_BASE_URL` environment variable.
     *   3. `HOSTED_URL` when `pmxtApiKey` (kwarg or env) is present.
     *   4. Local sidecar (`http://localhost:3847`).
     */
    baseUrl?: string;

    /**
     * Automatically start the local sidecar if it is not running.
     *
     * Default: `true` when the resolved base URL is the local sidecar,
     * `false` otherwise. Explicit `true` / `false` always wins.
     */
    autoStartServer?: boolean;

    /** Optional Polymarket Proxy/Smart Wallet address */
    proxyAddress?: string;

    /** Optional signature type (0=EOA, 1=Proxy) */
    signatureType?: number;

    /**
     * EVM wallet address used for hosted reads/writes. Required for hosted
     * endpoints that operate on a wallet (balances, positions, trades, open
     * orders). When omitted, hosted reads raise {@link MissingWalletAddress}.
     */
    walletAddress?: string;

    /**
     * External signer used for hosted writes. When `privateKey` is supplied
     * without `signer` in hosted mode, an internal {@link EthersSigner} is
     * built from it lazily.
     */
    signer?: Signer;
}

/**
 * Base class for prediction market exchanges.
 *
 * This provides a unified interface for interacting with different
 * prediction market platforms (Polymarket, Kalshi, etc.).
 */
export abstract class Exchange {
    private static readonly OBDATA_WATCH_ALL_SOURCES = new Set([
        "polymarket",
        "limitless",
        "kalshi",
        "opinion",
    ]);

    // Match a canonical 8-4-4-4-12 UUID string. The hosted catalog emits
    // UUIDs in this exact shape, so a regex is both faster and stricter
    // than `crypto.randomUUID()`-style parsing.
    private static readonly _UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    /** True iff `value` parses as a canonical catalog UUID string. */
    protected static _isCatalogUuid(value: string): boolean {
        return Exchange._UUID_RE.test(value);
    }

    // Public so structural interfaces like `HostedClientLike`
    // (./hosted-routing) can read the venue name and hosted credentials
    // without violating protected-access on this base class.
    public exchangeName: string;
    public pmxtApiKey?: string;
    protected apiKey?: string;
    protected privateKey?: string;
    protected proxyAddress?: string;
    protected signatureType?: number;
    protected api: DefaultApi;
    protected config: Configuration;
    protected serverManager: ServerManager;
    protected initPromise: Promise<void>;
    protected isHosted: boolean;

    /** Wallet address used for hosted endpoints that operate on a wallet. */
    public walletAddress?: string;

    /** External signer used for hosted writes. */
    public signer?: Signer;

    /** Escrow namespace — populated in hosted mode for trading-allowlisted venues. */
    public escrow?: Escrow;
    private _hostedAccount?: { depositWallet?: string; signatureType?: number };
    private _accountDiscoveryPromise?: Promise<void>;

    /**
     * Sticky flag: set to `true` the first time a GET read is rejected by
     * the sidecar with 404/405 (i.e. an older pmxt-core that only supports
     * POST). While false, read methods try GET first; once flipped they
     * POST directly and skip the GET probe for the lifetime of this client.
     */
    private _getReadsUnsupported: boolean = false;

    /** Shared WebSocket client for streaming methods (lazy). */
    private _wsClient: SidecarWsClient | null = null;
    /** Sticky flag: true if the sidecar /ws endpoint is unavailable. */
    private _wsUnsupported: boolean = false;
    private readonly _useSidecarLockBaseUrl: boolean;

    constructor(exchangeName: string, options: ExchangeOptions = {}) {
        this.exchangeName = exchangeName.toLowerCase();
        this.apiKey = options.apiKey;
        this.privateKey = options.privateKey;
        this.proxyAddress = options.proxyAddress;
        this.signatureType = options.signatureType;
        this.walletAddress = options.walletAddress;
        this.signer = options.signer;

        // Resolve base URL + hosted API key via the shared precedence
        // rules. See constants.ts for the full resolution table.
        const resolved = resolvePmxtBaseUrl({
            baseUrl: options.baseUrl,
            pmxtApiKey: options.pmxtApiKey,
        });
        const baseUrl = resolved.baseUrl;
        this.pmxtApiKey = resolved.pmxtApiKey;
        this.isHosted = resolved.isHosted;
        const hasBaseUrlOverride = Boolean(
            options.baseUrl ||
            (typeof process !== "undefined" && process.env[ENV.BASE_URL]),
        );
        this._useSidecarLockBaseUrl = !this.isHosted && !hasBaseUrlOverride;

        // Hosted trading bridge: if the caller passed a privateKey but no
        // explicit signer, lazily wrap it in an EthersSigner so that
        // `pmxt.Polymarket(pmxtApiKey, privateKey)` just works without the
        // user touching `signer`. EthersSigner's constructor synchronously
        // builds an ethers.Wallet, so this remains a synchronous bridge —
        // the constructor stays sync.
        if (this.pmxtApiKey && this.privateKey && !this.signer) {
            try {
                this.signer = new EthersSigner(this.privateKey);
            } catch {
                // ethers not installed — defer the error to the first
                // hosted write that actually needs the signer. Read-only
                // hosted callers don't need ethers.
            }
        }

        // Instantiate Escrow namespace for hosted-trading-allowlisted venues.
        if (this.pmxtApiKey && HOSTED_TRADING_VENUES.has(this.exchangeName)) {
            this.escrow = new Escrow(this);
        }

        // auto_start_server defaults: true for local, false for hosted.
        // An explicit value in the options always wins.
        const autoStartServer = options.autoStartServer !== undefined
            ? options.autoStartServer
            : !this.isHosted;

        // Initialize server manager (no network calls happen here — the
        // constructor just stores config).
        this.serverManager = new ServerManager({ baseUrl });

        // Configure the API client with the initial base URL (will be
        // updated to the actual listen port if the local sidecar gets
        // bumped off the default).
        this.config = new Configuration({ basePath: baseUrl });
        this.api = new DefaultApi(this.config);

        // Initialize the server connection asynchronously
        this.initPromise = this.initializeServer(autoStartServer);
    }

    private async initializeServer(autoStartServer: boolean): Promise<void> {
        if (autoStartServer) {
            try {
                await this.serverManager.ensureServerRunning();

                if (this._useSidecarLockBaseUrl) {
                    // Get the actual port the server is running on
                    // (may differ from default if default port was busy)
                    const actualPort = this.serverManager.getRunningPort();
                    const newBaseUrl = `http://localhost:${actualPort}`;

                    // Update API client with actual base URL
                    this.config = new Configuration({
                        basePath: newBaseUrl,
                    });
                    this.api = new DefaultApi(this.config);
                }
            } catch (error) {
                const msg =
                    `Failed to start PMXT server: ${error instanceof Error ? error.message : error}\n\n` +
                    `Please ensure 'pmxt-core' is installed: npm install -g pmxt-core\n` +
                    `Or start the server manually: pmxt-server`;
                const pmxtError = new PmxtError(msg);
                if (error instanceof Error) {
                    (pmxtError as any).cause = error;
                }
                throw pmxtError;
            }
        }
    }

    protected handleResponse(response: any): any {
        if (!response.success) {
            const error = response.error || {};
            if (error && typeof error === "object" && (error.code || error.message)) {
                throw fromServerError(error);
            }
            throw new PmxtError(error.message || "Unknown error");
        }
        return response.data;
    }

    protected getCredentials(): ExchangeCredentials | undefined {
        if (!this.apiKey && !this.privateKey) {
            return undefined;
        }
        return {
            apiKey: this.apiKey,
            privateKey: this.privateKey,
            funderAddress: this.proxyAddress,
            signatureType: this.signatureType,
        };
    }

    protected getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = { ...(this.config.headers as Record<string, string>) };

        // Local sidecar access token (read from the lock file). Only
        // meaningful when talking to a local sidecar we spawned
        // ourselves; harmless elsewhere.
        const accessToken = this.serverManager.getAccessToken();
        if (accessToken) {
            headers['x-pmxt-access-token'] = accessToken;
        }

        // Hosted pmxt bearer token. The hosted service requires this;
        // the local sidecar ignores it. Safe to attach unconditionally
        // whenever a pmxtApiKey has been resolved.
        if (this.pmxtApiKey) {
            headers['Authorization'] = `Bearer ${this.pmxtApiKey}`;
        }

        return headers;
    }

    /**
     * Returns true when this client should dispatch trading methods through
     * the hosted PMXT trading API (`pmxtApiKey` set AND venue is on the
     * hosted-trading allowlist). Used to gate every Group A method.
     */
    protected isHostedTradingMode(): boolean {
        return Boolean(this.pmxtApiKey) && HOSTED_TRADING_VENUES.has(this.exchangeName);
    }

    /**
     * Require a configured signer for a hosted write. Returns the signer or
     * throws {@link MissingWalletAddress} (consistent with the error class
     * surfaced for missing wallet wiring on hosted writes).
     */
    protected requireHostedSigner(): Signer {
        if (!this.signer) {
            throw new MissingWalletAddress(
                "hosted write requires a signer (pass `signer` or `privateKey`)",
            );
        }
        return this.signer;
    }

    /**
     * Resolve the current sidecar base URL.
     *
     * Hosted mode and explicit baseUrl clients keep the configured basePath.
     * Default local clients re-read the lock-file port on every call so they
     * pick up sidecar restarts that land on a different port.
     */
    private resolveBaseUrl(): string {
        if (this.isHosted || !this._useSidecarLockBaseUrl) return this.config.basePath;
        const port = this.serverManager.getRunningPort();
        return `http://localhost:${port}`;
    }

    /**
     * Execute a fetch with retry on connection failures.
     *
     * Only retries on connection-level errors (ECONNREFUSED, ECONNRESET) —
     * never on HTTP responses (4xx, 5xx). On first connection failure,
     * attempts to restart the sidecar.
     */
    private async fetchWithRetry(
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> {
        const delays = [200, 500, 1000];
        let lastError: unknown;

        for (let attempt = 0; attempt <= delays.length; attempt++) {
            try {
                return await fetch(input, {
                    ...init,
                    signal: AbortSignal.timeout(30_000),
                });
            } catch (error) {
                lastError = error;
                if (attempt >= delays.length) break;

                // Connection failed — try to restart the sidecar on first failure
                if (attempt === 0 && !this.isHosted) {
                    try {
                        await this.serverManager.ensureServerRunning();
                    } catch (err) {
                        logger.warn('PmxtClient: server restart failed during retry', { attempt, error: String(err) });
                    }
                }
                await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            }
        }
        throw lastError;
    }

    /**
     * Return the shared WebSocket client, creating it on first use.
     *
     * Returns `null` if the sidecar /ws endpoint was previously found
     * to be unavailable.
     */
    private async getOrCreateWs(): Promise<SidecarWsClient | null> {
        if (this._wsUnsupported) return null;
        if (this._wsClient?.connected) return this._wsClient;

        const host = this.resolveBaseUrl();
        const accessToken = this.isHosted
            ? this.pmxtApiKey
            : this.serverManager.getAccessToken();
        const authParamName = this.isHosted ? "apiKey" : "token";

        const client = new SidecarWsClient(host, accessToken || undefined, authParamName);
        try {
            // Trigger connection to validate the endpoint exists.
            // subscribe() calls ensureConnected internally, but we want
            // to detect failure eagerly so we can set _wsUnsupported.
            await client.subscribe(
                this.exchangeName,
                "_ping",
                [],
                undefined,
                3000,
            ).catch(() => {
                // Expected -- no _ping method. The connection itself
                // succeeded if we got a WS error frame back. If the
                // connection itself failed, we'll catch below.
            });
            // If we got here without the connect promise rejecting,
            // the WS endpoint exists.
            if (!client.connected) {
                throw new Error("WS handshake failed");
            }
        } catch (err) {
            logger.warn('PmxtClient: WebSocket probe failed, falling back to HTTP', { error: String(err) });
            this._wsUnsupported = true;
            client.close();
            return null;
        }

        this._wsClient = client;
        return this._wsClient;
    }

    /**
     * Attempt to use the WS transport for a watch method.
     * Returns the raw data on success, or `null` if WS is unavailable.
     */
    private async watchViaWs(
        method: string,
        args: any[],
    ): Promise<any | null> {
        const ws = await this.getOrCreateWs();
        if (!ws) return null;

        try {
            return await ws.subscribe(
                this.exchangeName,
                method,
                args,
                this.getCredentials() as Record<string, any> | undefined,
            );
        } catch (error) {
            if (this.isWsTransportUnavailableError(error)) {
                return null;
            }
            throw error;
        }
    }

    private wsTransportUnavailableError(method: string): PmxtError {
        return new PmxtError(`${method}() requires WebSocket transport — connection failed`);
    }

    private isWsTransportUnavailableError(error: unknown): boolean {
        return error instanceof PmxtError
            && /connection failed|no websocket|websocket.*not connected/i.test(error.message);
    }

    private defaultWatchAllOrderBookVenues(): string[] | undefined {
        if (Exchange.OBDATA_WATCH_ALL_SOURCES.has(this.exchangeName)) {
            return [this.exchangeName];
        }
        return undefined;
    }

    private getWsInternals(ws: SidecarWsClient): SidecarWsClientInternals {
        return ws as unknown as SidecarWsClientInternals;
    }

    private wsSubscriptionKey(method: string, args: any[]): string {
        const firstArg = args[0] ?? "";
        return Array.isArray(firstArg)
            ? `${method}:${[...firstArg].sort().join(",")}`
            : `${method}:${firstArg}`;
    }

    private getWsSubscriptionId(ws: SidecarWsClient, method: string, args: any[]): string | undefined {
        const internals = this.getWsInternals(ws);
        const subKey = this.wsSubscriptionKey(method, args);
        return internals.activeSubs.get(subKey);
    }

    private clearWsSubscription(ws: SidecarWsClient, method: string, args: any[]): void {
        const internals = this.getWsInternals(ws);
        const subKey = this.wsSubscriptionKey(method, args);
        const requestId = internals.activeSubs.get(subKey);
        if (!requestId) return;

        const sub = internals.subscriptions.get(requestId);
        if (sub?.reject) {
            sub.reject(new PmxtError(`${method} subscription cancelled`));
        }

        internals.activeSubs.delete(subKey);
        internals.subscriptions.delete(requestId);
        internals.dataQueues.delete(requestId);
        internals.dataStore.delete(requestId);

        const firstArg = args[0] ?? "";
        const symbols = Array.isArray(firstArg)
            ? firstArg.map(String)
            : firstArg
                ? [String(firstArg)]
                : [];
        for (const symbol of symbols) {
            internals.dataStore.delete(`${requestId}:${symbol}`);
        }
    }

    private async sendWsMessage(
        ws: SidecarWsClient,
        message: Record<string, any>,
    ): Promise<void> {
        const internals = this.getWsInternals(ws);
        await internals.ensureConnected();

        const socket = internals.ws;
        if (!socket) {
            throw new PmxtError('[ws-client] Cannot send: WebSocket not connected');
        }
        socket.send(JSON.stringify(message));
    }

    // Low-Level API Access

    /**
     * Call an exchange-specific REST endpoint by its operationId.
     * This provides direct access to all implicit API methods defined in
     * the exchange's OpenAPI spec (e.g., Polymarket CLOB, Kalshi trading API).
     *
     * @param operationId - The operationId (or auto-generated name) of the endpoint
     * @param params - Optional parameters to pass to the endpoint
     * @returns The raw response data from the exchange
     *
     * @example
     * ```typescript
     * // Call a Polymarket CLOB endpoint directly
     * const result = await poly.callApi('getMarket', { condition_id: '0x...' });
     * ```
     */
    async callApi(operationId: string, params?: Record<string, any>): Promise<any> {
        await this.initPromise;
        try {
            const url = `${this.resolveBaseUrl()}/api/${this.exchangeName}/callApi`;

            const requestBody: any = {
                args: [operationId, params],
                credentials: this.getCredentials()
            };

            const response = await this.fetchWithRetry(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders()
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }

            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to call API '${operationId}': ${error}`);
        }
    }

    /**
     * Dispatch a sidecar read method, preferring GET but transparently
     * falling back to POST for full backward compatibility.
     *
     * GET is used when:
     *   - the client has no per-instance credentials (the sidecar's GET
     *     handler intentionally drops credentials to avoid leaking them
     *     through query strings and access logs), and
     *   - the sidecar hasn't already returned 404/405 for a previous GET
     *     in this client's lifetime (`_getReadsUnsupported`), and
     *   - the query has no nested objects (query strings can't round-trip
     *     arbitrary JSON).
     *
     * Otherwise (or if the GET attempt is rejected with 404/405) the call
     * is sent as POST with the original `{args, credentials}` body so that
     * SDK users talking to an older pmxt-core continue to work unchanged.
     *
     * @internal — shared transport used by every generated read method.
     */
    protected async sidecarReadRequest(
        methodName: string,
        query: Record<string, unknown>,
        args: unknown[],
    ): Promise<any> {
        const resolvedBase = this.resolveBaseUrl();
        const baseUrl = `${resolvedBase}/api/${this.exchangeName}/${methodName}`;
        const hasCredentials = this.getCredentials() !== undefined;

        if (!hasCredentials && !this._getReadsUnsupported && !queryHasNestedObject(query)) {
            const qs = buildSidecarQueryString(query);
            const getUrl = qs ? `${baseUrl}?${qs}` : baseUrl;
            const response = await this.fetchWithRetry(getUrl, {
                method: 'GET',
                headers: this.getAuthHeaders(),
            });

            // 404 / 405 => older sidecar without GET dispatch. Remember
            // the downgrade so future calls skip the probe, and fall
            // through to POST below.
            if (response.status === 404 || response.status === 405) {
                await response.text().catch(() => undefined);
                this._getReadsUnsupported = true;
            } else {
                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    if (body.error && typeof body.error === "object") {
                        throw fromServerError(body.error);
                    }
                    throw new PmxtError(body.error?.message || response.statusText);
                }
                return response.json();
            }
        }

        // POST fallback — identical to the original per-method template.
        const response = await this.fetchWithRetry(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify({ args, credentials: this.getCredentials() }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            if (body.error && typeof body.error === "object") {
                throw fromServerError(body.error);
            }
            throw new PmxtError(body.error?.message || response.statusText);
        }
        return response.json();
    }

    /**
     * Dispatch a sidecar POST method with positional args and credentials.
     *
     * @internal - shared transport for hand-maintained methods that should
     * never use the GET read path.
     */
    protected async sidecarPostRequest(methodName: string, args: unknown[]): Promise<any> {
        const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/${methodName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify({ args, credentials: this.getCredentials() }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            if (body.error && typeof body.error === "object") {
                throw fromServerError(body.error);
            }
            throw new PmxtError(body.error?.message || response.statusText);
        }
        return response.json();
    }

    /**
     * Read a hosted catalog endpoint directly.
     *
     * Hosted-only Router APIs such as matched clusters are not part of the
     * core sidecar method namespace. They live under /v0 and return their own
     * response envelopes, so callers intentionally receive the raw JSON body.
     */
    protected async catalogReadRequest(path: string, query: Record<string, unknown> = {}): Promise<any> {
        const qs = buildSidecarQueryString(query);
        const url = `${this.resolveBaseUrl()}${path}${qs ? `?${qs}` : ''}`;
        const response = await this.fetchWithRetry(url, {
            method: 'GET',
            headers: this.getAuthHeaders(),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            if (body.error && typeof body.error === "object") {
                throw fromServerError(body.error);
            }
            throw new PmxtError(body.error?.message || response.statusText);
        }
        return response.json();
    }

    // BEGIN GENERATED METHODS

    async loadMarkets(reload: boolean = false): Promise<Record<string, UnifiedMarket>> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(reload);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/loadMarkets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            const result: Record<string, UnifiedMarket> = {};
            for (const [key, value] of Object.entries(data as any)) {
                result[key] = convertMarket(value);
            }
            return result;
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to loadMarkets: ${error}`);
        }
    }

    async fetchMarkets(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchMarkets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertMarket);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchMarkets: ${error}`);
        }
    }

    async fetchMarketsPaginated(params?: any): Promise<PaginatedMarketsResult> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchMarketsPaginated`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return {
                data: (data.data || []).map(convertMarket),
                total: data.total,
                nextCursor: data.nextCursor,
            };
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchMarketsPaginated: ${error}`);
        }
    }

    async fetchEventsPaginated(params?: any): Promise<PaginatedEventsResult> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchEventsPaginated`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return {
                data: (data.data || []).map(convertEvent),
                total: data.total,
                nextCursor: data.nextCursor,
            };
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchEventsPaginated: ${error}`);
        }
    }

    async fetchEvents(params?: EventFetchParams): Promise<UnifiedEvent[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchEvents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertEvent);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchEvents: ${error}`);
        }
    }

    async fetchSeries(params?: SeriesFetchParams): Promise<UnifiedSeries[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchSeries`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertSeries);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchSeries: ${error}`);
        }
    }

    async fetchMarket(params?: MarketFetchParams): Promise<UnifiedMarket> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchMarket`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertMarket(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchMarket: ${error}`);
        }
    }

    async fetchEvent(params?: EventFetchParams): Promise<UnifiedEvent> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchEvent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertEvent(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchEvent: ${error}`);
        }
    }

    async fetchOrderBook(outcomeId: string | MarketOutcome, limit?: number, params?: FetchOrderBookParams): Promise<OrderBook | OrderBook[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(resolveOutcomeId(outcomeId));
            if (limit !== undefined) args.push(limit);
            if (params !== undefined) {
                if (limit === undefined) args.push(null);
                args.push(params);
            }
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchOrderBook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            if (Array.isArray(data)) {
                return data.map(convertOrderBook);
            }
            return convertOrderBook(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchOrderBook: ${error}`);
        }
    }

    async fetchOrderBooks(outcomeIds: (string | MarketOutcome)[]): Promise<Record<string, OrderBook>> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(outcomeIds.map(resolveOutcomeId));
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchOrderBooks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            const result: Record<string, OrderBook> = {};
            for (const [key, value] of Object.entries(data as any)) {
                result[key] = convertOrderBook(value);
            }
            return result;
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchOrderBooks: ${error}`);
        }
    }

    async submitOrder(built: BuiltOrder): Promise<Order> {
        await this.initPromise;
        if (this.isHosted) {
            throw new PmxtError("submitOrder is not available in hosted mode. Use createOrder instead.");
        }
        try {
            const args: any[] = [];
            args.push(built);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/submitOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to submitOrder: ${error}`);
        }
    }

    async cancelOrder(orderId: string): Promise<Order> {
        await this.initPromise;
        if (this.isHosted) {
            return this._hostedCancelOrder(orderId);
        }
        try {
            const args: any[] = [];
            args.push(orderId);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/cancelOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to cancelOrder: ${error}`);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        await this.initPromise;
        if (this.isHosted) {
            const route = HOSTED_METHOD_ROUTES.get("fetchOrder")!;
            const path = formatRoutePath(route, { order_id: orderId });
            const data = await _tradingRequest(this, { method: route.method, path });
            const payload = data && typeof data === "object" && "order" in data
                ? (data as { order: unknown }).order
                : data;
            return orderFromV0(payload as Record<string, unknown>);
        }
        try {
            const args: any[] = [];
            args.push(orderId);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchOrder: ${error}`);
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        await this.initPromise;
        if (this.isHosted) {
            const resolvedAddress = resolveWalletAddress(this, undefined);
            const route = HOSTED_METHOD_ROUTES.get("fetchOpenOrders")!;
            const path = formatRoutePath(route, {});
            const params: Record<string, string> = { address: resolvedAddress };
            if (marketId !== undefined) params.market_id = marketId;
            const data = await _tradingRequest(this, { method: route.method, path, params });
            const list = Array.isArray(data)
                ? data
                : (data && Array.isArray((data as any).orders) ? (data as any).orders : []);
            return list.map((o: unknown) => orderFromV0(o as Record<string, unknown>));
        }
        try {
            const args: any[] = [];
            if (marketId !== undefined) args.push(marketId);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchOpenOrders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertOrder);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchOpenOrders: ${error}`);
        }
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        await this.initPromise;
        if (this.isHosted) {
            const resolvedAddress = resolveWalletAddress(this, undefined);
            const route = HOSTED_METHOD_ROUTES.get("fetchMyTrades")!;
            const path = formatRoutePath(route, { address: resolvedAddress });
            const data = await _tradingRequest(this, { method: route.method, path });
            const list = Array.isArray(data) ? data : (data && Array.isArray((data as any).trades) ? (data as any).trades : []);
            return list.map((t: unknown) => userTradeFromV0(t as Record<string, unknown>));
        }
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchMyTrades`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertUserTrade);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchMyTrades: ${error}`);
        }
    }

    async fetchClosedOrders(params?: OrderHistoryParams): Promise<Order[]> {
        await this.initPromise;
        if (this.isHosted) {
            throw new NotSupported("fetchClosedOrders is not available in hosted trading mode.");
        }
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchClosedOrders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertOrder);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchClosedOrders: ${error}`);
        }
    }

    async fetchAllOrders(params?: OrderHistoryParams): Promise<Order[]> {
        await this.initPromise;
        if (this.isHosted) {
            throw new NotSupported("fetchAllOrders is not available in hosted trading mode.");
        }
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchAllOrders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertOrder);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchAllOrders: ${error}`);
        }
    }

    async fetchPositions(address?: string): Promise<Position[]> {
        await this.initPromise;
        if (this.isHosted) {
            const resolvedAddress = resolveWalletAddress(this, address);
            const route = HOSTED_METHOD_ROUTES.get("fetchPositions")!;
            const path = formatRoutePath(route, { address: resolvedAddress });
            const data = await _tradingRequest(this, { method: route.method, path });
            const list: unknown[] = Array.isArray(data)
                ? data
                : (data && Array.isArray((data as any).positions) ? (data as any).positions : []);
            return list.map((p) => positionFromV0(p as Record<string, unknown>));
        }
        try {
            const args: any[] = [];
            if (address !== undefined) args.push(address);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchPositions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertPosition);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchPositions: ${error}`);
        }
    }

    async fetchBalance(address?: string): Promise<Balance[]> {
        await this.initPromise;
        if (this.isHosted) {
            const resolvedAddress = resolveWalletAddress(this, address);
            const route = HOSTED_METHOD_ROUTES.get("fetchBalance")!;
            const path = formatRoutePath(route, { address: resolvedAddress });
            const data = await _tradingRequest(this, { method: route.method, path });
            const list: unknown[] = Array.isArray(data)
                ? data
                : (data && Array.isArray((data as any).balances) ? (data as any).balances : []);
            return list.map((b) => balanceFromV0(b as Record<string, unknown>));
        }
        try {
            const args: any[] = [];
            if (address !== undefined) args.push(address);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchBalance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertBalance);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchBalance: ${error}`);
        }
    }

    async unwatchOrderBook(outcomeId: string | MarketOutcome): Promise<void> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(resolveOutcomeId(outcomeId));
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/unwatchOrderBook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to unwatchOrderBook: ${error}`);
        }
    }

    async unwatchAddress(address: string): Promise<void> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(address);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/unwatchAddress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to unwatchAddress: ${error}`);
        }
    }

    async close(): Promise<void> {
        await this.initPromise;
        try {
            const args: any[] = [];
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to close: ${error}`);
        }
    }

    async fetchMarketMatches(params?: any): Promise<any[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchMarketMatches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchMarketMatches: ${error}`);
        }
    }

    async fetchMatches(params: any): Promise<any[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchMatches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchMatches: ${error}`);
        }
    }

    async fetchEventMatches(params?: any): Promise<any[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchEventMatches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchEventMatches: ${error}`);
        }
    }

    async compareMarketPrices(params: any): Promise<any[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/compareMarketPrices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to compareMarketPrices: ${error}`);
        }
    }

    async fetchRelatedMarkets(params: any): Promise<any[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchRelatedMarkets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchRelatedMarkets: ${error}`);
        }
    }

    async fetchMatchedMarkets(params?: FetchMatchedMarketClustersParams): Promise<any[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchMatchedMarkets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchMatchedMarkets: ${error}`);
        }
    }

    async fetchMatchedPrices(params?: any): Promise<any[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchMatchedPrices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchMatchedPrices: ${error}`);
        }
    }

    async fetchHedges(params: any): Promise<any[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchHedges`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchHedges: ${error}`);
        }
    }

    async fetchArbitrage(params?: any): Promise<any[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/fetchArbitrage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetchArbitrage: ${error}`);
        }
    }

    // END GENERATED METHODS

    /**
     * Get historical price candles.
     *
     * @param outcomeId - Outcome ID (from market.outcomes[].outcomeId)
     * @param params - History filter parameters
     * @returns List of price candles
     *
     * @example
     * ```typescript
     * const markets = await exchange.fetchMarkets({ query: "Trump" });
     * const outcomeId = markets[0].outcomes[0].outcomeId;
     * const candles = await exchange.fetchOHLCV(outcomeId, {
     *   resolution: "1h",
     *   limit: 100
     * });
     * ```
     */
    async fetchOHLCV(
        outcomeId: string | MarketOutcome,
        params: any
    ): Promise<PriceCandle[]> {
        await this.initPromise;
        const resolvedOutcomeId = resolveOutcomeId(outcomeId);
        try {
            const paramsDict: any = { resolution: params.resolution };
            if (params.start) {
                paramsDict.start = params.start.toISOString();
            }
            if (params.end) {
                paramsDict.end = params.end.toISOString();
            }
            if (params.limit) {
                paramsDict.limit = params.limit;
            }

            const args = [resolvedOutcomeId, paramsDict];
            const query = { outcomeId: resolvedOutcomeId, ...paramsDict };
            const json = await this.sidecarReadRequest('fetchOHLCV', query, args);
            const data = this.handleResponse(json);
            return data.map(convertCandle);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetch OHLCV: ${error}`);
        }
    }

    /**
     * Get trade history for an outcome.
     *
     * Note: Polymarket requires API key.
     *
     * @param outcomeId - Outcome ID
     * @param params - History filter parameters
     * @returns List of trades
     */
    async fetchTrades(
        outcomeId: string | MarketOutcome,
        params: any
    ): Promise<Trade[]> {
        await this.initPromise;
        const resolvedOutcomeId = resolveOutcomeId(outcomeId);
        try {
            const paramsDict: any = {};
            if (params.resolution) {
                paramsDict.resolution = params.resolution;
            }
            if (params.limit) {
                paramsDict.limit = params.limit;
            }
            if (params.start) {
                paramsDict.start = params.start instanceof Date ? params.start.toISOString() : params.start;
            }
            if (params.end) {
                paramsDict.end = params.end instanceof Date ? params.end.toISOString() : params.end;
            }

            const args = [resolvedOutcomeId, paramsDict];
            const query = { outcomeId: resolvedOutcomeId, ...paramsDict };
            const json = await this.sidecarReadRequest('fetchTrades', query, args);
            const data = this.handleResponse(json);
            return data.map(convertTrade);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to fetch trades: ${error}`);
        }
    }

    // WebSocket Streaming Methods

    /**
     * Watch real-time order book updates via WebSocket.
     *
     * Returns a promise that resolves with the next order book update.
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param outcomeId - Outcome ID to watch
     * @param limit - Optional depth limit for order book
     * @param params - Optional exchange-specific parameters
     * @returns Next order book update
     *
     * @example
     * ```typescript
     * // Stream order book updates
     * while (true) {
     *   const orderBook = await exchange.watchOrderBook(outcomeId);
     *   console.log(`Best bid: ${orderBook.bids[0].price}`);
     *   console.log(`Best ask: ${orderBook.asks[0].price}`);
     * }
     * ```
     */
    async watchOrderBook(outcomeId: string | MarketOutcome, limit?: number, params: Record<string, any> = {}): Promise<OrderBook> {
        await this.initPromise;
        const resolvedOutcomeId = resolveOutcomeId(outcomeId);
        const args: any[] = [resolvedOutcomeId];
        if (limit !== undefined) {
            args.push(limit);
        }
        if (Object.keys(params).length > 0) {
            if (limit === undefined) {
                args.push(undefined);
            }
            args.push(params);
        }

        const wsData = await this.watchViaWs("watchOrderBook", args);
        if (wsData !== null) {
            return convertOrderBook(wsData);
        }

        throw this.wsTransportUnavailableError("watchOrderBook");
    }

    /**
     * Watch real-time order book updates for multiple outcomes at once.
     *
     * Returns a record mapping each outcome ID (ticker) to its latest
     * order book snapshot. Call repeatedly in a loop to stream updates
     * (CCXT Pro pattern).
     *
     * @param outcomeIds - Array of outcome IDs (or MarketOutcome objects)
     * @param limit - Optional depth limit for each order book
     * @param params - Optional exchange-specific parameters
     * @returns Record mapping ticker to OrderBook
     *
     * @example
     * ```typescript
     * const ids = markets.slice(0, 3).map(m => m.outcomes[0].outcomeId);
     * while (true) {
     *   const books = await exchange.watchOrderBooks(ids);
     *   for (const [ticker, ob] of Object.entries(books)) {
     *     console.log(`${ticker}: bid=${ob.bids[0]?.price}`);
     *   }
     * }
     * ```
     */
    async watchOrderBooks(
        outcomeIds: (string | MarketOutcome)[],
        limit?: number,
        params: Record<string, any> = {},
    ): Promise<Record<string, OrderBook>> {
        await this.initPromise;
        const resolvedIds = outcomeIds.map(resolveOutcomeId);
        const args: any[] = [resolvedIds];
        if (limit !== undefined) {
            args.push(limit);
        }
        if (Object.keys(params).length > 0) {
            if (limit === undefined) {
                args.push(undefined);
            }
            args.push(params);
        }

        try {
            const ws = await this.getOrCreateWs();
            if (!ws) {
                throw this.wsTransportUnavailableError("watchOrderBooks");
            }

            const rawResult = await ws.subscribeBatch(
                this.exchangeName,
                "watchOrderBooks",
                args,
                this.getCredentials() as Record<string, any> | undefined,
            );
            if (rawResult && typeof rawResult === "object") {
                const result: Record<string, OrderBook> = {};
                for (const [k, v] of Object.entries(rawResult)) {
                    if (v && typeof v === "object") {
                        result[k] = convertOrderBook(v);
                    }
                }
                return result;
            }

            throw new PmxtError("watchOrderBooks: unexpected response shape from server");
        } catch (error) {
            if (this.isWsTransportUnavailableError(error)) {
                throw this.wsTransportUnavailableError("watchOrderBooks");
            }
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to watch order books: ${error}`);
        }
    }

    /**
     * Stream all orderbook updates across venues via the hosted WebSocket API.
     *
     * Returns a promise that resolves with the next book event.
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     * Requires hosted mode (`pmxtApiKey` set).
     *
     * @param venues - Optional venue filter. Defaults to this exchange's venue
     *   for venue clients (e.g. Kalshi -> ["kalshi"]); Router defaults to all venues.
     * @returns Next event with source, symbol, and orderbook
     *
     * @example
     * ```typescript
     * const poly = new Polymarket({ pmxtApiKey: "pmxt_xxx" });
     * while (true) {
     *   const event = await poly.watchAllOrderBooks();
     *   console.log(event.source, event.symbol, event.orderbook.bids[0]);
     * }
     * ```
     */
    async watchAllOrderBooks(venues?: string[]): Promise<FirehoseEvent> {
        await this.initPromise;

        if (!this.isHosted) {
            throw new PmxtError("watchAllOrderBooks() requires hosted mode (set pmxtApiKey)");
        }

        const effectiveVenues = venues ?? this.defaultWatchAllOrderBookVenues();
        const args: any[] = effectiveVenues?.length ? [effectiveVenues] : [];
        const wsData = await this.watchViaWs("watchAllOrderBooks", args);
        if (wsData !== null) {
            return {
                source: (wsData as any)._source || "",
                symbol: (wsData as any)._symbol || "",
                orderbook: convertOrderBook(wsData),
            };
        }

        throw this.wsTransportUnavailableError("watchAllOrderBooks");
    }

    /**
     * Stream all orderbook updates across venues.
     *
     * @deprecated Use {@link watchAllOrderBooks} instead.
     * @param venues - Optional venue filter
     * @returns Next event with source, symbol, and orderbook
     */
    async firehose(venues?: string[]): Promise<FirehoseEvent> {
        return this.watchAllOrderBooks(venues);
    }

    /**
     * Watch real-time trade updates via WebSocket.
     *
     * Returns a promise that resolves with the next trade(s).
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param outcomeId - Outcome ID to watch
     * @param address - Public wallet to be watched
     * @param since - Optional timestamp to filter trades from
     * @param limit - Optional limit for number of trades
     * @returns Next trade update(s)
     *
     * @example
     * ```typescript
     * // Stream trade updates
     * while (true) {
     *   const trades = await exchange.watchTrades(outcomeId);
     *   for (const trade of trades) {
     *     console.log(`Trade: ${trade.price} @ ${trade.amount}`);
     *   }
     * }
     * ```
     */
    async watchTrades(
        outcomeId: string | MarketOutcome,
        address?: string,
        since?: number,
        limit?: number
    ): Promise<Trade[]> {
        await this.initPromise;
        const resolvedOutcomeId = resolveOutcomeId(outcomeId);
        const args: any[] = [resolvedOutcomeId];
        if (address !== undefined) {
            args.push(address);
        }
        if (since !== undefined) {
            args.push(since);
        }
        if (limit !== undefined) {
            args.push(limit);
        }

        const wsData = await this.watchViaWs("watchTrades", args);
        if (wsData !== null) {
            return wsData.map(convertTrade);
        }

        throw this.wsTransportUnavailableError("watchTrades");
    }

    /**
     * Watch real-time updates of a public wallet via WebSocket.
     *
     * Returns a promise that resolves with the next update(s).
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param address - Public wallet to be watched
     * @param types - Subscription options including 'trades', 'positions', and 'balances'
     * @returns Next update(s)
     *
     * @example
     * ```typescript
     * // Stream updates of a public wallet address
     * while (true) {
     *   const snapshots = await exchange.watchAddress(address, types);
     *   for (const snapshot of snapshots) {
     *     console.log(`Trade: ${snapshot.trades}`);
     *   }
     * }
     * ```
     */
    async watchAddress(
        address: string,
        types?: SubscriptionOption[],
    ): Promise<SubscribedAddressSnapshot> {
        await this.initPromise;
        try {
            const args: any[] = [address];
            if (types !== undefined) {
                args.push(types);
            }
            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/watchAddress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertSubscriptionSnapshot(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to watch address: ${error}`);
        }
    }

    // Trading Methods (require authentication)

    /**
     * Build an order payload without submitting it to the exchange.
     * Returns the exchange-native signed order or transaction payload for
     * inspection, forwarding through a middleware layer, or deferred
     * submission via {@link submitOrder}.
     *
     * You can specify the market either with explicit marketId/outcomeId,
     * or by passing an outcome object directly (e.g., market.yes).
     *
     * @param params - Order parameters (same as createOrder)
     * @returns A BuiltOrder containing the exchange-native payload
     *
     * @example
     * ```typescript
     * // Build, inspect, then submit:
     * const built = await exchange.buildOrder({
     *   marketId: "663583",
     *   outcomeId: "10991849...",
     *   side: "buy",
     *   type: "limit",
     *   amount: 10,
     *   price: 0.55
     * });
     *
     * console.log(built.signedOrder); // inspect before submitting
     * const order = await exchange.submitOrder(built);
     *
     * // Using outcome shorthand:
     * const yes = market.yes;
     * if (!yes) throw new Error("Market has no YES outcome");
     *
     * const built2 = await exchange.buildOrder({
     *   outcome: yes,
     *   side: "buy",
     *   type: "market",
     *   amount: 10
     * });
     * ```
     */
    async buildOrder(params: CreateOrderInput): Promise<BuiltOrder> {
        if (this.isHostedTradingMode()) {
            return this._hostedBuildOrder(params);
        }
        if (this.isHosted) {
            throw new PmxtError(
                "Trade execution is not available through the hosted API. " +
                "Use the local PMXT SDK with your venue credentials instead. " +
                "See https://pmxt.dev/docs/quickstart for setup instructions."
            );
        }
        await this.initPromise;
        try {
            let marketId = params.marketId;
            let outcomeId = params.outcomeId;

            if (params.outcome) {
                if (marketId !== undefined || outcomeId !== undefined) {
                    throw new PmxtError(
                        "Cannot specify both 'outcome' and 'marketId'/'outcomeId'. Use one or the other."
                    );
                }
                const outcome: MarketOutcome = params.outcome;
                if (!outcome.marketId) {
                    throw new PmxtError(
                        "outcome.marketId is not set. Ensure the outcome comes from a fetched market."
                    );
                }
                marketId = outcome.marketId;
                outcomeId = outcome.outcomeId;
            }

            const paramsDict: any = {
                marketId,
                outcomeId,
                side: params.side,
                type: params.type,
                amount: params.amount,
            };
            if (params.price !== undefined) {
                paramsDict.price = params.price;
            }
            if (params.fee !== undefined) {
                paramsDict.fee = params.fee;
            }
            if (params.tickSize !== undefined) {
                paramsDict.tickSize = params.tickSize;
            }
            if (params.negRisk !== undefined) {
                paramsDict.negRisk = params.negRisk;
            }
            if (params.onBehalfOf !== undefined) {
                paramsDict.onBehalfOf = params.onBehalfOf;
            }

            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/buildOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args: [paramsDict], credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data as BuiltOrder;
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to build order: ${error}`);
        }
    }

    private async _discoverHostedAccount(): Promise<void> {
        if (this._hostedAccount) return;
        if (!this._accountDiscoveryPromise) {
            this._accountDiscoveryPromise = (async () => {
                try {
                    const res = await this.fetchWithRetry(
                        `${this.resolveBaseUrl()}/v0/account`,
                        { method: 'GET', headers: { ...this.getAuthHeaders() } },
                    );
                    if (res.ok) {
                        const body = await res.json();
                        this._hostedAccount = { depositWallet: body.deposit_wallet, signatureType: body.signature_type };
                    } else { this._hostedAccount = {}; }
                } catch (err) {
                    logger.warn('PmxtClient: hosted account discovery failed', { error: String(err) });
                    this._hostedAccount = {};
                }
            })();
        }
        await this._accountDiscoveryPromise;
    }

    private async _executeSorOrder(params: any): Promise<Order> {
        await this._discoverHostedAccount();

        const buildRes = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/sor/buildOrder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify({ args: [params] }),
        });
        if (!buildRes.ok) throw new PmxtError(`buildOrder failed: ${await buildRes.text()}`);
        const buildJson = await buildRes.json();
        const { orderId, legs } = buildJson.data || buildJson;

        const fills: any[] = [];
        for (const leg of legs) {
            try {
                const { Polymarket, Limitless } = require('pmxt-core');
                const VenueClass = leg.venue === 'polymarket' ? Polymarket : leg.venue === 'limitless' ? Limitless : null;
                if (!VenueClass) throw new Error(`unsupported venue: ${leg.venue}`);

                const venueOpts: any = { privateKey: this.privateKey };
                if (leg.venue === 'polymarket' && this._hostedAccount?.depositWallet) {
                    venueOpts.funderAddress = this._hostedAccount.depositWallet;
                    venueOpts.signatureType = this._hostedAccount.signatureType || 3;
                }
                const venue = new VenueClass(venueOpts);
                const orderParams: any = { outcomeId: leg.tokenId, side: leg.side, amount: leg.shares };
                if (leg.orderType === 'market') { orderParams.type = 'market'; orderParams.price = leg.price; }
                else { orderParams.price = leg.price; }
                const order = await venue.createOrder(orderParams);
                fills.push({ venue: leg.venue, venueOrderId: order.id, venueMarketId: leg.venueMarketId, venueOutcomeId: leg.venueOutcomeId, shares: order.filled ?? leg.shares, price: order.price || leg.price, status: order.status });
            } catch (err: any) {
                fills.push({ venue: leg.venue, venueMarketId: leg.venueMarketId, venueOutcomeId: leg.venueOutcomeId, shares: leg.shares, price: leg.price, status: 'failed', error: err.message });
            }
        }

        const submitRes = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/sor/submitOrder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
            body: JSON.stringify({ args: [{ orderId, fills }] }),
        });
        if (!submitRes.ok) throw new PmxtError(`submitOrder failed: ${await submitRes.text()}`);
        const submitJson = await submitRes.json();
        const submitData = submitJson.data || submitJson;
        if (submitData.status === 'failed' && submitData.errors?.length) {
            throw new PmxtError(submitData.errors[0]);
        }
        return convertOrder(submitData);
    }

    /**
     * Hosted-mode buildOrder: validate inputs locally, then POST to the
     * trading service's `build-order` endpoint and return a BuiltOrder
     * that carries the original build_request for Layer-2 economic checks
     * at submit time.
     */
    private async _hostedBuildOrder(
        params: CreateOrderInput,
    ): Promise<BuiltOrder> {
        const body = this._hostedBuildOrderBody(params);
        const route = HOSTED_METHOD_ROUTES.get("buildOrder")!;
        const data = await _tradingRequest(this, {
            method: route.method,
            path: route.path,
            body,
        }) as Record<string, unknown>;
        // Attach the originating build_request so submit can run economic
        // validation without an extra catalog round-trip.
        const built = { ...data, build_request: body } as unknown as BuiltOrder;
        return built;
    }

    /**
     * Hosted-mode createOrder: build → sign → submit single-call wrapper.
     */
    private async _hostedCreateOrder(params: CreateOrderInput): Promise<Order> {
        const built = await this._hostedBuildOrder(params);
        return this._hostedSubmitOrder(built);
    }

    /**
     * Hosted-mode submitOrder: validate the stored build response, sign the
     * typed_data (and pull_typed_data for cross-chain venue sells), then
     * POST to `/v0/trade/submit-order`.
     *
     * Restored after PR #1058 (Limitless hosted wire-up) accidentally
     * removed it but left the call site + signing imports intact.
     */
    private async _hostedSubmitOrder(built: BuiltOrder): Promise<Order> {
        const signer = this.requireHostedSigner();
        if (!this.walletAddress) {
            throw new MissingWalletAddress(
                "hosted submitOrder requires walletAddress",
            );
        }
        const payload = built as unknown as Record<string, unknown>;
        const typedData = payload["typed_data"] as TypedData | undefined;
        if (!typedData) {
            throw new HostedInvalidSignature(0, "typed_data missing from built order");
        }
        const buildRequest = (payload["build_request"] as Record<string, unknown> | undefined)
            ?? ((payload["params"] as Record<string, unknown> | undefined)?.["build_request"] as Record<string, unknown> | undefined);

        const side = String(buildRequest?.["side"] ?? "buy");
        const primaryRoute = this._hostedTypedDataRoute(side, false);
        validateTypedData(typedData, primaryRoute, this.walletAddress);
        if (buildRequest) {
            validateEconomics(typedData, primaryRoute, buildRequest, payload);
        }

        const signature = await signer.signTypedData(typedData);
        verifySignature(typedData, signature, signer.address);

        const body: Record<string, unknown> = {
            built_order_id: payload["built_order_id"],
            signature,
        };

        const pullTypedData = payload["pull_typed_data"] as TypedData | undefined;
        if (pullTypedData) {
            const pullRoute = this._hostedTypedDataRoute(side, true);
            if (pullRoute) {
                validateTypedData(pullTypedData, pullRoute, this.walletAddress);
            }
            const pullSig = await signer.signTypedData(pullTypedData);
            verifySignature(pullTypedData, pullSig, signer.address);
            body["pull_signature"] = pullSig;
        }

        const route = HOSTED_METHOD_ROUTES.get("submitOrder")!;
        const data = await _tradingRequest(this, { method: route.method, path: route.path, body });
        return orderFromV0(data as Record<string, unknown>);
    }

    /**
     * Resolve the per-(venue, side, pull) typed-data schema route used by
     * `validateTypedData` / `validateEconomics`. Returns the cross-chain
     * pull-leg route name for Opinion sells and Limitless cross-chain orders.
     */
    private _hostedTypedDataRoute(side: string, isPull: boolean): HostedRoute {
        const venue = this.exchangeName;
        const sideLower = side.toLowerCase();
        if (venue === "polymarket") {
            return sideLower === "sell" ? "polymarket_sell" : "polymarket_buy";
        }
        if (venue === "limitless") {
            if (sideLower === "buy") return "limitless_buy";
            return isPull ? "limitless_sell_base_pull" : "limitless_sell_polygon";
        }
        // opinion
        if (sideLower === "buy") return "opinion_buy";
        return isPull ? "opinion_sell_bsc_pull" : "opinion_sell_polygon";
    }

    /**
     * Hosted-mode cancelOrder: build → sign → cancel single-call wrapper.
     * Mirrors the Python SDK's `_hosted_cancel_order`.
     */
    private async _hostedCancelOrder(orderId: string): Promise<Order> {
        const signer = this.requireHostedSigner();
        if (!this.walletAddress) {
            throw new MissingWalletAddress("hosted cancelOrder requires walletAddress");
        }
        const buildRequest = { order_id: orderId, user_address: this.walletAddress };
        const buildRoute = HOSTED_METHOD_ROUTES.get("cancelOrderBuild")!;
        const buildPayload = await _tradingRequest(this, {
            method: buildRoute.method,
            path: buildRoute.path,
            body: buildRequest,
        }) as Record<string, unknown>;

        const typedData = buildPayload["typed_data"] as TypedData | undefined;
        if (!typedData) {
            throw new HostedInvalidSignature(0, "typed_data missing from hosted cancel build response");
        }
        const primaryRoute = this._hostedCancelTypedDataRoute(false);
        validateTypedData(typedData, primaryRoute, this.walletAddress);
        const signature = await signer.signTypedData(typedData);
        verifySignature(typedData, signature, signer.address);

        const cancelId = buildPayload["cancel_id"];
        if (!cancelId) {
            throw new HostedInvalidSignature(0, "cancel_id missing from hosted cancel build response");
        }
        const body: Record<string, unknown> = { cancel_id: cancelId, signature };

        const pullTypedData = buildPayload["pull_typed_data"] as TypedData | undefined;
        if (pullTypedData) {
            const pullRoute = this._hostedCancelTypedDataRoute(true);
            validateTypedData(pullTypedData, pullRoute, this.walletAddress);
            const pullSig = await signer.signTypedData(pullTypedData);
            verifySignature(pullTypedData, pullSig, signer.address);
            body["pull_signature"] = pullSig;
        }

        const cancelRoute = HOSTED_METHOD_ROUTES.get("cancelOrder")!;
        const data = await _tradingRequest(this, {
            method: cancelRoute.method,
            path: cancelRoute.path,
            body,
        });
        return orderFromV0(data as Record<string, unknown>);
    }

    private _hostedCancelTypedDataRoute(isPull: boolean): HostedRoute {
        const venue = this.exchangeName;
        if (venue === "polymarket") return "cancel_polymarket";
        if (venue === "limitless") {
            return isPull ? "cancel_limitless_base_pull" : "cancel_limitless_polygon";
        }
        return isPull ? "cancel_opinion_bsc_pull" : "cancel_opinion_polygon";
    }

    /**
     * Construct the hosted build-order request body and validate inputs
     * locally per the v0 contract (denom/side compatibility, > 6-decimal
     * precision rejected via {@link to6dec}).
     */
    private _hostedBuildOrderBody(
        params: CreateOrderInput,
    ): Record<string, unknown> {
        let marketId: string | undefined = params.marketId;
        let outcomeId: string | undefined = params.outcomeId;

        if (params.outcome) {
            if (marketId !== undefined || outcomeId !== undefined) {
                throw new InvalidOrder(
                    "cannot specify both 'outcome' and 'marketId'/'outcomeId'",
                );
            }
            const outcome: MarketOutcome = params.outcome;
            if (!outcome.outcomeId) {
                throw new InvalidOrder(
                    "outcome.outcomeId is not set; ensure the outcome comes from a fetched market",
                );
            }
            // marketId is optional in hosted mode -- backend derives it from
            // outcomeId (catalog UUID). Forward it when present for backcompat.
            marketId = outcome.marketId || undefined;
            outcomeId = outcome.outcomeId;
        }

        if (!outcomeId) {
            throw new InvalidOrder(
                "outcomeId is required (or pass an 'outcome' from a fetched market)",
            );
        }

        const side = String(params.side);
        const orderType = String(params.type ?? "market");
        const denom = (params as unknown as Record<string, unknown>)["denom"] as
            | "usdc"
            | "shares"
            | undefined;

        // denom/side compatibility per v0:
        //   market buy  -> denom='usdc'
        //   market sell -> denom='shares'
        //   any limit   -> denom='shares'
        let resolvedDenom: "usdc" | "shares";
        if (orderType === "market") {
            if (side === "buy") {
                if (denom && denom !== "usdc") {
                    throw new InvalidOrder("market buy requires denom='usdc'");
                }
                resolvedDenom = "usdc";
            } else if (side === "sell") {
                if (denom && denom !== "shares") {
                    throw new InvalidOrder("market sell requires denom='shares'");
                }
                resolvedDenom = "shares";
            } else {
                throw new InvalidOrder(`unknown side: ${side}`);
            }
        } else {
            if (denom && denom !== "shares") {
                throw new InvalidOrder("limit orders require denom='shares'");
            }
            resolvedDenom = "shares";
        }

        if (!(Number(params.amount) > 0)) {
            throw new InvalidOrder("amount must be positive");
        }

        // to6dec throws InvalidOrder for sub-micro precision.
        const amount6dec = to6dec(params.amount as number).toString();

        // The supplied outcomeId may be a catalog UUID OR a venue-native id
        // (e.g. a Polymarket tokenId or an Opinion market hash). Catalog
        // UUIDs are forwarded as `outcome_id`; venue-native ids are
        // forwarded as `(venue, venue_outcome_id)` so the backend resolver
        // picks the right path. Either shape is accepted by the v0 trading
        // API.
        const body: Record<string, unknown> = {
            side,
            order_type: orderType,
            denom: resolvedDenom,
            amount: params.amount,
            amount_6dec: amount6dec,
        };
        if (Exchange._isCatalogUuid(outcomeId)) {
            body["outcome_id"] = outcomeId;
            // market_id is optional in hosted mode: backend derives it
            // from outcome_id (UUID) when omitted. Forward only when the
            // caller supplied a non-empty UUID -- "absent" and "null" are
            // not equivalent under some Pydantic configs on the backend.
            if (marketId && Exchange._isCatalogUuid(marketId)) {
                body["market_id"] = marketId;
            }
        } else {
            // Venue-native form: backend resolves the row from
            // (source_exchange, pmxt_id). marketId from a venue client is
            // itself venue-native and would fail backend UUID validation
            // if forwarded -- suppress it.
            body["venue"] = this.exchangeName;
            body["venue_outcome_id"] = outcomeId;
        }

        if (params.price !== undefined) body["price"] = params.price;
        const extra = params as unknown as Record<string, unknown>;
        if (extra["slippage_pct"] !== undefined) {
            body["slippage_pct"] = extra["slippage_pct"];
        }
        body["user_address"] = resolveWalletAddress(this);
        return body;
    }

    /**
     * @example
     * ```typescript
     * const order = await exchange.createOrder({
     *   marketId: "663583",
     *   outcomeId: "10991849...",
     *   side: "buy",
     *   type: "limit",
     *   amount: 10,
     *   price: 0.55
     * });
     * ```
     */
    async createOrder(params: CreateOrderInput): Promise<Order> {
        // SOR escape path (preserved): legacy hosted SOR flow uses a venue-side
        // SDK to execute the legs, only when a privateKey is present.
        if (this.isHosted && this.exchangeName === 'sor' && this.privateKey) {
            return this._executeSorOrder(params as any);
        }
        if (this.isHostedTradingMode()) {
            return this._hostedCreateOrder(params);
        }
        if (this.isHosted) {
            throw new PmxtError(
                "Trade execution is not available through the hosted API. " +
                "Use the local PMXT SDK with your venue credentials instead. " +
                "See https://pmxt.dev/docs/quickstart for setup instructions."
            );
        }
        await this.initPromise;
        try {
            // Resolve outcome shorthand: extract marketId/outcomeId from outcome object
            let marketId = params.marketId;
            let outcomeId = params.outcomeId;

            if (params.outcome) {
                if (marketId !== undefined || outcomeId !== undefined) {
                    throw new PmxtError(
                        "Cannot specify both 'outcome' and 'marketId'/'outcomeId'. Use one or the other."
                    );
                }
                const outcome: MarketOutcome = params.outcome;
                if (!outcome.marketId) {
                    throw new PmxtError(
                        "outcome.marketId is not set. Ensure the outcome comes from a fetched market."
                    );
                }
                marketId = outcome.marketId;
                outcomeId = outcome.outcomeId;
            }

            const paramsDict: any = {
                marketId,
                outcomeId,
                side: params.side,
                type: params.type,
                amount: params.amount,
            };
            if (params.price !== undefined) {
                paramsDict.price = params.price;
            }
            if (params.fee !== undefined) {
                paramsDict.fee = params.fee;
            }
            if (params.tickSize !== undefined) {
                paramsDict.tickSize = params.tickSize;
            }
            if (params.negRisk !== undefined) {
                paramsDict.negRisk = params.negRisk;
            }
            if (params.onBehalfOf !== undefined) {
                paramsDict.onBehalfOf = params.onBehalfOf;
            }

            const response = await this.fetchWithRetry(`${this.resolveBaseUrl()}/api/${this.exchangeName}/createOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
                body: JSON.stringify({ args: [paramsDict], credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to create order: ${error}`);
        }
    }

    /**
     * Calculate the average execution price for a given amount by walking the order book.
     * Uses the sidecar server for calculation to ensure consistency.
     *
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - The amount to execute
     * @returns The volume-weighted average price, or 0 if insufficient liquidity
     */
    getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): number {
        const levels = side === 'buy' ? orderBook.asks : orderBook.bids;
        let remaining = amount;
        let totalCost = 0;
        for (const level of levels) {
            const fill = Math.min(remaining, level.size);
            totalCost += fill * level.price;
            remaining -= fill;
            if (remaining <= 0) break;
        }
        if (remaining > 0) return 0;
        return totalCost / amount;
    }

    /**
     * Calculate detailed execution price information.
     * Uses the sidecar server for calculation to ensure consistency.
     *
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - The amount to execute
     * @returns Detailed execution result
     */
    async getExecutionPriceDetailed(
        orderBook: OrderBook,
        side: 'buy' | 'sell',
        amount: number
    ): Promise<ExecutionPriceResult> {
        await this.initPromise;
        try {
            const body: any = {
                args: [orderBook, side, amount]
            };
            const credentials = this.getCredentials();
            if (credentials) {
                body.credentials = credentials;
            }

            const url = `${this.resolveBaseUrl()}/api/${this.exchangeName}/getExecutionPriceDetailed`;

            const response = await this.fetchWithRetry(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                if (body.error && typeof body.error === "object") {
                    throw fromServerError(body.error);
                }
                throw new PmxtError(body.error?.message || response.statusText);
            }

            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to get execution price: ${error}`);
        }
    }

    // ----------------------------------------------------------------------------
    // Filtering Methods
    // ----------------------------------------------------------------------------

    /**
     * Filter markets based on criteria or custom function.
     *
     * @param markets - Array of markets to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of markets
     *
     * @example Simple text search
     * api.filterMarkets(markets, 'Trump')
     *
     * @example Advanced filtering
     * api.filterMarkets(markets, {
     *   text: 'Trump',
     *   searchIn: ['title', 'tags'],
     *   volume24h: { min: 10000 },
     *   category: 'Politics',
     *   price: { outcome: 'yes', max: 0.5 }
     * })
     *
     * @example Custom predicate
     * api.filterMarkets(markets, m => m.liquidity > 5000 && m.yes?.price < 0.3)
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
            if (criteria.resolutionDate && market.resolutionDate) {
                const resDate = market.resolutionDate;
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

    /**
     * Filter events based on criteria or custom function.
     *
     * @param events - Array of events to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of events
     *
     * @example Simple text search
     * api.filterEvents(events, 'Trump')
     *
     * @example Advanced filtering
     * api.filterEvents(events, {
     *   text: 'Election',
     *   searchIn: ['title', 'tags'],
     *   category: 'Politics',
     *   marketCount: { min: 5 }
     * })
     *
     * @example Custom predicate
     * api.filterEvents(events, e => e.markets.length > 10)
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
}

/**
 * Polymarket exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const poly = new Polymarket();
 * const markets = await poly.fetchMarkets({ query: "Trump" });
 *
 * // Trading (requires auth)
 * const poly = new Polymarket({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
 * const balance = await poly.fetchBalance();
 * ```
 */
/**
 * Options for initializing Polymarket client.
 */
export interface PolymarketOptions {
    /** Venue-specific API key (e.g. Polymarket CLOB key). Optional. */
    apiKey?: string;

    /** Private key for authentication (optional) */
    privateKey?: string;

    /** Hosted pmxt API key. Enables hosted mode when set. */
    pmxtApiKey?: string;

    /** Base URL of the PMXT sidecar server */
    baseUrl?: string;

    /** Automatically start server if not running (default: true) */
    autoStartServer?: boolean;

    /** Optional Polymarket Proxy/Smart Wallet address */
    proxyAddress?: string;

    /** Optional signature type */
    signatureType?: 'eoa' | 'poly-proxy' | 'gnosis-safe' | number;

    /**
     * EVM wallet address used for hosted reads/writes.
     */
    walletAddress?: string;

    /**
     * External signer used for hosted writes.
     */
    signer?: Signer;
}

export class Polymarket extends Exchange {
    constructor(options: PolymarketOptions = {}) {
        // Default to gnosis-safe signature type
        const polyOptions = {
            signatureType: 'gnosis-safe',
            ...options
        };
        super("polymarket", polyOptions as ExchangeOptions);
    }

    /**
     * Initialize Polymarket L2 API credentials for implicit API signing.
     *
     * Call this before private Polymarket implicit-API endpoints when the
     * underlying CLOB credentials have not been created yet.
     */
    async initAuth(): Promise<void> {
        await this.initPromise;
        try {
            const json = await this.sidecarPostRequest('initAuth', []);
            this.handleResponse(json);
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to initAuth: ${error}`);
        }
    }
}

/**
 * Kalshi exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const kalshi = new Kalshi();
 * const markets = await kalshi.fetchMarkets({ query: "Fed rates" });
 *
 * // Trading (requires auth)
 * const kalshi = new Kalshi({
 *   apiKey: process.env.KALSHI_API_KEY,
 *   privateKey: process.env.KALSHI_PRIVATE_KEY
 * });
 * const balance = await kalshi.fetchBalance();
 * ```
 */
export class Kalshi extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("kalshi", options);
    }
}

/**
 * Limitless exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const limitless = new Limitless();
 * const markets = await limitless.fetchMarkets({ query: "Trump" });
 *
 * // Trading (requires auth)
 * const limitless = new Limitless({
 *   apiKey: process.env.LIMITLESS_API_KEY,
 *   privateKey: process.env.LIMITLESS_PRIVATE_KEY
 * });
 * const balance = await limitless.fetchBalance();
 * ```
 */
export class Limitless extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("limitless", options);
    }

    /**
     * Watch real-time AMM price updates via WebSocket.
     *
     * @param marketAddress - Limitless market contract address
     * @param callback - Optional callback invoked with the returned update
     * @returns Next price update
     */
    async watchPrices(
        marketAddress: string,
        callback?: (data: Record<string, any>) => void,
    ): Promise<Record<string, any>> {
        await this.initPromise;
        try {
            const json = await this.sidecarPostRequest("watchPrices", [marketAddress]);
            const data = this.handleResponse(json);
            callback?.(data);
            return data;
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to watch prices: ${error}`);
        }
    }

    /**
     * Watch real-time Limitless user position updates.
     *
     * Requires API key authentication.
     *
     * @param callback - Optional callback invoked with the returned positions
     * @returns Next position update payload
     */
    async watchUserPositions(
        callback?: (data: Position[]) => void,
    ): Promise<Position[]> {
        await this.initPromise;
        try {
            const json = await this.sidecarPostRequest("watchUserPositions", []);
            const data = this.handleResponse(json).map(convertPosition);
            callback?.(data);
            return data;
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to watch user positions: ${error}`);
        }
    }

    /**
     * Watch real-time Limitless user transaction updates.
     *
     * Requires API key authentication.
     *
     * @param callback - Optional callback invoked with the returned update
     * @returns Next transaction update
     */
    async watchUserTransactions(
        callback?: (data: Record<string, any>) => void,
    ): Promise<Record<string, any>> {
        await this.initPromise;
        try {
            const json = await this.sidecarPostRequest("watchUserTransactions", []);
            const data = this.handleResponse(json);
            callback?.(data);
            return data;
        } catch (error) {
            if (error instanceof PmxtError) throw error;
            throw new PmxtError(`Failed to watch user transactions: ${error}`);
        }
    }
}

/**
 * Kalshi Demo exchange client (paper trading / sandbox environment).
 *
 * Uses Kalshi's demo environment — same API as Kalshi but against test accounts.
 * Credentials are separate from production Kalshi credentials.
 *
 * @example
 * ```typescript
 * const kalshiDemo = new KalshiDemo({
 *   apiKey: process.env.KALSHI_DEMO_API_KEY,
 *   privateKey: process.env.KALSHI_DEMO_PRIVATE_KEY
 * });
 * const balance = await kalshiDemo.fetchBalance();
 * ```
 */
export class KalshiDemo extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("kalshi-demo", options);
    }
}

/**
 * Myriad exchange client.
 *
 * AMM-based prediction market exchange. Requires an API key for trading.
 * The `privateKey` field is used as the wallet address.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const myriad = new Myriad();
 * const markets = await myriad.fetchMarkets();
 *
 * // Trading (requires auth)
 * const myriad = new Myriad({
 *   apiKey: process.env.MYRIAD_API_KEY,
 *   privateKey: process.env.MYRIAD_WALLET_ADDRESS
 * });
 * ```
 */
export class Myriad extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("myriad", options);
    }
}

/**
 * Probable exchange client.
 *
 * BSC-based CLOB exchange. Requires all four credential fields for trading.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const probable = new Probable();
 * const markets = await probable.fetchMarkets();
 *
 * // Trading (requires auth)
 * const probable = new Probable({
 *   privateKey: process.env.PROBABLE_PRIVATE_KEY,
 *   apiKey: process.env.PROBABLE_API_KEY,
 *   apiSecret: process.env.PROBABLE_API_SECRET,
 *   passphrase: process.env.PROBABLE_PASSPHRASE
 * });
 * ```
 */
export class Probable extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("probable", options);
    }
}

/**
 * Baozi exchange client.
 *
 * Solana-based on-chain pari-mutuel betting exchange.
 * Requires a Solana private key for trading.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const baozi = new Baozi();
 * const markets = await baozi.fetchMarkets();
 *
 * // Trading (requires auth)
 * const baozi = new Baozi({
 *   privateKey: process.env.BAOZI_PRIVATE_KEY
 * });
 * ```
 */
export class Baozi extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("baozi", options);
    }
}

/**
 * Opinion exchange client.
 *
 * Polygon-based CLOB exchange. Public catalog endpoints work without
 * credentials; trading requires `apiKey` (proxy address) and `privateKey`.
 *
 * @example
 * ```typescript
 * const opinion = new Opinion();
 * const events = await opinion.fetchEvents();
 * ```
 */
export class Opinion extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("opinion", options);
    }
}

/**
 * Metaculus exchange client.
 *
 * Forecasting platform. Public read-only access works without credentials;
 * authenticated calls accept a bearer token via `apiKey`.
 *
 * @example
 * ```typescript
 * const metaculus = new Metaculus();
 * const events = await metaculus.fetchEvents();
 * ```
 */
export class Metaculus extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("metaculus", options);
    }
}

/**
 * Smarkets exchange client.
 *
 * UK-based betting exchange. Public catalog endpoints work without
 * credentials; trading requires Smarkets account email (`apiKey`) and
 * password (`privateKey`).
 *
 * @example
 * ```typescript
 * const smarkets = new Smarkets();
 * const events = await smarkets.fetchEvents();
 * ```
 */
export class Smarkets extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("smarkets", options);
    }
}

/**
 * Polymarket US exchange client.
 *
 * US-regulated Polymarket venue. Public catalog endpoints work without
 * credentials; trading requires `apiKey` (keyId) and `privateKey`
 * (secretKey) issued by Polymarket US.
 *
 * @example
 * ```typescript
 * const polyUs = new PolymarketUS();
 * const events = await polyUs.fetchEvents();
 * ```
 */
export class PolymarketUS extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("polymarket_us", options);
    }
}

/**
 * Gemini Titan exchange client.
 *
 * @example
 * ```typescript
 * const titan = new GeminiTitan();
 * const markets = await titan.fetchMarkets();
 * ```
 */
export class GeminiTitan extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("gemini-titan", options);
    }
}

/**
 * Hyperliquid exchange client.
 *
 * @example
 * ```typescript
 * const hl = new Hyperliquid();
 * const markets = await hl.fetchMarkets();
 * ```
 */
export class Hyperliquid extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("hyperliquid", options);
    }
}

/**
 * Options for the SuiBets exchange client.
 */
export interface SuiBetsOptions extends ExchangeOptions {
    /**
     * Sui wallet address (0x + 64 hex chars).
     * Required for fetchPositions(). Can also be set via the
     * SUIBETS_WALLET_ADDRESS environment variable on the sidecar.
     */
    walletAddress?: string;
}

/**
 * SuiBets exchange client.
 *
 * SuiBets is a decentralised P2P sports betting exchange on Sui mainnet.
 * No house edge. 2% platform fee.
 * Contract: 0xd51fe151bec66a15b086a67c1cfce9b05759ddac1d73fcd3e14324ad202b2e59
 *
 * @example
 * ```typescript
 * const suibets = new SuiBets();
 * const markets = await suibets.fetchMarkets({ limit: 20 });
 *
 * // With wallet for fetchPositions()
 * const me = new SuiBets({ walletAddress: '0xabc...' });
 * const positions = await me.fetchPositions();
 * ```
 */
export class SuiBets extends Exchange {
    private readonly _walletAddress?: string;

    constructor(options: SuiBetsOptions = {}) {
        super("suibets", options);
        this._walletAddress = options.walletAddress;
    }

    /**
     * Includes walletAddress in the credentials sent to the sidecar so
     * that fetchPositions() can reach the /api/p2p/my endpoint.
     * Falls back to SUIBETS_WALLET_ADDRESS env var on the sidecar side
     * when walletAddress is not set here.
     */
    protected override getCredentials(): ExchangeCredentials | undefined {
        const base = super.getCredentials();
        if (!this._walletAddress) return base;
        return {
            ...(base ?? {}),
            walletAddress: this._walletAddress,
        } as ExchangeCredentials & { walletAddress: string };
    }
}

// Backwards-compatible casing alias matching the Python SDK export.
export const Suibets = SuiBets;

/**
 * Rain exchange client.
 *
 * Rain is a permissionless AMM-plus-orderbook prediction market on Arbitrum One.
 * Reads are unauthenticated; trading requires an EVM privateKey.
 *
 * @example
 * ```typescript
 * const rain = new Rain();
 * const markets = await rain.fetchMarkets({ limit: 20 });
 *
 * // With wallet for trading
 * const me = new Rain({ privateKey: '0x...' });
 * await me.createOrder({ marketId, outcomeId, side: 'buy', type: 'market', amount: 10 });
 * ```
 */
export class Rain extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("rain", options);
    }
}


/**
 * Hunch exchange client.
 *
 * Hunch is a crypto-native prediction market. Reads are unauthenticated;
 * trading requires an EVM private key.
 */
export class Hunch extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("hunch", options);
    }
}

/**
 * Mock exchange client.
 *
 * Offline deterministic exchange for testing and development.
 * No credentials required.
 *
 * @example
 * ```typescript
 * const mock = new Mock();
 * const markets = await mock.fetchMarkets();
 * ```
 */
export class Mock extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("mock", options);
    }
}
