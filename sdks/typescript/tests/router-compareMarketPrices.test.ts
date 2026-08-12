import { Router } from '../pmxt/router';

interface CapturedFetch {
    url: string;
    init?: RequestInit;
}

function installFetchSpy(
    handler: (req: CapturedFetch, callIndex: number) => Promise<Response> | Response,
): jest.SpyInstance {
    const captured: CapturedFetch[] = [];
    const spy = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL | Request).toString();
        const req: CapturedFetch = { url, init };
        captured.push(req);
        return handler(req, captured.length);
    });
    (spy as unknown as { captured: CapturedFetch[] }).captured = captured;
    return spy;
}

function captured(spy: jest.SpyInstance): CapturedFetch[] {
    return (spy as unknown as { captured: CapturedFetch[] }).captured;
}

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

class DynamicResolveBaseRouter extends Router {
    public baseUrls: string[] = [];
    private _baseCallCount = 0;

    public override resolveBaseUrl(): string {
        return this.baseUrls[this._baseCallCount++]
            ?? this.baseUrls[this.baseUrls.length - 1]
            ?? super.resolveBaseUrl();
    }
}

afterEach(() => {
    jest.restoreAllMocks();
});

describe('Router.compareMarketPrices transport contracts', () => {
    it('resolves base URL per invocation before dispatching sidecar reads', async () => {
        const spy = installFetchSpy(() => jsonResponse({ success: true, data: [] }));
        const router = new DynamicResolveBaseRouter({ autoStartServer: false });
        router.baseUrls = ['http://localhost:4011', 'http://localhost:4012'];

        await router.compareMarketPrices({ marketId: 'mkt-1' });
        await router.compareMarketPrices({ marketId: 'mkt-1' });

        const reqs = captured(spy);
        expect(reqs).toHaveLength(2);
        expect(reqs[0].url).toBe('http://localhost:4011/api/router/compareMarketPrices?marketId=mkt-1');
        expect(reqs[0].init?.method).toBe('GET');
        expect(reqs[1].url).toBe('http://localhost:4012/api/router/compareMarketPrices?marketId=mkt-1');
        expect(reqs[1].init?.method).toBe('GET');
    });

    it('retries once after a connection error before returning a result', async () => {
        const router = new DynamicResolveBaseRouter({ autoStartServer: false });
        router.baseUrls = ['http://localhost:4013'];
        const ensureServer = jest
            .spyOn((router as any).serverManager, 'ensureServerRunning')
            .mockResolvedValue(undefined);

        let calls = 0;
        const spy = installFetchSpy(() => {
            calls += 1;
            if (calls === 1) {
                throw new Error('ECONNREFUSED');
            }
            return jsonResponse({ success: true, data: [] });
        });

        await router.compareMarketPrices({ marketId: 'mkt-2' });

        const reqs = captured(spy);
        expect(reqs).toHaveLength(2);
        expect(reqs[0].init?.method).toBe('GET');
        expect(reqs[1].init?.method).toBe('GET');
        expect(ensureServer).toHaveBeenCalledTimes(1);
    });

    it('falls back to POST on 405 with exact args payload and preserves nested market mapping', async () => {
        const router = new DynamicResolveBaseRouter({ autoStartServer: false });
        router.baseUrls = ['http://localhost:4014'];

        const spy = installFetchSpy((_req, callIndex) => {
            if (callIndex === 1) {
                return jsonResponse({ success: false, error: 'GET unsupported' }, 405);
            }
            return jsonResponse({
                success: true,
                data: [
                    {
                        market: {
                            marketId: 'mkt-3',
                            sourceExchange: 'polymarket',
                            bestBid: 0.24,
                            bestAsk: 0.76,
                        },
                        confidence: 0.91,
                        relation: 'identity',
                        reasoning: 'identity match',
                    },
                ],
            });
        });

        const out = await router.compareMarketPrices({ marketId: 'mkt-3' });
        const reqs = captured(spy);

        expect(reqs).toHaveLength(2);
        expect(reqs[0].url).toBe('http://localhost:4014/api/router/compareMarketPrices?marketId=mkt-3');
        expect(reqs[0].init?.method).toBe('GET');
        expect(reqs[1].url).toBe('http://localhost:4014/api/router/compareMarketPrices');
        expect(reqs[1].init?.method).toBe('POST');
        const body = JSON.parse((reqs[1].init?.body as string) ?? '{}');
        expect(body).toEqual({ args: [{ marketId: 'mkt-3' }] });

        expect(out).toHaveLength(1);
        const row = out[0] as any;
        expect(row.market.sourceExchange).toBe('polymarket');
        expect(row.bestBid).toBe(0.24);
        expect(row.bestAsk).toBe(0.76);
        expect(row.venue).toBe('polymarket');
        expect(row.relation).toBe('identity');
        expect(row.confidence).toBe(0.91);
        expect(row.reasoning).toBe('identity match');
    });
});
