import axios from 'axios';
import { MarketFilterParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { LIMITLESS_API_URL, mapMarketToUnified } from './utils';
import { limitlessErrorMapper } from './errors';

export async function searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]> {
    try {
        const response = await axios.get(`${LIMITLESS_API_URL}/markets/search`, {
            params: {
                query: query,
                limit: params?.limit || 20
            }
        });

        const rawResults = response.data?.markets || [];
        const allMarkets: UnifiedMarket[] = [];

        for (const res of rawResults) {
            if (res.markets && Array.isArray(res.markets)) {
                // It's a group market, extract individual markets
                for (const child of res.markets) {
                    const mapped = mapMarketToUnified(child);
                    if (mapped) allMarkets.push(mapped);
                }
            } else {
                const mapped = mapMarketToUnified(res);
                if (mapped) allMarkets.push(mapped);
            }
        }

        return allMarkets
            .filter((m: any): m is UnifiedMarket => m !== null && m.outcomes.length > 0)
            .slice(0, params?.limit || 20);

    } catch (error: any) {
        throw limitlessErrorMapper.mapError(error);
    }
}
