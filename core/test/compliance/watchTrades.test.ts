import { exchangeClasses, validateTrade, hasAuth, initExchange } from './shared';

describe('Compliance: watchTrades', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        test(`${name} should comply with watchTrades standards`, async () => {
            if (name === 'LimitlessExchange') {
                console.info(`[Compliance] ${name}.watchTrades skipped (no websocket support)`);
                return;
            }

            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.watchTrades`);

                const markets = await exchange.fetchMarkets({ limit: 20, sort: 'volume' });
                if (!markets || markets.length === 0) {
                    throw new Error(`${name}: No markets found to test watchTrades`);
                }

                let tradeReceived: any;
                let testedOutcomeId = '';
                let marketFound = false;

                for (const market of markets) {
                    for (const outcome of market.outcomes) {
                        try {
                            const watchPromise = exchange.watchTrades(outcome.id);
                            const timeoutPromise = new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('Timeout waiting for watchTrades data')), 15000)
                            );

                            const result = await Promise.race([watchPromise, timeoutPromise]);

                            if (result) {
                                tradeReceived = result;
                                testedOutcomeId = outcome.id;
                                marketFound = true;
                                break;
                            }
                        } catch (error: any) {
                            const msg = error.message.toLowerCase();
                            if (msg.includes('not supported') || msg.includes('not implemented') || msg.includes('unavailable') || msg.includes('authentication') || msg.includes('credentials') || msg.includes('api key')) {
                                throw error;
                            }
                            console.warn(`[Compliance] ${name}: Failed to watch trades for outcome ${outcome.id}: ${error.message}`);
                        }
                    }
                    if (marketFound) break;
                }

                if (!marketFound) {
                    throw new Error(`${name}: Failed to receive any trades on fetched markets (timeout/inactivity)`);
                }

                expect(tradeReceived).toBeDefined();
                if (Array.isArray(tradeReceived)) {
                    expect(tradeReceived.length).toBeGreaterThan(0);
                    for (const trade of tradeReceived) {
                        validateTrade(trade, name, testedOutcomeId);
                    }
                } else {
                    validateTrade(tradeReceived, name, testedOutcomeId);
                }

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                if (msg.includes('not supported') || msg.includes('not implemented') || msg.includes('unavailable') || msg.includes('authentication') || msg.includes('credentials') || msg.includes('api key')) {
                    console.info(`[Compliance] ${name}.watchTrades skipped/unsupported: ${error.message}`);
                    return;
                }
                throw error;
            } finally {
                await exchange.close();
            }
        }, 120000);
    });
});
