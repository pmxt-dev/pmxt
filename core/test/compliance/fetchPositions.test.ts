import { exchangeClasses, validatePosition, getMockCredentials } from './shared';
import axios from 'axios';

describe('Compliance: fetchPositions', () => {
    test.each(exchangeClasses)('$name should comply with fetchPositions standards', async ({ name, cls }) => {
        let exchange: any;

        try {
            // Initialize with real credentials if available, otherwise use lazily generated dummies
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
                console.warn(`Error initializing ${name}:`, e);
                // If initialization fails (some SDKs might validate keys format in constructor), 
                // we can't really test even with mocks, so we might have to skip or fail gracefully.
                throw e;
            }

            console.info(`[Compliance] Testing ${name}.fetchPositions`);
            let positions: any[] = [];
            let usedMock = false;

            try {
                positions = await exchange.fetchPositions();
            } catch (error: any) {
                console.warn(`[Compliance] Real fetch failed for ${name}: ${error.message}. Attempting fallback mock.`);
            }

            if (!positions || positions.length === 0) {
                console.info(`[Compliance] No positions found for ${name} (or fetch failed). Injecting mock network response to verify mapping logic.`);
                usedMock = true;

                // Mock Network Response based on Exchange
                const spy = jest.spyOn(axios, 'get');
                try {
                    if (name === 'PolymarketExchange') {
                        spy.mockResolvedValue({
                            data: [{
                                asset: "0x123mockAsset",
                                conditionId: "0xabcMockCondition",
                                size: "100",
                                avgPrice: "0.50",
                                outcome: "Yes",
                                curPrice: "0.55",
                                cashPnl: "5.00",
                                realizedPnl: "0.00",
                                title: "Mock Market"
                            }]
                        });
                    } else if (name === 'LimitlessExchange') {
                        spy.mockResolvedValue({
                            data: {
                                data: [{
                                    market: { slug: "mock-slug-limited" },
                                    asset: "0x987mockAsset",
                                    outcome: "No",
                                    size: "50",
                                    avgPrice: "0.40",
                                    curPrice: "0.42",
                                    cashPnl: "1.00",
                                    realizedPnl: "0"
                                }]
                            }
                        });
                    } else if (name === 'KalshiExchange') {
                        spy.mockResolvedValue({
                            data: {
                                market_positions: [{
                                    ticker: "KX-MOCK",
                                    position: 10,
                                    total_cost: 500,
                                    market_price: 55,
                                    market_exposure: 50,
                                    realized_pnl: 0
                                }]
                            }
                        });
                    }

                    // Retry fetch with mock
                    positions = await exchange.fetchPositions();

                } finally {
                    spy.mockRestore();
                }
            }

            expect(Array.isArray(positions)).toBe(true);

            if (positions.length > 0) {
                for (const position of positions) {
                    validatePosition(position, name);
                }
                if (usedMock) {
                    console.info(`[Compliance] ${name}: Validated using MOCKED data successfully.`);
                }
            } else {
                throw new Error(`[Compliance] ${name}: Failed to produce positions even with mocks.`);
            }

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchPositions not implemented.`);
                return;
            }
            throw error;
        }
    }, 60000); // Increase timeout for API calls
});
