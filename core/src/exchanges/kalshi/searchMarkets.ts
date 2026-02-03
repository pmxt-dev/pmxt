import { MarketFilterParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { fetchMarkets as fetchMarketsFn } from './fetchMarkets';
import { kalshiErrorMapper } from './errors';

export async function searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]> {
    // We must fetch ALL markets to search them locally since we don't have server-side search
    const searchLimit = 5000;
    try {
        const markets = await fetchMarketsFn({ ...params, limit: searchLimit });
        const lowerQuery = query.toLowerCase();
        const searchIn = params?.searchIn || 'title'; // Default to title-only search

        const filtered = markets.filter(market => {
            const titleMatch = (market.title || '').toLowerCase().includes(lowerQuery);
            const descMatch = (market.description || '').toLowerCase().includes(lowerQuery);

            if (searchIn === 'title') return titleMatch;
            if (searchIn === 'description') return descMatch;
            return titleMatch || descMatch; // 'both'
        });

        const limit = params?.limit || 20;
        return filtered.slice(0, limit);
    } catch (error: any) {
        throw kalshiErrorMapper.mapError(error);
    }
}
