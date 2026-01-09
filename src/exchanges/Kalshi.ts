import axios from 'axios';
import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams } from '../BaseExchange';
import { UnifiedMarket, MarketOutcome, PriceCandle, CandleInterval, OrderBook, Trade } from '../types';

export class KalshiExchange extends PredictionMarketExchange {
    get name(): string {
        return "Kalshi";
    }
    private baseUrl = "https://api.elections.kalshi.com/trade-api/v2/events";

    async fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        const limit = params?.limit || 50;

        try {
            // Fetch active events with nested markets
            // For small limits, we can optimize by fetching fewer pages
            const allEvents = await this.fetchActiveEvents(limit);

            // Extract ALL markets from all events
            const allMarkets: UnifiedMarket[] = [];

            for (const event of allEvents) {
                const markets = event.markets || [];
                for (const market of markets) {
                    const unifiedMarket = this.mapMarketToUnified(event, market);
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

            return allMarkets.slice(0, limit);

        } catch (error) {
            console.error("Error fetching Kalshi data:", error);
            return [];
        }
    }

    private async fetchActiveEvents(targetMarketCount?: number): Promise<any[]> {
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
                // console.log(`Fetching Kalshi page ${page + 1}...`);
                const queryParams: any = {
                    limit: BATCH_SIZE,
                    with_nested_markets: true,
                    status: 'open' // Filter to open markets to improve relevance and speed
                };
                if (cursor) queryParams.cursor = cursor;

                const response = await axios.get(this.baseUrl, { params: queryParams });
                const events = response.data.events || [];

                if (events.length === 0) break;

                allEvents = allEvents.concat(events);

                // Count markets in this batch for early termination
                if (targetMarketCount) {
                    for (const event of events) {
                        totalMarketCount += (event.markets || []).length;
                    }

                    // Early termination: if we have enough markets, stop fetching
                    if (totalMarketCount >= targetMarketCount * 2) {
                        break;
                    }
                }

                cursor = response.data.cursor;
                page++;



            } catch (e) {
                console.error(`Error fetching Kalshi page ${page}:`, e);
                break;
            }
        } while (cursor && page < MAX_PAGES);


        return allEvents;
    }

    private mapMarketToUnified(event: any, market: any): UnifiedMarket | null {
        if (!market) return null;

        // Calculate price
        let price = 0.5;
        if (market.last_price) {
            price = market.last_price / 100;
        } else if (market.yes_ask && market.yes_bid) {
            price = (market.yes_ask + market.yes_bid) / 200;
        } else if (market.yes_ask) {
            price = market.yes_ask / 100;
        }

        // Extract candidate name
        let candidateName: string | null = null;
        if (market.subtitle || market.yes_sub_title) {
            candidateName = market.subtitle || market.yes_sub_title;
        }

        // Calculate 24h change
        let priceChange = 0;
        if (market.previous_price_dollars !== undefined && market.last_price_dollars !== undefined) {
            priceChange = market.last_price_dollars - market.previous_price_dollars;
        }

        const outcomes: MarketOutcome[] = [
            {
                id: market.ticker, // The actual market ticker (primary tradeable)
                label: candidateName || 'Yes',
                price: price,
                priceChange24h: priceChange
            },
            {
                id: `${market.ticker}-NO`, // Virtual ID for the No outcome
                label: candidateName ? `Not ${candidateName}` : 'No',
                price: 1 - price,
                priceChange24h: -priceChange // Inverse change for No? simplified assumption
            }
        ];

        return {
            id: market.ticker,
            title: event.title,
            description: event.sub_title || market.subtitle || "",
            outcomes: outcomes,
            resolutionDate: new Date(market.expiration_time),
            volume24h: Number(market.volume_24h || market.volume || 0),
            volume: Number(market.volume || 0),
            liquidity: Number(market.liquidity || 0), // Kalshi 'liquidity' might need specific mapping if available, otherwise 0 to avoid conflation
            openInterest: Number(market.open_interest || 0),
            url: `https://kalshi.com/events/${event.event_ticker}`,
            category: event.category,
            tags: event.tags || []
        };
    }

    async searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        // We must fetch ALL markets to search them locally since we don't have server-side search
        const fetchLimit = 100000;
        try {
            const markets = await this.fetchMarkets({ ...params, limit: fetchLimit });
            const lowerQuery = query.toLowerCase();
            const filtered = markets.filter(market =>
                market.title.toLowerCase().includes(lowerQuery) ||
                market.description.toLowerCase().includes(lowerQuery)
            );
            const limit = params?.limit || 20;
            return filtered.slice(0, limit);
        } catch (error) {
            console.error("Error searching Kalshi data:", error);
            return [];
        }
    }

    /**
     * Fetch specific markets by their event ticker.
     * Useful for looking up a specific event from a URL.
     * @param eventTicker - The event ticker (e.g. "FED-25JAN" or "PRES-2024")
     */
    async getMarketsBySlug(eventTicker: string): Promise<UnifiedMarket[]> {
        try {
            // Kalshi API expects uppercase tickers, but URLs use lowercase
            const normalizedTicker = eventTicker.toUpperCase();
            const url = `https://api.elections.kalshi.com/trade-api/v2/events/${normalizedTicker}`;
            const response = await axios.get(url, {
                params: { with_nested_markets: true }
            });

            const event = response.data.event;
            if (!event) return [];

            const unifiedMarkets: UnifiedMarket[] = [];
            const markets = event.markets || [];

            for (const market of markets) {
                const unifiedMarket = this.mapMarketToUnified(event, market);
                if (unifiedMarket) {
                    unifiedMarkets.push(unifiedMarket);
                }
            }

            return unifiedMarkets;

        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                if (error.response.status === 404) {
                    throw new Error(`Kalshi event not found: "${eventTicker}". Check that the event ticker is correct.`);
                }
                const apiError = error.response.data?.error || error.response.data?.message || "Unknown API Error";
                throw new Error(`Kalshi API Error (${error.response.status}): ${apiError}. Event Ticker: ${eventTicker}`);
            }
            console.error(`Unexpected error fetching Kalshi event ${eventTicker}:`, error);
            throw error;
        }
    }

    private mapIntervalToKalshi(interval: CandleInterval): number {
        const mapping: Record<CandleInterval, number> = {
            '1m': 1,
            '5m': 1,
            '15m': 1,
            '1h': 60,
            '6h': 60,
            '1d': 1440
        };
        return mapping[interval];
    }

    async getMarketHistory(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
        try {
            // Kalshi API expects uppercase tickers
            // Handle virtual "-NO" suffix by stripping it (fetching the underlying market history)
            const cleanedId = id.replace(/-NO$/, '');
            const normalizedId = cleanedId.toUpperCase();
            const interval = this.mapIntervalToKalshi(params.resolution);

            // Heuristic for series_ticker
            const parts = normalizedId.split('-');
            if (parts.length < 2) {
                throw new Error(`Invalid Kalshi Ticker format: "${id}". Expected format like "FED-25JAN29-B4.75".`);
            }
            const seriesTicker = parts.slice(0, -1).join('-');
            const url = `https://api.elections.kalshi.com/trade-api/v2/series/${seriesTicker}/markets/${normalizedId}/candlesticks`;

            const queryParams: any = { period_interval: interval };

            const now = Math.floor(Date.now() / 1000);
            let startTs = now - (24 * 60 * 60);
            let endTs = now;

            if (params.start) {
                startTs = Math.floor(params.start.getTime() / 1000);
            }
            if (params.end) {
                endTs = Math.floor(params.end.getTime() / 1000);
                if (!params.start) {
                    startTs = endTs - (24 * 60 * 60);
                }
            }

            queryParams.start_ts = startTs;
            queryParams.end_ts = endTs;

            const response = await axios.get(url, { params: queryParams });
            const candles = response.data.candlesticks || [];

            const mappedCandles: PriceCandle[] = candles.map((c: any) => ({
                timestamp: c.end_period_ts * 1000,
                open: (c.price.open || 0) / 100,
                high: (c.price.high || 0) / 100,
                low: (c.price.low || 0) / 100,
                close: (c.price.close || 0) / 100,
                volume: c.volume
            }));

            if (params.limit && mappedCandles.length > params.limit) {
                return mappedCandles.slice(-params.limit);
            }
            return mappedCandles;
        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                const apiError = error.response.data?.error || error.response.data?.message || "Unknown API Error";
                throw new Error(`Kalshi History API Error (${error.response.status}): ${apiError}. Used Ticker: ${id}`);
            }
            console.error(`Unexpected error fetching Kalshi history for ${id}:`, error);
            throw error;
        }
    }

    async getOrderBook(id: string): Promise<OrderBook> {
        try {
            const ticker = id.replace(/-NO$/, '');
            const url = `https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}/orderbook`;
            const response = await axios.get(url);
            const data = response.data.orderbook;

            // Structure: { yes: [[price, qty], ...], no: [[price, qty], ...] }
            const bids = (data.yes || []).map((level: number[]) => ({
                price: level[0] / 100,
                size: level[1]
            }));

            const asks = (data.no || []).map((level: number[]) => ({
                price: (100 - level[0]) / 100,
                size: level[1]
            }));

            // Sort bids desc, asks asc
            bids.sort((a: any, b: any) => b.price - a.price);
            asks.sort((a: any, b: any) => a.price - b.price);

            return { bids, asks, timestamp: Date.now() };
        } catch (error) {
            console.error(`Error fetching Kalshi orderbook for ${id}:`, error);
            return { bids: [], asks: [] };
        }
    }

    async getTradeHistory(id: string, params: HistoryFilterParams): Promise<Trade[]> {
        try {
            const ticker = id.replace(/-NO$/, '');
            const url = `https://api.elections.kalshi.com/trade-api/v2/markets/trades`;
            const response = await axios.get(url, {
                params: {
                    ticker: ticker,
                    limit: params.limit || 100
                }
            });
            const trades = response.data.trades || [];

            return trades.map((t: any) => ({
                id: t.trade_id,
                timestamp: new Date(t.created_time).getTime(),
                price: t.yes_price / 100,
                amount: t.count,
                side: t.taker_side === 'yes' ? 'buy' : 'sell'
            }));
        } catch (error) {
            console.error(`Error fetching Kalshi trades for ${id}:`, error);
            return [];
        }
    }
}
