import axios from 'axios';
import { MarketFilterParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { GAMMA_API_URL, mapMarketToUnified } from './utils';
import { polymarketErrorMapper } from './errors';

export async function fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 200;  // Higher default for better coverage
    const offset = params?.offset || 0;

    // Map generic sort params to Polymarket Gamma API params
    let queryParams: any = {
        active: 'true',
        closed: 'false',
        limit: limit,
        offset: offset,
    };

    // Gamma API uses 'order' and 'ascending' for sorting
    if (params?.sort === 'volume') {
        queryParams.order = 'volume';
        queryParams.ascending = 'false';
    } else if (params?.sort === 'newest') {
        queryParams.order = 'startDate';
        queryParams.ascending = 'false';
    } else if (params?.sort === 'liquidity') {
        // queryParams.order = 'liquidity';
    } else {
        // Default: do not send order param to avoid 422
    }

    try {
        // Fetch active events from Gamma
        const response = await axios.get(GAMMA_API_URL, {
            params: queryParams
        });

        const events = response.data;
        const unifiedMarkets: UnifiedMarket[] = [];

        for (const event of events) {
            // Each event is a container (e.g. "US Election").
            // It contains specific "markets" (e.g. "Winner", "Pop Vote").
            if (!event.markets) continue;

            for (const market of event.markets) {
                const unifiedMarket = mapMarketToUnified(event, market);
                if (unifiedMarket) {
                    unifiedMarkets.push(unifiedMarket);
                }
            }
        }

        // Client-side Sort capability to ensure contract fulfillment
        // Often API filters are "good effort" or apply to the 'event' but not the 'market'
        if (params?.sort === 'volume') {
            unifiedMarkets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (params?.sort === 'newest') {
            // unifiedMarkets.sort((a, b) => b.resolutionDate.getTime() - a.resolutionDate.getTime()); // Not quite 'newest'
        } else if (params?.sort === 'liquidity') {
            unifiedMarkets.sort((a, b) => b.liquidity - a.liquidity);
        } else {
            // Default volume sort
            unifiedMarkets.sort((a, b) => b.volume24h - a.volume24h);
        }

        // Respect limit strictly after flattening
        return unifiedMarkets.slice(0, limit);

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
