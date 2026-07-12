import { MarketFilterParams, EventFetchParams, OHLCVParams, TradesParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { hyperliquidErrorMapper } from './errors';
import { toCoinNotation, toMidKey, fromMarketId, fromCoinEncoding } from './utils';

// ----------------------------------------------------------------------------
// Raw venue-native types (Hyperliquid HIP-4 Outcome Markets)
// ----------------------------------------------------------------------------

export interface HyperliquidRawSideSpec {
    name: string;   // "Yes" or "No"
    token?: number; // token identifier
}

export interface HyperliquidRawOutcome {
    outcome: number;
    name: string;           // e.g. "BTC > $100K @ 2026-05-09 06:00 UTC"
    description: string;    // pipe-delimited contract spec
    sideSpecs: HyperliquidRawSideSpec[];
}

export interface HyperliquidRawQuestion {
    question: number;
    name: string;
    description: string;
    fallbackOutcome: number;
    namedOutcomes: number[];
    settledNamedOutcomes: number[];
}

export interface HyperliquidRawOutcomeMeta {
    outcomes: HyperliquidRawOutcome[];
    questions: HyperliquidRawQuestion[];
}

export interface HyperliquidRawL2Level {
    px: string;  // price as string
    sz: string;  // size as string
    n: number;   // number of orders
}

export interface HyperliquidRawL2Book {
    coin: string;
    levels: [HyperliquidRawL2Level[], HyperliquidRawL2Level[]]; // [bids, asks]
    time: number;
}

export interface HyperliquidRawCandle {
    t: number;   // timestamp (ms)
    T: number;   // close timestamp (ms)
    s: string;   // coin symbol
    i: string;   // interval
    o: string;   // open
    c: string;   // close
    h: string;   // high
    l: string;   // low
    v: string;   // volume
    n: number;   // number of trades
}

export interface HyperliquidRawTrade {
    coin: string;
    side: string;    // "A" (ask/sell) or "B" (bid/buy)
    px: string;      // price
    sz: string;      // size
    hash: string;    // transaction hash
    time: number;    // timestamp (ms)
    tid: number;     // trade id
    users: string[]; // [takerAddress, makerAddress]
}

export interface HyperliquidRawMid {
    [coin: string]: string; // coin -> mid price as string
}

export interface HyperliquidRawFill {
    coin: string;
    px: string;
    sz: string;
    side: string;
    time: number;
    startPosition: string;
    dir: string;
    closedPnl: string;
    hash: string;
    oid: number;
    crossed: boolean;
    fee: string;
    tid: number;
    feeToken: string;
    builderFee?: string; // present when order was placed through a builder
}

export interface HyperliquidRawOpenOrder {
    coin: string;
    limitPx: string;
    oid: number;
    side: string;
    sz: string;
    timestamp: number;
    origSz?: string; // only returned by frontendOpenOrders, not openOrders
    cloid?: string;
}

export interface HyperliquidRawPosition {
    coin: string;
    entryPx: string | null;
    leverage: { type: string; value: number; rawUsd?: string };
    liquidationPx: string | null;
    marginUsed: string;
    maxTradeSzs: [string, string];
    positionValue: string;
    returnOnEquity: string;
    szi: string;
    unrealizedPnl: string;
    cumFunding?: {
        allTime?: string;
        sinceChange?: string;
        sinceOpen?: string;
    };
}

export interface HyperliquidRawUserState {
    assetPositions: Array<{
        position: HyperliquidRawPosition;
        type: string;
    }>;
    crossMarginSummary: {
        accountValue: string;
        totalMarginUsed: string;
        totalNtlPos: string;
        totalRawUsd: string;
    };
    marginSummary: {
        accountValue: string;
        totalMarginUsed: string;
        totalNtlPos: string;
        totalRawUsd: string;
    };
    crossMaintenanceMarginUsed?: string;
    time?: number;
    withdrawable: string;
}

// Spot balance entry — coin/token + total/hold/entryNtl in token units (already human-readable).
export interface HyperliquidRawSpotBalance {
    coin: string;
    token: number;
    total: string;
    hold: string;
    entryNtl: string;
}

export interface HyperliquidRawSpotState {
    balances: HyperliquidRawSpotBalance[];
}

// Per-coin context from spotMetaAndAssetCtxs (only the fields we use)
export interface HyperliquidRawSpotAssetCtx {
    coin: string;            // "#NNNN" for outcome legs
    dayNtlVlm: string;       // 24h notional volume in USDC
    prevDayPx?: string;
    markPx?: string;
    midPx?: string;
}

// Composite type: outcome + its question context
export interface HyperliquidRawOutcomeWithQuestion {
    outcome: HyperliquidRawOutcome;
    question: HyperliquidRawQuestion | undefined;
    midPrice: string | undefined; // from allMids
    volume24h?: number;           // summed Yes+No dayNtlVlm from spotMetaAndAssetCtxs
}

// ----------------------------------------------------------------------------
// Fetcher
// ----------------------------------------------------------------------------

export class HyperliquidFetcher implements IExchangeFetcher<HyperliquidRawOutcomeWithQuestion, HyperliquidRawQuestion> {
    private readonly ctx: FetcherContext;
    private readonly baseUrl: string;

    constructor(ctx: FetcherContext, baseUrl: string) {
        this.ctx = ctx;
        this.baseUrl = baseUrl;
    }

    // -- Info endpoint helper --------------------------------------------------

    private async postInfo<T>(body: Record<string, unknown>): Promise<T> {
        try {
            const response = await this.ctx.http.post(`${this.baseUrl}/info`, body);
            return response.data as T;
        } catch (error: any) {
            throw hyperliquidErrorMapper.mapError(error);
        }
    }

    // -- Markets (outcomes) ----------------------------------------------------

    async fetchRawMarkets(params?: MarketFilterParams): Promise<HyperliquidRawOutcomeWithQuestion[]> {
        const [meta, mids, volumeMap] = await Promise.all([
            this.fetchOutcomeMeta(),
            this.fetchAllMids(),
            this.fetchOutcomeVolumeMap(),
        ]);

        const questionMap = new Map<number, HyperliquidRawQuestion>();
        for (const q of meta.questions) {
            for (const outcomeId of q.namedOutcomes) {
                questionMap.set(outcomeId, q);
            }
        }

        let results: HyperliquidRawOutcomeWithQuestion[] = meta.outcomes.map(outcome => ({
            outcome,
            question: questionMap.get(outcome.outcome),
            midPrice: this.getMidForOutcome(mids, outcome.outcome),
            volume24h: volumeMap.get(outcome.outcome),
        }));

        // Filter settled outcomes out by default (active only)
        if (!params?.status || params.status === 'active') {
            const settledSet = new Set<number>();
            for (const q of meta.questions) {
                for (const settled of q.settledNamedOutcomes) {
                    settledSet.add(settled);
                }
            }
            results = results.filter(r => !settledSet.has(r.outcome.outcome));
        }

        // Client-side search
        if (params?.query) {
            const lowerQuery = params.query.toLowerCase();
            results = results.filter(r =>
                r.outcome.name.toLowerCase().includes(lowerQuery) ||
                r.outcome.description.toLowerCase().includes(lowerQuery),
            );
        }

        // Direct lookup by marketId (canonical or outcome-token form)
        if ((params as any)?.marketId) {
            try {
                const targetOutcomeId = fromMarketId(String((params as any).marketId));
                results = results.filter(r => r.outcome.outcome === targetOutcomeId);
            } catch {
                results = [];
            }
        }

        // Filter by parent eventId (HL question number)
        if ((params as any)?.eventId !== undefined && (params as any).eventId !== null) {
            const targetEventId = String((params as any).eventId);
            results = results.filter(r => r.question && String(r.question.question) === targetEventId);
        }

        // Limit
        const limit = params?.limit || 250000;
        const offset = params?.offset || 0;
        return results.slice(offset, offset + limit);
    }

    // -- Events (questions) ----------------------------------------------------

    async fetchRawEvents(params: EventFetchParams): Promise<HyperliquidRawQuestion[]> {
        const meta = await this.fetchOutcomeMeta();

        let results = [...meta.questions];

        // Direct lookup by eventId (HL question number)
        if (params?.eventId !== undefined && params.eventId !== null) {
            const targetEventId = String(params.eventId);
            results = results.filter(q => String(q.question) === targetEventId);
        }

        // Filter by query
        if (params?.query) {
            const lowerQuery = params.query.toLowerCase();
            results = results.filter(q =>
                q.name.toLowerCase().includes(lowerQuery) ||
                q.description.toLowerCase().includes(lowerQuery),
            );
        }

        // Filter settled
        if (!params?.status || params.status === 'active') {
            results = results.filter(q =>
                q.namedOutcomes.length > q.settledNamedOutcomes.length,
            );
        }

        const limit = params?.limit || 250000;
        const offset = params?.offset || 0;
        return results.slice(offset, offset + limit);
    }

    // -- OrderBook -------------------------------------------------------------

    async fetchRawOrderBook(marketId: string): Promise<HyperliquidRawL2Book> {
        const outcomeId = fromMarketId(marketId);
        const coin = toCoinNotation(outcomeId, 'yes');
        return this.postInfo<HyperliquidRawL2Book>({ type: 'l2Book', coin });
    }

    // -- OHLCV (candles) -------------------------------------------------------

    async fetchRawOHLCV(marketId: string, params: OHLCVParams): Promise<HyperliquidRawCandle[]> {
        const outcomeId = fromMarketId(marketId);
        const coin = toCoinNotation(outcomeId, 'yes');

        const now = Date.now();
        const startTime = params.start ? params.start.getTime() : now - 24 * 60 * 60 * 1000;
        const endTime = params.end ? params.end.getTime() : now;

        const raw = await this.postInfo<HyperliquidRawCandle[]>({
            type: 'candleSnapshot',
            req: { coin, interval: params.resolution || '1h', startTime, endTime },
        });
        // ponytail: HL returns the full window; honor caller's limit by trimming to the most recent N
        return params.limit && raw.length > params.limit ? raw.slice(-params.limit) : raw;
    }

    // -- Trades ----------------------------------------------------------------

    async fetchRawTrades(marketId: string, params: TradesParams): Promise<HyperliquidRawTrade[]> {
        const outcomeId = fromMarketId(marketId);
        const coin = toCoinNotation(outcomeId, 'yes');
        const raw = await this.postInfo<HyperliquidRawTrade[]>({ type: 'recentTrades', coin });
        // ponytail: HL recentTrades returns a fixed page; honor caller's limit (most recent N)
        return params?.limit && raw.length > params.limit ? raw.slice(0, params.limit) : raw;
    }

    // -- User data -------------------------------------------------------------

    async fetchRawUserFills(walletAddress: string): Promise<HyperliquidRawFill[]> {
        return this.postInfo<HyperliquidRawFill[]>({
            type: 'userFills',
            user: walletAddress,
        });
    }

    async fetchRawOpenOrders(walletAddress: string): Promise<HyperliquidRawOpenOrder[]> {
        return this.postInfo<HyperliquidRawOpenOrder[]>({
            type: 'openOrders',
            user: walletAddress,
        });
    }

    async fetchRawSpotState(walletAddress: string): Promise<HyperliquidRawSpotState> {
        return this.postInfo<HyperliquidRawSpotState>({
            type: 'spotClearinghouseState',
            user: walletAddress,
        });
    }

    async fetchRawUserState(walletAddress: string): Promise<HyperliquidRawUserState> {
        return this.postInfo<HyperliquidRawUserState>({
            type: 'clearinghouseState',
            user: walletAddress,
        });
    }

    // -- Shared helpers --------------------------------------------------------

    async fetchOutcomeMeta(): Promise<HyperliquidRawOutcomeMeta> {
        return this.postInfo<HyperliquidRawOutcomeMeta>({ type: 'outcomeMeta' });
    }

    async fetchAllMids(): Promise<HyperliquidRawMid> {
        return this.postInfo<HyperliquidRawMid>({ type: 'allMids' });
    }

    /**
     * Build a map of outcomeId -> 24h notional volume (Yes leg + No leg)
     * by reading spotMetaAndAssetCtxs, where outcome legs appear as
     * coin "#<encoding>" with `dayNtlVlm` in USDC.
     */
    async fetchOutcomeVolumeMap(): Promise<Map<number, number>> {
        const map = new Map<number, number>();
        try {
            const resp = await this.postInfo<[unknown, HyperliquidRawSpotAssetCtx[]]>({ type: 'spotMetaAndAssetCtxs' });
            const ctxs = Array.isArray(resp) ? resp[1] : undefined;
            if (!Array.isArray(ctxs)) return map;
            for (const ctx of ctxs) {
                if (!ctx?.coin || !ctx.coin.startsWith('#')) continue;
                const vol = parseFloat(ctx.dayNtlVlm);
                if (!Number.isFinite(vol)) continue;
                const encoding = parseInt(ctx.coin.slice(1), 10);
                if (!Number.isFinite(encoding)) continue;
                const { outcomeId } = fromCoinEncoding(encoding);
                map.set(outcomeId, (map.get(outcomeId) ?? 0) + vol);
            }
        } catch {
            // ponytail: best-effort volume enrichment; if spotMetaAndAssetCtxs is unreachable, return empty map and callers fall back to 0
        }
        return map;
    }

    private getMidForOutcome(mids: HyperliquidRawMid, outcomeId: number): string | undefined {
        const midKey = toMidKey(outcomeId);
        return mids[midKey];
    }
}
