import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../types';
import axios from 'axios';
import { GAMMA_API_URL, mapMarketToUnified } from './utils';
import { polymarketErrorMapper } from './errors';

export async function fetchEvents(params: EventFetchParams): Promise<UnifiedEvent[]> {
    const searchLimit = 100000; // Fetch all events for comprehensive search

    try {
        // Fetch events from Gamma API
        const response = await axios.get(GAMMA_API_URL, {
            params: {
                active: 'true',
                closed: 'false',
                limit: searchLimit
            }
        });

        const events = response.data || [];

        // Client-side text filtering
        const lowerQuery = (params?.query || '').toLowerCase();
        const searchIn = params?.searchIn || 'title';

        const filtered = events.filter((event: any) => {
            const titleMatch = (event.title || '').toLowerCase().includes(lowerQuery);
            const descMatch = (event.description || '').toLowerCase().includes(lowerQuery);

            if (searchIn === 'title') return titleMatch;
            if (searchIn === 'description') return descMatch;
            return titleMatch || descMatch;
        });

        // Map to UnifiedEvent
        const unifiedEvents: UnifiedEvent[] = filtered.map((event: any) => {
            const markets: UnifiedMarket[] = [];

            if (event.markets) {
                for (const market of event.markets) {
                    const unifiedMarket = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
                    if (unifiedMarket) {
                        markets.push(unifiedMarket);
                    }
                }
            }

            const unifiedEvent: UnifiedEvent = {
                id: event.id || event.slug,
                title: event.title,
                description: event.description || '',
                slug: event.slug,
                markets: markets,
                url: `https://polymarket.com/event/${event.slug}`,
                image: event.image || `https://polymarket.com/api/og?slug=${event.slug}`,
                category: event.category || event.tags?.[0]?.label,
                tags: event.tags?.map((t: any) => t.label) || [],
                searchMarkets: function (marketQuery: string): UnifiedMarket[] {
                    const lowerMarketQuery = marketQuery.toLowerCase();
                    return this.markets.filter(m =>
                        m.title.toLowerCase().includes(lowerMarketQuery) ||
                        m.description.toLowerCase().includes(lowerMarketQuery) ||
                        m.outcomes.some(o => o.label.toLowerCase().includes(lowerMarketQuery))
                    );
                }
            };

            return unifiedEvent;
        });

        // Apply limit to filtered results
        const limit = params?.limit || 20;
        return unifiedEvents.slice(0, limit);

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
