import type {
    Event as SdkEvent,
    MarketDetail,
    MarketBook,
    Order as SdkOrder,
    OrderState,
    OrderType,
    OrderIntent,
    UserPosition,
    UserBalance,
    Activity,
    Series as SdkSeries,
} from 'polymarket-us';

import {
    UnifiedMarket,
    UnifiedEvent,
    UnifiedSeries,
    MarketOutcome,
    OrderBook,
    Order,
    Position,
    Balance,
    UserTrade,
} from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';
import { fromAmount, fromLongSidePrice } from './price';

// Raw Polymarket US fields already promoted to first-class Unified columns —
// excluded from sourceMetadata so we capture only what the unified shape drops.
const POLYMARKET_US_PROMOTED_EVENT_KEYS = [
    'slug', 'title', 'description', 'category', 'tags', 'volume', 'markets',
] as const;

// Series fields promoted to first-class UnifiedSeries columns.
const POLYMARKET_US_PROMOTED_SERIES_KEYS = [
    'id', 'slug', 'title', 'description', 'recurrence',
] as const;

// marketSides and outcomePrices feed the outcomes array and are therefore
// treated as promoted. orderPriceMinTickSize maps to tickSize and
// minimumTradeQty maps to minOrderSize.
const POLYMARKET_US_PROMOTED_MARKET_KEYS = [
    'slug', 'question', 'title', 'description', 'category', 'tags',
    'endDate', 'marketSides', 'outcomePrices', 'orderPriceMinTickSize',
    'minimumTradeQty', 'eventSlug', 'volume', 'liquidity',
] as const;

// ----------------------------------------------------------------------------
// Runtime-accurate shapes
// ----------------------------------------------------------------------------
//
// The polymarket-us SDK's TypeScript types do not match the live gateway
// response for markets. In particular:
//   - markets expose `question`, not `title`
//   - markets expose `endDate`, not `endTime`
//   - markets expose `marketSides` with long/short booleans and human labels
//   - markets expose `category` and `tags` directly
// The shapes below describe the fields we actually read at runtime.
//
interface RealMarketSide {
    description?: string;
    long?: boolean;
    // Live gateway reports the current long-side price of this side as a
    // stringified number ("1.000", "0.864", "0"). For the long side this
    // is the YES probability; for the short side it is `1 - longPrice`.
    price?: string;
}

interface RealMarket {
    slug: string;
    question?: string;
    title?: string;
    description?: string;
    category?: string;
    tags?: unknown;
    endDate?: string;
    startDate?: string;
    marketSides?: RealMarketSide[];
    // Fallback price source used by some gateway responses: a 2-element
    // array of stringified long-side prices, [longPrice, shortPrice].
    outcomePrices?: string[];
    // Per-market minimum price increment (e.g. 0.001). Lifted onto
    // `UnifiedMarket.tickSize` so price-sensitive helpers can honour the
    // real tick rather than falling back to the hard-coded default.
    orderPriceMinTickSize?: number;
    // Per-market minimum tradeable quantity for partial-contract markets.
    minimumTradeQty?: number;
    eventSlug?: string;
    volume?: number;
    liquidity?: number;
}

interface RealEvent {
    id?: number | string;
    slug: string;
    ticker?: string;
    title?: string;
    description?: string;
    category?: string;
    tags?: unknown;
    endDate?: string;
    endTime?: string;
    markets?: unknown[];
    volume?: number;
    liquidity?: number;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const POLYMARKET_US_BASE_URL = 'https://polymarket.us';

function buildMarketUrl(slug: string): string {
    return `${POLYMARKET_US_BASE_URL}/market/${slug}`;
}

function buildEventUrl(slug: string): string {
    return `${POLYMARKET_US_BASE_URL}/event/${slug}`;
}

/**
 * Parse a stringified price from the gateway. Returns `undefined` when
 * the input is missing, empty, or non-numeric so downstream logic can
 * distinguish "no quote" from a legitimate 0.
 */
function parsePriceString(value: string | undefined): number | undefined {
    if (value == null || value === '') return undefined;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : undefined;
}

function buildBinaryOutcomes(
    slug: string,
    longPrice: number,
    shortPrice: number,
): MarketOutcome[] {
    return [
        {
            outcomeId: `${slug}:long`,
            marketId: slug,
            label: 'long',
            price: longPrice,
        },
        {
            outcomeId: `${slug}:short`,
            marketId: slug,
            label: 'short',
            price: shortPrice,
        },
    ];
}

/**
 * Build binary outcomes from the gateway's `marketSides[]` array. The side
 * ordering is normalized to [long, short] regardless of input order. Human
 * labels from `description` (e.g. team names) are stashed under
 * `metadata.sideDescription`; `label` is kept canonical ("long" / "short")
 * so downstream helpers like `addBinaryOutcomes` continue to work.
 *
 * Prices are sourced with this precedence:
 *   1. `marketSides[i].price` (per-side price on the gateway payload)
 *   2. `outcomePrices[0|1]` (legacy 2-element fallback)
 *   3. 0 (no quote available)
 *
 * The short-side price is derived as `1 - longPrice` when only the long
 * side is quoted (and vice versa), since Polymarket US is fully binary.
 */
function buildOutcomes(
    slug: string,
    sides: RealMarketSide[] | undefined,
    outcomePrices: string[] | undefined,
): MarketOutcome[] {
    let longPrice: number | undefined;
    let shortPrice: number | undefined;
    let longDescription: string | undefined;
    let shortDescription: string | undefined;

    if (sides && sides.length > 0) {
        const longSide = sides.find(s => s.long === true);
        const shortSide = sides.find(s => s.long === false);
        if (longSide) {
            longPrice = parsePriceString(longSide.price);
            longDescription = longSide.description;
        }
        if (shortSide) {
            shortPrice = parsePriceString(shortSide.price);
            shortDescription = shortSide.description;
        }
    }

    if (longPrice === undefined && outcomePrices && outcomePrices.length >= 1) {
        longPrice = parsePriceString(outcomePrices[0]);
    }
    if (shortPrice === undefined && outcomePrices && outcomePrices.length >= 2) {
        shortPrice = parsePriceString(outcomePrices[1]);
    }

    // Fill in the complementary side from the binary identity when only
    // one side was quoted.
    if (longPrice !== undefined && shortPrice === undefined) {
        shortPrice = 1 - longPrice;
    }
    if (shortPrice !== undefined && longPrice === undefined) {
        longPrice = 1 - shortPrice;
    }

    const outcomes = buildBinaryOutcomes(slug, longPrice ?? 0, shortPrice ?? 0);

    if (longDescription) {
        outcomes[0].metadata = { sideDescription: longDescription };
    }
    if (shortDescription) {
        outcomes[1].metadata = { sideDescription: shortDescription };
    }

    return outcomes;
}

/**
 * Accepts the `tags` field in whatever shape the gateway returns it
 * (string[], array of {label|name|slug} objects, or undefined) and
 * produces a flat `string[]`.
 */
function coerceTags(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item === 'string') {
            if (item) out.push(item);
        } else if (item && typeof item === 'object') {
            const obj = item as { label?: unknown; name?: unknown; slug?: unknown };
            const label =
                (typeof obj.label === 'string' && obj.label) ||
                (typeof obj.name === 'string' && obj.name) ||
                (typeof obj.slug === 'string' && obj.slug) ||
                '';
            if (label) out.push(label);
        }
    }
    return out;
}

function parseTimeToMs(value: string | undefined): number {
    if (!value) return 0;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
}

function intentToSide(intent: OrderIntent): 'buy' | 'sell' {
    switch (intent) {
        case 'ORDER_INTENT_BUY_LONG':
        case 'ORDER_INTENT_BUY_SHORT':
            return 'buy';
        case 'ORDER_INTENT_SELL_LONG':
        case 'ORDER_INTENT_SELL_SHORT':
            return 'sell';
        default:
            throw new Error(`[polymarket_us] unknown order intent: ${String(intent)}`);
    }
}

function intentToOutcomeId(intent: OrderIntent, slug: string): string {
    switch (intent) {
        case 'ORDER_INTENT_BUY_LONG':
        case 'ORDER_INTENT_SELL_LONG':
            return `${slug}:long`;
        case 'ORDER_INTENT_BUY_SHORT':
        case 'ORDER_INTENT_SELL_SHORT':
            return `${slug}:short`;
        default:
            return `${slug}:long`;
    }
}

function mapOrderType(type: OrderType): 'market' | 'limit' {
    return type === 'ORDER_TYPE_MARKET' ? 'market' : 'limit';
}

// PMXT Order.status values: 'pending' | 'open' | 'filled' | 'canceled' | 'rejected'
// Note: PMXT has no 'expired' status; expired orders are mapped to 'canceled'.
function mapOrderStatus(state: OrderState): 'pending' | 'open' | 'filled' | 'canceled' | 'rejected' {
    switch (state) {
        case 'ORDER_STATE_FILLED':
            return 'filled';
        case 'ORDER_STATE_CANCELED':
        case 'ORDER_STATE_EXPIRED':
            return 'canceled';
        case 'ORDER_STATE_REJECTED':
            return 'rejected';
        case 'ORDER_STATE_NEW':
        case 'ORDER_STATE_PENDING_NEW':
        case 'ORDER_STATE_PENDING_REPLACE':
        case 'ORDER_STATE_PENDING_CANCEL':
        case 'ORDER_STATE_PENDING_RISK':
        case 'ORDER_STATE_PARTIALLY_FILLED':
        case 'ORDER_STATE_REPLACED':
        default:
            return 'open';
    }
}

// ----------------------------------------------------------------------------
// Normalizer
// ----------------------------------------------------------------------------

export class PolymarketUSNormalizer {

    /**
     * Normalize a Polymarket US SDK Series into a UnifiedSeries.
     *
     * The SDK's Series type is exported as `Series` from `polymarket-us`;
     * the `id` field is numeric and is stringified for the unified identifier.
     */
    normalizeSeries(raw: SdkSeries): UnifiedSeries {
        const id = String(raw.id);
        const slug = raw.slug || undefined;
        const title = raw.title || slug || id;
        const description = raw.description != null ? raw.description : null;
        const recurrence = raw.recurrence != null ? raw.recurrence : null;
        const url = slug != null ? `https://polymarket.us/series/${slug}` : null;

        return {
            id,
            slug,
            title,
            description,
            recurrence,
            url,
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                POLYMARKET_US_PROMOTED_SERIES_KEYS,
            ),
        };
    }

    /**
     * Normalize a single MarketDetail into a UnifiedMarket.
     * The slug is the canonical PMXT marketId for Polymarket US.
     */
    normalizeMarket(detail: MarketDetail): UnifiedMarket {
        const real = detail as unknown as RealMarket;
        return this.buildUnifiedMarket(real);
    }

    /**
     * Flatten an SDK Event's markets into UnifiedMarkets.
     * Each market inherits the parent event's metadata.
     */
    normalizeMarketsFromEvent(event: SdkEvent): UnifiedMarket[] {
        const realEvent = event as unknown as RealEvent;
        const nested = realEvent.markets as RealMarket[] | undefined;
        if (!nested) return [];

        const parentTags = coerceTags(realEvent.tags);
        const parentCategory = realEvent.category || (parentTags.length > 0 ? parentTags[0] : '');
        const parentEndDate = realEvent.endDate || realEvent.endTime;

        return nested.map(m =>
            this.buildUnifiedMarket(m, {
                eventSlug: realEvent.slug,
                category: parentCategory,
                tags: parentTags,
                endDate: parentEndDate,
            }),
        );
    }

    /**
     * Normalize an SDK Event into a UnifiedEvent.
     */
    normalizeEvent(event: SdkEvent): UnifiedEvent {
        const real = event as unknown as RealEvent;
        const markets = this.normalizeMarketsFromEvent(event);
        const tags = coerceTags(real.tags);
        const category = real.category || (tags.length > 0 ? tags[0] : '');

        return {
            id: real.slug,
            title: real.title || '',
            description: real.description || '',
            slug: real.slug,
            markets,
            volume24h: 0,
            volume: real.volume,
            url: buildEventUrl(real.slug),
            category,
            tags,
            sourceMetadata: buildSourceMetadata(
                real as unknown as Record<string, unknown>,
                POLYMARKET_US_PROMOTED_EVENT_KEYS,
            ),
        };
    }

    /**
     * Internal helper that builds a UnifiedMarket from the gateway's real
     * runtime shape. Handles inheritance from a parent event when the market
     * is nested (fields like category/tags/endDate fall back to the parent).
     */
    private buildUnifiedMarket(
        market: RealMarket,
        parent?: { eventSlug?: string; category?: string; tags?: string[]; endDate?: string },
    ): UnifiedMarket {
        const slug = market.slug;
        const title = market.question || market.title || slug;
        const tags = coerceTags(market.tags);
        const effectiveTags = tags.length > 0 ? tags : (parent?.tags || []);
        const category = market.category || parent?.category || (effectiveTags.length > 0 ? effectiveTags[0] : '');
        const endDate = market.endDate || parent?.endDate;
        const resolutionDate = endDate ? new Date(endDate) : new Date(0);
        const outcomes = buildOutcomes(slug, market.marketSides, market.outcomePrices);

        const um: UnifiedMarket = {
            marketId: slug,
            eventId: market.eventSlug || parent?.eventSlug,
            title,
            description: market.description || '',
            slug,
            outcomes,
            resolutionDate,
            volume24h: 0,
            volume: market.volume,
            liquidity: market.liquidity ?? 0,
            url: buildMarketUrl(slug),
            category,
            tags: [...effectiveTags],
            tickSize: typeof market.orderPriceMinTickSize === 'number'
                ? market.orderPriceMinTickSize
                : undefined,
            minOrderSize: typeof market.minimumTradeQty === 'number'
                ? market.minimumTradeQty
                : undefined,
            sourceMetadata: buildSourceMetadata(
                market as unknown as Record<string, unknown>,
                POLYMARKET_US_PROMOTED_MARKET_KEYS,
            ),
        };

        addBinaryOutcomes(um);
        return um;
    }

    /**
     * Normalize a MarketBook into a PMXT OrderBook.
     *
     * IMPORTANT: Polymarket US books are quoted in long-side prices. PMXT
     * exposes the book as the LONG side directly:
     *   - bids: levels where someone is bidding to BUY LONG (price = fromAmount(level.px))
     *   - asks: levels where someone is offering to SELL LONG (price = fromAmount(level.px))
     * The implicit short-side book is `1 - longPrice` for each level. Callers
     * needing the short-side view must invert prices themselves.
     */
    normalizeOrderBook(book: MarketBook, _marketId: string): OrderBook {
        // Missing bids/offers is a valid state (no liquidity), not broken data
        const bids = (book.bids ?? []).map(level => ({
            price: fromAmount(level.px),
            size: parseFloat(level.qty || '0'),
        }));

        const asks = (book.offers ?? []).map(level => ({
            price: fromAmount(level.px),
            size: parseFloat(level.qty || '0'),
        }));

        return {
            bids,
            asks,
            timestamp: parseTimeToMs(book.transactTime) || Date.now(),
        };
    }

    /**
     * Normalize an SDK Order into a PMXT Order.
     * Prices are converted from long-side to user-facing using the order's intent.
     */
    normalizeOrder(order: SdkOrder): Order {
        const slug = order.marketSlug;
        const longPrice = fromAmount(order.price);
        const userFacingPrice = fromLongSidePrice(order.intent, longPrice);

        const fee = order.commissionNotionalTotalCollected
            ? fromAmount(order.commissionNotionalTotalCollected)
            : undefined;

        const timestamp = parseTimeToMs(order.createTime) || parseTimeToMs(order.insertTime);

        return {
            id: order.id,
            marketId: slug,
            outcomeId: intentToOutcomeId(order.intent, slug),
            side: intentToSide(order.intent),
            type: mapOrderType(order.type),
            price: userFacingPrice,
            amount: order.quantity,
            status: mapOrderStatus(order.state),
            filled: order.cumQuantity,
            remaining: order.leavesQuantity,
            timestamp,
            fee,
        };
    }

    /**
     * Normalize the SDK's positions map into an array of PMXT Positions.
     * Positive netPosition -> long outcome; negative -> short outcome.
     */
    normalizePositions(positions: Record<string, UserPosition>): Position[] {
        const results: Position[] = [];

        for (const slug of Object.keys(positions)) {
            const pos = positions[slug];
            if (!pos) continue;

            const net = parseFloat(pos.netPosition || '0');
            const isLong = net >= 0;
            const size = Math.abs(net);

            // Approximate cost basis per share. The SDK does not expose a
            // running average price; we derive it from total cost / size.
            const totalCost = fromAmount(pos.cost);
            const entryPrice = size > 0 ? Math.abs(totalCost) / size : 0;

            // cashValue is the current mark-to-market value of the position.
            // unrealizedPnL = cashValue - abs(cost).
            const cashValue = fromAmount(pos.cashValue);
            const unrealizedPnL = cashValue - Math.abs(totalCost);
            const currentPrice = size > 0 ? cashValue / size : 0;

            results.push({
                marketId: slug,
                outcomeId: isLong ? `${slug}:long` : `${slug}:short`,
                outcomeLabel: isLong ? 'long' : 'short',
                size,
                entryPrice,
                currentPrice,
                unrealizedPnL,
                realizedPnL: fromAmount(pos.realized),
            });
        }

        return results;
    }

    /**
     * Normalize a UserBalance into PMXT Balance[].
     * Locked = total - available (clamped to >= 0).
     */
    normalizeBalance(balance: UserBalance): Balance[] {
        const total = balance.currentBalance;
        const available = balance.buyingPower;
        const locked = Math.max(0, total - available);

        return [{
            currency: 'USD',
            total,
            available,
            locked,
        }];
    }

    /**
     * Normalize a single Activity into a UserTrade.
     * Returns null for non-trade activities.
     */
    normalizeUserTradeFromActivity(activity: Activity, _index: number): UserTrade | null {
        if (activity.type !== 'ACTIVITY_TYPE_TRADE') return null;
        const trade = activity.trade;
        if (!trade) return null;

        return {
            id: trade.id,
            timestamp: parseTimeToMs(trade.createTime),
            price: fromAmount(trade.price),
            amount: parseFloat(trade.qty || '0'),
            // The Polymarket US activity trade object (Trade$1) does not carry
            // an intent/side field — only price, qty, and state are provided.
            // Side cannot be derived from activity data; consumers must cross-reference
            // with their own order history if side is required.
            side: 'unknown',
            outcomeId: undefined,
        };
    }
}
