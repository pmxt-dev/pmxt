import axios from 'axios';
import { MarketFilterParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { KALSHI_API_URL, KALSHI_SERIES_URL, mapMarketToUnified } from './utils';
import { kalshiErrorMapper } from './errors';

async function fetchActiveEvents(targetMarketCount?: number): Promise<any[]> {
    let allEvents: any[] = [];
    let totalMarketCount = 0;
    let cursor = null;
    let page = 0;

    // Note: Kalshi API uses cursor-based pagination which requires sequential fetching.
    // We cannot parallelize requests for a single list because we need the cursor from page N to fetch page N+1.
    // To optimize, we use the maximum allowed limit (200) and fetch until exhaustion.

    const MAX_PAGES = 1000; // Safety cap against infinite loops
    const BATCH_SIZE = 200; // Max limit per Kalshi API docs

    do {
        try {

            const queryParams: any = {
                limit: BATCH_SIZE,
                with_nested_markets: true,
                status: 'open' // Filter to open markets to improve relevance and speed
            };
            if (cursor) queryParams.cursor = cursor;

            const response = await axios.get(KALSHI_API_URL, { params: queryParams });
            const events = response.data.events || [];

            if (events.length === 0) break;

            allEvents = allEvents.concat(events);

            // Count markets in this batch for early termination
            if (targetMarketCount) {
                for (const event of events) {
                    totalMarketCount += (event.markets || []).length;
                }

                // Early termination: if we have enough markets, stop fetching
                // Use 1.5x multiplier to ensure we have enough for sorting/filtering
                if (totalMarketCount >= targetMarketCount * 1.5) {
                    break;
                }
            }

            cursor = response.data.cursor;
            page++;

            // Additional safety: if no target specified, limit to reasonable number of pages
            if (!targetMarketCount && page >= 10) {
                break;
            }

        } catch (e: any) {
            throw kalshiErrorMapper.mapError(e);
        }
    } while (cursor && page < MAX_PAGES);


    return allEvents;
}

async function fetchSeriesMap(): Promise<Map<string, string[]>> {
    try {

        const response = await axios.get(KALSHI_SERIES_URL);
        const seriesList = response.data.series || [];
        const map = new Map<string, string[]>();
        for (const series of seriesList) {
            if (series.tags && series.tags.length > 0) {
                map.set(series.ticker, series.tags);
            }
        }

        return map;
    } catch (e: any) {
        throw kalshiErrorMapper.mapError(e);
    }
}

// Simple in-memory cache to avoid redundant API calls within a short period
let cachedEvents: any[] | null = null;
let cachedSeriesMap: Map<string, string[]> | null = null;
let lastCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Export a function to reset the cache (useful for testing)
export function resetCache(): void {
    cachedEvents = null;
    cachedSeriesMap = null;
    lastCacheTime = 0;
}

export async function fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    const now = Date.now();

    try {
        let events: any[];
        let seriesMap: Map<string, string[]>;

        // Check if we have valid cached data
        if (cachedEvents && cachedSeriesMap && (now - lastCacheTime < CACHE_TTL)) {
            events = cachedEvents;
            seriesMap = cachedSeriesMap;
        } else {
            // Optimize fetch limit based on request parameters
            // If sorting is required (e.g. by volume), we need to fetch a larger set (or all) to sort correctly.
            // If no sorting is requested, we only need to fetch enough to satisfy the limit.
            const isSorted = params?.sort && (params.sort === 'volume' || params.sort === 'liquidity');
            const fetchLimit = isSorted ? 1000 : limit;

            const [allEvents, fetchedSeriesMap] = await Promise.all([
                fetchActiveEvents(fetchLimit),
                fetchSeriesMap()
            ]);

            events = allEvents;
            seriesMap = fetchedSeriesMap;

            events = allEvents;
            seriesMap = fetchedSeriesMap;

            // Cache the dataset ONLY if we fetched a comprehensive set (intended for global sorting/pagination)
            // If we only fetched a partial set (e.g. limit=5), we shouldn't cache it as the "full" logic assumes we have everything.
            if (fetchLimit >= 1000) {
                cachedEvents = allEvents;
                cachedSeriesMap = fetchedSeriesMap;
                lastCacheTime = now;
            }
        }

        // Extract ALL markets from all events
        const allMarkets: UnifiedMarket[] = [];
        // ... rest of the logic

        for (const event of events) {
            // Enrich event with tags from Series
            if (event.series_ticker && seriesMap.has(event.series_ticker)) {
                // If event has no tags or empty tags, use series tags
                if (!event.tags || event.tags.length === 0) {
                    event.tags = seriesMap.get(event.series_ticker);
                }
            }

            const markets = event.markets || [];
            for (const market of markets) {
                const unifiedMarket = mapMarketToUnified(event, market);
                if (unifiedMarket) {
                    allMarkets.push(unifiedMarket);
                }
            }
        }

        // Sort by 24h volume
        if (params?.sort === 'volume') {
            allMarkets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (params?.sort === 'liquidity') {
            allMarkets.sort((a, b) => b.liquidity - a.liquidity);
        }

        return allMarkets.slice(offset, offset + limit);

    } catch (error: any) {
        throw kalshiErrorMapper.mapError(error);
    }
}
