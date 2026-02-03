import { MarketFilterParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { fetchMarkets as fetchMarketsFn } from './fetchMarkets';
import { polymarketErrorMapper } from './errors';

export async function searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]> {
    // Polymarket Gamma API doesn't support native search
    // Fetch all active markets and filter client-side
    const searchLimit = 5000; // Fetch enough markets for a good search pool

    try {
        // Fetch markets with a higher limit
        const markets = await fetchMarketsFn({
            ...params,
            limit: searchLimit
        });

        // Client-side text filtering
        const lowerQuery = query.toLowerCase();
        const searchIn = params?.searchIn || 'title'; // Default to title-only search

        const filtered = markets.filter(market => {
            const titleMatch = (market.title || '').toLowerCase().includes(lowerQuery);
            const descMatch = (market.description || '').toLowerCase().includes(lowerQuery);

            if (searchIn === 'title') return titleMatch;
            if (searchIn === 'description') return descMatch;
            return titleMatch || descMatch; // 'both'
        });

        // Apply limit to filtered results
        const limit = params?.limit || 20;
        return filtered.slice(0, limit);

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
