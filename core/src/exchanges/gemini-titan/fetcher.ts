import { MarketFilterParams, EventFetchParams } from '../../BaseExchange';
import { IExchangeFetcher, FetcherContext } from '../interfaces';
import { geminiErrorMapper } from './errors';
import { GeminiAuth } from './auth';
import {
    GeminiRawEvent,
    GeminiRawEventsResponse,
    GeminiRawOrder,
    GeminiRawActiveOrdersResponse,
    GeminiRawOrderHistoryResponse,
    GeminiRawPosition,
    GeminiRawPositionsResponse,
    GeminiRawOrderBook,
    GeminiRawOrderBookLevel,
} from './types';

// ----------------------------------------------------------------------------
// Fetcher
// ----------------------------------------------------------------------------

export class GeminiFetcher implements IExchangeFetcher<GeminiRawEvent, GeminiRawEvent> {
    private readonly ctx: FetcherContext;
    private readonly baseUrl: string;
    private readonly auth: GeminiAuth | undefined;
    private readonly httpClient: any; // Add httpClient

    // Index mapping instrumentSymbol -> eventTicker, built during fetchRawEvents
    private symbolToEventTicker: Map<string, string> = new Map();

    // Track terms acceptance status to avoid repeated checks
    private termsAccepted: boolean = false;

    constructor(ctx: FetcherContext, baseUrl: string, auth?: GeminiAuth) {
        this.ctx = ctx;
        this.baseUrl = baseUrl;
        this.auth = auth;
        this.httpClient = ctx.http; // Initialize httpClient from ctx
    }

    // -- Public data -----------------------------------------------------------

    async fetchRawMarkets(params?: MarketFilterParams): Promise<GeminiRawEvent[]> {
        return this.fetchRawEvents(params ?? {});
    }

    async fetchRawEvents(params: EventFetchParams): Promise<GeminiRawEvent[]> {
        const allEvents: GeminiRawEvent[] = [];
        const pageSize = 500;
        let offset = params.offset ?? 0;
        const maxResults = params.limit ?? 250000;

        while (allEvents.length < maxResults) {
            const queryParams: Record<string, string | string[]> = {
                limit: String(Math.min(pageSize, maxResults - allEvents.length)),
                offset: String(offset),
            };

            const status = params.status as string | string[] | undefined;
            if (Array.isArray(status)) {
                const statuses = status.filter(s => s !== 'all');
                if (statuses.length > 0) queryParams.status = statuses;
            } else if (status && status !== 'all') {
                queryParams.status = status === 'active' ? 'active' : status;
            } else if (!status) {
                queryParams.status = 'active';
            }

            const category = params.category as string | string[] | undefined;
            if (category) {
                queryParams.category = category;
            }

            if (params.query) {
                queryParams.search = params.query;
            }

            const response = await this.get<GeminiRawEventsResponse>(
                '/v1/prediction-markets/events',
                queryParams,
            );

            const events = response.data;
            if (events.length === 0) break;

            // Build the instrumentSymbol -> eventTicker index
            for (const event of events) {
                for (const contract of event.contracts) {
                    this.symbolToEventTicker.set(contract.instrumentSymbol, event.ticker);
                }
            }

            allEvents.push(...events);

            // Check if we've fetched all available
            if (allEvents.length >= response.pagination.total) break;
            offset += events.length;
        }

        return allEvents;
    }

    async fetchRawSingleEvent(eventTicker: string): Promise<GeminiRawEvent> {
        return this.get<GeminiRawEvent>(
            `/v1/prediction-markets/events/${encodeURIComponent(eventTicker)}`,
        );
    }

    async fetchRawOrderBook(instrumentSymbol: string): Promise<GeminiRawOrderBook | undefined> {
        const eventTicker = this.getEventTickerForSymbol(instrumentSymbol);
        if (!eventTicker) {
            throw new Error(
                `Cannot fetch order book: no event ticker found for ${instrumentSymbol}. ` +
                'Call fetchMarkets first to build the symbol index.',
            );
        }

        const event = await this.fetchRawSingleEvent(eventTicker);

        // The REST API does not expose a full order book — construct a
        // single-level book from the contract's best bid/ask prices.
        // Full depth is only available via the WebSocket @depth streams.
        const contract = event.contracts.find(c => c.instrumentSymbol === instrumentSymbol);
        if (!contract?.prices) return undefined;

        const { bestBid, bestAsk } = contract.prices;
        const bids: GeminiRawOrderBookLevel[] = bestBid
            ? [{ price: bestBid, size: '0' }]
            : [];
        const asks: GeminiRawOrderBookLevel[] = bestAsk
            ? [{ price: bestAsk, size: '0' }]
            : [];

        return { bids, asks, timestamp: Date.now() };
    }

    getEventTickerForSymbol(instrumentSymbol: string): string | undefined {
        return this.symbolToEventTicker.get(instrumentSymbol);
    }

    // -- Terms Acceptance Flow -----------------------------------------------

    /**
     * Get current terms version and content
     */
    async getTerms(): Promise<{ version: string; content: string }> {
        return this.getAuthenticated('/v1/prediction-markets/terms');
    }

    /**
     * Check if API key has accepted the latest terms
     */
    async getTermsStatus(): Promise<{
        hasAcceptedLatest: boolean;
        acceptedVersion?: string;
        latestVersion?: string;
    }> {
        return this.getAuthenticated('/v1/prediction-markets/terms/status');
    }

    /**
     * Accept the latest terms version
     */
    async acceptTerms(): Promise<{ accepted: boolean; version: string }> {
        const result = await this.postAuthenticated<{ accepted: boolean; version: string }>(
            '/v1/prediction-markets/terms/accept',
            {},
        );
        this.termsAccepted = true;
        return result;
    }

    /**
     * Ensure terms are accepted before placing orders.
     * This is called automatically before order submission.
     */
    async ensureTermsAccepted(): Promise<void> {
        // Skip if already accepted in this session
        if (this.termsAccepted) {
            return;
        }

        try {
            const status = await this.getTermsStatus();
            if (!status.hasAcceptedLatest) {
                // Terms not accepted - accept them
                await this.acceptTerms();
                // Log acceptance (using logger instead of console if available)
                
            } else {
                this.termsAccepted = true;
            }
        } catch (error: any) {
            // If terms check fails with a specific error, re-throw
            if (error.message?.includes('TERMS') || error.message?.includes('terms')) {
                throw geminiErrorMapper.mapError(error);
            }
            // Otherwise log warning but don't block order submission
            // The order will fail with a clear error if terms are required
            
        }
    }

    // -- Authenticated endpoints -----------------------------------------------

    async submitRawOrder(payload: Record<string, unknown>): Promise<GeminiRawOrder> {
        // ✅ Ensure terms are accepted before placing order
        await this.ensureTermsAccepted();

        return this.postAuthenticated<GeminiRawOrder>(
            '/v1/prediction-markets/order',
            payload,
        );
    }

    async cancelRawOrder(orderId: number): Promise<GeminiRawOrder> {
        return this.postAuthenticated<GeminiRawOrder>(
            '/v1/prediction-markets/order/cancel',
            { orderId },
        );
    }

    async fetchRawActiveOrders(symbol?: string): Promise<GeminiRawOrder[]> {
        return this.fetchPaginatedOrders('/v1/prediction-markets/orders/active', symbol ? { symbol } : {});
    }

    async fetchRawOrderHistory(): Promise<GeminiRawOrder[]> {
        return this.fetchPaginatedOrders('/v1/prediction-markets/orders/history', {});
    }

    private async fetchPaginatedOrders(
        path: '/v1/prediction-markets/orders/active' | '/v1/prediction-markets/orders/history',
        extra: Record<string, unknown>,
    ): Promise<GeminiRawOrder[]> {
        const allOrders: GeminiRawOrder[] = [];
        const limit = 100;
        let offset = 0;

        while (true) {
            const response = await this.postAuthenticated<GeminiRawActiveOrdersResponse | GeminiRawOrderHistoryResponse>(
                path,
                { ...extra, limit, offset },
            );

            const orders = response.orders ?? [];
            allOrders.push(...orders);

            const pagination = response.pagination;
            const count = pagination?.count ?? orders.length;
            const pageOffset = pagination?.offset ?? offset;

            if (orders.length === 0 || pageOffset + orders.length >= count) {
                break;
            }

            offset = pageOffset + orders.length;
        }

        return allOrders;
    }

    async fetchRawPositions(): Promise<GeminiRawPosition[]> {
        const response = await this.postAuthenticated<GeminiRawPositionsResponse>(
            '/v1/prediction-markets/positions',
            {},
        );
        return response.positions;
    }

    // -- HTTP helpers ----------------------------------------------------------

    private async get<T>(path: string, params?: Record<string, string | string[]>): Promise<T> {
        try {
            const url = new URL(path, this.baseUrl);
            if (params) {
                for (const [key, value] of Object.entries(params)) {
                    if (Array.isArray(value)) {
                        for (const item of value) {
                            url.searchParams.append(key, item);
                        }
                    } else {
                        url.searchParams.set(key, value);
                    }
                }
            }
            const response = await this.ctx.http.get(url.toString());
            return response.data as T;
        } catch (error: any) {
            throw geminiErrorMapper.mapError(error);
        }
    }

    /**
     * Authenticated GET request
     */
    private async getAuthenticated<T = any>(path: string): Promise<T> {
        if (!this.auth) {
            throw new Error('Authentication required. Provide apiKey and apiSecret.');
        }

        const url = `${this.baseUrl}${path}`;
        const payload: Record<string, unknown> = {
            request: path,
            nonce: this.auth.nonce(),
        };
        const headers = this.auth.buildHeaders(payload);
        
        try {
            const response = await this.httpClient.get(url, { headers });
            return response.data as T;
        } catch (error: any) {
            throw geminiErrorMapper.mapError(error);
        }
    }

    private async postAuthenticated<T = any>(
        path: string,
        extraFields: Record<string, unknown>,
    ): Promise<T> {
        if (!this.auth) {
            throw new Error('Authentication required. Provide apiKey and apiSecret.');
        }

        const payload: Record<string, unknown> = {
            request: path,
            nonce: this.auth.nonce(),
            ...extraFields,
        };

        const headers = this.auth.buildHeaders(payload);

        try {
            const response = await this.ctx.http.post(
                `${this.baseUrl}${path}`,
                {},
                { headers },
            );
            return response.data as T;
        } catch (error: any) {
            throw geminiErrorMapper.mapError(error);
        }
    }
}