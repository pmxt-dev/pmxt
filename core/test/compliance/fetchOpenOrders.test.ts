import { exchangeClasses, validateOrder, hasAuth, initExchange } from './shared';

describe('Compliance: fetchOpenOrders', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with fetchOpenOrders standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.fetchOpenOrders`);

                const orders = await exchange.fetchOpenOrders();

                expect(Array.isArray(orders)).toBe(true);

                for (const order of orders) {
                    validateOrder(order, name);
                }

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                if (msg.includes('not implemented')) {
                    console.info(`[Compliance] ${name}.fetchOpenOrders not implemented.`);
                    return;
                }
                throw error;
            }
        }, 60000);
    });
});
