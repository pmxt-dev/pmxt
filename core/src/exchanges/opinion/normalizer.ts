import { OHLCVParams } from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    PriceCandle,
    OrderBook,
    Trade,
    UserTrade,
    Position,
    Order,
    MarketOutcome,
} from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { parseNumStr, mapOrderStatus, toMillis, intervalToMs } from './utils';
import {
    OpinionRawMarket,
    OpinionRawChildMarket,
    OpinionRawOrderBook,
    OpinionRawPricePoint,
    OpinionRawUserTrade,
    OpinionRawPosition,
    OpinionRawOrder,
} from './fetcher';

// ---------------------------------------------------------------------------
// Opinion Trade Normalizer
// ---------------------------------------------------------------------------

export class OpinionNormalizer implements IExchangeNormalizer<OpinionRawMarket, OpinionRawMarket> {

    // -- Markets --------------------------------------------------------------

    normalizeMarket(raw: OpinionRawMarket): UnifiedMarket | null {
        if (!raw) return null;

        // For categorical markets, return the first child as the "primary" market.
        // Use normalizeMarketsFromEvent() for the full set.
        if (raw.marketType === 1) {
            const markets = this.normalizeMarketsFromEvent(raw);
            return markets.length > 0 ? markets[0] : null;
        }

        return this.normalizeBinaryMarket(raw);
    }

    normalizeMarketsFromEvent(raw: OpinionRawMarket): UnifiedMarket[] {
        if (!raw) return [];

        // Binary market wraps itself as a single-market list
        if (raw.marketType === 0) {
            const market = this.normalizeBinaryMarket(raw);
            return market ? [market] : [];
        }

        // Categorical: each child market becomes a separate UnifiedMarket
        const children = raw.childMarkets || [];
        const results: UnifiedMarket[] = [];

        const parentVolume24h = parseNumStr(raw.volume24h);
        const totalChildVolume = children.reduce((sum, c) => sum + parseNumStr(c.volume), 0);

        for (const child of children) {
            const childVolume = parseNumStr(child.volume);
            const childVolume24h = totalChildVolume > 0
                ? (childVolume / totalChildVolume) * parentVolume24h
                : 0;
            const market = this.normalizeChildMarket(child, raw, childVolume24h);
            if (market) results.push(market);
        }

        return results;
    }

    // -- Events ---------------------------------------------------------------

    normalizeEvent(raw: OpinionRawMarket): UnifiedEvent | null {
        if (!raw) return null;

        const markets = this.normalizeMarketsFromEvent(raw);

        const volume24h = raw.volume24h
            ? parseNumStr(raw.volume24h)
            : markets.reduce((sum, m) => sum + m.volume24h, 0);

        const totalVolume = markets.some(m => m.volume !== undefined)
            ? markets.reduce((sum, m) => sum + (m.volume ?? 0), 0)
            : undefined;

        return {
            id: String(raw.marketId),
            title: raw.marketTitle || '',
            description: raw.rules || '',
            slug: String(raw.marketId),
            markets,
            volume24h,
            volume: totalVolume,
            url: `https://opinion.trade/market/${raw.marketId}`,
        };
    }

    // -- OHLCV ----------------------------------------------------------------

    normalizeOHLCV(raw: { history: OpinionRawPricePoint[] }, params: OHLCVParams): PriceCandle[] {
        const points = raw?.history || [];
        if (points.length === 0) return [];

        const bucketMs = intervalToMs(params.resolution);
        const buckets = new Map<number, PriceCandle>();

        for (const point of points) {
            const rawMs = point.t * 1000; // t is always in seconds per API spec
            const snappedMs = Math.floor(rawMs / bucketMs) * bucketMs;
            const price = parseNumStr(point.p);

            const existing = buckets.get(snappedMs);
            if (!existing) {
                buckets.set(snappedMs, {
                    timestamp: snappedMs,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                });
            } else {
                buckets.set(snappedMs, {
                    timestamp: snappedMs,
                    open: existing.open,
                    high: Math.max(existing.high, price),
                    low: Math.min(existing.low, price),
                    close: price,
                });
            }
        }

        const candles = Array.from(buckets.values()).sort(
            (a, b) => a.timestamp - b.timestamp,
        );

        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }

        return candles;
    }

    // -- Order Book -----------------------------------------------------------

    normalizeOrderBook(raw: OpinionRawOrderBook, _id: string): OrderBook {
        const bids = (raw?.bids || []).map(level => ({
            price: parseFloat(level.price),
            size: parseFloat(level.size),
        })).sort((a, b) => b.price - a.price);

        const asks = (raw?.asks || []).map(level => ({
            price: parseFloat(level.price),
            size: parseFloat(level.size),
        })).sort((a, b) => a.price - b.price);

        return {
            bids,
            asks,
            timestamp: raw?.timestamp ?? Date.now(),
        };
    }

    // -- Trades ---------------------------------------------------------------

    normalizeTrade(raw: OpinionRawUserTrade, index: number): Trade {
        return {
            id: raw.txHash || String(index),
            timestamp: toMillis(raw.createdAt),
            price: parseNumStr(raw.price),
            amount: parseNumStr(raw.shares),
            side: raw.side === 'BUY' ? 'buy' : raw.side === 'SELL' ? 'sell' : 'unknown',
        };
    }

    // -- User Trades ----------------------------------------------------------

    normalizeUserTrade(raw: OpinionRawUserTrade, index: number): UserTrade {
        return {
            id: raw.txHash || String(index),
            timestamp: toMillis(raw.createdAt),
            price: parseNumStr(raw.price),
            amount: parseNumStr(raw.shares),
            side: raw.side === 'BUY' ? 'buy' : raw.side === 'SELL' ? 'sell' : 'unknown',
        };
    }

    // -- Positions ------------------------------------------------------------

    normalizePosition(raw: OpinionRawPosition): Position {
        const sharesOwned = parseNumStr(raw.sharesOwned);
        const currentValue = parseNumStr(raw.currentValueInQuoteToken);
        const currentPrice = sharesOwned > 0 ? currentValue / sharesOwned : 0;

        return {
            marketId: String(raw.marketId),
            outcomeId: raw.tokenId || '',
            outcomeLabel: raw.outcome || (raw.outcomeSide === 1 ? 'Yes' : 'No'),
            size: sharesOwned,
            entryPrice: parseNumStr(raw.avgEntryPrice),
            currentPrice,
            unrealizedPnL: parseNumStr(raw.unrealizedPnl),
        };
    }

    // -- Orders ---------------------------------------------------------------

    normalizeOrder(raw: OpinionRawOrder): Order {
        const orderShares = parseNumStr(raw.orderShares);
        const filledShares = parseNumStr(raw.filledShares);

        return {
            id: raw.orderId || '',
            marketId: String(raw.marketId),
            outcomeId: raw.outcome || (raw.outcomeSide === 1 ? 'Yes' : 'No'),
            side: raw.side === 1 ? 'buy' : 'sell',
            type: raw.tradingMethod === 2 ? 'limit' : 'market',
            price: parseNumStr(raw.price),
            amount: orderShares,
            status: mapOrderStatus(raw.status),
            filled: filledShares,
            remaining: orderShares - filledShares,
            timestamp: toMillis(raw.createdAt),
        };
    }

    // -- Private helpers ------------------------------------------------------

    private normalizeBinaryMarket(raw: OpinionRawMarket): UnifiedMarket | null {
        if (!raw || raw.marketType !== 0) return null;

        const marketId = String(raw.marketId);

        if (!raw.yesTokenId) {
            throw new Error(`Opinion market ${marketId} is missing yesTokenId`);
        }
        if (!raw.noTokenId) {
            throw new Error(`Opinion market ${marketId} is missing noTokenId`);
        }

        const yesOutcome: MarketOutcome = {
            outcomeId: raw.yesTokenId,
            marketId,
            label: raw.yesLabel || 'Yes',
            price: 0.5,
        };

        const noOutcome: MarketOutcome = {
            outcomeId: raw.noTokenId,
            marketId,
            label: raw.noLabel || 'No',
            price: 0.5,
        };

        const market: UnifiedMarket = {
            marketId,
            title: raw.marketTitle || '',
            description: raw.rules || '',
            outcomes: [yesOutcome, noOutcome],
            resolutionDate: new Date(toMillis(raw.cutoffAt)),
            volume24h: parseNumStr(raw.volume24h),
            volume: parseNumStr(raw.volume),
            liquidity: 0,
            url: `https://opinion.trade/market/${raw.marketId}`,
        };

        addBinaryOutcomes(market);
        return market;
    }

    private normalizeChildMarket(
        child: OpinionRawChildMarket,
        parent: OpinionRawMarket,
        volume24h: number = 0,
    ): UnifiedMarket | null {
        if (!child) return null;

        const marketId = String(child.marketId);

        if (!child.yesTokenId) {
            throw new Error(`Opinion child market ${marketId} is missing yesTokenId`);
        }
        if (!child.noTokenId) {
            throw new Error(`Opinion child market ${marketId} is missing noTokenId`);
        }

        const yesOutcome: MarketOutcome = {
            outcomeId: child.yesTokenId,
            marketId,
            label: child.yesLabel || 'Yes',
            price: 0.5,
        };

        const noOutcome: MarketOutcome = {
            outcomeId: child.noTokenId,
            marketId,
            label: child.noLabel || 'No',
            price: 0.5,
        };

        const market: UnifiedMarket = {
            marketId,
            eventId: String(parent.marketId),
            title: child.marketTitle || '',
            description: child.rules || '',
            outcomes: [yesOutcome, noOutcome],
            resolutionDate: new Date(toMillis(child.cutoffAt)),
            volume24h,
            volume: parseNumStr(child.volume),
            liquidity: 0,
            url: `https://opinion.trade/market/${child.marketId}`,
        };

        addBinaryOutcomes(market);
        return market;
    }
}
