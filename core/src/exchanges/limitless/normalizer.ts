import { OHLCVParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, UserTrade, Position, Balance } from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { mapMarketToUnified } from './utils';
import {
    LimitlessRawMarket,
    LimitlessRawEvent,
    LimitlessRawPricePoint,
    LimitlessRawOrderBook,
    LimitlessRawTrade,
} from './fetcher';

// Limitless uses USDC with 6 decimals
const USDC_DECIMALS = 6;
const USDC_SCALE = Math.pow(10, USDC_DECIMALS);

function convertSize(rawSize: number): number {
    return rawSize / USDC_SCALE;
}

export class LimitlessNormalizer implements IExchangeNormalizer<LimitlessRawMarket, LimitlessRawEvent> {

    normalizeMarket(raw: LimitlessRawMarket): UnifiedMarket | null {
        return mapMarketToUnified(raw);
    }

    normalizeEvent(raw: LimitlessRawEvent): UnifiedEvent | null {
        if (!raw) return null;

        let marketsList: UnifiedMarket[] = [];

        if (raw.markets && Array.isArray(raw.markets)) {
            const eventTitle = raw.title || raw.question || '';
            marketsList = raw.markets
                .map((child: any) => mapMarketToUnified(child, {
                    eventId: raw.slug,
                    eventTitle,
                    eventDescription: raw.description,
                    categories: raw.categories,
                    tags: raw.tags,
                }))
                .filter((m: any): m is UnifiedMarket => m !== null);
        } else {
            const unifiedMarket = mapMarketToUnified(raw);
            if (unifiedMarket) marketsList = [unifiedMarket];
        }

        return {
            id: raw.slug,
            title: raw.title || raw.question || '',
            description: raw.description || '',
            slug: raw.slug,
            markets: marketsList,
            volume24h: marketsList.reduce((sum, m) => sum + m.volume24h, 0),
            volume: marketsList.some(m => m.volume !== undefined)
                ? marketsList.reduce((sum, m) => sum + (m.volume ?? 0), 0)
                : undefined,
            url: `https://limitless.exchange/markets/${raw.slug}`,
            image: raw.logo || `https://limitless.exchange/api/og?slug=${raw.slug}`,
            category: raw.categories?.[0],
            tags: raw.tags || [],
        } as UnifiedEvent;
    }

    normalizeOHLCV(rawPrices: LimitlessRawPricePoint[], params: OHLCVParams): PriceCandle[] {
        let candles = rawPrices.map((p) => {
            const price = Number(p.price);
            const ts = Number(p.timestamp);

            return {
                timestamp: ts,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0,
            };
        }).sort((a, b) => a.timestamp - b.timestamp);

        if (params.start) {
            const start = params.start;
            candles = candles.filter((c) => c.timestamp >= start.getTime());
        }
        if (params.end) {
            const end = params.end;
            candles = candles.filter((c) => c.timestamp <= end.getTime());
        }
        if (params.limit) {
            candles = candles.slice(0, params.limit);
        }

        return candles;
    }

    normalizeOrderBook(raw: LimitlessRawOrderBook, _id: string): OrderBook {
        const bids = (raw.bids || []).map((level) => ({
            price: parseFloat(String(level.price)),
            size: convertSize(parseFloat(String(level.size))),
        })).sort((a, b) => b.price - a.price);

        const asks = (raw.asks || []).map((level) => ({
            price: parseFloat(String(level.price)),
            size: convertSize(parseFloat(String(level.size))),
        })).sort((a, b) => a.price - b.price);

        return {
            bids,
            asks,
            timestamp: raw.timestamp || Date.now(),
        };
    }

    normalizeTrade(_raw: unknown, _index: number): Trade {
        // Limitless does not have a public market trades endpoint
        throw new Error('Limitless normalizeTrade not supported: No public market trades API available.');
    }

    normalizeUserTrade(raw: unknown, _index: number): UserTrade {
        const t = raw as LimitlessRawTrade;
        return {
            id: t.id || String(t.timestamp),
            timestamp: t.createdAt ? new Date(t.createdAt).getTime() : (t.timestamp || 0),
            price: parseFloat(t.price || '0'),
            amount: parseFloat(t.quantity || t.amount || '0'),
            side: (t.side || '').toLowerCase() === 'buy' ? 'buy' as const : 'sell' as const,
            orderId: t.orderId,
        };
    }

    normalizePosition(raw: unknown): Position {
        const p = raw as any;
        const slug = p.market?.slug;
        if (!slug) {
            throw new Error(`Position missing market.slug (conditionId=${p.conditionId})`);
        }
        return {
            marketId: slug,
            outcomeId: p.asset,
            outcomeLabel: p.outcome || 'Unknown',
            size: parseFloat(p.size || '0'),
            entryPrice: parseFloat(p.avgPrice || '0'),
            currentPrice: parseFloat(p.curPrice || '0'),
            unrealizedPnL: parseFloat(p.cashPnl || '0'),
            realizedPnL: parseFloat(p.realizedPnl || '0'),
        };
    }

    normalizeBalance(raw: unknown): Balance[] {
        // Not used in the standard flow -- balance comes from on-chain RPC
        return [];
    }
}
