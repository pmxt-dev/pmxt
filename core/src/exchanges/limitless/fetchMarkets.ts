import axios from 'axios';
import { MarketFilterParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { LIMITLESS_API_URL, mapMarketToUnified } from './utils';
import { limitlessErrorMapper } from './errors';

export async function fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 200;
    const offset = params?.offset || 0;

    // The new API endpoint is /markets/active
    const url = `${LIMITLESS_API_URL}/markets/active`;

    try {
        const response = await axios.get(url);
        const markets = response.data?.data || response.data;

        if (!markets || !Array.isArray(markets)) {
            return [];
        }

        const unifiedMarkets: UnifiedMarket[] = [];

        for (const market of markets) {
            const unifiedMarket = mapMarketToUnified(market);
            // Only include markets that are valid and have outcomes (compliance requirement)
            if (unifiedMarket && unifiedMarket.outcomes.length > 0) {
                unifiedMarkets.push(unifiedMarket);
            }
        }

        // Apply filtering if needed (e.g. by category or volume)
        // Note: The new API returns ~350 markets, so we can filter and sort locally

        if (params?.sort === 'volume') {
            unifiedMarkets.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
        } else {
            // Default volume sort
            unifiedMarkets.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
        }

        return unifiedMarkets.slice(offset, offset + limit);

    } catch (error: any) {
        throw limitlessErrorMapper.mapError(error);
    }
}
