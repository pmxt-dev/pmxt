import { Ticker, Tickers, OHLCV, OrderBook, Market, FundingRate, FundingRates, OracleRound, OracleParams, Dictionary } from './types';

// ----------------------------------------------------------------------------
// Data Feed Interface — CCXT-compatible method signatures.
// ----------------------------------------------------------------------------

export type DataFeedCapability =
    | 'loadMarkets'
    | 'fetchTicker'
    | 'fetchTickers'
    | 'watchTicker'
    | 'fetchOHLCV'
    | 'fetchOrderBook'
    | 'watchOrderBook'
    | 'fetchFundingRate'
    | 'fetchFundingRates'
    | 'fetchOracleRound'
    | 'fetchOracleHistory'
    | 'fetchHistoricalPrices';

export type DataFeedCapabilityValue = true | false | 'emulated';
export type DataFeedCapabilities = Readonly<Partial<Record<DataFeedCapability, DataFeedCapabilityValue>>>;

export interface IDataFeed {
    readonly name: string;
    readonly description: string;
    readonly has?: DataFeedCapabilities;

    // -- CCXT unified methods --

    loadMarkets(reload?: boolean): Promise<Dictionary<Market>>;
    fetchTicker(symbol: string): Promise<Ticker>;
    fetchTickers(symbols?: string[]): Promise<Tickers>;
    watchTicker(symbol: string, callback: (ticker: Ticker) => void): () => void;
    fetchOHLCV(symbol: string, timeframe?: string, since?: number, limit?: number): Promise<OHLCV[]>;
    fetchOrderBook?(symbol: string, limit?: number): Promise<OrderBook>;
    watchOrderBook?(symbol: string, callback: (book: OrderBook) => void): () => void;
    fetchFundingRate?(symbol: string): Promise<FundingRate>;
    fetchFundingRates?(symbols?: string[]): Promise<FundingRates>;

    // -- pmxt extensions (no CCXT equivalent) --

    fetchOracleRound?(params: OracleParams): Promise<OracleRound>;
    fetchOracleHistory?(params: OracleParams): Promise<OracleRound[]>;
    fetchHistoricalPrices?(
        symbol: string,
        opts?: {
            fromTimestamp?: number;
            untilTimestamp?: number;
            maxSize?: number;
            order?: 'asc' | 'desc';
        },
    ): Promise<Ticker[]>;

    // -- Lifecycle --

    connect?(): Promise<void>;
    close?(): Promise<void>;
}

// ----------------------------------------------------------------------------
// Feed Normalizer — maps raw provider responses to unified types.
// ----------------------------------------------------------------------------

export interface IFeedNormalizer<TRawTick = unknown, TRawCandle = unknown, TRawBook = unknown> {
    normalizeTicker(raw: TRawTick): Ticker;
    normalizeOHLCV?(raw: TRawCandle): OHLCV;
    normalizeOrderBook?(raw: TRawBook): OrderBook;
}
