import { GeminiWebSocket } from '../../src/exchanges/gemini-titan/websocket';

describe('GeminiWebSocket depth snapshots', () => {
    it('routes snapshots using s when symbol is absent', () => {
        const ws = new GeminiWebSocket(undefined, { wsUrl: 'wss://example.test' }) as any;
        const resolved: unknown[] = [];
        ws.orderBookResolvers.set('BTCUSD-PERP', [{
            resolve: (value: unknown) => resolved.push(value),
            reject: jest.fn(),
        }]);

        ws.handleDepthSnapshot({
            lastUpdateId: 1,
            s: 'btcusd-perp',
            bids: [['0.48', '10']],
            asks: [['0.52', '12']],
        });

        expect(resolved).toEqual([{
            bids: [{ price: 0.48, size: 10 }],
            asks: [{ price: 0.52, size: 12 }],
            timestamp: expect.any(Number),
        }]);
    });

    it('uses the documented full-depth stream name', () => {
        const ws = new GeminiWebSocket(undefined, { wsUrl: 'wss://example.test' }) as any;
        expect(ws.depthStream('BTCUSD-PERP')).toBe('BTCUSD-PERP@depth@100ms');
    });
});
