import { IExchangeNormalizer } from '../interfaces';
import { UnifiedMarket, UnifiedEvent, Position } from '../../types';
import { SuibetsRawOffer, SuibetsRawEvent } from './fetcher';
import { OHLCVParams } from '../../BaseExchange';

function impliedProbability(odds: number): number {
    if (!odds || odds <= 1) return 0.5;
    return Math.min(0.99, Math.max(0.01, 1 / odds));
}

function takerProbability(odds: number): number {
    return Math.min(0.99, Math.max(0.01, 1 - impliedProbability(odds)));
}

function liquidity(offer: SuibetsRawOffer): number {
    // Available to be filled in USD-equivalent (SUI)
    const remaining = offer.remainingStake ?? offer.creatorStake;
    return Number(remaining) / 1e9 || 0; // convert MIST to SUI
}

function sideLabel(offer: SuibetsRawOffer, side: 'creator' | 'taker'): string {
    const creator = offer.creatorTeam || offer.homeTeam || 'Home';
    const away = offer.awayTeam || 'Away';
    if (side === 'creator') return creator;
    // taker takes opposite side
    if (creator.toLowerCase() === offer.homeTeam?.toLowerCase()) return away;
    if (creator.toLowerCase() === offer.awayTeam?.toLowerCase()) return offer.homeTeam || 'Home';
    return 'Opposite';
}

export class SuibetsNormalizer implements IExchangeNormalizer<SuibetsRawOffer, SuibetsRawEvent> {
    normalizeMarket(raw: SuibetsRawOffer): UnifiedMarket | null {
        if (!raw?.id) return null;

        const odds = Number(raw.creatorOdds) || 2;
        const yesProb = impliedProbability(odds);
        const noProb = takerProbability(odds);
        const liq = liquidity(raw);
        const volume24h = Number(raw.totalMatched ?? 0) / 1e9;

        const market: UnifiedMarket = {
            marketId: `suibets:${raw.id}`,
            eventId: raw.matchId ? `suibets:${raw.matchId}` : undefined,
            title: `${raw.matchName || `${raw.homeTeam} vs ${raw.awayTeam}`} — ${sideLabel(raw, 'creator')} @ ${odds}x`,
            description: [
                `P2P offer on ${raw.sport || 'sports'} match.`,
                `Creator bets ${sideLabel(raw, 'creator')} at ${odds}× odds.`,
                `Taker backs ${sideLabel(raw, 'taker')} at ${(1 / noProb).toFixed(2)}× implied odds.`,
                raw.leagueName ? `League: ${raw.leagueName}.` : '',
                raw.isOnchain ? `On-chain escrow: ${raw.onchainOfferId ?? 'yes'}.` : 'Off-chain escrow.',
            ].filter(Boolean).join(' '),
            slug: raw.id,
            outcomes: [
                {
                    outcomeId: `${raw.id}:creator`,
                    marketId: `suibets:${raw.id}`,
                    label: sideLabel(raw, 'creator'),
                    price: yesProb,
                },
                {
                    outcomeId: `${raw.id}:taker`,
                    marketId: `suibets:${raw.id}`,
                    label: sideLabel(raw, 'taker'),
                    price: noProb,
                },
            ],
            resolutionDate: new Date(raw.matchDate || raw.expiresAt),
            volume24h,
            liquidity: liq,
            url: `https://suibets.replit.app/p2p`,
            status: raw.status === 'OPEN' ? 'active' : raw.status?.toLowerCase() ?? 'inactive',
            category: 'Sports',
            tags: ['Sports', 'P2P', raw.sport, raw.leagueName].filter((t): t is string => Boolean(t)),
            contractAddress: raw.onchainOfferId,
        };

        // Convenience YES/NO accessors
        (market as any).yes = market.outcomes[0];
        (market as any).no = market.outcomes[1];

        return market;
    }

    normalizeEvent(raw: SuibetsRawEvent): UnifiedEvent | null {
        if (!raw?.id) return null;

        const markets: UnifiedMarket[] = (raw.offers ?? [])
            .map(o => this.normalizeMarket(o))
            .filter((m): m is UnifiedMarket => m !== null);

        const totalVolume = markets.reduce((s, m) => s + (m.volume ?? m.volume24h ?? 0), 0);

        return {
            id: `suibets:${raw.id}`,
            title: raw.name || `${raw.homeTeam} vs ${raw.awayTeam}`,
            description: [
                raw.leagueName ? `${raw.leagueName} —` : '',
                raw.sport,
                'P2P betting on SuiBets.',
            ].filter(Boolean).join(' '),
            slug: raw.id,
            markets,
            volume24h: totalVolume,
            volume: totalVolume,
            url: 'https://suibets.replit.app/p2p',
            category: 'Sports',
            tags: ['Sports', 'P2P', 'Sui', raw.sport, raw.leagueName].filter((t): t is string => Boolean(t)),
        };
    }

    normalizePosition(raw: SuibetsRawOffer): Position {
        const odds = Number(raw.creatorOdds) || 2;
        return {
            marketId: `suibets:${raw.matchId ?? raw.id}`,
            outcomeId: `${raw.id}:creator`,
            outcomeLabel: sideLabel(raw, 'creator'),
            size: Number(raw.creatorStake ?? 0) / 1e9,
            entryPrice: impliedProbability(odds),
            currentPrice: impliedProbability(odds),
            unrealizedPnL: 0,
        };
    }
}
