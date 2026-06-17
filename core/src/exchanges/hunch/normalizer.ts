import { OHLCVParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, Position, Balance } from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { buildSourceMetadata } from '../../utils/metadata';
import {
    HunchRawMarket,
    HunchRawResearch,
    HunchRawOddsHistoryPoint,
    HunchRawPosition,
    HunchRawReadiness,
    HunchRawQuote,
} from './fetcher';
import { mapHunchMarketToUnified } from './utils';
import { resolveHunchPrice } from './price';

const HUNCH_PROMOTED_EVENT_KEYS = ['id', 'slug', 'question', 'markets'] as const;

/**
 * HunchNormalizer — pure venue→unified mappers. No I/O. Hunch is PARIMUTUEL:
 * prices are implied odds (cents → 0..1), there is no real CLOB; the order book
 * is emulated as a single level at the implied price with the pool as depth.
 */
export class HunchNormalizer implements IExchangeNormalizer<HunchRawMarket, HunchRawMarket> {
    /**
     * Normalize a market ref. `odds`/`ladder` (from a single-market quote or
     * research read) price the outcomes live; the bare list path passes neither,
     * so list outcomes carry price 0 (live odds ride on the detail reads —
     * mirrors Myriad's "static on list, live on detail" model).
     */
    normalizeMarket(
        raw: HunchRawMarket,
        odds?: { yesPriceCents: number | null; noPriceCents: number | null },
        ladder?: HunchRawResearch['ladder'],
    ): UnifiedMarket | null {
        return mapHunchMarketToUnified(raw, odds, ladder ?? null);
    }

    /**
     * Hunch has no Event tier. When the event API is used, each market is wrapped
     * as a single-market event so the cross-venue ingest pipeline still works.
     */
    normalizeEvent(raw: HunchRawMarket): UnifiedEvent | null {
        const um = this.normalizeMarket(raw);
        if (!um) return null;
        return {
            id: raw.id,
            title: raw.question || raw.shortTitle || '',
            description: raw.summary || '',
            slug: raw.slug || raw.id,
            markets: [um],
            volume24h: 0,
            volume: um.volume,
            url: raw.links?.app || 'https://www.playhunch.xyz',
            category: raw.category,
            tags: raw.tokenSymbol ? [raw.tokenSymbol] : [],
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                HUNCH_PROMOTED_EVENT_KEYS,
            ),
        };
    }

    /**
     * Map a research payload's oddsHistory to candles. Each fill is a flat
     * candle at its realized YES probability (Myriad's flat-candle approach).
     * For an N-way outcome, points whose `outcomeKey` matches are used; binary
     * markets ignore `outcomeId` and use the YES trajectory.
     */
    normalizeOHLCV(raw: HunchRawResearch, params: OHLCVParams, outcomeKey?: string): PriceCandle[] {
        const history: HunchRawOddsHistoryPoint[] = raw?.oddsHistory ?? [];
        let points = history;
        if (outcomeKey && outcomeKey !== 'yes' && outcomeKey !== 'no') {
            const matched = history.filter((p) => p.outcomeKey === outcomeKey);
            if (matched.length > 0) points = matched;
        }

        const candles: PriceCandle[] = points
            .filter((p) => typeof p.yesPct === 'number')
            .map((p) => {
                const prob = (p.yesPct as number) / 100;
                return {
                    timestamp: this.parseTs(p.at),
                    open: prob,
                    high: prob,
                    low: prob,
                    close: prob,
                    volume: p.sizeUsd,
                };
            });

        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }
        return candles;
    }

    /**
     * Emulate a single-level order book at the market's implied price, with the
     * pool size (or virtual liquidity) as depth. Reuses research → odds / ladder
     * / stats. For an N-way market, the level reflects the requested rung's
     * implied price; binary uses the YES (or NO) implied price.
     */
    normalizeOrderBook(raw: HunchRawResearch, outcomeId: string): OrderBook {
        const side = this.sideOf(outcomeId);
        let price = 0;

        if (raw?.ladder && raw.ladder.outcomes.length > 0 && side !== 'yes' && side !== 'no') {
            const rung = raw.ladder.outcomes.find((o) => o.key === side);
            price = rung ? resolveHunchPrice(rung.impliedPct) : 0;
        } else {
            const yesC = raw?.odds?.yesPriceCents ?? null;
            const noC = raw?.odds?.noPriceCents ?? null;
            price = side === 'no' ? resolveHunchPrice(noC) : resolveHunchPrice(yesC);
        }

        const pool = raw?.stats?.totalPoolUsd ?? 0;
        const liquidity = Number(raw?.market?.virtualLiquidityUsd ?? 0);
        const size = pool > 0 ? pool : liquidity > 0 ? liquidity : 1;

        return {
            bids: [{ price, size }],
            asks: [{ price, size }],
            timestamp: Date.now(),
            lastTradePrice: price || undefined,
        };
    }

    /** Map a research oddsHistory point to a public trade. */
    normalizeTrade(raw: HunchRawOddsHistoryPoint, index: number): Trade {
        const prob = typeof raw.yesPct === 'number' ? raw.yesPct / 100 : 0;
        return {
            id: `${raw.at}-${index}`,
            timestamp: this.parseTs(raw.at),
            price: prob,
            amount: Number(raw.sizeUsd || 0),
            // Hunch oddsHistory is a one-sided fill tape (every entry is a buy
            // into a side); direction isn't carried, so 'buy' from the taker view.
            side: 'buy',
        };
    }

    /** Map an AgentPosition → unified Position (shares, entry/now cents → 0..1). */
    normalizePosition(raw: HunchRawPosition): Position {
        const side = this.normalizeSideKey(raw.side);
        return {
            marketId: raw.marketId,
            outcomeId: `${raw.marketId}:${side}`,
            outcomeLabel: raw.outcomeLabel || side,
            size: Number(raw.shares || 0),
            entryPrice: resolveHunchPrice(raw.avgEntryCents),
            currentPrice: resolveHunchPrice(raw.currentCents),
            unrealizedPnL: Number(raw.pnlUsd || 0),
            txHash: null,
            chain: 'base',
        };
    }

    /** Map readiness → a single USDC balance entry. */
    normalizeBalance(raw: HunchRawReadiness): Balance[] {
        const total = typeof raw?.usdcBalanceUsd === 'number' ? raw.usdcBalanceUsd : 0;
        return [
            {
                currency: 'USDC',
                total,
                available: total,
                locked: 0,
            },
        ];
    }

    /**
     * Quote → a single emulated order-book level (alternative to research when a
     * size-specific implied price is wanted). Not wired into fetchOrderBook by
     * default; kept for callers that have a quote in hand.
     */
    normalizeQuoteOrderBook(quote: HunchRawQuote): OrderBook {
        const price = resolveHunchPrice(quote.priceCents);
        const pool = quote.stats?.totalPoolUsd ?? 0;
        const size = pool > 0 ? pool : 1;
        return {
            bids: [{ price, size }],
            asks: [{ price, size }],
            timestamp: Date.now(),
            lastTradePrice: price || undefined,
        };
    }

    // -- helpers --------------------------------------------------------------

    private sideOf(outcomeId: string): string {
        const idx = outcomeId.lastIndexOf(':');
        return idx >= 0 ? outcomeId.slice(idx + 1) : outcomeId;
    }

    /** Normalize a stored position `side` to a stable outcome-id token. */
    private normalizeSideKey(side: string): string {
        const s = (side || '').toLowerCase();
        if (s === 'yes' || s === 'no' || s === 'up' || s === 'down') return s;
        return side; // bucket key (e.g. le-330m) — keep verbatim
    }

    private parseTs(at: string | undefined): number {
        if (!at) return Date.now();
        const ms = Date.parse(at);
        return Number.isFinite(ms) ? ms : Date.now();
    }
}
