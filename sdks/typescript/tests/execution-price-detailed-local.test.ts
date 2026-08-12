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

describe('getExecutionPrice', () => {
    it('requires full fill and sorts asks before averaging buys', () => {
        const client = new Polymarket({ autoStartServer: false });
        const price = client.getExecutionPrice(
            {
                bids: [],
                asks: [
                    { price: 0.52, size: 4 },
                    { price: 0.5, size: 6 },
                ],
            },
            'buy',
            8
        );

        expect(price).toBe(0.505);
    });

    it('requires full fill and sorts bids before averaging sells', () => {
        const client = new Polymarket({ autoStartServer: false });
        const price = client.getExecutionPrice(
            {
                bids: [
                    { price: 0.41, size: 5 },
                    { price: 0.43, size: 10 },
                ],
                asks: [],
            },
            'sell',
            8
        );

        expect(price).toBe(0.43);
    });

    it('returns 0 when order cannot be fully filled', () => {
        const client = new Polymarket({ autoStartServer: false });
        const price = client.getExecutionPrice(
            {
                bids: [{ price: 0.42, size: 2 }],
                asks: [],
            },
            'sell',
            5
        );

        expect(price).toBe(0);
    });

    it('matches detailed-price validation for non-positive amount', () => {
        const client = new Polymarket({ autoStartServer: false });
        const emptyBook = { bids: [], asks: [] };

        expect(() => client.getExecutionPrice(emptyBook, 'buy', 0)).toThrow(
            'Amount must be greater than 0'
        );
        expect(() => client.getExecutionPriceDetailed(emptyBook, 'buy', -1)).toThrow(
            'Amount must be greater than 0'
        );
    });

    it('ignores non-positive level sizes before computing execution price', () => {
        const client = new Polymarket({ autoStartServer: false });
        const price = client.getExecutionPrice(
            {
                bids: [],
                asks: [
                    { price: 0.52, size: -1 },
                    { price: 0.5, size: 0 },
                    { price: 0.48, size: 8 },
                ],
            },
            'buy',
            8
        );

        expect(price).toBe(0.48);
    });
});
