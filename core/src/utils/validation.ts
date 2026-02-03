import { ValidationError } from '../errors';

/**
 * Validates that the provided ID is an outcomeId (not marketId)
 * Provides helpful error messages mentioning deprecation
 */
export function validateOutcomeId(id: string, context: string): void {
    // Polymarket: CLOB Token IDs are long (>= 10 digits)
    // Market IDs are shorter
    if (id.length < 10 && /^\d+$/.test(id)) {
        throw new ValidationError(
            `Invalid ID for ${context}: "${id}". ` +
            `This appears to be a market ID (deprecated: market.id, use: market.marketId). ` +
            `Please use outcome ID (preferred: outcome.outcomeId, deprecated: outcome.id).`,
            'id'
        );
    }
}

export function validateIdFormat(id: string, context: string): void {
    if (!id || id.trim().length === 0) {
        throw new ValidationError(
            `Invalid ID for ${context}: ID cannot be empty`,
            'id'
        );
    }
}
