import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { GaduinExchange } from '../../src/exchanges/gaduin';
import { AuthenticationError, MarketNotFound, ValidationError } from '../../src/errors';

// Fixtures follow the response shapes in core/specs/gaduin/gaduin.yaml.
const BINARY = {
    id: '3b1f2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    slug: 'flight-ba117-2026-09-28',
    kind: 'LMSR',
    category: 'FLIGHT',
    question: 'Will BA117 arrive on time on 28 Sep?',
    rules: 'Delayed means more than 15 minutes late.',
    outcomes: [{ idx: 0, label: 'yes' }, { idx: 1, label: 'no' }],
    status: 'OPEN',
    close_at: '2026-09-30T12:00:00Z',
    trading_closes_at: '2026-09-30T11:00:00Z',
    tradable: true,
    prices: [0.53, 0.47],
    volume: '250.75',
};

const MULTI = {
    id: '9a8b7c6d-0000-4000-8000-000000000001',
    slug: 'train-ic123-2026-09-28',
    kind: 'LMSR',
    category: 'TRAIN',
    question: 'How will IC 123 arrive on 28 Sep?',
    outcomes: [{ idx: 0, label: 'on_time' }, { idx: 1, label: 'delayed' }, { idx: 2, label: 'cancelled' }],
    status: 'OPEN',
    close_at: '2026-09-29T08:00:00Z',
    trading_closes_at: '2026-09-29T07:00:00Z',
    tradable: true,
    prices: [0.6, 0.3, 0.1],
    volume: '10',
};

const CANCELLED = { ...BINARY, id: 'c0000000-0000-4000-8000-000000000002', status: 'CANCELLED', prices: null, tradable: false };

type Reply = { status?: number; data: unknown };

function setup(routes: (config: InternalAxiosRequestConfig) => Reply) {
    const exchange = new GaduinExchange({ apiKey: 'pk_live_test' });
    exchange.enableRateLimit = false;
    const requests: InternalAxiosRequestConfig[] = [];
    exchange.http.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        requests.push(config);
        if (config.url?.endsWith('/auth/token')) {
            expect(config.headers.Authorization).toBe('Bearer pk_live_test');
            // A form-encoded body would be read as an OAuth client_credentials grant.
            expect(String(config.headers['Content-Type'])).toContain('application/json');
            return { data: { access_token: 'jwt-1', token_type: 'Bearer', expires_in: 3600 }, status: 200, statusText: 'OK', headers: {}, config };
        }
        expect(config.headers.Authorization).toBe('Bearer jwt-1');
        const reply = routes(config);
        const response = { data: reply.data, status: reply.status ?? 200, statusText: '', headers: {}, config };
        if (response.status >= 400) {
            throw new AxiosError(`Request failed with status code ${response.status}`, 'ERR_BAD_REQUEST', config, null, response);
        }
        return response;
    };
    return { exchange, requests };
}

describe('GaduinExchange', () => {
    test('refuses reads without an API key', async () => {
        await expect(new GaduinExchange().fetchMarkets()).rejects.toBeInstanceOf(AuthenticationError);
    });

    test('lists open markets with a token exchanged once from the API key', async () => {
        const { exchange, requests } = setup(() => ({ data: { markets: [BINARY, MULTI] } }));

        const markets = await exchange.fetchMarkets({ limit: 5 });
        await exchange.fetchMarkets();

        const tokenCalls = requests.filter((r) => r.url?.endsWith('/auth/token'));
        expect(tokenCalls).toHaveLength(1);
        expect(tokenCalls[0].method).toBe('post');
        const list = requests.find((r) => r.url === 'https://gaduin.com/api/v1/markets');
        expect(list?.params).toEqual({ status: 'OPEN', limit: 5, sort: 'close_asc' });

        expect(markets).toHaveLength(2);
        const [binary, multi] = markets;
        expect(binary).toMatchObject({
            marketId: BINARY.id,
            title: BINARY.question,
            description: BINARY.rules,
            slug: BINARY.slug,
            category: 'FLIGHT',
            status: 'active',
            volume: 250.75,
            url: 'https://gaduin.com/markets/flight-ba117-2026-09-28',
            resolutionDate: new Date('2026-09-30T12:00:00Z'),
        });
        expect(binary.yes).toMatchObject({ outcomeId: `${BINARY.id}:0`, label: 'yes', price: 0.53 });
        expect(binary.no).toMatchObject({ outcomeId: `${BINARY.id}:1`, label: 'no', price: 0.47 });

        expect(multi.outcomes.map((o) => [o.outcomeId, o.label, o.price])).toEqual([
            [`${MULTI.id}:0`, 'on_time', 0.6],
            [`${MULTI.id}:1`, 'delayed', 0.3],
            [`${MULTI.id}:2`, 'cancelled', 0.1],
        ]);
        expect(multi.yes).toBeUndefined();
        expect(multi.no).toBeUndefined();
    });

    test('caps the page size and filters by category', async () => {
        const { exchange, requests } = setup(() => ({ data: { markets: [BINARY, MULTI] } }));

        const markets = await exchange.fetchMarkets({ category: 'TRAIN', limit: 500 });

        expect(markets.map((m) => m.marketId)).toEqual([MULTI.id]);
        expect(requests.find((r) => r.url?.endsWith('/markets'))?.params.limit).toBe(100);
    });

    test('closed status reads CLOSED and SETTLED markets', async () => {
        const { exchange, requests } = setup((config) => ({
            data: { markets: config.params.status === 'SETTLED' ? [{ ...BINARY, status: 'SETTLED', settled_outcome_idx: 1 }] : [] },
        }));

        const markets = await exchange.fetchMarkets({ status: 'closed' });

        expect(requests.filter((r) => r.url?.endsWith('/markets')).map((r) => r.params.status).sort()).toEqual(['CLOSED', 'SETTLED']);
        expect(markets[0].status).toBe('settled');
        expect(markets[0].sourceMetadata).toMatchObject({ settledOutcomeIdx: 1 });
    });

    test('fetchMarket looks up by id or slug and maps 404 to MarketNotFound', async () => {
        const { exchange, requests } = setup((config) =>
            config.url?.endsWith(`/markets/${CANCELLED.id}`) ? { data: { market: CANCELLED } } : { status: 404, data: { error: 'market not found' } },
        );

        const market = await exchange.fetchMarket({ marketId: CANCELLED.id });
        expect(market.status).toBe('cancelled');
        expect(market.outcomes.map((o) => o.price)).toEqual([0, 0]);

        await expect(exchange.fetchMarket({ slug: 'no-such-market' })).rejects.toBeInstanceOf(MarketNotFound);
        expect(requests.some((r) => r.url === 'https://gaduin.com/api/v1/markets/no-such-market')).toBe(true);
    });

    test('fetchOHLCV buckets price history for one outcome', async () => {
        const { exchange, requests } = setup(() => ({
            data: {
                points: [
                    { t: '2026-09-28T10:40:00Z', prices: [0.5, 0.3, 0.2] },
                    { t: '2026-09-28T10:05:00Z', prices: [0.4, 0.4, 0.2] },
                    { t: '2026-09-28T11:10:00Z', prices: [0.55, 0.3, 0.15] },
                    { t: '2026-09-28T10:20:00Z', prices: [0.35, 0.45, 0.2] },
                ],
            },
        }));

        const candles = await exchange.fetchOHLCV(`${MULTI.id}:0`, { resolution: '1h' });

        expect(requests.some((r) => r.url === `https://gaduin.com/api/v1/markets/${MULTI.id}/price-history`)).toBe(true);
        expect(candles).toEqual([
            { timestamp: Date.parse('2026-09-28T10:00:00Z'), open: 0.4, high: 0.5, low: 0.35, close: 0.5 },
            { timestamp: Date.parse('2026-09-28T11:00:00Z'), open: 0.55, high: 0.55, low: 0.55, close: 0.55 },
        ]);
        expect(await exchange.fetchOHLCV(`${MULTI.id}:0`, { resolution: '1h', limit: 1 })).toHaveLength(1);
    });

    test('fetchOHLCV rejects malformed outcome ids and resolutions', async () => {
        const { exchange } = setup(() => ({ data: { points: [] } }));

        await expect(exchange.fetchOHLCV(MULTI.id, { resolution: '1h' })).rejects.toBeInstanceOf(ValidationError);
        await expect(exchange.fetchOHLCV(`${MULTI.id}:0`, { resolution: '1w' })).rejects.toBeInstanceOf(ValidationError);
    });
});
