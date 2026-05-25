const MARKET_PREFIX = 'suibets:';

/**
 * Build a unique market ID from a SuiBets offer ID.
 * Format: "suibets:{offerId}"
 */
export function toMarketId(offerId: string): string {
    return `${MARKET_PREFIX}${offerId}`;
}

/**
 * Extract the offer ID from a SuiBets market ID.
 * Throws if the ID does not carry the expected prefix.
 */
export function fromMarketId(marketId: string): string {
    if (!marketId.startsWith(MARKET_PREFIX)) {
        throw new Error(`Invalid SuiBets market ID: ${marketId}`);
    }
    return marketId.slice(MARKET_PREFIX.length);
}

/**
 * Build an outcome ID that encodes both the offer ID and the side.
 * Format: "{offerId}:{side}"
 */
export function toOutcomeId(offerId: string, side: 'creator' | 'taker'): string {
    return `${offerId}:${side}`;
}

/**
 * Decode an outcome ID back into offerId and side.
 * Throws if the format is unrecognised or the side is invalid.
 */
export function fromOutcomeId(outcomeId: string): { offerId: string; side: 'creator' | 'taker' } {
    const lastColon = outcomeId.lastIndexOf(':');
    if (lastColon === -1) {
        throw new Error(`Invalid SuiBets outcome ID: ${outcomeId}`);
    }
    const offerId = outcomeId.slice(0, lastColon);
    const side = outcomeId.slice(lastColon + 1);
    if (side !== 'creator' && side !== 'taker') {
        throw new Error(`Invalid side in SuiBets outcome ID: ${outcomeId}`);
    }
    if (!offerId) {
        throw new Error(`Invalid SuiBets outcome ID (empty offerId): ${outcomeId}`);
    }
    return { offerId, side };
}

/**
 * Map raw SuiBets offer statuses to the pmxt unified status vocabulary.
 *
 *   OPEN      -> active
 *   MATCHED   -> matched
 *   SETTLED   -> settled
 *   EXPIRED   -> expired
 *   CANCELLED -> cancelled
 *   (other)   -> inactive
 */
export function mapStatus(rawStatus: string): string {
    switch (rawStatus) {
        case 'OPEN':      return 'active';
        case 'MATCHED':   return 'matched';
        case 'SETTLED':   return 'settled';
        case 'EXPIRED':   return 'expired';
        case 'CANCELLED': return 'cancelled';
        default:          return 'inactive';
    }
}

/**
 * Convert decimal odds to an implied probability clamped to [0.01, 0.99].
 *
 * Throws if odds are zero or negative.
 * Throws if odds are less than 1 (invalid — a payout below stake).
 * When odds === 1 (evens), returns 0.99 (clamped maximum).
 */
export function impliedProbability(decimalOdds: number): number {
    if (decimalOdds <= 0) {
        throw new Error(`Decimal odds must be positive, got: ${decimalOdds}`);
    }
    if (decimalOdds < 1) {
        throw new Error(`Decimal odds below 1 are invalid, got: ${decimalOdds}`);
    }
    const raw = 1 / decimalOdds;
    return Math.min(0.99, Math.max(0.01, raw));
}

/**
 * Implied probability for the taker side: 1 - impliedProbability(odds),
 * clamped to [0.01, 0.99].
 */
export function takerProbability(decimalOdds: number): number {
    return Math.min(0.99, Math.max(0.01, 1 - impliedProbability(decimalOdds)));
}

/**
 * Convert an amount denominated in MIST (the smallest SUI unit, 1e-9 SUI)
 * to SUI by dividing by 1e9.
 */
export function mistToSui(mist: number | string): number {
    return Number(mist) / 1e9;
}

/**
 * Return the human-readable team name for the given side of a P2P offer.
 *
 * Creator side: the team the creator bet on (creatorTeam, falling back to homeTeam).
 * Taker side: the opposite team.
 */
export function sideLabel(
    offer: { creatorTeam?: string; homeTeam?: string; awayTeam?: string },
    side: 'creator' | 'taker',
): string {
    const creator = offer.creatorTeam || offer.homeTeam || 'Home';
    const away = offer.awayTeam || 'Away';
    if (side === 'creator') return creator;
    // Taker takes the opposite side
    if (creator.toLowerCase() === offer.homeTeam?.toLowerCase()) return away;
    if (creator.toLowerCase() === offer.awayTeam?.toLowerCase()) return offer.homeTeam || 'Home';
    return 'Opposite';
}
