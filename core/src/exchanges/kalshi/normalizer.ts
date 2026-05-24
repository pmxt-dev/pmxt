import { OHLCVParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, UserTrade, Position, Balance, MarketOutcome } from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { fromKalshiCents, invertKalshiUnified } from './price';
import { KalshiRawEvent, KalshiRawMarket, KalshiRawCandlestick, KalshiRawTrade, KalshiRawFill, KalshiRawOrder, KalshiRawPosition, KalshiRawOrderBookFp } from './fetcher';

export class KalshiNormalizer implements IExchangeNormalizer<KalshiRawEvent, KalshiRawEvent> {

    normalizeMarket(raw: KalshiRawEvent): UnifiedMarket | null {
        // This normalizes a single-market event. For multi-market events, use normalizeMarketsFromEvent.
        if (!raw || !raw.markets || raw.markets.length === 0) return null;
        return this.normalizeRawMarket(raw, raw.markets[0]);
    }

    normalizeMarketsFromEvent(rawEvent: KalshiRawEvent): UnifiedMarket[] {
        const markets = rawEvent.markets || [];
        const results: UnifiedMarket[] = [];
        for (const market of markets) {
            const um = this.normalizeRawMarket(rawEvent, market);
            if (um) results.push(um);
        }
        return results;
    }

    normalizeRawMarket(event: KalshiRawEvent, market: KalshiRawMarket): UnifiedMarket | null {
        if (!market) return null;

        // Kalshi API v2 migrated from cent integers to FixedPointDollars strings.
        // Prefer the _dollars fields; fall back to deprecated cent fields.
        let price = 0;
        if (market.last_price_dollars != null) {
            price = parseFloat(market.last_price_dollars);
        } else if (market.yes_ask_dollars != null && market.yes_bid_dollars != null) {
            price = (parseFloat(market.yes_ask_dollars) + parseFloat(market.yes_bid_dollars)) / 2;
        } else if (market.yes_ask_dollars != null) {
            price = parseFloat(market.yes_ask_dollars);
        } else if (market.last_price) {
            price = fromKalshiCents(market.last_price);
        } else if (market.yes_ask && market.yes_bid) {
            price = (fromKalshiCents(market.yes_ask) + fromKalshiCents(market.yes_bid)) / 2;
        } else if (market.yes_ask) {
            price = fromKalshiCents(market.yes_ask);
        }

        const candidateName = this.deriveOutcomeLabel(market);

        let priceChange = 0;
        if (market.previous_price_dollars != null && market.last_price_dollars != null) {
            priceChange = parseFloat(market.last_price_dollars) - parseFloat(market.previous_price_dollars);
        }

        const outcomes: MarketOutcome[] = [
            {
                outcomeId: market.ticker,
                marketId: market.ticker,
                label: candidateName || 'Yes',
                price,
                priceChange24h: priceChange,
            },
            {
                outcomeId: `${market.ticker}-NO`,
                marketId: market.ticker,
                label: candidateName ? `Not ${candidateName}` : 'No',
                price: invertKalshiUnified(price),
                priceChange24h: -priceChange,
            },
        ];

        const unifiedTags: string[] = [];
        if (event.category) unifiedTags.push(event.category);
        if (event.tags && Array.isArray(event.tags)) {
            for (const tag of event.tags) {
                if (!unifiedTags.includes(tag)) unifiedTags.push(tag);
            }
        }

        const um = {
            id: market.ticker,
            marketId: market.ticker,
            eventId: event.event_ticker,
            title: this.cleanLabel(market.title) || event.title,
            description: market.rules_primary || market.rules_secondary || '',
            slug: market.ticker,
            outcomes,
            resolutionDate: new Date(market.expiration_time),
            volume24h: parseFloat(market.volume_24h_fp ?? '') || Number(market.volume_24h || market.volume || 0),
            volume: parseFloat(market.volume_fp ?? '') || Number(market.volume || 0),
            liquidity: Number(market.liquidity || 0),
            openInterest: parseFloat(market.open_interest_fp ?? '') || Number(market.open_interest || 0),
            url: `https://kalshi.com/events/${event.event_ticker}`,
            category: event.category,
            tags: unifiedTags,
            status: this.cleanLabel(market.status) || undefined,
        } as UnifiedMarket;

        addBinaryOutcomes(um);
        return um;
    }

    normalizeEvent(raw: KalshiRawEvent): UnifiedEvent | null {
        if (!raw) return null;

        const markets: UnifiedMarket[] = this.normalizeMarketsFromEvent(raw);

        return {
            id: raw.event_ticker,
            title: raw.title,
            description: raw.mututals_description || this.deriveEventDescription(raw.markets || []),
            slug: raw.event_ticker,
            markets,
            volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
            volume: markets.some(m => m.volume !== undefined)
                ? markets.reduce((sum, m) => sum + (m.volume ?? 0), 0)
                : undefined,
            url: `https://kalshi.com/events/${raw.event_ticker}`,
            image: raw.image_url,
            category: raw.category,
            tags: raw.tags || [],
        };
    }

    normalizeOHLCV(rawCandles: KalshiRawCandlestick[], params: OHLCVParams): PriceCandle[] {
        const candles = rawCandles.map((c) => {
            const p = c.price || {};
            const ask = c.yes_ask || {};
            const bid = c.yes_bid || {};

            const getVal = (field: string) => {
                const pf = (p as any)[field];
                const af = (ask as any)[field];
                const bf = (bid as any)[field];
                if (pf !== null && pf !== undefined) return pf;
                if (af !== null && af !== undefined && bf !== null && bf !== undefined) {
                    return (af + bf) / 2;
                }
                return (p as any).previous || 0;
            };

            return {
                timestamp: c.end_period_ts * 1000,
                open: fromKalshiCents(getVal('open')),
                high: fromKalshiCents(getVal('high')),
                low: fromKalshiCents(getVal('low')),
                close: fromKalshiCents(getVal('close')),
                volume: c.volume || 0,
            };
        });

        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }
        return candles;
    }

    normalizeOrderBook(raw: { orderbook_fp: KalshiRawOrderBookFp }, id: string): OrderBook {
        const data = raw.orderbook_fp;
        const isNoOutcome = id.endsWith('-NO');

        let bids: { price: number; size: number }[];
        let asks: { price: number; size: number }[];

        if (isNoOutcome) {
            bids = (data.no_dollars || []).map((level) => ({
                price: parseFloat(level[0]),
                size: parseFloat(level[1]),
            }));
            asks = (data.yes_dollars || []).map((level) => ({
                price: Math.round((1 - parseFloat(level[0])) * 10000) / 10000,
                size: parseFloat(level[1]),
            }));
        } else {
            bids = (data.yes_dollars || []).map((level) => ({
                price: parseFloat(level[0]),
                size: parseFloat(level[1]),
            }));
            asks = (data.no_dollars || []).map((level) => ({
                price: Math.round((1 - parseFloat(level[0])) * 10000) / 10000,
                size: parseFloat(level[1]),
            }));
        }

        bids.sort((a, b) => b.price - a.price);
        asks.sort((a, b) => a.price - b.price);

        return { bids, asks, timestamp: Date.now() };
    }

    normalizeTrade(raw: KalshiRawTrade, _index: number): Trade {
        // Kalshi API v2 changed field names:
        //   yes_price (cents int) → yes_price_dollars (dollar string)
        //   count (int)           → count_fp (string)
        const price = raw.yes_price_dollars != null
            ? parseFloat(raw.yes_price_dollars)
            : raw.yes_price != null
                ? fromKalshiCents(raw.yes_price)
                : 0;

        const amount = raw.count_fp != null
            ? parseFloat(raw.count_fp)
            : raw.count ?? 0;

        return {
            id: raw.trade_id,
            timestamp: new Date(raw.created_time).getTime(),
            price,
            amount,
            side: raw.taker_side === 'yes' ? 'buy' : 'sell',
        };
    }

    normalizeUserTrade(raw: KalshiRawFill, _index: number): UserTrade {
        const price = raw.yes_price_dollars != null
            ? parseFloat(raw.yes_price_dollars)
            : raw.yes_price != null
                ? fromKalshiCents(raw.yes_price)
                : 0;

        const amount = raw.count_fp != null
            ? parseFloat(raw.count_fp)
            : raw.count ?? 0;

        return {
            id: raw.fill_id,
            timestamp: new Date(raw.created_time).getTime(),
            price,
            amount,
            side: raw.side === 'yes' ? 'buy' as const : 'sell' as const,
            orderId: raw.order_id,
        };
    }

    normalizeOrder(raw: KalshiRawOrder): import('../../types').Order {
        return {
            id: raw.order_id,
            marketId: raw.ticker,
            outcomeId: raw.ticker,
            side: raw.side === 'yes' ? 'buy' : 'sell',
            type: raw.type === 'limit' ? 'limit' : 'market',
            price: raw.yes_price ? raw.yes_price / 100 : undefined,
            amount: raw.count,
            status: this.mapOrderStatus(raw.status),
            filled: raw.count - (raw.remaining_count || 0),
            remaining: raw.remaining_count || 0,
            timestamp: new Date(raw.created_time).getTime(),
        };
    }

    normalizePosition(raw: KalshiRawPosition): Position {
        const absPosition = Math.abs(raw.position);
        const entryPrice = absPosition > 0 ? raw.total_cost / absPosition / 100 : 0;

        return {
            info: raw,
            marketId: raw.ticker,
            outcomeId: raw.ticker,
            outcomeLabel: raw.ticker,
            size: raw.position,
            entryPrice,
            currentPrice: raw.market_price ? raw.market_price / 100 : entryPrice,
            unrealizedPnL: raw.market_exposure ? raw.market_exposure / 100 : 0,
            realizedPnL: raw.realized_pnl ? raw.realized_pnl / 100 : 0,
        };
    }

    normalizeBalance(raw: { balance: number; portfolio_value: number }): Balance[] {
        const available = raw.balance / 100;
        const total = raw.portfolio_value / 100;
        return [{
            info: raw,
            currency: 'USD',
            total,
            available,
            locked: total - available,
        }];
    }

    // -- Helpers ---------------------------------------------------------------

    private mapOrderStatus(status: string | undefined): 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected' {
        switch ((status ?? '').toLowerCase()) {
            case 'resting': return 'open';
            case 'canceled':
            case 'cancelled': return 'cancelled';
            case 'executed':
            case 'filled': return 'filled';
            default: return 'open';
        }
    }

    private deriveEventDescription(markets: any[]): string {
        const texts = markets
            .map((m) => m.rules_primary as string)
            .filter((t) => typeof t === 'string' && t.length > 0);

        if (texts.length === 0) return '';
        if (texts.length === 1) return texts[0];

        const templates = new Map<string, number>();
        for (const market of markets) {
            const rawRule = typeof market?.rules_primary === 'string' ? market.rules_primary : '';
            if (!rawRule) continue;

            const candidate = this.deriveOutcomeLabel(market);
            const templated = this.templateRule(rawRule, candidate);
            templates.set(templated, (templates.get(templated) ?? 0) + 1);
        }

        // Only consider templates that actually contain the {x} placeholder so
        // that a rule we failed to template (e.g. candidate name missing) can
        // never win the vote and leak a specific name into the event description.
        if (templates.size > 0) {
            let bestTemplate: string | null = null;
            let bestCount = 0;
            for (const [template, count] of templates.entries()) {
                if (!template.includes('{x}')) continue;
                if (count > bestCount) {
                    bestTemplate = template;
                    bestCount = count;
                }
            }
            if (bestTemplate) return bestTemplate;
        }

        return texts[0];
    }

    private deriveOutcomeLabel(market: KalshiRawMarket): string | null {
        const yesSubtitle = this.cleanLabel(market.yes_sub_title);
        if (yesSubtitle) return yesSubtitle;

        const subtitle = this.cleanLabel(market.subtitle);
        if (subtitle) return subtitle;

        return null;
    }

    private cleanLabel(value: unknown): string | null {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        // Some Kalshi markets use structural subtitles like ":: Democratic".
        if (trimmed.startsWith('::')) return null;
        return trimmed;
    }

    private templateRule(rule: string, candidateName: string | null): string {
        if (!candidateName) return rule;
        const escaped = candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Unicode-aware word boundaries so non-ASCII candidate names (Jose,
        // Muller, O'Brien, etc.) still template correctly. JavaScript's \b is
        // ASCII-only and would silently fail on such names.
        const matcher = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu');
        const replaced = rule.replace(matcher, '{x}');
        return replaced === rule ? rule : replaced;
    }
}

// -- Event sorting utility (exported for fetchEvents) -------------------------

function eventVolume(event: any): number {
    return (event.markets || []).reduce((sum: number, m: any) => sum + (parseFloat(m.volume_fp ?? '') || Number(m.volume || 0)), 0);
}

function eventLiquidity(event: any): number {
    return (event.markets || []).reduce((sum: number, m: any) => sum + (parseFloat(m.open_interest_fp ?? '') || Number(m.open_interest || m.liquidity || 0)), 0);
}

function eventNewest(event: any): number {
    const times = (event.markets || [])
        .map((m: any) => (m.close_time ? new Date(m.close_time).getTime() : 0))
        .filter((t: number) => t > 0);
    return times.length > 0 ? Math.min(...times) : 0;
}

export function sortRawEvents(events: any[], sort: string): any[] {
    const copy = [...events];
    if (sort === 'newest') {
        copy.sort((a, b) => eventNewest(b) - eventNewest(a));
    } else if (sort === 'liquidity') {
        copy.sort((a, b) => eventLiquidity(b) - eventLiquidity(a));
    } else {
        copy.sort((a, b) => eventVolume(b) - eventVolume(a));
    }
    return copy;
}
