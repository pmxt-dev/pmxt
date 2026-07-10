import { MarketFilterParams, EventFetchParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { suibetsErrorMapper } from './errors';

export interface SuibetsRawOffer {
    id: string;
    matchId: string;
    matchName: string;
    sport: string;
    homeTeam: string;
    awayTeam: string;
    creatorWallet: string;
    creatorTeam: string;
    creatorOdds: number;
    creatorStake: number;
    takerStake: number;
    remainingStake?: number;
    matchDate: string;
    expiresAt: string;
    status: string;
    totalMatched?: number;
    currency?: string;
    isOnchain?: boolean;
    onchainOfferId?: string;
    leagueName?: string;
    onchainState?: {
        makerRemaining?: string;
        totalLiquidity?: string;
        filledAmount?: string;
        status?: string;
    };
}

export interface SuibetsRawEvent {
    id: string;
    name: string;
    homeTeam: string;
    awayTeam: string;
    sport: string;
    leagueName?: string;
    matchDate: string;
    status: string;
    offers?: SuibetsRawOffer[];
}


/**
 * Structured return type for fetchRawPositions.
 * Keeps the three position-array types separate so each is normalised
 * with the correct shape instead of being cast from unknown[].
 */
export interface SuibetsRawPositions {
    createdOffers: SuibetsRawOffer[];
    matchedBets: unknown[];
    parlays: unknown[];
}

/**
 * Type guard: true only when the value has the core fields that
 * SuibetsNormalizer.normalizePosition() reads (id, creatorOdds, creatorStake).
 * Guards against silent garbage output when matchedBets or parlays
 * are accidentally passed in as SuibetsRawOffer.
 */
export function isSuibetsRawOffer(value: unknown): value is SuibetsRawOffer {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        (typeof v['id'] === 'string' || typeof v['id'] === 'number') &&
        typeof v['creatorOdds'] === 'number' &&
        typeof v['creatorStake'] === 'number'
    );
}

export class SuibetsFetcher implements IExchangeFetcher<SuibetsRawOffer, SuibetsRawEvent, SuibetsRawPositions> {
    private readonly ctx: FetcherContext;
    private readonly baseUrl: string;

    constructor(ctx: FetcherContext, baseUrl: string) {
        this.ctx = ctx;
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    /**
     * Performs a GET request via the rate-limited HTTP client provided by the
     * base class. All errors are mapped to pmxt unified error types.
     */
    private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
        try {
            const url = new URL(path, this.baseUrl);
            if (params) {
                for (const [k, v] of Object.entries(params)) {
                    url.searchParams.set(k, v);
                }
            }
            const response = await this.ctx.http.get(url.toString(), {
                maxContentLength: 5 * 1024 * 1024,
            });
            return response.data as T;
        } catch (error: unknown) {
            throw suibetsErrorMapper.mapError(error);
        }
    }

    /**
     * Fetches raw P2P bet offers from the SuiBets API.
     *
     * When `params.query` is set, filtering is applied client-side after
     * fetching because the API does not support full-text search.
     */
    async fetchRawMarkets(params?: MarketFilterParams): Promise<SuibetsRawOffer[]> {
        if (params?.marketId) {
            const id = params.marketId.replace(/^suibets:/, '');
            const data = await this.get<{ offer?: SuibetsRawOffer } | SuibetsRawOffer>(
                `/api/p2p/offers/${id}`,
            );
            const offer =
                (data as { offer?: SuibetsRawOffer }).offer ?? (data as SuibetsRawOffer);
            return offer ? [offer] : [];
        }

        const baseParams: Record<string, string> = {
            status: params?.status === 'all' ? 'all' : 'OPEN',
            limit: String(params?.limit ?? 50),
            offset: String(params?.offset ?? 0),
        };

        const queryParams: Record<string, string> = params?.eventId
            ? { ...baseParams, matchId: params.eventId.replace(/^suibets:/, '') }
            : { ...baseParams };

        const data = await this.get<{ offers?: SuibetsRawOffer[] } | SuibetsRawOffer[]>(
            '/api/p2p/offers',
            queryParams,
        );
        const offers: SuibetsRawOffer[] =
            (data as { offers?: SuibetsRawOffer[] }).offers ??
            (Array.isArray(data) ? (data as SuibetsRawOffer[]) : []);

        if (!params?.query) {
            return offers;
        }

        // Client-side text filter: the API has no search endpoint.
        const q = params.query.toLowerCase();
        return offers.filter(
            o =>
                o.matchName?.toLowerCase().includes(q) ||
                o.homeTeam?.toLowerCase().includes(q) ||
                o.awayTeam?.toLowerCase().includes(q) ||
                o.sport?.toLowerCase().includes(q),
        );
    }

    /**
     * Fetches raw events by grouping active P2P offers by their matchId.
     *
     * SuiBets has no dedicated events endpoint; events are synthesised from
     * the offers list so each unique match becomes one event.
     */
    async fetchRawEvents(params: EventFetchParams): Promise<SuibetsRawEvent[]> {
        const queryParams: Record<string, string> = {
            status: 'OPEN',
            limit: String(params.limit ?? 100),
        };

        const data = await this.get<{ offers?: SuibetsRawOffer[] } | SuibetsRawOffer[]>(
            '/api/p2p/offers',
            queryParams,
        );
        const offers: SuibetsRawOffer[] =
            (data as { offers?: SuibetsRawOffer[] }).offers ??
            (Array.isArray(data) ? (data as SuibetsRawOffer[]) : []);

        // Group offers by matchId using a Map; each entry is built immutably.
        const byMatch = new Map<string, SuibetsRawOffer[]>();
        for (const offer of offers) {
            if (!offer.matchId) continue;
            const existing = byMatch.get(offer.matchId) ?? [];
            byMatch.set(offer.matchId, [...existing, offer]);
        }

        const q = params.query?.toLowerCase();
        const events: SuibetsRawEvent[] = [];

        for (const [matchId, matchOffers] of byMatch) {
            const first = matchOffers[0];

            if (q) {
                const matches =
                    first.matchName?.toLowerCase().includes(q) ||
                    first.homeTeam?.toLowerCase().includes(q) ||
                    first.awayTeam?.toLowerCase().includes(q) ||
                    first.sport?.toLowerCase().includes(q);
                if (!matches) continue;
            }

            events.push({
                id: matchId,
                name: first.matchName || `${first.homeTeam} vs ${first.awayTeam}`,
                homeTeam: first.homeTeam,
                awayTeam: first.awayTeam,
                sport: first.sport,
                leagueName: first.leagueName,
                matchDate: first.matchDate,
                status: 'active',
                offers: matchOffers,
            });
        }

        return events;
    }

    /**
     * Fetches raw positions (created offers, matched bets, parlays) for a
     * given Sui wallet address.
     *
     * Returns each array separately and typed so that normalisation uses
     * the correct shape per position type rather than casting from unknown[].
     */
    async fetchRawPositions(walletAddress: string): Promise<SuibetsRawPositions> {
        const data = await this.get<{
            createdOffers?: unknown[];
            matchedBets?: unknown[];
            parlays?: unknown[];
        }>('/api/p2p/my', { wallet: walletAddress });

        return {
            createdOffers: (data.createdOffers ?? []).filter(isSuibetsRawOffer),
            matchedBets: data.matchedBets ?? [],
            parlays: data.parlays ?? [],
        };
    }
}
