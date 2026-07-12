import { createExchange } from '../../src/server/exchange-factory';
import { KalshiDemoExchange } from '../../src/exchanges/kalshi-demo';

const getCredentials = (exchange: unknown): Record<string, unknown> | undefined =>
    (exchange as { credentials?: Record<string, unknown> }).credentials;

const getConfig = (exchange: unknown): Record<string, unknown> | undefined =>
    (exchange as { config?: Record<string, unknown> }).config;

const getFetcher = (exchange: unknown): Record<string, unknown> | undefined =>
    (exchange as { fetcher?: Record<string, unknown> }).fetcher;

const getBaseUrl = (exchange: unknown): string | undefined =>
    (exchange as { baseUrl?: string }).baseUrl;

const withEnv = <T>(env: NodeJS.ProcessEnv, run: () => T): T => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, ...env };
    try {
        return run();
    } finally {
        process.env = originalEnv;
    }
};

describe('createExchange', () => {
    test('kalshi-demo prefers demo credentials before production fallbacks', () => {
        withEnv(
            {
                KALSHI_API_KEY: 'prod-key',
                KALSHI_PRIVATE_KEY: 'prod-private-key',
                KALSHI_DEMO_API_KEY: 'demo-key',
                KALSHI_DEMO_PRIVATE_KEY: 'demo-private-key',
            },
            () => {
                const exchange = createExchange('kalshi-demo');

                expect(exchange).toBeInstanceOf(KalshiDemoExchange);
                expect((exchange as any).auth?.credentials).toMatchObject({
                    apiKey: 'demo-key',
                    privateKey: 'demo-private-key',
                });
            },
        );
    });

    test('opinion maps funder address environment credentials', () => {
        withEnv(
            {
                OPINION_API_KEY: 'opinion-key',
                OPINION_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
                OPINION_FUNDER_ADDRESS: '0xopinionfunder',
            },
            () => {
                const exchange = createExchange('opinion');

                expect(getCredentials(exchange)).toMatchObject({
                    apiKey: 'opinion-key',
                    funderAddress: '0xopinionfunder',
                });
            },
        );
    });

    test('limitless uses LIMITLESS_BASE_URL for API fetches', () => {
        withEnv(
            { LIMITLESS_BASE_URL: 'https://limitless.test.local' },
            () => {
                const exchange = createExchange('limitless');

                expect(getFetcher(exchange)).toMatchObject({
                    apiUrl: 'https://limitless.test.local',
                });
            },
        );
    });

    test('probable uses PROBABLE_BASE_URL for API fetches', () => {
        withEnv(
            { PROBABLE_BASE_URL: 'https://probable.test.local' },
            () => {
                const exchange = createExchange('probable');

                expect(getFetcher(exchange)).toMatchObject({
                    baseUrl: 'https://probable.test.local',
                });
            },
        );
    });

    test('myriad uses MYRIAD_BASE_URL for API fetches', () => {
        withEnv(
            { MYRIAD_BASE_URL: 'https://myriad.test.local' },
            () => {
                const exchange = createExchange('myriad');

                expect(getFetcher(exchange)).toMatchObject({
                    baseUrl: 'https://myriad.test.local',
                });
            },
        );
    });

    test('opinion uses OPINION_BASE_URL for API fetches', () => {
        withEnv(
            { OPINION_BASE_URL: 'https://opinion.test.local/openapi' },
            () => {
                const exchange = createExchange('opinion');

                expect(getFetcher(exchange)).toMatchObject({
                    apiUrl: 'https://opinion.test.local/openapi',
                });
            },
        );
    });

    test('metaculus uses METACULUS_BASE_URL for API fetches', () => {
        withEnv(
            { METACULUS_BASE_URL: 'https://metaculus.test.local/api' },
            () => {
                const exchange = createExchange('metaculus');

                expect(getBaseUrl(exchange)).toBe('https://metaculus.test.local/api');
            },
        );
    });

    test('smarkets uses SMARKETS_BASE_URL for API configuration', () => {
        withEnv(
            { SMARKETS_BASE_URL: 'https://smarkets.test.local' },
            () => {
                const exchange = createExchange('smarkets');

                expect(getConfig(exchange)).toMatchObject({
                    apiUrl: 'https://smarkets.test.local',
                });
            },
        );
    });

    test('polymarket_us uses base URL environment configuration', () => {
        withEnv(
            {
                POLYMARKET_US_BASE_URL: 'https://poly-us-api.test.local',
                POLYMARKET_US_GATEWAY_URL: 'https://poly-us-gateway.test.local',
            },
            () => {
                const exchange = createExchange('polymarket_us');

                expect(getConfig(exchange)).toMatchObject({
                    apiUrl: 'https://poly-us-api.test.local',
                    gatewayUrl: 'https://poly-us-gateway.test.local',
                });
            },
        );
    });
});
