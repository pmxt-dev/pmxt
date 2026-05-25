import type { PredictionMarketExchange } from '../BaseExchange';
import type { UnifiedMarket, UnifiedEvent } from '../types';

// ---------------------------------------------------------------------------
// Relation types (matches the matching engine's SetRelation)
// ---------------------------------------------------------------------------

export type MatchRelation = 'identity' | 'subset' | 'superset' | 'overlap' | 'disjoint';

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface RouterOptions {
    apiKey: string;
    baseUrl?: string;
    /** Exchange instances for cross-venue orderbook aggregation. Keyed by exchange name (e.g. 'polymarket', 'kalshi'). */
    exchanges?: Record<string, PredictionMarketExchange>;
    /**
     * Local exchange instances used only to resolve sidecar-only fixture IDs
     * before hosted catalog match lookups. Does not affect orderbook routing.
     */
    localExchanges?: Record<string, PredictionMarketExchange>;
}

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface MatchResult {
    market: UnifiedMarket;
    /** The source market this was matched against. Present in browse mode (no marketId), absent in lookup mode. */
    sourceMarket?: UnifiedMarket;
    relation: MatchRelation;
    confidence: number;
    reasoning: string | null;
    bestBid: number | null;
    bestAsk: number | null;
}

export interface EventMatchResult {
    event: UnifiedEvent;
    marketMatches: MatchResult[];
}

export interface PriceComparison {
    market: UnifiedMarket;
    relation: MatchRelation;
    confidence: number;
    reasoning: string | null;
    bestBid: number | null;
    bestAsk: number | null;
    venue: string;
}

export interface ArbitrageOpportunity {
    marketA: UnifiedMarket;
    marketB: UnifiedMarket;
    spread: number;
    buyVenue: string;
    sellVenue: string;
    buyPrice: number;
    sellPrice: number;
    /** The set-theoretic relation between the two markets (e.g. identity, subset). */
    relation?: MatchRelation;
    /** Match confidence score (0.0 to 1.0). */
    confidence?: number;
}

// ---------------------------------------------------------------------------
// Param types
// ---------------------------------------------------------------------------

export interface FetchMarketMatchesParams {
    /** Keyword search across matched market titles. */
    query?: string;
    /** Filter matches by category. */
    category?: string;
    /** Pass a UnifiedMarket directly instead of marketId/slug/url. */
    market?: UnifiedMarket;
    /** Lookup a specific market by ID. Omit for browse mode. */
    marketId?: string;
    slug?: string;
    url?: string;
    relation?: MatchRelation;
    minConfidence?: number;
    limit?: number;
    includePrices?: boolean;
    /** Minimum price difference between venues. Browse mode only. */
    minDifference?: number;
    /** Sort order. Browse mode only. */
    sort?: 'confidence' | 'volume' | 'priceDifference';
}

/** @deprecated Use {@link FetchMarketMatchesParams} instead. */
export type FetchMatchesParams = FetchMarketMatchesParams;

export interface FetchEventMatchesParams {
    /** Keyword search across matched event titles. */
    query?: string;
    /** Filter matches by category. */
    category?: string;
    /** Pass a UnifiedEvent directly instead of eventId/slug. */
    event?: UnifiedEvent;
    /** Lookup a specific event by ID. Omit for browse mode. */
    eventId?: string;
    slug?: string;
    relation?: MatchRelation;
    minConfidence?: number;
    limit?: number;
    includePrices?: boolean;
}

export interface FetchArbitrageParams {
    minSpread?: number;
    category?: string;
    limit?: number;
    /** Comma-separated relation types to include (default: 'identity'). */
    relations?: MatchRelation[];
}

export interface MatchedMarketPair {
    marketA: UnifiedMarket;
    marketB: UnifiedMarket;
    priceDifference: number;
    venueA: string;
    venueB: string;
    priceA: number;
    priceB: number;
    /** The set-theoretic relation between the two markets (e.g. identity, subset). */
    relation?: MatchRelation;
    /** Match confidence score (0.0 to 1.0). */
    confidence?: number;
    /** Why the two markets were matched. */
    reasoning?: string | null;
}

/** @deprecated Use {@link MatchedMarketPair} instead. */
export type MatchedPricePair = MatchedMarketPair;

export interface FetchMatchedMarketsParams {
    minDifference?: number;
    category?: string;
    limit?: number;
    /** Comma-separated relation types to include (default: 'identity'). */
    relations?: MatchRelation[];
}

/** @deprecated Use {@link FetchMatchedMarketsParams} instead. */
export type FetchMatchedPricesParams = FetchMatchedMarketsParams;

export interface RouterMarketSearchParams {
    query?: string;
    sourceExchange?: string;
    category?: string;
    limit?: number;
    offset?: number;
    closed?: boolean;
}

export interface RouterEventSearchParams {
    query?: string;
    sourceExchange?: string;
    category?: string;
    limit?: number;
    offset?: number;
    closed?: boolean;
}
