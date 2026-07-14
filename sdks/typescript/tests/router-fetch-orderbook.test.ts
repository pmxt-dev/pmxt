import { Router } from '../pmxt/router';
import { OrderBook } from '../pmxt/models';

describe('Router.fetchOrderBook', () => {
    it('should fetch a merged order book', async () => {
        const router = new Router({ baseUrl: 'http://localhost:3847' });
        const result = await router.fetchOrderBook('test-outcome-123', 10);
        
        expect(result).toBeDefined();
        expect(result.bids).toBeDefined();
        expect(result.asks).toBeDefined();
        expect(Array.isArray(result.bids)).toBe(true);
        expect(Array.isArray(result.asks)).toBe(true);
    });
});