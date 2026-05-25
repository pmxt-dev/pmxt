/**
 * GET/POST parity test: verifies that GET and POST requests to the PMXT
 * server return identical (or structurally equivalent) results for every
 * read method exposed via both verbs.
 *
 * The GET handler uses method-verbs.json to translate query params into
 * positional args. The POST handler takes raw positional args in `args`.
 * Both should invoke the same exchange method with equivalent arguments.
 *
 * MockExchange is seeded-deterministic for markets, events, and order
 * books. OHLCV and fetchTrades use Date.now() for timestamp anchoring, so
 * those are compared structurally (same count, same field types) rather
 * than by exact value equality.
 */

import http from 'http';
import { createApp } from '../../src/server/app';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
    const app = createApp({ accessToken: undefined });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ApiSuccess<T> {
    success: true;
    data: T;
}

interface ApiFailure {
    success: false;
    error: unknown;
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

async function apiGet<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`);
    const body = (await res.json()) as ApiResponse<T>;
    if (!body.success) {
        throw new Error(`GET ${path} failed: ${JSON.stringify((body as ApiFailure).error)}`);
    }
    return (body as ApiSuccess<T>).data;
}

async function apiPost<T>(exchange: string, method: string, args: unknown[]): Promise<T> {
    const res = await fetch(`${baseUrl}/api/${exchange}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args }),
    });
    const body = (await res.json()) as ApiResponse<T>;
    if (!body.success) {
        throw new Error(
            `POST /api/${exchange}/${method} failed: ${JSON.stringify((body as ApiFailure).error)}`,
        );
    }
    return (body as ApiSuccess<T>).data;
}

async function apiPostRaw(exchange: string, method: string, args: unknown[]) {
    const res = await fetch(`${baseUrl}/api/${exchange}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args }),
    });
    return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET/POST parity (mock exchange)', () => {
    // Shared outcomeId resolved once during the suite; populated in the
    // fetchMarkets parity test and reused by the order-book and OHLCV tests.
    let sharedOutcomeId: string;

    describe('fetchMarkets parity', () => {
        it('returns the same number of markets and the same marketIds', async () => {
            const [getResult, postResult] = await Promise.all([
                apiGet<any[]>('/api/mock/fetchMarkets?limit=3'),
                apiPost<any[]>('mock', 'fetchMarkets', [{ limit: 3 }]),
            ]);

            expect(getResult.length).toBe(3);
            expect(postResult.length).toBe(3);
            expect(getResult.length).toBe(postResult.length);

            const getIds = getResult.map((m: any) => m.marketId);
            const postIds = postResult.map((m: any) => m.marketId);
            expect(getIds).toEqual(postIds);

            // Capture an outcomeId for later tests.
            sharedOutcomeId = getResult[0].outcomes[0].outcomeId;
        });
    });

    describe('fetchEvents parity', () => {
        it('returns the same number of events and the same event IDs', async () => {
            const [getResult, postResult] = await Promise.all([
                apiGet<any[]>('/api/mock/fetchEvents?limit=3'),
                apiPost<any[]>('mock', 'fetchEvents', [{ limit: 3 }]),
            ]);

            expect(getResult.length).toBe(3);
            expect(postResult.length).toBe(3);
            expect(getResult.length).toBe(postResult.length);

            const getIds = getResult.map((e: any) => e.id);
            const postIds = postResult.map((e: any) => e.id);
            expect(getIds).toEqual(postIds);
        });
    });

    describe('fetchOrderBook parity', () => {
        it('returns bids and asks arrays of the same length with the same prices', async () => {
            // Ensure we have an outcomeId. If the markets test ran first it
            // sets sharedOutcomeId; otherwise resolve it inline here.
            if (!sharedOutcomeId) {
                const markets = await apiGet<any[]>('/api/mock/fetchMarkets?limit=1');
                sharedOutcomeId = markets[0].outcomes[0].outcomeId;
            }

            const outcomeIdParam = encodeURIComponent(sharedOutcomeId);
            const [getResult, postResult] = await Promise.all([
                apiGet<any>(`/api/mock/fetchOrderBook?outcomeId=${outcomeIdParam}`),
                apiPost<any>('mock', 'fetchOrderBook', [sharedOutcomeId]),
            ]);

            // Structure must be present on both.
            expect(Array.isArray(getResult.bids)).toBe(true);
            expect(Array.isArray(getResult.asks)).toBe(true);
            expect(Array.isArray(postResult.bids)).toBe(true);
            expect(Array.isArray(postResult.asks)).toBe(true);

            // Same number of levels.
            expect(getResult.bids.length).toBe(postResult.bids.length);
            expect(getResult.asks.length).toBe(postResult.asks.length);
            expect(getResult.bids.length).toBeGreaterThan(0);
            expect(getResult.asks.length).toBeGreaterThan(0);

            // Same prices at every level (prices are seeded-deterministic).
            const getBidPrices = getResult.bids.map((l: any) => l.price);
            const postBidPrices = postResult.bids.map((l: any) => l.price);
            expect(getBidPrices).toEqual(postBidPrices);

            const getAskPrices = getResult.asks.map((l: any) => l.price);
            const postAskPrices = postResult.asks.map((l: any) => l.price);
            expect(getAskPrices).toEqual(postAskPrices);

            // Same sizes at every level.
            const getBidSizes = getResult.bids.map((l: any) => l.size);
            const postBidSizes = postResult.bids.map((l: any) => l.size);
            expect(getBidSizes).toEqual(postBidSizes);

            const getAskSizes = getResult.asks.map((l: any) => l.size);
            const postAskSizes = postResult.asks.map((l: any) => l.size);
            expect(getAskSizes).toEqual(postAskSizes);

            // Timestamps are Date.now()-based and may diverge by milliseconds
            // between the two concurrent calls; only assert they exist.
            expect(typeof getResult.timestamp).toBe('number');
            expect(typeof postResult.timestamp).toBe('number');
        });
    });

    describe('fetchBalance parity', () => {
        it('returns the same balance values', async () => {
            // fetchBalance depends only on internal order state (no Date.now
            // in the return value), so exact equality is correct here.
            const [getResult, postResult] = await Promise.all([
                apiGet<any[]>('/api/mock/fetchBalance'),
                apiPost<any[]>('mock', 'fetchBalance', []),
            ]);

            expect(Array.isArray(getResult)).toBe(true);
            expect(Array.isArray(postResult)).toBe(true);
            expect(getResult.length).toBe(postResult.length);
            expect(getResult.length).toBeGreaterThan(0);

            // Every balance entry must match exactly.
            for (let i = 0; i < getResult.length; i++) {
                const g = getResult[i];
                const p = postResult[i];
                expect(g.currency).toBe(p.currency);
                expect(g.total).toBe(p.total);
                expect(g.available).toBe(p.available);
                expect(g.locked).toBe(p.locked);
            }
        });
    });

    describe('fetchOHLCV parity', () => {
        it('returns the same number of candles with the same structural fields', async () => {
            if (!sharedOutcomeId) {
                const markets = await apiGet<any[]>('/api/mock/fetchMarkets?limit=1');
                sharedOutcomeId = markets[0].outcomes[0].outcomeId;
            }

            const outcomeIdParam = encodeURIComponent(sharedOutcomeId);

            // Sequential calls so the Date.now() anchor used by fetchOHLCV
            // is as close as possible between GET and POST. fetchOHLCV uses
            // Date.now() as the 'end' when params.end is absent, which means
            // the timestamp sequence varies call-to-call. We compare count
            // and OHLC price/volume values (which are seeded-deterministic
            // relative to the step offset from the start anchor) rather than
            // exact timestamp values.
            const getResult = await apiGet<any[]>(
                `/api/mock/fetchOHLCV?outcomeId=${outcomeIdParam}&resolution=1h&limit=5`,
            );
            const postResult = await apiPost<any[]>('mock', 'fetchOHLCV', [
                sharedOutcomeId,
                { resolution: '1h', limit: 5 },
            ]);

            expect(Array.isArray(getResult)).toBe(true);
            expect(Array.isArray(postResult)).toBe(true);

            // Both should return exactly 5 candles.
            expect(getResult.length).toBe(5);
            expect(postResult.length).toBe(5);
            expect(getResult.length).toBe(postResult.length);

            // Every candle must have the correct field types on both sides,
            // and the price/volume fields must match (seeded from outcomeId).
            for (let i = 0; i < getResult.length; i++) {
                const g = getResult[i];
                const p = postResult[i];

                expect(typeof g.timestamp).toBe('number');
                expect(typeof p.timestamp).toBe('number');
                expect(typeof g.open).toBe('number');
                expect(typeof g.high).toBe('number');
                expect(typeof g.low).toBe('number');
                expect(typeof g.close).toBe('number');
                expect(typeof g.volume).toBe('number');
                expect(typeof p.open).toBe('number');
                expect(typeof p.high).toBe('number');
                expect(typeof p.low).toBe('number');
                expect(typeof p.close).toBe('number');
                expect(typeof p.volume).toBe('number');

                // OHLC prices and volume are seeded from the outcomeId and
                // the candle index; they are identical regardless of the
                // wall-clock anchor used for timestamps.
                expect(g.open).toBe(p.open);
                expect(g.high).toBe(p.high);
                expect(g.low).toBe(p.low);
                expect(g.close).toBe(p.close);
                expect(g.volume).toBe(p.volume);
            }
        });

        it('accepts date-time strings for start and end on both GET and POST', async () => {
            if (!sharedOutcomeId) {
                const markets = await apiGet<any[]>('/api/mock/fetchMarkets?limit=1');
                sharedOutcomeId = markets[0].outcomes[0].outcomeId;
            }

            const outcomeIdParam = encodeURIComponent(sharedOutcomeId);
            const start = '2026-01-01T00:00:00.000Z';
            const end = '2026-01-01T03:00:00.000Z';
            const expectedStart = Date.parse(start);

            const getResult = await apiGet<any[]>(
                `/api/mock/fetchOHLCV?outcomeId=${outcomeIdParam}` +
                    `&resolution=1h&start=${encodeURIComponent(start)}` +
                    `&end=${encodeURIComponent(end)}&limit=3`,
            );
            const postResult = await apiPost<any[]>('mock', 'fetchOHLCV', [
                sharedOutcomeId,
                { resolution: '1h', start, end, limit: 3 },
            ]);

            expect(getResult.map((c: any) => c.timestamp)).toEqual([
                expectedStart,
                expectedStart + 3_600_000,
                expectedStart + 7_200_000,
            ]);
            expect(postResult.map((c: any) => c.timestamp)).toEqual([
                expectedStart,
                expectedStart + 3_600_000,
                expectedStart + 7_200_000,
            ]);
        });
    });

    describe('createOrder validation', () => {
        it('returns a clean validation error for missing required order fields', async () => {
            const { status, body } = await apiPostRaw('mock', 'createOrder', [{}]);

            expect(status).toBe(400);
            expect(body.success).toBe(false);
            expect(body.error.code).toBe('VALIDATION_ERROR');
            expect(body.error.message).toContain('createOrder requires params.marketId');
            expect(body.error.message).not.toContain('Cannot read properties');
        });
    });
});
