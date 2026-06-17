import { MarketFilterParams, EventFetchParams, OHLCVParams, TradesParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { DEFAULT_BASE_URL, mapStatusToHunch } from './utils';
import { hunchErrorMapper } from './errors';

const AGENT_PREFIX = '/api/agent/v1';
const DEFAULT_LIMIT = 200;

// ---------------------------------------------------------------------------
// Raw venue-native shapes (what the Hunch agent API returns). Mirror the Zod
// source of truth in the Hunch repo: src/agent/schemas.ts.
// ---------------------------------------------------------------------------

export interface HunchRawOutcome {
    key: string;
    label: string;
    shortLabel: string;
    lowerUsd: number | null;
    upperUsd: number | null;
    startAt?: string | null;
    endAt?: string | null;
}

export interface HunchRawMarketLinks {
    app: string;
    quote: string;
    trade: string;
    research: string;
}

export interface HunchRawMarket {
    id: string;
    slug: string;
    question: string;
    shortTitle: string;
    summary: string;
    category: string;
    tokenSymbol: string;
    chainId: string;
    deadlineAt: string;
    deadlineLabel: string;
    status: string;
    feeBps: number;
    feeRecipientLabel: string;
    defaultTicketUsd: number;
    virtualLiquidityUsd: number;
    /** Present in the schema; absent on the bare list endpoint — optional. */
    volumeUsd?: number;
    totalBets?: number;
    targetMarketCapUsd: number | null;
    outcomes: HunchRawOutcome[] | null;
    headline?: string | null;
    links: HunchRawMarketLinks;
    [key: string]: unknown;
}

export interface HunchRawBinaryOdds {
    yesPriceCents: number | null;
    noPriceCents: number | null;
}

export interface HunchRawLadderOutcome extends HunchRawOutcome {
    impliedPct: number;
    backedUsd: number;
    isCurrent: boolean;
}

export interface HunchRawLadder {
    outcomes: HunchRawLadderOutcome[];
    currentBucketKey: string | null;
    currentMarketCapUsd: number | null;
    totalBackedUsd: number;
}

export interface HunchRawTokenSnapshot {
    tokenSymbol: string;
    currentMarketCapUsd: number;
    currentPriceUsd: number | null;
    targetMarketCapUsd: number;
    distanceToTargetPct: number;
    reachedTarget: boolean;
    source: string;
    sourceUrl: string;
    observedAt: string;
}

export interface HunchRawMarketStats {
    totalBets: number;
    totalPoolUsd: number;
    yesPoolUsd: number;
    noPoolUsd: number;
    feeUsd: number;
}

export interface HunchRawOddsHistoryPoint {
    at: string;
    yesPct: number | null;
    outcomeKey: string | null;
    sizeUsd: number;
}

export interface HunchRawResearch {
    market: HunchRawMarket;
    resolutionRules: {
        source: string;
        sourceUrl: string | null;
        metric: string;
        comparator: string | null;
        thresholdLabel: string | null;
        deadlineAt: string;
        earlyResolvable: boolean;
        description: string;
    };
    odds: HunchRawBinaryOdds;
    stats: HunchRawMarketStats | null;
    ladder: HunchRawLadder | null;
    tokenSnapshot: HunchRawTokenSnapshot | null;
    oddsHistory: HunchRawOddsHistoryPoint[];
    observations: { observedAt: string; value: number | null; label: string | null; sourceUrl: string | null }[];
    related: { id: string; slug: string; question: string; category: string; deadlineAt: string }[];
    impact: { sizeUsd: number; priceCents: number | null; impactPct: number | null }[];
    [key: string]: unknown;
}

export interface HunchRawQuote {
    marketId: string;
    side: string;
    sizeUsd: number;
    tier: 'simple' | 'locked';
    quoteId: string;
    expiresAt: string;
    bookVersion: string;
    priceCents: number;
    estimatedShares: number;
    suggestedMinSharesOut: number;
    feeBps: number;
    feeUsd: number;
    netStakeUsd: number;
    postTradeOdds: HunchRawBinaryOdds;
    impactPct: number | null;
    ladder: HunchRawLadder | null;
    tokenSnapshot: HunchRawTokenSnapshot | null;
    stats: HunchRawMarketStats | null;
    [key: string]: unknown;
}

export interface HunchRawPosition {
    marketId: string;
    slug: string;
    question: string;
    side: string;
    outcomeLabel: string;
    shares: number;
    stakedUsd: number;
    avgEntryCents: number;
    currentCents: number;
    pnlUsd: number;
    maxPayoutUsd: number;
    status: 'open' | 'resolved-won' | 'resolved-lost';
    appUrl: string;
    proofUrl: string | null;
    filledAt: string | null;
    [key: string]: unknown;
}

export interface HunchRawReadiness {
    wallet: string;
    usdcBalanceUsd: number | null;
    canBetMin: boolean | null;
    minBetUsd: number;
    simpleTierMaxUsd: number;
    gasNeeded: false;
    reason: string;
    funding: { network: 'base'; usdcAddress: string; docsUrl: string };
    hint: string | null;
    [key: string]: unknown;
}

/**
 * HunchFetcher — raw GETs against the live agent API. Hunch reads are keyless,
 * so we hit the HTTP client directly (clearer + more robust than the implicit
 * `callApi` for these path/query-param GETs). The trade POST (x402 money path)
 * is handled in index.ts createOrder, not here.
 */
export class HunchFetcher
    implements IExchangeFetcher<HunchRawMarket, HunchRawMarket, HunchRawPosition[]>
{
    private readonly ctx: FetcherContext;
    private readonly baseUrl: string;

    constructor(ctx: FetcherContext, baseUrl?: string) {
        this.ctx = ctx;
        this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    }

    async fetchRawMarkets(params?: MarketFilterParams): Promise<HunchRawMarket[]> {
        try {
            if (params?.marketId) {
                const one = await this.fetchRawMarketById(params.marketId);
                return one ? [one] : [];
            }
            if (params?.slug) {
                const one = await this.fetchRawMarketById(params.slug);
                return one ? [one] : [];
            }

            const query: Record<string, unknown> = {
                limit: params?.limit ?? DEFAULT_LIMIT,
            };
            const status = mapStatusToHunch(params?.status);
            if (status) query.status = status;
            if (params?.query) query.token = params.query;

            const res = await this.ctx.http.get(`${this.baseUrl}${AGENT_PREFIX}/markets`, {
                params: query,
                headers: this.ctx.getHeaders(),
            });
            const markets: HunchRawMarket[] = res.data?.markets ?? [];
            return markets;
        } catch (error: unknown) {
            throw hunchErrorMapper.mapError(error);
        }
    }

    /**
     * Hunch has no Event tier (markets stand alone). `fetchRawEvents` returns
     * the raw markets so the exchange can wrap each as a single-market event
     * when the event API is used; honoring `series` by returning [].
     */
    async fetchRawEvents(params: EventFetchParams): Promise<HunchRawMarket[]> {
        if (params.series !== undefined) return [];
        return this.fetchRawMarkets({
            limit: params.limit,
            status: params.status,
            query: params.query,
        });
    }

    /** Research payload — carries oddsHistory, the source for OHLCV/trades. */
    async fetchRawOHLCV(id: string, _params: OHLCVParams): Promise<HunchRawResearch> {
        return this.fetchRawResearch(this.outcomeIdToMarketId(id));
    }

    /** Quote + research drive the emulated orderbook (implied price + pool). */
    async fetchRawOrderBook(id: string): Promise<HunchRawResearch> {
        return this.fetchRawResearch(this.outcomeIdToMarketId(id));
    }

    /** oddsHistory (from research) doubles as the public trade tape. */
    async fetchRawTrades(id: string, _params: TradesParams): Promise<HunchRawOddsHistoryPoint[]> {
        const research = await this.fetchRawResearch(this.outcomeIdToMarketId(id));
        return research.oddsHistory ?? [];
    }

    async fetchRawPositions(walletAddress: string): Promise<HunchRawPosition[]> {
        try {
            const res = await this.ctx.http.get(`${this.baseUrl}${AGENT_PREFIX}/positions`, {
                params: { wallet: walletAddress },
                headers: this.ctx.getHeaders(),
            });
            return res.data?.positions ?? [];
        } catch (error: unknown) {
            throw hunchErrorMapper.mapError(error);
        }
    }

    async fetchRawBalance(walletAddress: string): Promise<HunchRawReadiness> {
        try {
            const res = await this.ctx.http.get(
                `${this.baseUrl}${AGENT_PREFIX}/wallet/${encodeURIComponent(walletAddress)}/readiness`,
                { headers: this.ctx.getHeaders() },
            );
            return res.data?.readiness ?? res.data;
        } catch (error: unknown) {
            throw hunchErrorMapper.mapError(error);
        }
    }

    // -- Shared raw reads -----------------------------------------------------

    async fetchRawResearch(marketId: string): Promise<HunchRawResearch> {
        try {
            const res = await this.ctx.http.get(
                `${this.baseUrl}${AGENT_PREFIX}/markets/${encodeURIComponent(marketId)}/research`,
                { headers: this.ctx.getHeaders() },
            );
            return res.data?.research ?? res.data;
        } catch (error: unknown) {
            throw hunchErrorMapper.mapError(error);
        }
    }

    async fetchRawQuote(marketId: string, side: string, sizeUsd: number, wallet?: string): Promise<HunchRawQuote> {
        try {
            const res = await this.ctx.http.get(`${this.baseUrl}${AGENT_PREFIX}/quote`, {
                params: { marketId, side, sizeUsd, ...(wallet ? { wallet } : {}) },
                headers: this.ctx.getHeaders(),
            });
            return res.data?.quote ?? res.data;
        } catch (error: unknown) {
            throw hunchErrorMapper.mapError(error);
        }
    }

    private async fetchRawMarketById(id: string): Promise<HunchRawMarket | null> {
        const res = await this.ctx.http.get(
            `${this.baseUrl}${AGENT_PREFIX}/markets/${encodeURIComponent(id)}`,
            { headers: this.ctx.getHeaders() },
        );
        return res.data?.market ?? res.data ?? null;
    }

    /** outcomeId is `${marketId}:${side}`; strip the side to get the market id. */
    private outcomeIdToMarketId(id: string): string {
        const idx = id.lastIndexOf(':');
        return idx > 0 ? id.slice(0, idx) : id;
    }
}
