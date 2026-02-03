import axios from 'axios';
import { UnifiedMarket } from '../../types';
import { GAMMA_API_URL, mapMarketToUnified } from './utils';
import { polymarketErrorMapper } from './errors';

/**
 * Fetch specific markets by their URL slug.
 * Useful for looking up a specific event from a URL.
 * @param slug - The event slug (e.g. "will-fed-cut-rates-in-march")
 */
export async function getMarketsBySlug(slug: string): Promise<UnifiedMarket[]> {
    try {
        const response = await axios.get(GAMMA_API_URL, {
            params: { slug: slug }
        });

        const events = response.data;
        if (!events || events.length === 0) return [];

        const unifiedMarkets: UnifiedMarket[] = [];

        for (const event of events) {
            if (!event.markets) continue;

            for (const market of event.markets) {
                const unifiedMarket = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
                if (unifiedMarket) {
                    unifiedMarkets.push(unifiedMarket);
                }
            }
        }
        return unifiedMarkets;

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
