import { UnifiedMarket, MarketOutcome, CandleInterval } from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';

export const DEFAULT_LIMITLESS_API_URL = 'https://api.limitless.exchange';

// Raw Limitless market fields already promoted to first-class Unified columns —
// excluded from sourceMetadata so we capture only what the unified shape drops.
// Also excludes __pmxt* internal injection keys (not raw vendor data).
const LIMITLESS_PROMOTED_MARKET_KEYS = [
    'slug', 'title', 'question', 'description',
    'tokens', 'prices',
    'expirationTimestamp',
    'volumeFormatted', 'volume',
    'logo',
    'categories', 'tags',
    'expired', 'status',
    'markets',
    '__pmxtEventId', '__pmxtEventTitle', '__pmxtEventDescription',
    '__pmxtCategories', '__pmxtTags',
] as const;

export function scaledIntegerToNumber(value: bigint | { toBigInt?: () => bigint; toString(): string }, decimals: number): number {
    if (!Number.isInteger(decimals) || decimals < 0) {
        throw new Error(`[limitless] Invalid token decimals: ${decimals}`);
    }

    const raw = typeof value === 'bigint'
        ? value
        : typeof value.toBigInt === 'function'
            ? value.toBigInt()
            : BigInt(value.toString());
    const sign = raw < 0n ? -1 : 1;
    const abs = raw < 0n ? -raw : raw;
    const scale = 10n ** BigInt(decimals);
    const whole = abs / scale;
    const fraction = abs % scale;
    const amount = Number(whole) + (Number(fraction) / Number(scale));

    return sign * amount;
}

export interface LimitlessMarketContext {
    eventId?: string;
    eventTitle?: string;
    eventDescription?: string;
    categories?: string[];
    tags?: string[];
}

export function mapMarketToUnified(market: any, context: LimitlessMarketContext = {}): UnifiedMarket | null {
    if (!market) return null;

    const resolvedContext: LimitlessMarketContext = {
        eventId: getText(market.__pmxtEventId) || context.eventId,
        eventTitle: getText(market.__pmxtEventTitle) || context.eventTitle,
        eventDescription: getText(market.__pmxtEventDescription) || context.eventDescription,
        categories: getStringArray(market.__pmxtCategories) || context.categories,
        tags: getStringArray(market.__pmxtTags) || context.tags,
    };
    const outcomes: MarketOutcome[] = [];
    const rawTitle = getText(market.title) || getText(market.question) || market.slug;
    const title = composeMarketTitle(rawTitle, resolvedContext.eventTitle);
    const hasParentContext = Boolean(resolvedContext.eventTitle && rawTitle);

    // The Limitless SDK provides:
    //   tokens: { yes: "...", no: "..." }
    //   prices: [yesPrice, noPrice]  (always [yes, no] per SDK docs)
    // Use explicit key lookup — Object.entries order is not guaranteed to
    // match the prices array.
    if (market.tokens) {
        if (!market.tokens.yes || !market.tokens.no) {
            throw new Error(`[limitless] Market "${market.slug}" is missing token addresses`);
        }

        const legacyPrices = Array.isArray(market.prices) ? market.prices : [];
        const yesPrice = market.tradePrices?.buy?.market?.[0] ?? legacyPrices[0] ?? 0.5;
        const noPrice = market.tradePrices?.sell?.market?.[0] ?? legacyPrices[1] ?? Math.max(0, Math.min(1, 1 - yesPrice));
        const yesLabel = hasParentContext ? rawTitle : 'Yes';
        const noLabel = hasParentContext ? `Not ${rawTitle}` : 'No';

        outcomes.push({
            outcomeId: market.tokens.yes,
            marketId: market.slug,
            label: yesLabel,
            price: yesPrice,
            priceChange24h: 0,
            metadata: { clobTokenId: market.tokens.yes },
        });
        outcomes.push({
            outcomeId: market.tokens.no,
            marketId: market.slug,
            label: noLabel,
            price: noPrice,
            priceChange24h: 0,
            metadata: { clobTokenId: market.tokens.no },
        });
    }

    // Limitless returns status='FUNDED' for active markets and expired=true
    // when the market has ended. Map to the same canonical values Polymarket uses.
    let status: string | undefined;
    if (market.expired === true) status = 'closed';
    else if (market.status === 'FUNDED') status = 'active';

    const um = {
        id: market.slug,
        marketId: market.slug,
        eventId: resolvedContext.eventId || market.slug,
        title,
        description: market.description || resolvedContext.eventDescription,
        slug: market.slug,
        outcomes: outcomes,
        resolutionDate: market.expirationTimestamp ? new Date(market.expirationTimestamp) : new Date(),
        volume24h: Number(market.volumeFormatted || 0),
        volume: Number(market.volume || 0),
        liquidity: 0, // Not directly in the flat market list
        openInterest: 0, // Not directly in the flat market list
        url: `https://limitless.exchange/markets/${market.slug}`,
        image: market.logo || `https://limitless.exchange/api/og?slug=${market.slug}`,
        category: market.categories?.[0] || resolvedContext.categories?.[0],
        tags: market.tags || resolvedContext.tags || [],
        status,
        sourceMetadata: buildSourceMetadata(
            market as unknown as Record<string, unknown>,
            LIMITLESS_PROMOTED_MARKET_KEYS,
        ),
    } as UnifiedMarket;

    addBinaryOutcomes(um);
    return um;
}

function getText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function normalizeTitle(value: string): string {
    return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function composeMarketTitle(childTitle: string, eventTitle?: string): string {
    if (!eventTitle) return childTitle;

    const normalizedChild = normalizeTitle(childTitle);
    const normalizedEvent = normalizeTitle(eventTitle);
    if (!normalizedChild || !normalizedEvent || normalizedChild.startsWith(normalizedEvent)) {
        return childTitle;
    }

    return `${eventTitle} - ${childTitle}`;
}

export function mapIntervalToFidelity(interval: CandleInterval): number {
    const mapping: Record<CandleInterval, number> = {
        '1m': 1,
        '5m': 5,
        '15m': 15,
        '1h': 60,
        '6h': 360,
        '1d': 1440
    };
    return mapping[interval];
}

/**
 * Fetch paginated results from Limitless API.
 * The API has a hard limit of 25 items per request, so this function
 * handles automatic pagination when more items are requested.
 *
 * This function fetches all available markets up to a reasonable limit
 * to ensure the caller can filter and still get the requested number.
 */
export async function paginateLimitlessMarkets(
    fetcher: any,
    requestedLimit: number,
    sortBy: 'lp_rewards' | 'ending_soon' | 'newest' | 'high_value'
): Promise<any[]> {
    const PAGE_SIZE = 25;
    const targetLimit = requestedLimit || PAGE_SIZE;
    const MAX_PAGES = 20; // Safety limit to prevent infinite loops

    if (targetLimit <= PAGE_SIZE) {
        const response = await fetcher.getActiveMarkets({
            limit: targetLimit,
            page: 1,
            sortBy: sortBy,
        });
        return response.data || [];
    }

    // Fetch more pages than theoretically needed to account for filtering
    // ~33% of markets lack tokens and get filtered out, so we over-fetch
    // by 70% to ensure we get enough valid markets after filtering
    const estimatedPages = Math.ceil(targetLimit / PAGE_SIZE);
    const pagesWithBuffer = Math.min(Math.ceil(estimatedPages * 1.7), MAX_PAGES);

    const pageNumbers: number[] = [];
    for (let i = 1; i <= pagesWithBuffer; i++) {
        pageNumbers.push(i);
    }

    const pages = await Promise.all(pageNumbers.map(async (page) => {
        try {
            const response = await fetcher.getActiveMarkets({
                limit: PAGE_SIZE,
                page: page,
                sortBy: sortBy,
            });
            return response.data || [];
        } catch (e) {
            return [];
        }
    }));

    const allMarkets = pages.flat();

    // Don't slice here - let the caller handle limiting after filtering
    // This ensures we return enough raw markets for the caller to filter
    return allMarkets;
}
