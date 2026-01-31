import { exchangeClasses, validatePosition, hasAuth, initExchange } from './shared';

describe('Compliance: fetchPositions', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with fetchPositions standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.fetchPositions`);

                const positions = await exchange.fetchPositions();

                expect(Array.isArray(positions)).toBe(true);

                if (positions.length > 0) {
                    for (const position of positions) {
                        validatePosition(position, name);
                    }
                } else {
                    if (positions === undefined) {
                        throw new Error(`[Compliance] ${name}: fetchPositions returned undefined.`);
                    }
                }

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                if (msg.includes('not implemented')) {
                    console.info(`[Compliance] ${name}.fetchPositions not implemented.`);
                    return;
                }
                throw error;
            }
        }, 60000);
    });
});
