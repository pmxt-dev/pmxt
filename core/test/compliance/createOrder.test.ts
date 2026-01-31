import { exchangeClasses, validateOrder, hasAuth, initExchange } from './shared';

describe('Compliance: createOrder', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with createOrder standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.createOrder`);

                // We use a dummy order that is likely to fail validation or execution
                // but structure-wise it's correct.
                const orderParams = {
                    marketId: 'mock-market-id',
                    outcomeId: 'mock-outcome-id',
                    side: 'buy' as const,
                    type: 'limit' as const,
                    amount: 1,
                    price: 0.01
                };

                const order = await exchange.createOrder(orderParams);
                validateOrder(order, name);

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                if (msg.includes('not implemented')) {
                    console.info(`[Compliance] ${name}.createOrder not implemented.`);
                    return;
                }
                throw error;
            }
        }, 60000);
    });
});
