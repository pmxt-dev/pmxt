import { AxiosInstance } from 'axios';
import { MarketFilterParams, EventFetchParams, OHLCVParams, TradesParams, MyTradesParams } from '../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, UserTrade, Position, Balance, CreateOrderParams, Order } from '../types';

// ----------------------------------------------------------------------------
// Fetcher Context -- provided by the SDK class to give fetchers access to
// the HTTP client, implicit-API caller, and authentication headers.
// ----------------------------------------------------------------------------

export interface FetcherContext {
    readonly http: AxiosInstance;
    callApi(operationId: string, params?: Record<string, any>): Promise<any>;
    getHeaders(): Record<string, string>;
}

// ----------------------------------------------------------------------------
// Fetcher -- responsible for calling the venue API and returning raw,
// venue-native data.  Handles pagination, rate-limit headers, retries, etc.
// Every method returns the raw response payload (unknown); normalisation
// happens in a separate layer.
// ----------------------------------------------------------------------------

export interface IExchangeFetcher<TRawMarket = unknown, TRawEvent = unknown, TRawPositions = unknown[]> {
    fetchRawMarkets(params?: MarketFilterParams): Promise<TRawMarket[]>;
    fetchRawEvents(params: EventFetchParams): Promise<TRawEvent[]>;

    // Optional capabilities -- exchanges that do not support a data type
    // simply omit the method or throw "not supported".
    fetchRawOHLCV?(id: string, params: OHLCVParams): Promise<unknown>;
    fetchRawOrderBook?(id: string): Promise<unknown>;
    fetchRawTrades?(id: string, params: TradesParams): Promise<unknown[]>;
    fetchRawMyTrades?(params: MyTradesParams, walletAddress: string): Promise<unknown[]>;
    fetchRawPositions?(walletAddress: string): Promise<TRawPositions>;
    fetchRawBalance?(walletAddress: string): Promise<unknown>;
}

// ----------------------------------------------------------------------------
// Normalizer -- maps venue-native shapes into pmxt unified types.
// Pure functions (no I/O) so they are trivially testable with fixture data.
// ----------------------------------------------------------------------------

export interface IExchangeNormalizer<TRawMarket = unknown, TRawEvent = unknown> {
    normalizeMarket(raw: TRawMarket): UnifiedMarket | null;
    normalizeEvent(raw: TRawEvent): UnifiedEvent | null;

    normalizeOHLCV?(raw: unknown, params: OHLCVParams): PriceCandle[];
    normalizeOrderBook?(raw: unknown, id: string): OrderBook;
    normalizeTrade?(raw: unknown, index: number): Trade;
    normalizeUserTrade?(raw: unknown, index: number): UserTrade;
    normalizePosition?(raw: unknown): Position;
    normalizeBalance?(raw: unknown): Balance[];
}
