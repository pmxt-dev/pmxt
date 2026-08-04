import http from 'http';
import { Router } from '../../src/router';
import { MockExchange } from '../../src/exchanges/mock';
import { createApp } from '../../src/server/app';

interface RawResponse {
    status: number;
    body: any;
}

async function startTestServer(): Promise<{ server: http.Server; baseUrl: string }> {
    const app = createApp({ accessToken: undefined });
    const server = http.createServer(app);
    await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function startRawServer(
    handler: http.RequestListener,
): Promise<{ server: http.Server; baseUrl: string }> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
    });
    const addr = server.address() as { port: number };
    return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function stopTestServer(server: http.Server): Promise<void> {
    await new Promise<void>((resolve) => {
        server.close(() => resolve());
    });
}

async function get(baseUrl: string, path: string): Promise<RawResponse> {
    const res = await fetch(`${baseUrl}${path}`);
    const body = await res.json();
    return { status: res.status, body };
}

describe('Router local mock match lookup', () => {
    test('resolves local mock market and event IDs to no hosted matches when a mock exchange is configured', async () => {
        const router = new Router({
            apiKey: 'test',
            localExchanges: { mock: new MockExchange() },
        });

        await expect(router.fetchMarketMatches({ marketId: 'mock-m0' })).resolves.toEqual([]);
        await expect(router.fetchMarketMatches({ marketId: 'mock-m0-yes' })).resolves.toEqual([]);
        await expect(router.fetchEventMatches({ eventId: 'mock-event-0' })).resolves.toEqual([]);
    });

    test('throws a clear local-unsupported error before hosted lookup without a mock exchange', async () => {
        const router = new Router({ apiKey: 'test' });

        await expect(router.fetchMarketMatches({ marketId: 'mock-m0' })).rejects.toMatchObject({
            code: 'LOCAL_MATCH_LOOKUP_UNSUPPORTED',
            status: 501,
        });
        await expect(router.fetchEventMatches({ eventId: 'mock-event-0' })).rejects.toMatchObject({
            code: 'LOCAL_MATCH_LOOKUP_UNSUPPORTED',
            status: 501,
        });
    });

    test('sidecar router resolves bundled mock IDs locally instead of returning hosted not found', async () => {
        const { server, baseUrl } = await startTestServer();
        try {
            const market = await get(baseUrl, '/api/router/fetchMarketMatches?marketId=mock-m0');
            expect(market.status).toBe(200);
            expect(market.body.success).toBe(true);
            expect(market.body.data).toEqual([]);

            const event = await get(baseUrl, '/api/router/fetchEventMatches?eventId=mock-event-0');
            expect(event.status).toBe(200);
            expect(event.body.success).toBe(true);
            expect(event.body.data).toEqual([]);
        } finally {
            await stopTestServer(server);
        }
    });

    test('throws when hosted market match lookup returns a malformed success envelope', async () => {
        const { server, baseUrl } = await startRawServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });

        try {
            const router = new Router({ apiKey: 'test', baseUrl });
            await expect(router.fetchMarketMatches({ marketId: 'bad-id' })).rejects.toThrow(
                'missing matches array',
            );
        } finally {
            await stopTestServer(server);
        }
    });

    test('throws when hosted event match lookup returns a malformed success envelope', async () => {
        const { server, baseUrl } = await startRawServer((_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });

        try {
            const router = new Router({ apiKey: 'test', baseUrl });
            await expect(router.fetchEventMatches({ eventId: 'bad-id' })).rejects.toThrow(
                'missing matches array',
            );
        } finally {
            await stopTestServer(server);
        }
    });
});

describe('Router hosted event filters', () => {
    test.each([
        ['closed', 'true'],
        ['inactive', 'true'],
        ['active', null],
        ['all', null],
    ] as const)('maps event status %s to closed=%s', async (status, expectedClosed) => {
        let capturedUrl: URL | undefined;
        const { server, baseUrl } = await startRawServer((req, res) => {
            capturedUrl = new URL(req.url ?? '/', 'http://localhost');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ data: [] }));
        });

        try {
            const router = new Router({ apiKey: 'test', baseUrl });
            await expect(router.fetchEvents({ status, query: 'election' })).resolves.toEqual([]);
            expect(capturedUrl?.pathname).toBe('/v0/events');
            expect(capturedUrl?.searchParams.get('q')).toBe('election');
            expect(capturedUrl?.searchParams.get('closed')).toBe(expectedClosed);
        } finally {
            await stopTestServer(server);
        }
    });
});
