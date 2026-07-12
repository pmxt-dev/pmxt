import {
    OUTCOME_ASSET_BASE,
    OUTCOME_MULTIPLIER,
    SIDE_YES,
    SIDE_NO,
} from './config';

/**
 * Encode an outcome ID and side into a Hyperliquid asset ID.
 *
 * Formula: 100_000_000 + (10 * outcomeId) + side
 * where side = 0 (Yes) or 1 (No).
 */
export function encodeAssetId(outcomeId: number, side: 'yes' | 'no'): number {
    const sideValue = side === 'yes' ? SIDE_YES : SIDE_NO;
    return OUTCOME_ASSET_BASE + (OUTCOME_MULTIPLIER * outcomeId) + sideValue;
}

/**
 * Decode a Hyperliquid asset ID back into outcome ID and side.
 */
export function decodeAssetId(assetId: number): { outcomeId: number; side: 'yes' | 'no' } {
    const offset = assetId - OUTCOME_ASSET_BASE;
    const sideValue = offset % OUTCOME_MULTIPLIER;
    const outcomeId = (offset - sideValue) / OUTCOME_MULTIPLIER;
    return {
        outcomeId,
        side: sideValue === SIDE_YES ? 'yes' : 'no',
    };
}

/**
 * Convert an outcome ID and side to the Hyperliquid coin notation (#encoding).
 *
 * Example: outcome 1, Yes -> "#10"
 */
export function toCoinNotation(outcomeId: number, side: 'yes' | 'no'): string {
    const encoding = OUTCOME_MULTIPLIER * outcomeId + (side === 'yes' ? SIDE_YES : SIDE_NO);
    return `#${encoding}`;
}

/**
 * Convert an asset encoding (the number after #) to outcome ID and side.
 */
export function fromCoinEncoding(encoding: number): { outcomeId: number; side: 'yes' | 'no' } {
    const sideValue = encoding % OUTCOME_MULTIPLIER;
    const outcomeId = (encoding - sideValue) / OUTCOME_MULTIPLIER;
    return {
        outcomeId,
        side: sideValue === SIDE_YES ? 'yes' : 'no',
    };
}

/**
 * Convert an outcome ID to the allMids lookup key.
 *
 * The allMids endpoint keys prediction-market outcomes as "@{outcomeId}"
 * (e.g. "@8"), which is distinct from the "#encoding" coin notation used
 * for orders and positions.
 */
export function toMidKey(outcomeId: number): string {
    return `@${outcomeId}`;
}

/**
 * Build a unique market ID string from an outcome.
 * We use "hl-outcome-{outcomeId}" as the market ID.
 */
export function toMarketId(outcomeId: number): string {
    return `hl-outcome-${outcomeId}`;
}

/**
 * Extract the numeric outcome ID from a Hyperliquid identifier.
 *
 * Accepts either:
 *   - our canonical market ID, "hl-outcome-{N}"
 *   - a raw encoded asset token (numeric string >= OUTCOME_ASSET_BASE),
 *     as returned in UnifiedMarket.outcomes[].outcomeId. Decoded via
 *     decodeAssetId so callers can pass an outcome token directly.
 */
export function fromMarketId(marketId: string): number {
    const match = marketId.match(/^hl-outcome-(\d+)$/);
    if (match) {
        return parseInt(match[1], 10);
    }
    if (/^\d+$/.test(marketId)) {
        const assetId = parseInt(marketId, 10);
        if (assetId >= OUTCOME_ASSET_BASE) {
            return decodeAssetId(assetId).outcomeId;
        }
    }
    throw new Error(`Invalid Hyperliquid market ID: ${marketId}`);
}

/**
 * Build an outcome ID string for the unified type.
 * Format: "{assetId}" which is the full numeric asset ID.
 */
export function toOutcomeId(outcomeId: number, side: 'yes' | 'no'): string {
    return String(encodeAssetId(outcomeId, side));
}
