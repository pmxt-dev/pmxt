import {
    PredictionMarketExchange,
    MarketFilterParams,
    EventFetchParams,
    ExchangeCredentials,
} from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, OrderBook, Position } from '../../types';
import { AuthenticationError } from '../../errors';
import { getSuibetsConfig, SuibetsApiConfig, RATE_LIMIT_MS, validateBaseUrl } from './config';
import { SuibetsFetcher, SuibetsRawOffer } from './fetcher';
import { SuibetsNormalizer } from './normalizer';
import { fromOutcomeId } from './utils';
import { FetcherContext } from '../interfaces';

export interface SuibetsCredentials extends ExchangeCredentials {
    /** Sui wallet address for fetching personal positions */
    walletAddress?: string;
    /** Override API base URL (default: https://www.suibets.com) */
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
        fetchPositions: true as const,
        watchOrderBook: false as const,
        watchTrades: false as const,
        fetchSeries: false as const,
    };

    private readonly config: SuibetsApiConfig;
    private readonly fetcher: SuibetsFetcher;
    private readonly normalizer: SuibetsNormalizer;
    private readonly walletAddress?: string;

    constructor(credentials?: SuibetsCredentials) {
        super(credentials);
        this.rateLimit = RATE_LIMIT_MS;
        this.walletAddress = credentials?.walletAddress;

        if (credentials?.baseUrl) {
            validateBaseUrl(credentials.baseUrl);
        }

        this.config = getSuibetsConfig(credentials?.baseUrl);

        const ctx: FetcherContext = {
            http: this.http,
            callApi: this.callApi.bind(this),
            getHeaders: () => ({}),
        };

        this.fetcher = new SuibetsFetcher(ctx, this.config.baseUrl);
        this.normalizer = new SuibetsNormalizer();
    }

    get name(): string {
        return 'SuiBets';
    }

    // SuiBets is a public API -- no request signing required
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
        // Venue does not expose a series concept; honoring `params.series` by returning [] rather than ignoring the filter.
        if (params.series !== undefined) {
            return [];
        }

        const raw = await this.fetcher.fetchRawEvents(params);
        return raw
            .map(r => this.normalizer.normalizeEvent(r))
            .filter((e): e is UnifiedEvent => e !== null);
    }

    /**
     * Emulated order book derived from offer odds.
     *
     * Bid side: what buyers pay to back the creator's pick (YES price).
     * Ask side: what sellers want to take the opposite side (NO price).
     */
    async fetchOrderBook(outcomeId: string): Promise<OrderBook> {
        const { offerId } = fromOutcomeId(outcomeId);
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
    // Positions (read-only -- requires walletAddress)
    // -------------------------------------------------------------------------

    async fetchPositions(): Promise<Position[]> {
        const wallet = this.walletAddress;
        if (!wallet) {
            throw new AuthenticationError(
                'fetchPositions() requires a walletAddress. ' +
                    'Pass it via new SuiBetsExchange({ walletAddress: "0x..." }).',
                'SuiBets',
            );
        }
        const raw = await this.fetcher.fetchRawPositions(wallet);
        return raw.createdOffers.map(r => this.normalizer.normalizePosition(r));
    }
}
