import { MarketFetchParams } from '../../BaseExchange';
import { BaseError } from '../../errors';
import { UnifiedMarket } from '../../types';
import { GaduinMarket, mapMarketToUnified } from './utils';

type CallApi = (operationId: string, params?: Record<string, any>) => Promise<any>;

// API-key reads are refused above 100 rows per page.
const PAGE_MAX = 100;

function toApiStatuses(status?: string): (string | undefined)[] {
    if (status === 'all') return [undefined];
    if (status === 'closed' || status === 'inactive') return ['CLOSED', 'SETTLED'];
    return ['OPEN'];
}

export async function fetchMarkets(
    params: MarketFetchParams | undefined,
    callApi: CallApi,
): Promise<UnifiedMarket[]> {
    // GET /markets/{id} accepts a market UUID or slug.
    const id = params?.marketId ?? params?.slug ?? params?.outcomeId?.replace(/:\d+$/, '');
    if (id) {
        try {
            const data = await callApi('GetMarket', { id });
            return [mapMarketToUnified(data.market)];
        } catch (error) {
            if (error instanceof BaseError && error.status === 404) return [];
            throw error;
        }
    }
    // GADUIN has no event tier.
    if (params?.eventId) return [];

    const limit = Math.min(params?.limit ?? PAGE_MAX, PAGE_MAX);
    const pages = await Promise.all(
        toApiStatuses(params?.status).map((status) =>
            callApi('GetMarkets', {
                status,
                limit,
                sort: status === 'OPEN' ? 'close_asc' : 'close_desc',
            }),
        ),
    );
    const markets = pages.flatMap((page) => page.markets as GaduinMarket[]).map(mapMarketToUnified);

    // No server-side keyword search: match the question text of the fetched page.
    const query = params?.query?.toLowerCase();
    return query ? markets.filter((m) => m.title.toLowerCase().includes(query)) : markets;
}
