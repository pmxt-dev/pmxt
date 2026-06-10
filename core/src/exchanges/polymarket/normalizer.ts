import { OHLCVParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, UnifiedSeries, PriceCandle, OrderBook, Trade, UserTrade, Position } from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { buildSourceMetadata } from '../../utils/metadata';
import { mapMarketToUnified, mapIntervalToFidelity } from './utils';
import {
    PolymarketRawEvent,
    PolymarketRawOHLCVPoint,
    PolymarketRawOrderBook,
    PolymarketRawTrade,
    PolymarketRawPosition,
} from './fetcher';

// Raw Polymarket Gamma event fields already promoted to first-class Unified
// columns — excluded from sourceMetadata so we capture only what the unified
// shape would otherwise drop.
const POLYMARKET_PROMOTED_EVENT_KEYS = [
    'id', 'slug', 'title', 'description', 'image', 'category', 'tags',
    // 'markets' is the child-markets array — promoted to UnifiedEvent.markets
    'markets',
] as const;

// Raw Polymarket Gamma series fields promoted to first-class UnifiedSeries columns.
const POLYMARKET_PROMOTED_SERIES_KEYS = [
    'id', 'ticker', 'slug', 'title', 'description', 'image', 'recurrence',
    // 'events' is promoted to UnifiedSeries.events
    'events',
] as const;

export class PolymarketNormalizer implements IExchangeNormalizer<PolymarketRawEvent, PolymarketRawEvent> {

    normalizeMarket(raw: PolymarketRawEvent): UnifiedMarket | null {
        if (!raw) return null;

        // For market-level normalization, we flatten event -> markets
        // This returns the first market; use normalizeMarketsFromEvents for full results
        const markets = this.normalizeMarketsFromEvent(raw, { useQuestionAsCandidateFallback: false });
        return markets.length > 0 ? markets[0] : null;
    }

    normalizeMarketsFromEvent(raw: PolymarketRawEvent, options: { useQuestionAsCandidateFallback?: boolean } = {}): UnifiedMarket[] {
        if (!raw || !raw.markets) return [];

        const results: UnifiedMarket[] = [];
        for (const market of raw.markets) {
            const unified = mapMarketToUnified(raw, market, options);
            if (unified) results.push(unified);
        }
        return results;
    }

    normalizeEvent(raw: PolymarketRawEvent): UnifiedEvent | null {
        if (!raw) return null;

        const markets = this.normalizeMarketsFromEvent(raw, { useQuestionAsCandidateFallback: true });

        return {
            id: raw.id || raw.slug || '',
            title: raw.title || '',
            description: (raw.description as string) || '',
            slug: raw.slug || '',
            markets,
            volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
            volume: markets.some(m => m.volume !== undefined)
                ? markets.reduce((sum, m) => sum + (m.volume ?? 0), 0)
                : undefined,
            url: `https://polymarket.com/event/${raw.slug}`,
            image: (raw.image as string) || `https://polymarket.com/api/og?slug=${raw.slug}`,
            category: (raw.category as string) || raw.tags?.[0]?.label,
            tags: raw.tags?.map((t: any) => t.label) || [],
            // Keeps non-promoted Gamma event fields (e.g. active, closed, and
            // any other vendor fields not surfaced as first-class columns).
            // NOTE: Polymarket "series" data lives on a separate Gamma /series
            // endpoint — it is NOT present in the event payload and therefore
            // requires a separate /series fetch+join to populate here.
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                POLYMARKET_PROMOTED_EVENT_KEYS,
            ),
        } as UnifiedEvent;
    }

    normalizeSeries(raw: Record<string, unknown>): UnifiedSeries {
        const id = String(raw['id'] ?? '');
        const slug = typeof raw['slug'] === 'string' ? raw['slug'] : undefined;
        const ticker = typeof raw['ticker'] === 'string' ? raw['ticker'] : undefined;
        const title = typeof raw['title'] === 'string' ? raw['title'] : (slug ?? id);
        const description = raw['description'] != null ? String(raw['description']) : null;
        const recurrence = raw['recurrence'] != null ? String(raw['recurrence']) : null;
        const image = raw['image'] != null ? String(raw['image']) : null;

        const rawEvents = Array.isArray(raw['events']) ? (raw['events'] as Record<string, unknown>[]) : undefined;
        const events: UnifiedEvent[] | undefined = rawEvents !== undefined
            ? rawEvents
                .map((e) => this.normalizeEvent(e as unknown as import('./fetcher').PolymarketRawEvent))
                .filter((e): e is UnifiedEvent => e !== null)
            : undefined;

        return {
            id,
            ticker,
            slug,
            title,
            description,
            recurrence,
            image,
            url: slug != null ? `https://polymarket.com/series/${slug}` : null,
            events,
            sourceMetadata: buildSourceMetadata(
                raw,
                POLYMARKET_PROMOTED_SERIES_KEYS,
            ),
        };
    }

    normalizeOHLCV(raw: { history: PolymarketRawOHLCVPoint[] }, params: OHLCVParams): PriceCandle[] {
        const history = raw.history || [];
        const fidelity = mapIntervalToFidelity(params.resolution);
        const resolutionMs = fidelity * 60 * 1000;

        const buckets = new Map<number, PriceCandle>();

        for (const item of history) {
            const rawMs = item.t * 1000;
            const snappedMs = Math.floor(rawMs / resolutionMs) * resolutionMs;
            const price = Number(item.p);
            const volume = Number(item.s || item.v || 0);

            if (!buckets.has(snappedMs)) {
                buckets.set(snappedMs, {
                    timestamp: snappedMs,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: volume,
                });
            } else {
                const candle = buckets.get(snappedMs);
                if (candle) {
                    candle.high = Math.max(candle.high, price);
                    candle.low = Math.min(candle.low, price);
                    candle.close = price;
                    candle.volume = (candle.volume || 0) + volume;
                }
            }
        }

        const candles = Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);

        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }

        return candles;
    }

    normalizeOrderBook(raw: PolymarketRawOrderBook, id: string): OrderBook {
        const bids = (raw.bids || []).map((level: any) => ({
            price: parseFloat(level.price),
            size: parseFloat(level.size),
        })).sort((a: { price: number }, b: { price: number }) => b.price - a.price);

        const asks = (raw.asks || []).map((level: any) => ({
            price: parseFloat(level.price),
            size: parseFloat(level.size),
        })).sort((a: { price: number }, b: { price: number }) => a.price - b.price);

        return {
            bids,
            asks,
            timestamp: raw.timestamp ? (typeof raw.timestamp === 'string' ? (isFinite(Number(raw.timestamp)) ? Number(raw.timestamp) : new Date(raw.timestamp).getTime()) : Number(raw.timestamp)) : Date.now(),
            isNegRisk: raw.neg_risk ?? false,
            lastTradePrice: raw.last_trade_price != null ? parseFloat(raw.last_trade_price) : undefined,
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                ['asset_id', 'bids', 'asks', 'timestamp', 'neg_risk', 'last_trade_price'],
            ),
        };
    }

    normalizeTrade(raw: PolymarketRawTrade, index: number): Trade {
        return {
            id: raw.id || `${raw.timestamp}-${raw.price}`,
            timestamp: raw.timestamp * 1000,
            price: parseFloat(raw.price),
            amount: parseFloat(raw.size || raw.amount || '0'),
            side: raw.side === 'BUY' ? 'buy' as const : raw.side === 'SELL' ? 'sell' as const : 'unknown' as const,
        };
    }

    normalizeUserTrade(raw: PolymarketRawTrade, index: number): UserTrade {
        return {
            id: raw.id || raw.transactionHash || String(raw.timestamp),
            timestamp: typeof raw.timestamp === 'number' ? raw.timestamp * 1000 : Date.now(),
            price: parseFloat(raw.price || '0'),
            amount: parseFloat(raw.size || raw.amount || '0'),
            side: raw.side === 'BUY' ? 'buy' as const : raw.side === 'SELL' ? 'sell' as const : 'unknown' as const,
            orderId: raw.orderId,
        };
    }

    normalizePosition(raw: PolymarketRawPosition): Position {
        return {
            marketId: raw.resolvedMarketId || '',
            outcomeId: raw.asset || '',
            outcomeLabel: raw.outcome || 'Unknown',
            size: parseFloat(raw.size),
            entryPrice: parseFloat(raw.avgPrice),
            currentPrice: parseFloat(raw.curPrice || '0'),
            unrealizedPnL: parseFloat(raw.cashPnl || '0'),
            realizedPnL: parseFloat(raw.realizedPnl || '0'),
        };
    }
}
