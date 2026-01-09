import axios from 'axios';
import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams } from '../BaseExchange';
import { UnifiedMarket, MarketOutcome, PriceCandle, CandleInterval, OrderBook, Trade } from '../types';

export class PolymarketExchange extends PredictionMarketExchange {
    get name(): string {
        return 'Polymarket';
    }

    // Utilizing the Gamma API for rich metadata and list view data
    private readonly baseUrl = 'https://gamma-api.polymarket.com/events';
    // CLOB API for orderbook, trades, and timeseries
    private readonly clobUrl = 'https://clob.polymarket.com';

    async fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
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
            const response = await axios.get(this.baseUrl, {
                params: queryParams
            });

            const events = response.data;
            const unifiedMarkets: UnifiedMarket[] = [];

            for (const event of events) {
                // Each event is a container (e.g. "US Election"). 
                // It contains specific "markets" (e.g. "Winner", "Pop Vote").
                if (!event.markets) continue;

                for (const market of event.markets) {
                    const outcomes: MarketOutcome[] = [];

                    // Polymarket Gamma often returns 'outcomes' and 'outcomePrices' as stringified JSON keys.
                    let outcomeLabels: string[] = [];
                    let outcomePrices: string[] = [];

                    try {
                        outcomeLabels = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : (market.outcomes || []);
                        outcomePrices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : (market.outcomePrices || []);
                    } catch (e) {

                    }

                    // Extract CLOB token IDs for granular operations
                    let clobTokenIds: string[] = [];
                    try {
                        clobTokenIds = typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : (market.clobTokenIds || []);
                    } catch (e) {

                    }

                    // Extract candidate/option name from market question for better outcome labels
                    let candidateName: string | null = null;
                    if (market.question && market.groupItemTitle) {
                        candidateName = market.groupItemTitle;
                    }

                    if (outcomeLabels.length > 0) {
                        outcomeLabels.forEach((label: string, index: number) => {
                            const rawPrice = outcomePrices[index] || "0";

                            // For Yes/No markets with specific candidates, use the candidate name
                            let outcomeLabel = label;
                            if (candidateName && label.toLowerCase() === 'yes') {
                                outcomeLabel = candidateName;
                            } else if (candidateName && label.toLowerCase() === 'no') {
                                outcomeLabel = `Not ${candidateName}`;
                            }

                            // 24h Price Change
                            // Polymarket API provides 'oneDayPriceChange' on the market object
                            let priceChange = 0;
                            if (index === 0 || label.toLowerCase() === 'yes' || (candidateName && label === candidateName)) {
                                priceChange = Number(market.oneDayPriceChange || 0);
                            }

                            outcomes.push({
                                id: clobTokenIds[index] || String(index), // Use CLOB Token ID as the primary ID
                                label: outcomeLabel,
                                price: parseFloat(rawPrice) || 0,
                                priceChange24h: priceChange,
                                metadata: {
                                    // clobTokenId is now the main ID, but keeping it in metadata for backward compat if needed
                                    clobTokenId: clobTokenIds[index]
                                }
                            });
                        });
                    }

                    unifiedMarkets.push({
                        id: market.id,
                        title: market.question ? `${event.title} - ${market.question}` : event.title,
                        description: market.description || event.description,
                        outcomes: outcomes,
                        resolutionDate: market.endDate ? new Date(market.endDate) : (market.end_date_iso ? new Date(market.end_date_iso) : new Date()),
                        volume24h: Number(market.volume24hr || market.volume_24h || 0),
                        volume: Number(market.volume || 0),
                        liquidity: Number(market.liquidity || market.rewards?.liquidity || 0),
                        openInterest: Number(market.openInterest || market.open_interest || 0),
                        url: `https://polymarket.com/event/${event.slug}`,
                        image: event.image || market.image || `https://polymarket.com/api/og?slug=${event.slug}`,
                        category: event.category || event.tags?.[0]?.label,
                        tags: event.tags?.map((t: any) => t.label) || []
                    });
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

        } catch (error) {
            console.error("Error fetching Polymarket data:", error);
            return [];
        }
    }

    async searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        // Polymarket Gamma API doesn't support native search
        // Fetch a larger batch and filter client-side
        const searchLimit = 100; // Fetch more markets to search through

        try {
            // Fetch markets with a higher limit
            const markets = await this.fetchMarkets({
                ...params,
                limit: searchLimit
            });

            // Client-side text filtering
            const lowerQuery = query.toLowerCase();
            const filtered = markets.filter(market =>
                market.title.toLowerCase().includes(lowerQuery) ||
                market.description.toLowerCase().includes(lowerQuery)
            );

            // Apply limit to filtered results
            const limit = params?.limit || 20;
            return filtered.slice(0, limit);

        } catch (error) {
            console.error("Error searching Polymarket data:", error);
            return [];
        }
    }

    /**
     * Fetch specific markets by their URL slug.
     * Useful for looking up a specific event from a URL.
     * @param slug - The event slug (e.g. "will-fed-cut-rates-in-march")
     */
    async getMarketsBySlug(slug: string): Promise<UnifiedMarket[]> {
        try {
            const response = await axios.get(this.baseUrl, {
                params: { slug: slug }
            });

            const events = response.data;
            if (!events || events.length === 0) return [];

            // We can reuse the logic from fetchMarkets if we extract it, 
            // but for now I'll duplicate the extraction logic to keep it self-contained
            // and avoid safe refactoring risks.
            // Actually, fetchMarkets is built to work with the Gamma response structure.
            // So we can manually map the response using the same logic.

            const unifiedMarkets: UnifiedMarket[] = [];

            for (const event of events) {
                if (!event.markets) continue;

                for (const market of event.markets) {
                    const outcomes: MarketOutcome[] = [];
                    let outcomeLabels: string[] = [];
                    let outcomePrices: string[] = [];
                    let clobTokenIds: string[] = [];

                    try {
                        outcomeLabels = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : (market.outcomes || []);
                        outcomePrices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : (market.outcomePrices || []);
                        clobTokenIds = typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : (market.clobTokenIds || []);
                    } catch (e) { /* ignore */ }

                    let candidateName = market.groupItemTitle;
                    if (!candidateName && market.question) candidateName = market.question;

                    if (outcomeLabels.length > 0) {
                        outcomeLabels.forEach((label: string, index: number) => {
                            let outcomeLabel = label;
                            // Clean up Yes/No labels if candidate name is available
                            if (candidateName && label.toLowerCase() === 'yes') outcomeLabel = candidateName;
                            else if (candidateName && label.toLowerCase() === 'no') outcomeLabel = `Not ${candidateName}`;

                            // 24h Price Change Logic
                            let priceChange = 0;
                            if (index === 0 || label.toLowerCase() === 'yes' || (candidateName && label === candidateName)) {
                                priceChange = Number(market.oneDayPriceChange || 0);
                            }

                            outcomes.push({
                                id: clobTokenIds[index] || String(index),
                                label: outcomeLabel,
                                price: parseFloat(outcomePrices[index] || "0") || 0,
                                priceChange24h: priceChange,
                                metadata: {
                                    clobTokenId: clobTokenIds[index]
                                }
                            });
                        });
                    }

                    unifiedMarkets.push({
                        id: market.id,
                        title: event.title,
                        description: market.description || event.description,
                        outcomes: outcomes,
                        resolutionDate: market.endDate ? new Date(market.endDate) : new Date(),
                        volume24h: Number(market.volume24hr || market.volume_24h || 0),
                        volume: Number(market.volume || 0),
                        liquidity: Number(market.liquidity || market.rewards?.liquidity || 0),
                        openInterest: Number(market.openInterest || market.open_interest || 0),
                        url: `https://polymarket.com/event/${event.slug}`,
                        image: event.image || market.image,
                        category: event.category || event.tags?.[0]?.label,
                        tags: event.tags?.map((t: any) => t.label) || []
                    });
                }
            }
            return unifiedMarkets;

        } catch (error) {
            console.error(`Error fetching Polymarket slug ${slug}:`, error);
            return [];
        }
    }

    /**
     * Map our generic CandleInterval to Polymarket's fidelity (in minutes)
     */
    private mapIntervalToFidelity(interval: CandleInterval): number {
        const mapping: Record<CandleInterval, number> = {
            '1m': 1,
            '5m': 5,
            '15m': 15,
            '1h': 60,
            '6h': 360,
            '1d': 1440
        };
        return mapping[interval];
    }

    /**
     * Fetch historical price data (OHLCV candles) for a specific token.
     * @param id - The CLOB token ID (e.g., outcome token ID)
     */
    async getMarketHistory(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
        // ID Validation: Polymarket CLOB requires a Token ID (long numeric string) not a Market ID
        if (id.length < 10 && /^\d+$/.test(id)) {
            throw new Error(`Invalid ID for Polymarket history: "${id}". You provided a Market ID, but Polymarket's CLOB API requires a Token ID. Ensure you are using 'outcome.id'.`);
        }

        try {
            const fidelity = this.mapIntervalToFidelity(params.resolution);
            const nowTs = Math.floor(Date.now() / 1000);

            // 1. Smart Lookback Calculation
            // If start/end not provided, calculate window based on limit * resolution
            let startTs = params.start ? Math.floor(params.start.getTime() / 1000) : 0;
            let endTs = params.end ? Math.floor(params.end.getTime() / 1000) : nowTs;

            if (!params.start) {
                // Default limit is usually 20 in the example, but safety margin is good.
                // If limit is not set, we default to 100 candles.
                const count = params.limit || 100;
                // fidelity is in minutes. 
                const durationSeconds = count * fidelity * 60;
                startTs = endTs - durationSeconds;
            }

            const queryParams: any = {
                market: id,
                fidelity: fidelity,
                startTs: startTs,
                endTs: endTs
            };

            const response = await axios.get(`${this.clobUrl}/prices-history`, {
                params: queryParams
            });

            const history = response.data.history || [];

            // 2. Align Timestamps (Snap to Grid)
            // Polymarket returns random tick timestamps (e.g. 1:00:21).
            // We want to normalize this to the start of the bucket (1:00:00).
            const resolutionMs = fidelity * 60 * 1000;

            const candles: PriceCandle[] = history.map((item: any) => {
                const rawMs = item.t * 1000;
                const snappedMs = Math.floor(rawMs / resolutionMs) * resolutionMs;

                return {
                    timestamp: snappedMs, // Aligned timestamp
                    open: item.p,
                    high: item.p,
                    low: item.p,
                    close: item.p,
                    volume: undefined
                };
            });

            // Apply limit if specified
            if (params.limit && candles.length > params.limit) {
                return candles.slice(-params.limit);
            }

            return candles;

        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                const apiError = error.response.data?.error || error.response.data?.message || "Unknown API Error";
                throw new Error(`Polymarket History API Error (${error.response.status}): ${apiError}. Used ID: ${id}`);
            }
            console.error(`Unexpected error fetching Polymarket history for ${id}:`, error);
            throw error;
        }
    }

    /**
     * Fetch the current order book for a specific token.
     * @param id - The CLOB token ID
     */
    async getOrderBook(id: string): Promise<OrderBook> {
        try {
            const response = await axios.get(`${this.clobUrl}/book`, {
                params: { token_id: id }
            });

            const data = response.data;

            // Response format: { bids: [{price: "0.52", size: "100"}], asks: [...] }
            const bids = (data.bids || []).map((level: any) => ({
                price: parseFloat(level.price),
                size: parseFloat(level.size)
            })).sort((a: { price: number, size: number }, b: { price: number, size: number }) => b.price - a.price); // Sort Bids Descending (Best/Highest first)

            const asks = (data.asks || []).map((level: any) => ({
                price: parseFloat(level.price),
                size: parseFloat(level.size)
            })).sort((a: { price: number, size: number }, b: { price: number, size: number }) => a.price - b.price); // Sort Asks Ascending (Best/Lowest first)

            return {
                bids,
                asks,
                timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now()
            };

        } catch (error) {
            console.error(`Error fetching Polymarket orderbook for ${id}:`, error);
            return { bids: [], asks: [] };
        }
    }

    /**
     * Fetch raw trade history for a specific token.
     * @param id - The CLOB token ID
     * 
     * NOTE: Polymarket's /trades endpoint currently requires L2 Authentication (API Key).
     * This method will return an empty array if an API key is not provided in headers.
     * Use getMarketHistory for public historical price data instead.
     */
    async getTradeHistory(id: string, params: HistoryFilterParams): Promise<Trade[]> {
        // ID Validation
        if (id.length < 10 && /^\d+$/.test(id)) {
            throw new Error(`Invalid ID for Polymarket trades: "${id}". You provided a Market ID, but Polymarket's CLOB API requires a Token ID.`);
        }

        try {
            const queryParams: any = {
                market: id
            };

            // Add time filters if provided
            if (params.start) {
                queryParams.after = Math.floor(params.start.getTime() / 1000);
            }
            if (params.end) {
                queryParams.before = Math.floor(params.end.getTime() / 1000);
            }

            const response = await axios.get(`${this.clobUrl}/trades`, {
                params: queryParams
            });

            // Response is an array of trade objects
            const trades = response.data || [];

            const mappedTrades: Trade[] = trades.map((trade: any) => ({
                id: trade.id || `${trade.timestamp}-${trade.price}`,
                timestamp: trade.timestamp * 1000, // Convert to milliseconds
                price: parseFloat(trade.price),
                amount: parseFloat(trade.size || trade.amount || 0),
                side: trade.side === 'BUY' ? 'buy' : trade.side === 'SELL' ? 'sell' : 'unknown'
            }));

            // Apply limit if specified
            if (params.limit && mappedTrades.length > params.limit) {
                return mappedTrades.slice(-params.limit); // Return most recent N trades
            }

            return mappedTrades;

        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                const apiError = error.response.data?.error || error.response.data?.message || "Unknown API Error";
                throw new Error(`Polymarket Trades API Error (${error.response.status}): ${apiError}. Used ID: ${id}`);
            }
            console.error(`Unexpected error fetching Polymarket trades for ${id}:`, error);
            throw error;
        }
    }
}
