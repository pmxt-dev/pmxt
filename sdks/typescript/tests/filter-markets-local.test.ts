import { Polymarket } from '../pmxt/client';

describe('filterMarkets', () => {
    it('filters out markets where priceChange24h is null while keeping zero', () => {
        const client = new Polymarket({ autoStartServer: false });

        const nullPriceChangeMarket: any = {
            marketId: 'null-market',
            title: 'Null market',
            yes: { outcomeId: 'yes', outcome: 'Yes', label: 'Yes', price: 0.5, priceChange24h: null },
            no: { outcomeId: 'no', outcome: 'No', label: 'No', price: 0.5, priceChange24h: null },
        };

        const zeroPriceChangeMarket: any = {
            marketId: 'zero-market',
            title: 'Zero market',
            yes: { outcomeId: 'yes', outcome: 'Yes', label: 'Yes', price: 0.5, priceChange24h: 0 },
            no: { outcomeId: 'no', outcome: 'No', label: 'No', price: 0.5, priceChange24h: 0.2 },
        };

        const out = client.filterMarkets([nullPriceChangeMarket, zeroPriceChangeMarket], {
            priceChange24h: {
                outcome: 'yes',
                min: -1,
            },
        });

        expect(out).toHaveLength(1);
        expect(out[0].marketId).toBe('zero-market');
    });
});
