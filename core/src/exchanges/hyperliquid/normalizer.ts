import {
    UnifiedMarket,
    UnifiedEvent,
    OrderBook,
    PriceCandle,
    Trade,
    UserTrade,
    Position,
    Balance,
    MarketOutcome,
    Order,
} from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { OHLCVParams } from '../../BaseExchange';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';
import { toMarketId, toOutcomeId, toMidKey, decodeAssetId } from './utils';
import { OUTCOME_ASSET_BASE } from './config';
import {
    HyperliquidRawOutcomeWithQuestion,
    HyperliquidRawQuestion,
    HyperliquidRawL2Book,
    HyperliquidRawCandle,
    HyperliquidRawTrade,
    HyperliquidRawFill,
    HyperliquidRawOpenOrder,
    HyperliquidRawPosition,
    HyperliquidRawUserState,
    HyperliquidRawSpotState,
    HyperliquidRawOutcomeMeta,
    HyperliquidRawMid,
} from './fetcher';

// Raw Hyperliquid outcome fields already promoted to first-class Unified columns —
// excluded from sourceMetadata so we capture only what the unified shape would drop.
const HL_PROMOTED_MARKET_KEYS = [
    'outcome',      // -> marketId
    'name',         // -> title
    'description',  // -> description
    'sideSpecs',    // -> outcomes (labels)
] as const;

// Raw Hyperliquid question fields already promoted to first-class Unified columns.
// namedOutcomes is omitted as well — it is the child-markets array and must not
// be duplicated in metadata.
const HL_PROMOTED_EVENT_KEYS = [
    'question',       // -> id / eventId
    'name',           // -> title
    'description',    // -> description
    'namedOutcomes',  // -> markets (child-markets array)
] as const;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

interface ParsedDescription {
    class?: string;         // "priceBinary", "priceBucket", etc.
    underlying?: string;    // "BTC", "ETH", etc.
    expiry?: string;        // "20260509-0600" -> raw format
    expiryDate?: Date;      // parsed Date
    targetPrice?: string;   // "79583" for binary
    priceThresholds?: string[]; // ["77991","81174"] for buckets
    period?: string;        // "1d"
    index?: string;         // "0", "1", "2" for named outcomes
    raw: string;
}

function parseDescription(description: string): ParsedDescription {
    // Hyperliquid outcome descriptions use key:value pairs separated by |
    // e.g. "class:priceBinary|underlying:BTC|expiry:20260509-0600|targetPrice:79583|period:1d"
    // or simple values like "other", "index:0"
    const result: ParsedDescription = { raw: description };

    const parts = description.split('|');
    for (const part of parts) {
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) continue;
        const key = part.slice(0, colonIdx);
        const value = part.slice(colonIdx + 1);
        switch (key) {
            case 'class': result.class = value; break;
            case 'underlying': result.underlying = value; break;
            case 'expiry': {
                result.expiry = value;
                result.expiryDate = parseExpiryDate(value);
                break;
            }
            case 'targetPrice': result.targetPrice = value; break;
            case 'priceThresholds': result.priceThresholds = value.split(','); break;
            case 'period': result.period = value; break;
            case 'index': result.index = value; break;
        }
    }
    return result;
}

/**
 * Parse Hyperliquid's expiry format "YYYYMMDD-HHmm" into a Date.
 * Example: "20260509-0600" -> 2026-05-09T06:00:00Z
 */
function parseExpiryDate(expiry: string): Date | undefined {
    const match = expiry.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
    if (!match) return undefined;
    const [, year, month, day, hour, minute] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
}

/**
 * Build a human-readable title from the parsed description.
 */
function buildTitle(
    rawName: string,
    parsed: ParsedDescription,
    questionParsed?: ParsedDescription,
): string {
    // priceBinary: "BTC > $79,583 @ May 9, 2026"
    if (parsed.class === 'priceBinary' && parsed.underlying && parsed.targetPrice) {
        const price = Number(parsed.targetPrice).toLocaleString('en-US');
        const dateStr = parsed.expiryDate
            ? parsed.expiryDate.toISOString().replace('T', ' ').replace(':00.000Z', ' UTC')
            : '';
        return `${parsed.underlying} > $${price}${dateStr ? ` @ ${dateStr}` : ''}`;
    }

    // Named outcome in a priceBucket question: use thresholds from question
    if (parsed.index !== undefined && questionParsed?.priceThresholds && questionParsed.underlying) {
        const idx = parseInt(parsed.index, 10);
        const thresholds = questionParsed.priceThresholds;
        const underlying = questionParsed.underlying;
        if (idx === 0 && thresholds.length > 0) {
            return `${underlying} < $${Number(thresholds[0]).toLocaleString('en-US')}`;
        }
        if (idx === thresholds.length) {
            return `${underlying} > $${Number(thresholds[thresholds.length - 1]).toLocaleString('en-US')}`;
        }
        if (idx > 0 && idx <= thresholds.length) {
            const lo = Number(thresholds[idx - 1]).toLocaleString('en-US');
            const hi = Number(thresholds[idx]).toLocaleString('en-US');
            return `${underlying} $${lo} - $${hi}`;
        }
    }

    return rawName;
}

function buildMarketUrl(outcomeId: number): string {
    return `https://app.hyperliquid.xyz/trade/${encodeURIComponent(`#${outcomeId * 10}`)}`;
}

function buildEventUrl(questionId: number): string {
    return `https://app.hyperliquid.xyz/trade/${encodeURIComponent(`#${questionId}`)}`;
}

function isOutcomeCoin(coin: string): boolean {
    return coin.startsWith('#');
}

// ----------------------------------------------------------------------------
// Normalizer
// ----------------------------------------------------------------------------

export class HyperliquidNormalizer implements IExchangeNormalizer<HyperliquidRawOutcomeWithQuestion, HyperliquidRawQuestion> {

    normalizeMarket(raw: HyperliquidRawOutcomeWithQuestion): UnifiedMarket | null {
        if (!raw || !raw.outcome) return null;

        const outcome = raw.outcome;
        const outcomeId = outcome.outcome;
        const parsed = parseDescription(outcome.description);

        // Also parse the question description for context (e.g. priceThresholds)
        const questionParsed = raw.question
            ? parseDescription(raw.question.description)
            : undefined;

        const midPrice = raw.midPrice ? parseFloat(raw.midPrice) : 0.5;
        const yesPrice = Math.max(0, Math.min(1, midPrice));
        const noPrice = Math.max(0, Math.min(1, 1 - midPrice));

        const outcomes: MarketOutcome[] = [];
        for (const side of outcome.sideSpecs) {
            const sideKey = side.name.toLowerCase() === 'yes' ? 'yes' as const : 'no' as const;
            outcomes.push({
                outcomeId: toOutcomeId(outcomeId, sideKey),
                marketId: toMarketId(outcomeId),
                label: side.name,
                price: sideKey === 'yes' ? yesPrice : noPrice,
            });
        }

        // If no sideSpecs provided, default to Yes/No
        if (outcomes.length === 0) {
            outcomes.push(
                {
                    outcomeId: toOutcomeId(outcomeId, 'yes'),
                    marketId: toMarketId(outcomeId),
                    label: 'Yes',
                    price: yesPrice,
                },
                {
                    outcomeId: toOutcomeId(outcomeId, 'no'),
                    marketId: toMarketId(outcomeId),
                    label: 'No',
                    price: noPrice,
                },
            );
        }

        // Resolution date: prefer outcome-level expiry, fall back to question-level
        const expiryDate = parsed.expiryDate
            ?? questionParsed?.expiryDate
            ?? undefined;

        // Build a descriptive title from the parsed description
        const title = buildTitle(outcome.name, parsed, questionParsed);

        // Derive underlying from outcome or question
        const underlying = parsed.underlying ?? questionParsed?.underlying;

        const tags: string[] = [];
        if (underlying) {
            tags.push(underlying);
        }
        tags.push('Outcome Markets');

        const category = underlying ? 'Crypto' : undefined;

        const um: UnifiedMarket = {
            marketId: toMarketId(outcomeId),
            eventId: raw.question ? String(raw.question.question) : undefined,
            title,
            description: outcome.description,
            slug: `hl-${outcomeId}`,
            outcomes,
            resolutionDate: expiryDate ?? new Date(0),
            volume24h: raw.volume24h ?? 0,
            liquidity: 0,
            url: buildMarketUrl(outcomeId),
            category,
            tags,
            tickSize: 0.001,
            status: 'active',
            sourceMetadata: buildSourceMetadata(
                outcome as unknown as Record<string, unknown>,
                HL_PROMOTED_MARKET_KEYS,
            ),
        };

        addBinaryOutcomes(um);
        return um;
    }

    normalizeEvent(raw: HyperliquidRawQuestion): UnifiedEvent | null {
        if (!raw) return null;

        const parsed = parseDescription(raw.description);
        const underlying = parsed.underlying;

        // Build a more descriptive event title
        let title = raw.name;
        if (parsed.class === 'priceBucket' && underlying && parsed.priceThresholds) {
            const thresholds = parsed.priceThresholds.map(t => `$${Number(t).toLocaleString('en-US')}`).join(', ');
            const dateStr = parsed.expiryDate
                ? parsed.expiryDate.toISOString().replace('T', ' ').replace(':00.000Z', ' UTC')
                : '';
            title = `${underlying} Price Bucket [${thresholds}]${dateStr ? ` @ ${dateStr}` : ''}`;
        }

        const tags: string[] = ['Outcome Markets'];
        if (underlying) tags.push(underlying);

        return {
            id: String(raw.question),
            title,
            description: raw.description,
            slug: `hl-question-${raw.question}`,
            markets: [],
            volume24h: 0,
            url: buildEventUrl(raw.question),
            category: underlying ? 'Crypto' : undefined,
            tags,
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                HL_PROMOTED_EVENT_KEYS,
            ),
        };
    }

    normalizeEventWithMarkets(
        raw: HyperliquidRawQuestion,
        outcomeMeta: HyperliquidRawOutcomeMeta,
        mids: HyperliquidRawMid,
        volumeMap?: Map<number, number>,
    ): UnifiedEvent | null {
        const event = this.normalizeEvent(raw);
        if (!event) return null;

        const markets: UnifiedMarket[] = [];
        for (const outcomeId of raw.namedOutcomes) {
            if (raw.settledNamedOutcomes.includes(outcomeId)) continue;

            const outcome = outcomeMeta.outcomes.find(o => o.outcome === outcomeId);
            if (!outcome) continue;

            const midKey = toMidKey(outcomeId);
            const midPrice = mids[midKey];

            const market = this.normalizeMarket({
                outcome,
                question: raw,
                midPrice,
                volume24h: volumeMap?.get(outcomeId),
            });
            if (market) {
                markets.push(market);
            }
        }

        return {
            ...event,
            markets,
            volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
        };
    }

    normalizeOrderBook(raw: HyperliquidRawL2Book, _id: string): OrderBook {
        const [rawBids, rawAsks] = raw.levels;

        const bids = rawBids.map(level => ({
            price: parseFloat(level.px),
            size: parseFloat(level.sz),
            orderCount: level.n,
        }));

        const asks = rawAsks.map(level => ({
            price: parseFloat(level.px),
            size: parseFloat(level.sz),
            orderCount: level.n,
        }));

        return {
            bids: [...bids].sort((a, b) => b.price - a.price),
            asks: [...asks].sort((a, b) => a.price - b.price),
            timestamp: raw.time,
        };
    }

    normalizeOHLCV(raw: HyperliquidRawCandle[], _params: OHLCVParams): PriceCandle[] {
        return raw.map(candle => ({
            timestamp: candle.t,
            open: parseFloat(candle.o),
            high: parseFloat(candle.h),
            low: parseFloat(candle.l),
            close: parseFloat(candle.c),
            volume: parseFloat(candle.v),
        }));
    }

    normalizeTrade(raw: HyperliquidRawTrade, _index: number): Trade {
        return {
            id: String(raw.tid),
            timestamp: raw.time,
            price: parseFloat(raw.px),
            amount: parseFloat(raw.sz),
            side: raw.side === 'B' ? 'buy' : raw.side === 'A' ? 'sell' : 'unknown',
        };
    }

    normalizeUserTrade(raw: HyperliquidRawFill, _index: number): UserTrade {
        const fee = parseFloat(raw.fee);
        return {
            id: String(raw.tid),
            timestamp: raw.time,
            price: parseFloat(raw.px),
            amount: parseFloat(raw.sz),
            side: raw.side === 'B' ? 'buy' : raw.side === 'A' ? 'sell' : 'unknown',
            orderId: String(raw.oid),
            marketId: this.coinToMarketId(raw.coin),
            outcomeId: this.coinToOutcomeId(raw.coin),
            fee: Number.isFinite(fee) ? fee : undefined,
        };
    }

    // ponytail: HL has no closed-orders endpoint; we reconstruct from the fills of one oid.
    // amount = filled (we cannot recover the unfilled-then-cancelled portion); price = VWAP across fills.
    synthesizeClosedOrder(fills: HyperliquidRawFill[]): Order {
        const first = fills[0];
        let totalSz = 0;
        let totalNotional = 0;
        let totalFee = 0;
        let earliest = first.time;
        for (const f of fills) {
            const sz = parseFloat(f.sz);
            const px = parseFloat(f.px);
            const fee = parseFloat(f.fee);
            totalSz += sz;
            totalNotional += sz * px;
            if (Number.isFinite(fee)) totalFee += fee;
            if (f.time < earliest) earliest = f.time;
        }
        const vwap = totalSz > 0 ? totalNotional / totalSz : parseFloat(first.px);
        return {
            id: String(first.oid),
            marketId: this.coinToMarketId(first.coin),
            outcomeId: this.coinToOutcomeId(first.coin),
            side: first.side === 'B' ? 'buy' : 'sell',
            type: 'limit',
            price: vwap,
            amount: totalSz,
            status: 'filled',
            filled: totalSz,
            remaining: 0,
            timestamp: earliest,
            fee: totalFee,
        };
    }

    normalizeOpenOrder(raw: HyperliquidRawOpenOrder): Order {
        const currentSz = parseFloat(raw.sz);
        // origSz is only available from frontendOpenOrders; fall back to sz
        const origSz = raw.origSz !== undefined ? parseFloat(raw.origSz) : currentSz;

        return {
            id: String(raw.oid),
            marketId: this.coinToMarketId(raw.coin),
            outcomeId: this.coinToOutcomeId(raw.coin),
            side: raw.side === 'B' ? 'buy' : 'sell',
            type: 'limit',
            price: parseFloat(raw.limitPx),
            amount: origSz,
            status: currentSz < origSz ? 'open' : 'pending',
            filled: origSz - currentSz,
            remaining: currentSz,
            timestamp: raw.timestamp,
        };
    }

    normalizePosition(raw: HyperliquidRawPosition): Position {
        if (!isOutcomeCoin(raw.coin)) {
            return {
                marketId: raw.coin,
                outcomeId: raw.coin,
                outcomeLabel: raw.coin,
                size: parseFloat(raw.szi),
                entryPrice: raw.entryPx ? parseFloat(raw.entryPx) : 0,
                currentPrice: 0,
                unrealizedPnL: parseFloat(raw.unrealizedPnl),
            };
        }

        return {
            marketId: this.coinToMarketId(raw.coin),
            outcomeId: this.coinToOutcomeId(raw.coin),
            outcomeLabel: raw.coin,
            size: parseFloat(raw.szi),
            entryPrice: raw.entryPx ? parseFloat(raw.entryPx) : 0,
            currentPrice: 0,
            unrealizedPnL: parseFloat(raw.unrealizedPnl),
        };
    }

    normalizeBalance(raw: HyperliquidRawUserState, spot?: HyperliquidRawSpotState): Balance[] {
        const result: Balance[] = [];

        // Spot balances: outcome markets quote against these (USDC, USDH, etc.).
        for (const b of spot?.balances ?? []) {
            const total = parseFloat(b.total);
            const hold = parseFloat(b.hold);
            if (!Number.isFinite(total) || total === 0) continue;
            result.push({
                currency: b.coin,
                total,
                available: total - (Number.isFinite(hold) ? hold : 0),
                locked: Number.isFinite(hold) ? hold : 0,
            });
        }

        // Perp cross-margin account, labelled as such so consumers don't conflate it with spot.
        const summary = raw.crossMarginSummary;
        const perpTotal = parseFloat(summary.accountValue);
        const perpLocked = parseFloat(summary.totalMarginUsed);
        if (Number.isFinite(perpTotal) && perpTotal > 0) {
            result.push({
                currency: 'USDC_PERP',
                total: perpTotal,
                available: perpTotal - perpLocked,
                locked: perpLocked,
            });
        }

        return result;
    }

    // -- Private helpers -------------------------------------------------------

    private coinToMarketId(coin: string): string {
        if (!coin.startsWith('#')) return coin;
        const encoding = parseInt(coin.slice(1), 10);
        const { outcomeId } = decodeAssetId(OUTCOME_ASSET_BASE + encoding);
        return toMarketId(outcomeId);
    }

    private coinToOutcomeId(coin: string): string {
        if (!coin.startsWith('#')) return coin;
        const encoding = parseInt(coin.slice(1), 10);
        return String(OUTCOME_ASSET_BASE + encoding);
    }
}
