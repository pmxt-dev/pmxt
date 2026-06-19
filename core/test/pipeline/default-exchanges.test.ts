import { DEFAULT_EXCHANGE_NAMES } from '../../src/server/app';

describe('sidecar default exchange registry', () => {
    test('includes unauthenticated singleton entries for public Rain, Gemini Titan, and Hyperliquid reads', () => {
        expect(DEFAULT_EXCHANGE_NAMES).toEqual(expect.arrayContaining([
            'rain',
            'gemini-titan',
            'hyperliquid',
        ]));
    });
});
