import { UnifiedMarket, PriceCandle, CandleInterval, OrderBook, Trade } from './types';

export interface MarketFilterParams {
    limit?: number;
    offset?: number;
    sort?: 'volume' | 'liquidity' | 'newest';
    searchIn?: 'title' | 'description' | 'both'; // Where to search (default: 'title')
}

export interface HistoryFilterParams {
    resolution: CandleInterval;
    start?: Date;
    end?: Date;
    limit?: number;
}

// ----------------------------------------------------------------------------
// Base Exchange Class
// ----------------------------------------------------------------------------

export abstract class PredictionMarketExchange {
    abstract get name(): string;

    /**
     * Fetch all relevant markets from the source.
     */
    abstract fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]>;

    /**
     * Search for markets matching a keyword query.
     * By default, searches only in market titles. Use params.searchIn to search descriptions or both.
     */
    abstract searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]>;

    /**
     * Fetch historical price data for a specific market outcome.
     * @param id - The Outcome ID (MarketOutcome.id). This should be the ID of the specific tradeable asset.
     */
    async fetchOHLCV(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
        throw new Error("Method fetchOHLCV not implemented.");
    }

    /**
     * Fetch the current order book (bids/asks) for a specific outcome.
     * Essential for calculating localized spread and depth.
     */
    async fetchOrderBook(id: string): Promise<OrderBook> {
        throw new Error("Method fetchOrderBook not implemented.");
    }

    /**
     * Fetch raw trade history.
     * Useful for generating synthetic OHLCV candles if the exchange doesn't provide them natively.
     */
    async fetchTrades(id: string, params: HistoryFilterParams): Promise<Trade[]> {
        throw new Error("Method fetchTrades not implemented.");
    }
}
