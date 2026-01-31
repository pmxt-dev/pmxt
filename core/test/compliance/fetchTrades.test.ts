import { exchangeClasses, validateTrade, hasAuth, initExchange } from './shared';

describe('Compliance: fetchTrades', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with fetchTrades standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.fetchTrades`);

                // 1. Get a market to find an outcome ID
                const markets = await exchange.fetchMarkets({ limit: 5 });
                if (!markets || markets.length === 0) {
                    throw new Error(`${name}: No markets found to test fetchTrades`);
                }

                let trades: any[] = [];
                let testedOutcomeId = '';

                for (const market of markets) {
                    for (const outcome of market.outcomes) {
                        try {
                            trades = await exchange.fetchTrades(outcome.id, { limit: 10 });
                            if (trades && trades.length > 0) {
                                testedOutcomeId = outcome.id;
                                break;
                            }
                        } catch (error) {
                            // Skip and try next
                        }
                    }
                    if (testedOutcomeId) break;
                }

                if (trades.length === 0) {
                    throw new Error(`${name}: No trades found on live markets.`);
                }

                expect(Array.isArray(trades)).toBe(true);
                expect(trades.length).toBeGreaterThan(0);

                for (const trade of trades) {
                    validateTrade(trade, name, testedOutcomeId);
                }

            } catch (error: any) {
                if (error.message.toLowerCase().includes('not implemented')) {
                    console.info(`[Compliance] ${name}.fetchTrades not implemented.`);
                    return;
                }
                throw error;
            }
        }, 60000);
    });
});
