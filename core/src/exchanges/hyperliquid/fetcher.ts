import { MarketFilterParams, EventFetchParams, OHLCVParams, TradesParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { hyperliquidErrorMapper } from './errors';
import { toCoinNotation, toMidKey, fromMarketId } from './utils';

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

// Composite type: outcome + its question context
export interface HyperliquidRawOutcomeWithQuestion {
    outcome: HyperliquidRawOutcome;
    question: HyperliquidRawQuestion | undefined;
    midPrice: string | undefined; // from allMids
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
        const [meta, mids] = await Promise.all([
            this.fetchOutcomeMeta(),
            this.fetchAllMids(),
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

        // Limit
        const limit = params?.limit || 250000;
        const offset = params?.offset || 0;
        return results.slice(offset, offset + limit);
    }

    // -- Events (questions) ----------------------------------------------------

    async fetchRawEvents(params: EventFetchParams): Promise<HyperliquidRawQuestion[]> {
        const meta = await this.fetchOutcomeMeta();

        let results = [...meta.questions];

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

        return this.postInfo<HyperliquidRawCandle[]>({
            type: 'candleSnapshot',
            req: { coin, interval: params.resolution || '1h', startTime, endTime },
        });
    }

    // -- Trades ----------------------------------------------------------------

    async fetchRawTrades(marketId: string, _params: TradesParams): Promise<HyperliquidRawTrade[]> {
        const outcomeId = fromMarketId(marketId);
        const coin = toCoinNotation(outcomeId, 'yes');
        return this.postInfo<HyperliquidRawTrade[]>({ type: 'recentTrades', coin });
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

    private getMidForOutcome(mids: HyperliquidRawMid, outcomeId: number): string | undefined {
        const midKey = toMidKey(outcomeId);
        return mids[midKey];
    }
}
