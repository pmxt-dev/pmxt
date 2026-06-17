import { UnifiedMarket, MarketOutcome } from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';
import { HunchRawMarket } from './fetcher';

/**
 * Canonical Hunch agent-platform base URL. Reads are keyless (CORS `*`);
 * the trade route settles real Base USDC via x402 / EIP-3009.
 */
export const DEFAULT_BASE_URL = 'https://www.playhunch.xyz';

/** Base mainnet — the ONLY settlement chain on Hunch's agent rail. */
export const BASE_CHAIN_ID = 8453;

/** USDC on Base (the EIP-3009 `transferWithAuthorization` asset). */
export const BASE_USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

/**
 * Raw Hunch fields already promoted to first-class Unified columns — excluded
 * from `sourceMetadata` so we capture only what the unified shape would drop
 * (e.g. headline, deadlineLabel, feeRecipientLabel, defaultTicketUsd, links).
 */
export const HUNCH_PROMOTED_MARKET_KEYS = [
    'id',
    'slug',
    'question',
    'summary',
    'category',
    'tokenSymbol',
    'chainId',
    'deadlineAt',
    'status',
    'feeBps',
    'virtualLiquidityUsd',
    'volumeUsd',
    'targetMarketCapUsd',
    'outcomes',
] as const;

/**
 * Map a Hunch status (open / closed / resolved) to the pmxt unified lifecycle
 * vocabulary (active / inactive / closed). Unknown → 'active' (Hunch only lists
 * `open` markets when `status=open`, so this is defensive).
 */
export function mapHunchStatus(status: string | undefined): 'active' | 'inactive' | 'closed' {
    switch (status) {
        case 'open':
            return 'active';
        case 'closed':
            return 'inactive';
        case 'resolved':
        case 'voided':
            return 'closed';
        default:
            return 'active';
    }
}

/**
 * Translate the pmxt unified `status` filter into the Hunch `status` query
 * value. Hunch only accepts `open` | `all`; 'inactive'/'closed' have no live
 * listing, so they fold to `all` (the caller filters client-side afterwards).
 */
export function mapStatusToHunch(status?: string): 'open' | 'all' | undefined {
    if (!status) return undefined;
    switch (status) {
        case 'active':
            return 'open';
        case 'inactive':
        case 'closed':
        case 'all':
            return 'all';
        default:
            return undefined;
    }
}

/**
 * Compose an outcome id that round-trips back to a Hunch trade `side`.
 *
 * Encoding: `${marketId}:${side}` where `side` is `yes` | `no` for binary
 * markets, or the parimutuel bucket `key` (e.g. `le-330m`, `up`, `down`,
 * a date-window key) for N-way markets. `parseHunchSide()` reverses it.
 */
export function buildOutcomeId(marketId: string, side: string): string {
    return `${marketId}:${side}`;
}

/**
 * Reverse {@link buildOutcomeId}: pull the Hunch `side` token back out of a
 * unified `outcomeId`. The market id itself may contain a `:` is NOT a concern —
 * Hunch ids are slug-shaped (`[a-z0-9-]`), so the FIRST colon never appears
 * inside an id; we split on the LAST colon to be safe regardless.
 */
export function parseHunchSide(outcomeId: string): { marketId: string; side: string } {
    const idx = outcomeId.lastIndexOf(':');
    if (idx <= 0 || idx === outcomeId.length - 1) {
        // No separator — treat the whole thing as the side with no market id.
        return { marketId: '', side: outcomeId };
    }
    return {
        marketId: outcomeId.slice(0, idx),
        side: outcomeId.slice(idx + 1),
    };
}

/**
 * Shared market normalizer used by both the live fetch path and the (rare)
 * direct-mapping helper. Pulls a Hunch market ref into a {@link UnifiedMarket}.
 *
 * - Binary markets (`outcomes == null`) get YES/NO outcomes priced from `odds`
 *   when supplied (research/quote-derived), else flat 0 (the list endpoint
 *   does not carry live odds — they ride on the quote/research single-market
 *   reads, matching Myriad's "static on list, live on detail" model).
 * - N-way markets expand `outcomes[]` into one {@link MarketOutcome} per rung,
 *   carrying `impliedPct/100` as the price when a live ladder is supplied.
 *
 * `outcomeId` round-trips to a Hunch `side` (see {@link buildOutcomeId}).
 */
export function mapHunchMarketToUnified(
    raw: HunchRawMarket,
    odds?: { yesPriceCents: number | null; noPriceCents: number | null },
    ladder?: { outcomes: HunchLadderOutcome[] } | null,
): UnifiedMarket | null {
    if (!raw || !raw.id) return null;

    const marketId = raw.id;
    let outcomes: MarketOutcome[];

    if (Array.isArray(raw.outcomes) && raw.outcomes.length > 0) {
        // N-way parimutuel ladder / date-window market.
        const ladderByKey = new Map<string, HunchLadderOutcome>();
        for (const lo of ladder?.outcomes ?? []) ladderByKey.set(lo.key, lo);

        outcomes = raw.outcomes.map((o) => {
            const live = ladderByKey.get(o.key);
            const price = live && typeof live.impliedPct === 'number' ? live.impliedPct / 100 : 0;
            return {
                outcomeId: buildOutcomeId(marketId, o.key),
                marketId,
                label: o.label,
                price,
                metadata: {
                    key: o.key,
                    shortLabel: o.shortLabel,
                    lowerUsd: o.lowerUsd,
                    upperUsd: o.upperUsd,
                    startAt: o.startAt ?? null,
                    endAt: o.endAt ?? null,
                    backedUsd: live?.backedUsd ?? null,
                    isCurrent: live?.isCurrent ?? null,
                },
            };
        });
    } else {
        // Binary YES/NO market.
        const yesPrice = odds && typeof odds.yesPriceCents === 'number' ? odds.yesPriceCents / 100 : 0;
        const noPrice =
            odds && typeof odds.noPriceCents === 'number'
                ? odds.noPriceCents / 100
                : yesPrice > 0
                  ? 1 - yesPrice
                  : 0;
        outcomes = [
            { outcomeId: buildOutcomeId(marketId, 'yes'), marketId, label: 'Yes', price: yesPrice },
            { outcomeId: buildOutcomeId(marketId, 'no'), marketId, label: 'No', price: noPrice },
        ];
    }

    const um = {
        marketId,
        title: raw.question || raw.shortTitle || '',
        description: raw.summary || '',
        slug: raw.slug,
        outcomes,
        resolutionDate: raw.deadlineAt ? new Date(raw.deadlineAt) : undefined,
        // Hunch is parimutuel and reports no 24h volume split — surface 0.
        volume24h: 0,
        volume: typeof raw.volumeUsd === 'number' ? raw.volumeUsd : undefined,
        liquidity: Number(raw.virtualLiquidityUsd || 0),
        url: raw.links?.app || `${DEFAULT_BASE_URL}/markets/${raw.slug || marketId}`,
        category: raw.category,
        tags: raw.tokenSymbol ? [raw.tokenSymbol] : [],
        status: mapHunchStatus(raw.status),
        sourceMetadata: buildSourceMetadata(
            raw as unknown as Record<string, unknown>,
            HUNCH_PROMOTED_MARKET_KEYS,
        ),
    } as UnifiedMarket;

    // Standardize yes/no/up/down convenience accessors for binary markets.
    addBinaryOutcomes(um);
    return um;
}

/** Minimal live-ladder rung shape (mirrors AgentLadderOutcome) used for pricing. */
export interface HunchLadderOutcome {
    key: string;
    label: string;
    shortLabel: string;
    lowerUsd: number | null;
    upperUsd: number | null;
    startAt?: string | null;
    endAt?: string | null;
    impliedPct: number;
    backedUsd: number;
    isCurrent: boolean;
}
