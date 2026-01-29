import { MarketOutcome, UnifiedMarket } from '../types';

/**
 * Standardizes binary market outcomes into yes/no/up/down properties.
 */
export function addBinaryOutcomes(market: UnifiedMarket): void {
    const outcomes = market.outcomes;
    if (outcomes.length !== 2) return;

    const o1 = outcomes[0];
    const o2 = outcomes[1];
    const l1 = o1.label.toLowerCase();
    const l2 = o2.label.toLowerCase();

    // 1. Check for explicit opposites
    const isYes = (l: string) => l === 'yes' || l === 'up' || l === 'over';
    const isNo = (l: string) => l === 'no' || l === 'down' || l === 'under';

    if (isYes(l1) || isNo(l2)) {
        market.yes = o1;
        market.no = o2;
    } else if (isYes(l2) || isNo(l1)) {
        market.yes = o2;
        market.no = o1;
    }
    // 2. Check for "Not" pattern
    else if (l2.startsWith('not ')) {
        market.yes = o1;
        market.no = o2;
    } else if (l1.startsWith('not ')) {
        market.yes = o2;
        market.no = o1;
    }
    // 3. Fallback to indexing
    else {
        market.yes = o1;
        market.no = o2;
    }

    market.up = market.yes;
    market.down = market.no;
}
