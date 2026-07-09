import { IExchangeNormalizer } from '../interfaces';
import { UnifiedMarket, UnifiedEvent, Position } from '../../types';
import { SuibetsRawOffer, SuibetsRawEvent } from './fetcher';
import {
    impliedProbability,
    takerProbability,
    mistToSui,
    sideLabel,
    toMarketId,
    toOutcomeId,
    mapStatus,
} from './utils';

function liquidity(offer: SuibetsRawOffer): number {
    // Prioritize live onchainState.makerRemaining data before falling back to legacy fields
    const remaining = offer.onchainState?.makerRemaining ?? offer.remainingStake ?? offer.creatorStake;
    return mistToSui(remaining);
}

export class SuibetsNormalizer implements IExchangeNormalizer<SuibetsRawOffer, SuibetsRawEvent> {
    normalizeMarket(raw: SuibetsRawOffer): UnifiedMarket | null {
        if (!raw?.id) return null;

        const dateSource = raw.matchDate || raw.expiresAt;
        if (!dateSource) {
            throw new Error(`SuibetsNormalizer: offer ${raw.id} has neither matchDate nor expiresAt`);
        }

        const homeTeam = raw.homeTeam || 'Unknown Team';
        const awayTeam = raw.awayTeam || 'Unknown Team';

        const odds = Number(raw.creatorOdds) || 2;
        const yesProb = impliedProbability(odds);
        const noProb = takerProbability(odds);
        const liq = liquidity(raw);
        const volume24h = mistToSui(raw.totalMatched ?? 0);

        const marketId = toMarketId(raw.id);
        const creatorOutcome = {
            outcomeId: toOutcomeId(raw.id, 'creator'),
            marketId,
            label: sideLabel(raw, 'creator'),
            price: yesProb,
        };
        const takerOutcome = {
            outcomeId: toOutcomeId(raw.id, 'taker'),
            marketId,
            label: sideLabel(raw, 'taker'),
            price: noProb,
        };

        const market: UnifiedMarket = {
            marketId,
            eventId: raw.matchId ? toMarketId(raw.matchId) : undefined,
            title: `${raw.matchName || `${homeTeam} vs ${awayTeam}`} \u2014 ${sideLabel(raw, 'creator')} @ ${odds}x`,
            description: [
                `P2P offer on ${raw.sport || 'sports'} match.`,
                `Creator bets ${sideLabel(raw, 'creator')} at ${odds}x odds.`,
                `Taker backs ${sideLabel(raw, 'taker')} at ${(1 / noProb).toFixed(2)}x implied odds.`,
                raw.leagueName ? `League: ${raw.leagueName}.` : '',
                raw.isOnchain ? `On-chain escrow: ${raw.onchainOfferId ?? 'yes'}.` : 'Off-chain escrow.',
            ].filter(Boolean).join(' '),
            slug: raw.id,
            outcomes: [creatorOutcome, takerOutcome],
            resolutionDate: new Date(dateSource),
            volume24h,
            liquidity: liq,
            url: 'https://www.suibets.com/p2p',
            status: mapStatus(raw.status),
            category: 'Sports',
            tags: ['Sports', 'P2P', raw.sport, raw.leagueName].filter((t): t is string => Boolean(t)),
            contractAddress: raw.onchainOfferId,
            yes: creatorOutcome,
            no: takerOutcome,
        };

        return market;
    }

    normalizeEvent(raw: SuibetsRawEvent): UnifiedEvent | null {
        if (!raw?.id) return null;

        const homeTeam = raw.homeTeam || 'Unknown Team';
        const awayTeam = raw.awayTeam || 'Unknown Team';

        const markets: UnifiedMarket[] = (raw.offers ?? [])
            .map(o => this.normalizeMarket(o))
            .filter((m): m is UnifiedMarket => m !== null);

        const totalVolume = markets.reduce((s, m) => s + (m.volume24h ?? 0), 0);

        return {
            id: toMarketId(raw.id),
            title: raw.name || `${homeTeam} vs ${awayTeam}`,
            description: [
                raw.leagueName ? `${raw.leagueName} \u2014` : '',
                raw.sport,
                'P2P betting on SuiBets.',
            ].filter(Boolean).join(' '),
            slug: raw.id,
            markets,
            volume24h: totalVolume,
            volume: totalVolume,
            url: 'https://www.suibets.com/p2p',
            category: 'Sports',
            tags: ['Sports', 'P2P', 'Sui', raw.sport, raw.leagueName].filter((t): t is string => Boolean(t)),
        };
    }

    normalizePosition(raw: SuibetsRawOffer): Position {
        const odds = Number(raw.creatorOdds) || 2;
        return {
            marketId: toMarketId(raw.matchId ?? raw.id),
            outcomeId: toOutcomeId(raw.id, 'creator'),
            outcomeLabel: sideLabel(raw, 'creator'),
            size: mistToSui(raw.creatorStake ?? 0),
            entryPrice: impliedProbability(odds),
            currentPrice: impliedProbability(odds),
            unrealizedPnL: 0,
        };
    }
}
