import { Polymarket } from '../pmxt/client';

describe('getExecutionPriceDetailed', () => {
    it('computes detailed execution price locally without sidecar access', () => {
        const client = new Polymarket({ autoStartServer: false });
        const result = client.getExecutionPriceDetailed({
            bids: [
                { price: 0.41, size: 5 },
                { price: 0.43, size: 10 },
            ],
            asks: [
                { price: 0.52, size: 4 },
                { price: 0.5, size: 6 },
            ],
        }, 'buy', 8);

        expect(result).toEqual({
            price: 0.505,
            filledAmount: 8,
            fullyFilled: true,
        });
    });

    it('reports partial fills instead of requiring a network call', () => {
        const client = new Polymarket({ autoStartServer: false });
        const result = client.getExecutionPriceDetailed({
            bids: [{ price: 0.42, size: 2 }],
            asks: [],
        }, 'sell', 5);

        expect(result).toEqual({
            price: 0.42,
            filledAmount: 2,
            fullyFilled: false,
        });
    });
});
