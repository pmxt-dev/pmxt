import { HyperliquidExchange } from '../../src/exchanges/hyperliquid';

describe('HyperliquidExchange buildOrder builder attribution', () => {
    const params = {
        marketId: 'hl:#100001751',
        outcomeId: '100001751',
        side: 'buy' as const,
        type: 'limit' as const,
        amount: 10,
        price: 0.001,
    };

    it('attaches builder attribution when builder params are supplied', async () => {
        const exchange = new HyperliquidExchange({ testnet: true });
        const built = await exchange.buildOrder({
            ...params,
            builder: '0x370a6D37911294ebE8D45419d007E7e0C4BEC2a9',
            builderFee: 10,
        });

        expect(built.raw).toEqual({
            type: 'order',
            orders: [{
                a: 100001751,
                b: true,
                p: '0.001',
                s: '10',
                r: false,
                t: { limit: { tif: 'Gtc' } },
            }],
            grouping: 'na',
            builder: {
                b: '0x370a6d37911294ebe8d45419d007e7e0c4bec2a9',
                f: 10,
            },
        });
    });

    it('rejects malformed builder params before signing', async () => {
        const exchange = new HyperliquidExchange({ testnet: true });

        await expect(exchange.buildOrder({ ...params, builderFee: 10 })).rejects.toThrow(
            'Hyperliquid builderFee requires builder address',
        );
        await expect(exchange.buildOrder({ ...params, builder: '0x123', builderFee: 10 })).rejects.toThrow(
            'Invalid Hyperliquid builder address',
        );
        await expect(exchange.buildOrder({
            ...params,
            builder: '0x370a6D37911294ebE8D45419d007E7e0C4BEC2a9',
            builderFee: 0.5,
        })).rejects.toThrow('Hyperliquid builderFee must be a non-negative integer');
    });
});
