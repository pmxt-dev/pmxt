import { OHLCVParams } from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    UnifiedSeries,
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
import { buildSourceMetadata } from '../../utils/metadata';
import { parseNumStr, mapOrderStatus, toMillis, intervalToMs } from './utils';
import {
    OpinionRawMarket,
    OpinionRawChildMarket,
    OpinionRawCollection,
    OpinionRawOrderBook,
    OpinionRawPricePoint,
    OpinionRawLatestPrice,
    OpinionRawUserTrade,
    OpinionRawPosition,
    OpinionRawOrder,
} from './fetcher';

// ---------------------------------------------------------------------------
// Raw Opinion fields already promoted to first-class Unified columns — omit
// from sourceMetadata so we capture only what the unified shape would drop.
// ---------------------------------------------------------------------------

// Fields promoted on a market or child-market payload.
const OPINION_PROMOTED_MARKET_KEYS = [
    'marketId', 'marketTitle', 'rules', 'slug',
    'volume', 'volume24h', 'cutoffAt',
    'yesTokenId', 'noTokenId',
] as const;

// Fields promoted on the parent (event-level) payload.
const OPINION_PROMOTED_EVENT_KEYS = [
    'marketId', 'marketTitle', 'rules', 'slug',
    'volume', 'volume24h', 'childMarkets',
] as const;

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

    // -- Series ---------------------------------------------------------------

    /**
     * Produce a UnifiedSeries from an Opinion `collection` object.
     * `id` is the canonical series identifier (collection.symbol).
     * `events` is optionally injected by the caller when doing a single-id lookup.
     */
    normalizeSeries(raw: OpinionRawCollection, events?: UnifiedEvent[]): UnifiedSeries {
        return {
            id: raw.symbol,
            ticker: raw.symbol,
            title: raw.title,
            recurrence: raw.frequency || null,
            events,
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                ['title', 'symbol', 'frequency'],
            ),
        };
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
            slug: raw.slug || String(raw.marketId),
            markets,
            volume24h,
            volume: totalVolume,
            url: `https://www.opinion.trade/market/${raw.slug || raw.marketId}`,
            // collection carries series/recurring identifier (title, symbol,
            // frequency, current period, next periods) — not a unified column.
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                OPINION_PROMOTED_EVENT_KEYS,
                raw.collection ? { collection: raw.collection } : undefined,
            ),
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
            timestamp: toMillis(raw.createdAt) ?? 0,
            price: parseNumStr(raw.price),
            amount: parseNumStr(raw.shares),
            side: raw.side === 'BUY' ? 'buy' : raw.side === 'SELL' ? 'sell' : 'unknown',
        };
    }

    // -- User Trades ----------------------------------------------------------

    normalizeUserTrade(raw: OpinionRawUserTrade, index: number): UserTrade {
        return {
            id: raw.txHash || String(index),
            timestamp: toMillis(raw.createdAt) ?? 0,
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
            timestamp: toMillis(raw.createdAt) ?? 0,
        };
    }

    // -- Price enrichment -----------------------------------------------------

    /**
     * Fetch latest prices for all markets in parallel and update outcome prices.
     *
     * Opinion's /market endpoint does not include prices, so outcomes are
     * initially created with a placeholder.  This method calls the supplied
     * `fetchLatestPrice` callback (backed by /token/latest-price) for the
     * first outcome of every market, derives the complementary price for
     * binary outcomes, and re-runs addBinaryOutcomes().
     *
     * Uses Promise.allSettled so a single failed price fetch never breaks the
     * whole batch — markets whose price fetch fails simply keep the placeholder.
     */
    async enrichMarketsWithPrices(
        markets: UnifiedMarket[],
        fetchLatestPrice: (tokenId: string) => Promise<OpinionRawLatestPrice>,
    ): Promise<void> {
        if (markets.length === 0) return;

        const results = await Promise.allSettled(
            markets.map(async (market) => {
                const yesOutcome = market.outcomes[0];
                if (!yesOutcome?.outcomeId) return null;

                const raw = await fetchLatestPrice(yesOutcome.outcomeId);
                const yesPrice = parseFloat(raw?.price ?? '');
                if (isNaN(yesPrice)) return null;

                return { marketId: market.marketId, yesPrice };
            }),
        );

        const priceMap: Record<string, number> = {};
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                priceMap[result.value.marketId] = result.value.yesPrice;
            }
        }

        for (const market of markets) {
            const yesPrice = priceMap[market.marketId];
            if (yesPrice === undefined) continue;

            if (market.outcomes[0]) market.outcomes[0].price = yesPrice;
            if (market.outcomes[1]) market.outcomes[1].price = 1 - yesPrice;

            addBinaryOutcomes(market);
        }
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
            metadata: { opinionMarketId: raw.marketId },
        };

        const noOutcome: MarketOutcome = {
            outcomeId: raw.noTokenId,
            marketId,
            label: raw.noLabel || 'No',
            price: 0.5,
            metadata: { opinionMarketId: raw.marketId },
        };

        const market: UnifiedMarket = {
            marketId,
            title: raw.marketTitle || '',
            description: raw.rules || '',
            outcomes: [yesOutcome, noOutcome],
            resolutionDate: toMillis(raw.cutoffAt) !== null
                ? new Date(toMillis(raw.cutoffAt) as number)
                : undefined,
            volume24h: parseNumStr(raw.volume24h),
            volume: parseNumStr(raw.volume),
            liquidity: 0,
            url: `https://www.opinion.trade/market/${raw.slug || raw.marketId}`,
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                OPINION_PROMOTED_MARKET_KEYS,
            ),
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
            metadata: { opinionMarketId: child.marketId },
        };

        const noOutcome: MarketOutcome = {
            outcomeId: child.noTokenId,
            marketId,
            label: child.noLabel || 'No',
            price: 0.5,
            metadata: { opinionMarketId: child.marketId },
        };

        const childTitle = child.marketTitle || '';
        const parentTitle = parent.marketTitle || '';
        const combinedTitle = parentTitle && childTitle
            ? `${parentTitle} - ${childTitle}`
            : parentTitle || childTitle;

        const market: UnifiedMarket = {
            marketId,
            eventId: String(parent.marketId),
            title: combinedTitle,
            description: child.rules || '',
            outcomes: [yesOutcome, noOutcome],
            resolutionDate: toMillis(child.cutoffAt || parent.cutoffAt) !== null
                ? new Date(toMillis(child.cutoffAt || parent.cutoffAt) as number)
                : undefined,
            volume24h,
            volume: parseNumStr(child.volume),
            liquidity: 0,
            url: `https://www.opinion.trade/market/${child.slug || child.marketId}`,
            // parentMarketId links the child back to its categorical parent;
            // collection carries the series/recurring context from the parent.
            sourceMetadata: buildSourceMetadata(
                child as unknown as Record<string, unknown>,
                OPINION_PROMOTED_MARKET_KEYS,
                {
                    parentMarketId: parent.marketId,
                    ...(parent.collection ? { collection: parent.collection } : {}),
                },
            ),
        };

        addBinaryOutcomes(market);
        return market;
    }
}
