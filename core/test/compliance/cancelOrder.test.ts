import { exchangeClasses, hasAuth, initExchange } from './shared';

describe('Compliance: cancelOrder', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with cancelOrder standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.cancelOrder`);

                const orderIdToCancel = 'dummy-order-id';
                const cancelledOrder = await exchange.cancelOrder(orderIdToCancel);

                expect(cancelledOrder.id).toBeDefined();
                expect(['cancelled', 'canceled']).toContain(cancelledOrder.status);

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                if (msg.includes('not implemented')) {
                    console.info(`[Compliance] ${name}.cancelOrder not implemented.`);
                    return;
                }
                throw error;
            }
        }, 60000);
    });
});
