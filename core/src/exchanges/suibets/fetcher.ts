import axios, { AxiosInstance } from 'axios';
import { MarketFilterParams, EventFetchParams } from '../../BaseExchange';
import { IExchangeFetcher } from '../interfaces';

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
    [key: string]: unknown;
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
    [key: string]: unknown;
}

export class SuibetsFetcher implements IExchangeFetcher<SuibetsRawOffer, SuibetsRawEvent> {
    private readonly http: AxiosInstance;
    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.http = axios.create({ baseURL: this.baseUrl, timeout: 10_000 });
    }

    async fetchRawMarkets(params?: MarketFilterParams): Promise<SuibetsRawOffer[]> {
        if (params?.marketId) {
            const id = params.marketId.replace(/^suibets:/, '');
            const { data } = await this.http.get(`/api/p2p/offers/${id}`);
            const offer = data?.offer || data;
            return offer ? [offer] : [];
        }

        const queryParams: Record<string, any> = {
            status: params?.status === 'all' ? undefined : 'OPEN',
            limit: params?.limit ?? 50,
            offset: params?.offset ?? 0,
        };

        if (params?.eventId) {
            queryParams.matchId = params.eventId.replace(/^suibets:/, '');
        }
        if (params?.query) {
            // filter client-side
        }

        const { data } = await this.http.get('/api/p2p/offers', { params: queryParams });
        const offers: SuibetsRawOffer[] = data?.offers ?? data ?? [];

        if (params?.query) {
            const q = params.query.toLowerCase();
            return offers.filter(o =>
                o.matchName?.toLowerCase().includes(q) ||
                o.homeTeam?.toLowerCase().includes(q) ||
                o.awayTeam?.toLowerCase().includes(q) ||
                o.sport?.toLowerCase().includes(q)
            );
        }

        return offers;
    }

    async fetchRawEvents(params: EventFetchParams): Promise<SuibetsRawEvent[]> {
        // Group active offers by matchId to build synthetic events
        const queryParams: Record<string, any> = {
            status: 'OPEN',
            limit: params.limit ?? 100,
        };

        const { data } = await this.http.get('/api/p2p/offers', { params: queryParams });
        const offers: SuibetsRawOffer[] = data?.offers ?? data ?? [];

        // Group offers by matchId
        const byMatch = new Map<string, SuibetsRawOffer[]>();
        for (const offer of offers) {
            if (!offer.matchId) continue;
            if (!byMatch.has(offer.matchId)) byMatch.set(offer.matchId, []);
            byMatch.get(offer.matchId)!.push(offer);
        }

        const events: SuibetsRawEvent[] = [];
        for (const [matchId, matchOffers] of byMatch) {
            const first = matchOffers[0];
            let q = params.query?.toLowerCase();
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

    async fetchRawPositions(walletAddress: string): Promise<SuibetsRawOffer[]> {
        const { data } = await this.http.get('/api/p2p/my', {
            params: { wallet: walletAddress },
        });
        const all = [
            ...(data?.createdOffers ?? []),
            ...(data?.matchedBets ?? []),
            ...(data?.parlays ?? []),
        ];
        return all;
    }
}
