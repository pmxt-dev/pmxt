import { MarketFetchParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, Position, Balance } from '../../types';
import { NotFound } from '../../errors';
import { IExchangeNormalizer } from '../interfaces';
import {
    LAMPORTS_PER_SOL,
    mapBooleanToUnified,
    mapRaceToUnified,
    deriveMarketPda,
    deriveRaceMarketPda,
    BaoziMarket,
    BaoziRaceMarket,
} from './utils';
import {
    BaoziRawMarket,
    BaoziRawBooleanMarket,
    BaoziRawRaceMarket,
    BaoziRawBooleanPosition,
    BaoziRawRacePosition,
    BaoziRawBalance,
    isRawBooleanMarket,
    isRawRaceMarket,
} from './fetcher';

// ---------------------------------------------------------------------------
// Normalizer -- pure data mapping, no I/O
// ---------------------------------------------------------------------------

export class BaoziNormalizer implements IExchangeNormalizer<BaoziRawMarket, BaoziRawMarket> {

    normalizeMarket(raw: BaoziRawMarket): UnifiedMarket | null {
        if (!raw) return null;

        if (isRawBooleanMarket(raw)) {
            return mapBooleanToUnified(raw.parsed, raw.pubkey);
        }

        if (isRawRaceMarket(raw)) {
            return mapRaceToUnified(raw.parsed, raw.pubkey);
        }

        return null;
    }

    normalizeEvent(raw: BaoziRawMarket): UnifiedEvent | null {
        const market = this.normalizeMarket(raw);
        if (!market) return null;

        return {
            id: market.marketId,
            title: market.title,
            description: market.description,
            slug: market.marketId,
            markets: [market],
            volume24h: market.volume24h,
            volume: market.volume,
            url: market.url,
            image: market.image,
            category: market.category,
            tags: market.tags,
            sourceMetadata: market.sourceMetadata,
        };
    }

    normalizeMarkets(rawMarkets: BaoziRawMarket[], params?: MarketFetchParams): UnifiedMarket[] {
        const markets: UnifiedMarket[] = [];
        for (const raw of rawMarkets) {
            const m = this.normalizeMarket(raw);
            if (m) markets.push(m);
        }
        return applyFilters(markets, params);
    }

    normalizeEvents(rawMarkets: BaoziRawMarket[], params?: MarketFetchParams): UnifiedEvent[] {
        const markets = this.normalizeMarkets(rawMarkets, params);
        return markets.map(m => ({
            id: m.marketId,
            title: m.title,
            description: m.description,
            slug: m.marketId,
            markets: [m],
            volume24h: m.volume24h,
            volume: m.volume,
            url: m.url,
            image: m.image,
            category: m.category,
            tags: m.tags,
            sourceMetadata: m.sourceMetadata,
        }));
    }

    normalizeOrderBook(raw: BaoziRawMarket | null, outcomeId: string): OrderBook {
        if (!raw) {
            throw new NotFound(`Market not found for outcome: ${outcomeId}`, 'Baozi');
        }

        const market = this.normalizeMarket(raw);
        if (!market) {
            throw new NotFound(`Could not parse market for outcome: ${outcomeId}`, 'Baozi');
        }

        const outcome = market.outcomes.find(o => o.outcomeId === outcomeId);
        const price = outcome?.price ?? 0;
        const totalLiquidity = market.liquidity;

        return {
            bids: [{ price, size: totalLiquidity }],
            asks: [{ price, size: totalLiquidity }],
            timestamp: Date.now(),
        };
    }

    normalizeBooleanPositions(
        positions: BaoziRawBooleanPosition[],
        marketLookup: Map<string, UnifiedMarket>,
    ): Position[] {
        const result: Position[] = [];

        for (const { parsed: pos } of positions) {
            if (pos.claimed) continue;

            const marketPda = deriveMarketPda(pos.marketId);
            const marketPdaStr = marketPda.toString();
            const market = marketLookup.get(marketPdaStr);

            let currentYesPrice = 0;
            let currentNoPrice = 0;

            if (market) {
                currentYesPrice = market.yes?.price ?? 0;
                currentNoPrice = market.no?.price ?? 0;
            }

            const yesSOL = Number(pos.yesAmount) / LAMPORTS_PER_SOL;
            const noSOL = Number(pos.noAmount) / LAMPORTS_PER_SOL;

            if (yesSOL > 0) {
                result.push({
                    marketId: marketPdaStr,
                    outcomeId: `${marketPdaStr}-YES`,
                    outcomeLabel: 'Yes',
                    size: yesSOL,
                    entryPrice: 0,
                    currentPrice: currentYesPrice,
                    unrealizedPnL: 0,
                });
            }

            if (noSOL > 0) {
                result.push({
                    marketId: marketPdaStr,
                    outcomeId: `${marketPdaStr}-NO`,
                    outcomeLabel: 'No',
                    size: noSOL,
                    entryPrice: 0,
                    currentPrice: currentNoPrice,
                    unrealizedPnL: 0,
                });
            }
        }

        return result;
    }

    normalizeRacePositions(
        positions: BaoziRawRacePosition[],
        marketLookup: Map<string, UnifiedMarket>,
    ): Position[] {
        const result: Position[] = [];

        for (const { parsed: pos } of positions) {
            if (pos.claimed) continue;

            const racePda = deriveRaceMarketPda(pos.marketId);
            const racePdaStr = racePda.toString();
            const market = marketLookup.get(racePdaStr);

            const outcomePrices: number[] = market ? market.outcomes.map(o => o.price) : [];
            const outcomeLabels: string[] = market ? market.outcomes.map(o => o.label) : [];

            for (let i = 0; i < pos.bets.length; i++) {
                const betSOL = Number(pos.bets[i]) / LAMPORTS_PER_SOL;
                if (betSOL <= 0) continue;

                result.push({
                    marketId: racePdaStr,
                    outcomeId: `${racePdaStr}-${i}`,
                    outcomeLabel: outcomeLabels[i] || `Outcome ${i}`,
                    size: betSOL,
                    entryPrice: 0,
                    currentPrice: outcomePrices[i] ?? 0,
                    unrealizedPnL: 0,
                });
            }
        }

        return result;
    }

    normalizeBalance(raw: BaoziRawBalance): Balance[] {
        const solBalance = raw.lamports / LAMPORTS_PER_SOL;
        return [{
            currency: 'SOL',
            total: solBalance,
            available: solBalance,
            locked: 0,
        }];
    }
}

// ---------------------------------------------------------------------------
// Filtering / sorting (pure, no I/O)
// ---------------------------------------------------------------------------

function applyFilters(markets: UnifiedMarket[], params?: MarketFetchParams): UnifiedMarket[] {
    let result = [...markets];

    // Status filter
    const status = params?.status || 'active';
    if (status !== 'all') {
        const now = Date.now();
        if (status === 'active') {
            result = result.filter(m => !m.resolutionDate || m.resolutionDate.getTime() > now);
        } else {
            result = result.filter(m => m.resolutionDate && m.resolutionDate.getTime() <= now);
        }
    }

    // Text search
    if (params?.query) {
        const lowerQuery = params.query.toLowerCase();
        const searchIn = params.searchIn || 'title';

        result = result.filter(m => {
            const titleMatch = m.title.toLowerCase().includes(lowerQuery);
            const descMatch = (m.description || '').toLowerCase().includes(lowerQuery);

            if (searchIn === 'title') return titleMatch;
            if (searchIn === 'description') return descMatch;
            return titleMatch || descMatch;
        });
    }

    // Sort
    if (params?.sort === 'volume') {
        result.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    } else if (params?.sort === 'liquidity') {
        result.sort((a, b) => b.liquidity - a.liquidity);
    } else if (params?.sort === 'newest') {
        result.sort((a, b) => (b.resolutionDate?.getTime() ?? 0) - (a.resolutionDate?.getTime() ?? 0));
    } else {
        result.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    }

    // Pagination
    const offset = params?.offset || 0;
    const limit = params?.limit || 10000;
    result = result.slice(offset, offset + limit);

    return result;
}
