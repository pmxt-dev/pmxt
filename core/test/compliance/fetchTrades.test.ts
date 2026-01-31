import { exchangeClasses, validateTrade, getMockCredentials } from './shared';
import axios from 'axios';

describe('Compliance: fetchTrades', () => {
    test.each(exchangeClasses)('$name should comply with fetchTrades standards', async ({ name, cls }) => {
        let exchange: any;

        try {
            // Initialize with real credentials if available, otherwise use lazily generated dummies
            // This is required for Polymarket/Limitless trades which might be auth-restricted
            const mockCreds = getMockCredentials();

            try {
                if (name === 'PolymarketExchange') {
                    const pk = process.env.POLYMARKET_PRIVATE_KEY || mockCreds.ethPrivateKey;
                    exchange = new cls({ privateKey: pk });
                } else if (name === 'KalshiExchange') {
                    exchange = new cls({
                        apiKey: process.env.KALSHI_API_KEY || "dummy_api_key",
                        privateKey: process.env.KALSHI_PRIVATE_KEY || mockCreds.kalshiPrivateKey
                    });
                } else if (name === 'LimitlessExchange') {
                    const pk = process.env.LIMITLESS_PRIVATE_KEY || mockCreds.ethPrivateKey;
                    exchange = new cls({ privateKey: pk });
                } else {
                    exchange = new cls();
                }
            } catch (e) {
                console.warn(`Error initializing ${name} for trades:`, e);
                exchange = new cls(); // Fallback to public if init fails
            }

            console.info(`[Compliance] Testing ${name}.fetchTrades`);

            // 1. Get a market to find an outcome ID
            const markets = await exchange.fetchMarkets({ limit: 5 });
            if (!markets || markets.length === 0) {
                throw new Error(`${name}: No markets found to test fetchTrades`);
            }

            let trades: any[] = [];
            let testedOutcomeId = '';

            // Try to find an outcome with trades (real network)
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

            // 2. Verify trades result
            if (trades.length === 0) {
                throw new Error(`${name}: No trades found on live markets and mocking is disabled.`);
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
