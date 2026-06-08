import { OHLCVParams } from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    PriceCandle,
    OrderBook,
    Trade,
    UserTrade,
    Position,
    Balance,
    CandleInterval,
    MarketOutcome,
} from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { timestampToMs } from '../../utils/time';
import { mapMarketToUnified, mapEventToUnified, enrichMarketsWithPrices } from './utils';
import {
    ProbableRawMarket,
    ProbableRawEvent,
    ProbableRawOrderBook,
    ProbableRawPricePoint,
    ProbableRawTrade,
    ProbableRawPosition,
} from './fetcher';

function aggregateCandles(candles: PriceCandle[], intervalMs: number): PriceCandle[] {
    if (candles.length === 0) return [];
    const buckets = new Map<number, PriceCandle>();
    for (const c of candles) {
        const key = Math.floor(c.timestamp / intervalMs) * intervalMs;
        const existing = buckets.get(key);
        if (!existing) {
            buckets.set(key, { ...c, timestamp: key });
        } else {
            buckets.set(key, {
                ...existing,
                high: Math.max(existing.high, c.high),
                low: Math.min(existing.low, c.low),
                close: c.close,
            });
        }
    }
    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export class ProbableNormalizer implements IExchangeNormalizer<ProbableRawMarket, ProbableRawEvent> {

    normalizeMarket(raw: ProbableRawMarket): UnifiedMarket | null {
        // Delegate to the existing utils function for consistency
        const event = (raw as any)._parentEvent || raw.event;
        return mapMarketToUnified(raw, event);
    }

    normalizeEvent(raw: ProbableRawEvent): UnifiedEvent | null {
        return mapEventToUnified(raw);
    }

    normalizeOrderBook(raw: ProbableRawOrderBook, _id: string): OrderBook {
        const bids = (raw.bids || [])
            .map((level) => ({ price: parseFloat(level.price), size: parseFloat(level.size) }))
            .sort((a, b) => b.price - a.price);
        const asks = (raw.asks || [])
            .map((level) => ({ price: parseFloat(level.price), size: parseFloat(level.size) }))
            .sort((a, b) => a.price - b.price);
        return {
            bids,
            asks,
            timestamp: raw.timestamp ? new Date(String(raw.timestamp)).getTime() : Date.now(),
        };
    }

    normalizeOHLCV(rawPoints: ProbableRawPricePoint[], params: OHLCVParams): PriceCandle[] {
        let candles: PriceCandle[] = rawPoints
            .map((p) => {
                const price = Number(p.p);
                const ts = Number(p.t) * 1000;
                return { timestamp: ts, open: price, high: price, low: price, close: price, volume: 0 };
            })
            .sort((a, b) => a.timestamp - b.timestamp);

        if (params.resolution === '5m') {
            candles = aggregateCandles(candles, 5 * 60 * 1000);
        } else if (params.resolution === '15m') {
            candles = aggregateCandles(candles, 15 * 60 * 1000);
        }

        if (params.limit) {
            candles = candles.slice(-params.limit);
        }

        return candles;
    }

    normalizeTrade(raw: ProbableRawTrade, index: number): Trade {
        if (raw.id == null && raw.tradeId == null) {
            throw new Error(`Probable trade at index ${index}: missing required field "id" or "tradeId".`);
        }
        if (raw.price == null) {
            throw new Error(`Probable trade at index ${index}: missing required field "price".`);
        }
        if (raw.size == null) {
            throw new Error(`Probable trade at index ${index}: missing required field "size".`);
        }
        if (raw.time == null) {
            throw new Error(`Probable trade at index ${index}: missing required field "time".`);
        }
        return {
            id: String(raw.id ?? raw.tradeId),
            timestamp: timestampToMs(raw.time),
            price: parseFloat(String(raw.price)),
            amount: parseFloat(String(raw.size)),
            side: raw.side === 'BUY' ? 'buy' as const
                : raw.side === 'SELL' ? 'sell' as const
                    : 'unknown' as const,
        };
    }

    normalizeUserTrade(raw: ProbableRawTrade, index: number): UserTrade {
        if (raw.tradeId == null && raw.id == null) {
            throw new Error(`Probable user trade at index ${index}: missing required field "tradeId" or "id".`);
        }
        if (raw.price == null) {
            throw new Error(`Probable user trade at index ${index}: missing required field "price".`);
        }
        if (raw.size == null) {
            throw new Error(`Probable user trade at index ${index}: missing required field "size".`);
        }
        if (raw.time == null) {
            throw new Error(`Probable user trade at index ${index}: missing required field "time".`);
        }
        if (raw.side == null) {
            throw new Error(`Probable user trade at index ${index}: missing required field "side".`);
        }
        return {
            id: String(raw.tradeId ?? raw.id),
            timestamp: timestampToMs(raw.time),
            price: parseFloat(String(raw.price)),
            amount: parseFloat(String(raw.size)),
            side: String(raw.side).toLowerCase() === 'buy' ? 'buy' as const : 'sell' as const,
            orderId: raw.orderId,
        };
    }

    normalizePosition(raw: ProbableRawPosition): Position {
        if (raw.condition_id == null) {
            throw new Error(`Probable position: missing required field "condition_id".`);
        }
        if (raw.token_id == null) {
            throw new Error(`Probable position: missing required field "token_id".`);
        }
        if (raw.size == null) {
            throw new Error(`Probable position: missing required field "size".`);
        }
        return {
            marketId: String(raw.condition_id),
            outcomeId: String(raw.token_id),
            outcomeLabel: raw.outcome || raw.title || 'Unknown',
            size: parseFloat(String(raw.size)),
            entryPrice: parseFloat(String(raw.avg_price ?? '0')),
            currentPrice: parseFloat(String(raw.cur_price ?? '0')),
            unrealizedPnL: parseFloat(String(raw.cash_pnl ?? '0')),
            realizedPnL: parseFloat(String(raw.realized_pnl ?? '0')),
        };
    }

    // -- Price enrichment helper (used by SDK class) --

    async enrichMarketsWithPrices(
        markets: UnifiedMarket[],
        callMidpoint: (tokenId: string) => Promise<any>
    ): Promise<void> {
        await enrichMarketsWithPrices(markets, callMidpoint);
    }
}
