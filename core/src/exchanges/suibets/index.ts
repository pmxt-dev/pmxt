import {
    PredictionMarketExchange,
    MarketFilterParams,
    ExchangeCredentials,
    EventFetchParams,
} from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, OrderBook, Position } from '../../types';
import { SuibetsFetcher } from './fetcher';
import { SuibetsNormalizer } from './normalizer';

export const SUIBETS_DEFAULT_BASE_URL = 'https://suibets.replit.app';

export interface SuibetsCredentials extends ExchangeCredentials {
    /** Sui wallet address for fetching personal positions */
    walletAddress?: string;
    /** Override API base URL (default: https://suibets.replit.app) */
    baseUrl?: string;
}

/**
 * SuiBets — Decentralised P2P sports betting on Sui blockchain.
 *
 * Maps P2P bet offers to the pmxt unified market model:
 *   - Market  = one P2P offer (creator side vs taker side)
 *   - Event   = a sports match (groups all offers for that match)
 *   - Outcome = creator's pick (YES) or opposite (NO)
 *   - Price   = implied probability derived from the offer odds
 *
 * Usage:
 * ```ts
 * import pmxt from 'pmxtjs';
 * const exchange = new pmxt.SuiBets();
 * const markets = await exchange.fetchMarkets({ limit: 20 });
 * ```
 */
export class SuiBetsExchange extends PredictionMarketExchange {
    protected override readonly capabilityOverrides = {
        fetchOrderBook: 'emulated' as const,
        createOrder: false as const,
        cancelOrder: false as const,
        fetchOrder: false as const,
        fetchOpenOrders: false as const,
        fetchBalance: false as const,
        fetchPositions: 'real' as const,
        watchOrderBook: false as const,
        watchTrades: false as const,
    };

    private readonly fetcher: SuibetsFetcher;
    private readonly normalizer: SuibetsNormalizer;
    private readonly walletAddress?: string;

    constructor(credentials?: SuibetsCredentials) {
        super(credentials);
        this.rateLimit = 300;
        this.walletAddress = credentials?.walletAddress;

        const baseUrl = credentials?.baseUrl || SUIBETS_DEFAULT_BASE_URL;
        this.fetcher = new SuibetsFetcher(baseUrl);
        this.normalizer = new SuibetsNormalizer();
    }

    get name(): string {
        return 'SuiBets';
    }

    protected override sign(): Record<string, string> {
        return {};
    }

    // -------------------------------------------------------------------------
    // Market Data
    // -------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        const raw = await this.fetcher.fetchRawMarkets(params);
        return raw
            .map(r => this.normalizer.normalizeMarket(r))
            .filter((m): m is UnifiedMarket => m !== null);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        const raw = await this.fetcher.fetchRawEvents(params);
        return raw
            .map(r => this.normalizer.normalizeEvent(r))
            .filter((e): e is UnifiedEvent => e !== null);
    }

    /**
     * Emulated order book from offer odds.
     * Bid = taker side (buying the NO position), Ask = creator side (YES).
     */
    async fetchOrderBook(outcomeId: string): Promise<OrderBook> {
        const offerId = outcomeId.split(':')[0];
        const markets = await this.fetchMarketsImpl({ marketId: `suibets:${offerId}` });
        const market = markets[0];
        if (!market) return { bids: [], asks: [], timestamp: Date.now() };

        const yes = market.outcomes[0];
        const no = market.outcomes[1];
        const size = market.liquidity;

        return {
            bids: [{ price: yes.price, size }],
            asks: [{ price: no.price, size }],
            timestamp: Date.now(),
        };
    }

    // -------------------------------------------------------------------------
    // Positions (read-only — requires walletAddress)
    // -------------------------------------------------------------------------

    async fetchPositions(): Promise<Position[]> {
        const wallet = this.walletAddress;
        if (!wallet) {
            throw new Error(
                'fetchPositions() requires a walletAddress. ' +
                'Pass it via new SuiBetsExchange({ walletAddress: "0x..." }).',
            );
        }
        const raw = await this.fetcher.fetchRawPositions(wallet);
        return raw.map(r => this.normalizer.normalizePosition(r));
    }
}
