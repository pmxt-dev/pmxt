import {
    PredictionMarketExchange,
    MarketFilterParams,
    HistoryFilterParams,
    OHLCVParams,
    TradesParams,
    ExchangeCredentials,
    EventFetchParams,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    PriceCandle,
    OrderBook,
    Trade,
    Balance,
    Order,
    Position,
    CreateOrderParams,
} from '../../types';
import { InvalidOrder, ValidationError } from '../../errors';
import { validateTradesLimit } from '../../utils/validation';
import { parseOpenApiSpec } from '../../utils/openapi';
import { FetcherContext } from '../interfaces';
import { type Hex } from 'viem';

import { HunchAuth, HunchCredentials } from './auth';
import { HunchFetcher } from './fetcher';
import { HunchNormalizer } from './normalizer';
import { HunchWebSocket } from './websocket';
import { hunchErrorMapper } from './errors';
import { hunchApiSpec } from './api';
import { DEFAULT_BASE_URL, BASE_CHAIN_ID, parseHunchSide } from './utils';

const AGENT_PREFIX = '/api/agent/v1';
const SIMPLE_TIER_MAX_USD = 10;

// ---------------------------------------------------------------------------
// x402 / EIP-3009 codec — ported VERBATIM from the Hunch SDK
// (packages/hunch-agent-sdk/src/x402.ts) so the signature + X-PAYMENT encoding
// the route decodes are byte-correct. pmxt-core cannot import the Hunch SDK,
// so the minimal recipe is inlined here.
// ---------------------------------------------------------------------------

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
    TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
    ],
} as const;

const DEFAULT_AUTH_VALID_SECONDS = 10 * 60;
const CLOCK_SKEW_SECONDS = 60;

interface X402Requirements {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource?: string;
    description?: string;
    mimeType?: string;
    payTo: string;
    maxTimeoutSeconds?: number;
    asset: string;
    extra: { name: string; version: string };
}

interface X402Challenge {
    x402Version: number;
    error: string | null;
    accepts: X402Requirements[];
}

/** Validate + extract the single Base-USDC "exact" requirement from a 402 body. */
function parseX402Challenge(body: unknown): X402Requirements {
    const challenge = body as Partial<X402Challenge> | null | undefined;
    const accepts = challenge?.accepts;
    const first = Array.isArray(accepts) ? accepts[0] : undefined;
    if (!first || typeof first !== 'object') {
        throw new InvalidOrder('Hunch 402 challenge did not advertise a payment requirement.', 'Hunch');
    }
    if (first.scheme !== 'exact') {
        throw new InvalidOrder(`Unsupported Hunch x402 scheme: ${String(first.scheme)}`, 'Hunch');
    }
    if (first.network !== 'base') {
        throw new InvalidOrder(`Unsupported Hunch x402 network: ${String(first.network)}`, 'Hunch');
    }
    if (!first.payTo || !first.asset || !first.extra) {
        throw new InvalidOrder('Hunch 402 challenge is missing payTo / asset / domain extra.', 'Hunch');
    }
    return first as X402Requirements;
}

function randomNonce(): Hex {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    let out = '0x';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out as Hex;
}

interface TransferAuthorization {
    from: Hex;
    to: Hex;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: Hex;
}

interface Eip3009TypedData {
    domain: { name: string; version: string; chainId: number; verifyingContract: Hex };
    types: typeof TRANSFER_WITH_AUTHORIZATION_TYPES;
    primaryType: 'TransferWithAuthorization';
    message: { from: Hex; to: Hex; value: bigint; validAfter: bigint; validBefore: bigint; nonce: Hex };
}

function buildTransferAuthorizationTypedData(params: {
    from: Hex;
    requirements: X402Requirements;
    now?: number;
}): { typedData: Eip3009TypedData; authorization: TransferAuthorization } {
    const now = params.now ?? Math.floor(Date.now() / 1000);
    const validAfter = Math.max(0, Math.floor(now) - CLOCK_SKEW_SECONDS);
    const validBefore = Math.floor(now) + DEFAULT_AUTH_VALID_SECONDS;
    const nonce = randomNonce();
    const to = params.requirements.payTo as Hex;
    const value = params.requirements.maxAmountRequired;

    const authorization: TransferAuthorization = { from: params.from, to, value, validAfter, validBefore, nonce };
    const typedData: Eip3009TypedData = {
        domain: {
            name: params.requirements.extra.name,
            version: params.requirements.extra.version,
            chainId: BASE_CHAIN_ID,
            verifyingContract: params.requirements.asset as Hex,
        },
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
        primaryType: 'TransferWithAuthorization',
        message: {
            from: params.from,
            to,
            value: BigInt(value),
            validAfter: BigInt(validAfter),
            validBefore: BigInt(validBefore),
            nonce,
        },
    };
    return { typedData, authorization };
}

/** Encode a signed authorization into the base64 `X-PAYMENT` header value. */
function encodeXPaymentHeader(signed: TransferAuthorization & { signature: Hex }): string {
    const payload = {
        x402Version: 1,
        scheme: 'exact',
        network: 'base',
        payload: {
            signature: signed.signature,
            authorization: {
                from: signed.from,
                to: signed.to,
                value: signed.value,
                validAfter: signed.validAfter,
                validBefore: signed.validBefore,
                nonce: signed.nonce,
            },
        },
    };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

// ---------------------------------------------------------------------------
// HunchExchange
// ---------------------------------------------------------------------------

export class HunchExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchOrderBook: 'emulated' as const,
        createOrder: true as const,
        cancelOrder: false as const,
        fetchOrder: false as const,
        fetchOpenOrders: false as const,
        fetchBalance: true as const,
        fetchPositions: true as const,
        fetchSeries: false as const,
        watchOrderBook: 'emulated' as const,
        watchTrades: 'emulated' as const,
    };

    private readonly auth: HunchAuth;
    private readonly fetcher: HunchFetcher;
    private readonly normalizer: HunchNormalizer;
    private readonly hunchBaseUrl: string;
    private ws?: HunchWebSocket;

    constructor(credentials?: HunchCredentials) {
        super(credentials);
        this.rateLimit = 500;
        this.auth = new HunchAuth(credentials ?? {});

        this.hunchBaseUrl = credentials?.baseUrl || DEFAULT_BASE_URL;
        const descriptor = parseOpenApiSpec(hunchApiSpec, this.hunchBaseUrl);
        this.defineImplicitApi(descriptor);

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => this.getHeaders(),
        };

        this.fetcher = new HunchFetcher(ctx, this.hunchBaseUrl);
        this.normalizer = new HunchNormalizer();
    }

    get name(): string {
        return 'Hunch';
    }

    private getHeaders(): Record<string, string> {
        return this.auth.getHeaders();
    }

    protected override sign(_method: string, _path: string, _params: Record<string, any>): Record<string, string> {
        return this.getHeaders();
    }

    protected override mapImplicitApiError(error: any): any {
        throw hunchErrorMapper.mapError(error);
    }

    // -- Market data ----------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        const raw = await this.fetcher.fetchRawMarkets(params);
        return raw.map((m) => this.normalizer.normalizeMarket(m)).filter((m): m is UnifiedMarket => m !== null);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        // Hunch has no series concept; honor `series` by returning [].
        if (params.series !== undefined) return [];
        const raw = await this.fetcher.fetchRawEvents(params);
        return raw.map((m) => this.normalizer.normalizeEvent(m)).filter((e): e is UnifiedEvent => e !== null);
    }

    async fetchOHLCV(outcomeId: string, params: OHLCVParams): Promise<PriceCandle[]> {
        if (!params.resolution) {
            throw new Error('fetchOHLCV requires a resolution parameter.');
        }
        const { side } = parseHunchSide(outcomeId);
        const research = await this.fetcher.fetchRawOHLCV(outcomeId, params);
        return this.normalizer.normalizeOHLCV(research, params, side);
    }

    async fetchOrderBook(outcomeId: string, _limit?: number, _params?: Record<string, any>): Promise<OrderBook> {
        const research = await this.fetcher.fetchRawOrderBook(outcomeId);
        return this.normalizer.normalizeOrderBook(research, outcomeId);
    }

    async fetchTrades(outcomeId: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        validateTradesLimit(params.limit);
        const rawTrades = await this.fetcher.fetchRawTrades(outcomeId, params as TradesParams);
        return rawTrades.map((raw, i) => this.normalizer.normalizeTrade(raw, i));
    }

    // -- Trading (x402 money path) --------------------------------------------

    async createOrder(params: CreateOrderParams): Promise<Order> {
        if (params.type === 'limit') {
            throw new InvalidOrder(
                'Hunch is parimutuel: limit orders are unsupported, market orders only.',
                'Hunch',
            );
        }
        if (params.side !== 'buy') {
            throw new InvalidOrder(
                'Hunch markets are entry-only (parimutuel pool): only side "buy" is supported.',
                'Hunch',
            );
        }

        const { marketId, side } = parseHunchSide(params.outcomeId);
        if (!marketId || !side) {
            throw new ValidationError(
                `Invalid Hunch outcomeId "${params.outcomeId}". Expected "{marketId}:{side}".`,
                'outcomeId',
                'Hunch',
            );
        }

        const walletAddress = this.auth.requireWalletAddress('createOrder');
        const account = this.auth.getAccount(); // throws if no privateKey to sign
        const sizeUsd = params.amount;

        const body: Record<string, unknown> = {
            marketId,
            side,
            sizeUsd,
            idemKey: this.buildIdemKey(marketId, side, walletAddress),
            walletAddress,
            simulate: false,
        };

        // Above the simple tier ($10) Hunch requires a price-locked quote.
        if (sizeUsd > SIMPLE_TIER_MAX_USD) {
            const quote = await this.fetcher.fetchRawQuote(marketId, side, sizeUsd, walletAddress);
            body.quoteId = quote.quoteId;
            body.minSharesOut = quote.suggestedMinSharesOut;
        }

        // x402 loop: serialize ONCE so the paid retry recomputes the same
        // intentHash the 402 advertised (matches the Hunch SDK's `bet()`).
        const serialized = JSON.stringify(body);
        const tradeUrl = `${this.hunchBaseUrl}${AGENT_PREFIX}/trade`;

        let res = await this.postTrade(tradeUrl, serialized);

        if (res.status === 402) {
            const requirements = parseX402Challenge(res.data);
            const { typedData, authorization } = buildTransferAuthorizationTypedData({
                from: walletAddress as Hex,
                requirements,
            });
            const signature = (await account.signTypedData(
                typedData as Parameters<typeof account.signTypedData>[0],
            )) as Hex;
            const paymentHeader = encodeXPaymentHeader({ ...authorization, signature });
            res = await this.postTrade(tradeUrl, serialized, paymentHeader);
        }

        if (res.status < 200 || res.status >= 300) {
            throw hunchErrorMapper.mapError({
                response: { status: res.status, data: res.data },
                isAxiosError: true,
            });
        }

        const receipt = res.data?.receipt ?? res.data;
        return this.receiptToOrder(receipt, params);
    }

    async cancelOrder(_orderId: string): Promise<Order> {
        throw new InvalidOrder('cancelOrder() is not supported by Hunch (parimutuel pool — bets cannot be cancelled).', 'Hunch');
    }

    async fetchOrder(_orderId: string): Promise<Order> {
        throw new InvalidOrder('fetchOrder() is not supported by Hunch (parimutuel; use fetchPositions / getProof).', 'Hunch');
    }

    async fetchOpenOrders(_marketId?: string): Promise<Order[]> {
        return []; // Parimutuel: no resting orders.
    }

    async fetchPositions(): Promise<Position[]> {
        const walletAddress = this.auth.requireWalletAddress('fetchPositions');
        const raw = await this.fetcher.fetchRawPositions(walletAddress);
        return raw.map((p) => this.normalizer.normalizePosition(p));
    }

    async fetchBalance(): Promise<Balance[]> {
        const walletAddress = this.auth.requireWalletAddress('fetchBalance');
        const raw = await this.fetcher.fetchRawBalance(walletAddress);
        return this.normalizer.normalizeBalance(raw);
    }

    // -- Real-time (poll-based emulation) -------------------------------------

    async watchOrderBook(outcomeId: string, _limit?: number, _params: Record<string, any> = {}): Promise<OrderBook> {
        if (!this.ws) this.ws = this.makeWs();
        return this.ws.watchOrderBook(outcomeId);
    }

    async watchTrades(outcomeId: string, _address?: string, _since?: number, _limit?: number): Promise<Trade[]> {
        if (!this.ws) this.ws = this.makeWs();
        return this.ws.watchTrades(outcomeId);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }

    // -- helpers --------------------------------------------------------------

    private makeWs(): HunchWebSocket {
        return new HunchWebSocket(
            (id: string) => this.fetchOrderBook(id),
            (id: string, limit: number) => this.fetchTrades(id, { limit }),
        );
    }

    /**
     * POST the trade body via the axios client, NOT throwing on non-2xx so the
     * 402 challenge can be read (validateStatus: always-true). Mirrors the SDK's
     * fetch-based `post()` that inspects `res.status === 402`.
     */
    private async postTrade(url: string, body: string, paymentHeader?: string) {
        return this.http.request({
            url,
            method: 'POST',
            data: body,
            headers: {
                'Content-Type': 'application/json',
                ...(paymentHeader ? { 'X-PAYMENT': paymentHeader } : {}),
            },
            transformRequest: [(d) => d], // body is already a JSON string
            validateStatus: () => true,
        });
    }

    /** Deterministic-but-unique idempotency key (≥8 chars per the schema). */
    private buildIdemKey(marketId: string, side: string, wallet: string): string {
        const bytes = new Uint8Array(8);
        globalThis.crypto.getRandomValues(bytes);
        let suffix = '';
        for (const b of bytes) suffix += b.toString(16).padStart(2, '0');
        return `pmxt-${wallet.slice(2, 10)}-${marketId}-${side}-${suffix}`.slice(0, 128);
    }

    private receiptToOrder(receipt: any, params: CreateOrderParams): Order {
        const shares = Number(receipt?.position?.shares ?? 0);
        const priceCents = Number(receipt?.position?.avgPriceCents ?? 0);
        const sizeUsd = Number(receipt?.sizeUsd ?? params.amount);
        const ts = receipt?.recordedAt ? Date.parse(receipt.recordedAt) : Date.now();
        return {
            id: String(receipt?.tradeId ?? `hunch-${Date.now()}`),
            marketId: params.marketId,
            outcomeId: params.outcomeId,
            side: 'buy',
            type: 'market',
            price: priceCents / 100,
            amount: sizeUsd,
            filled: sizeUsd,
            filledShares: shares,
            remaining: 0,
            status: 'filled',
            timestamp: Number.isFinite(ts) ? ts : Date.now(),
            txHash: receipt?.txHash ?? null,
            chain: 'base',
        };
    }
}
