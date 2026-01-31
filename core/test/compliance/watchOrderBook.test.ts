import { exchangeClasses, validateOrderBook, hasAuth, initExchange } from './shared';

describe('Compliance: watchOrderBook', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        // Some exchanges might allow public WS, but if they require auth we check it here
        // For now, these are considered public unless known otherwise. 
        // But if they fail with "auth required", we catch it in the body.

        test(`${name} should comply with watchOrderBook standards`, async () => {
            if (name === 'LimitlessExchange') {
                console.info(`[Compliance] ${name}.watchOrderBook skipped (no websocket support)`);
                return;
            }

            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.watchOrderBook`);

                const markets = await exchange.fetchMarkets({ limit: 20 });
                if (!markets || markets.length === 0) {
                    throw new Error(`${name}: No markets found to test watchOrderBook`);
                }

                let orderbook: any;
                let testedOutcomeId = '';
                let marketFound = false;

                for (const market of markets) {
                    for (const outcome of market.outcomes) {
                        try {
                            const watchPromise = exchange.watchOrderBook(outcome.id);
                            const timeoutPromise = new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('Timeout waiting for watchOrderBook data')), 10000)
                            );

                            orderbook = await Promise.race([watchPromise, timeoutPromise]);

                            if (orderbook) {
                                testedOutcomeId = outcome.id;
                                marketFound = true;
                                break;
                            }
                        } catch (error: any) {
                            const msg = error.message.toLowerCase();
                            if (msg.includes('not supported') || msg.includes('not implemented') || msg.includes('unavailable') || msg.includes('authentication') || msg.includes('credentials') || msg.includes('api key')) {
                                throw error;
                            }
                            console.warn(`[Compliance] ${name}: Failed to watch orderbook for outcome ${outcome.id}: ${error.message}`);
                        }
                    }
                    if (marketFound) break;
                }

                if (!marketFound) {
                    throw new Error(`${name}: Failed to watch orderbook on any of the fetched markets`);
                }

                expect(orderbook).toBeDefined();
                validateOrderBook(orderbook, name, testedOutcomeId);

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                if (msg.includes('not supported') || msg.includes('not implemented') || msg.includes('unavailable') || msg.includes('authentication') || msg.includes('credentials') || msg.includes('api key')) {
                    console.info(`[Compliance] ${name}.watchOrderBook skipped/unsupported: ${error.message}`);
                    return;
                }
                throw error;
            } finally {
                await exchange.close();
            }
        }, 60000);
    });
});
