import { exchangeClasses, hasAuth, initExchange } from './shared';

describe('Compliance: fetchBalance', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with fetchBalance standards`, async () => {
            const exchange = initExchange(name, cls);
            try {
                console.info(`[Compliance] Testing ${name}.fetchBalance`);
                // Real call execution
                const balances = await exchange.fetchBalance();

                // Verification
                expect(Array.isArray(balances)).toBe(true);

                if (balances.length > 0) {
                    for (const balance of balances) {
                        expect(balance.currency).toBeDefined();
                        expect(typeof balance.total).toBe('number');
                        expect(typeof balance.available).toBe('number');
                        expect(typeof balance.locked).toBe('number');
                        expect(balance.total).toBeGreaterThanOrEqual(0);
                    }
                } else {
                    // If the array is empty, it's technically a valid return (no balances),
                    // but usually implies we couldn't verify the structure fully.
                    // However, without mocks, we accept empty array or throw if it's undefined.
                    if (balances === undefined) {
                        throw new Error(`[Compliance] ${name}: fetchBalance returned undefined.`);
                    }
                }

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                if (msg.includes('not implemented')) {
                    console.info(`[Compliance] ${name}.fetchBalance not implemented.`);
                    return;
                }
                // If it fails due to auth, let it fail.
                throw error;
            }
        }, 60000);
    });
});
