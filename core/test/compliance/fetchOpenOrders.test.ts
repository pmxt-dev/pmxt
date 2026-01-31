
import { exchangeClasses, validateOrder, getMockCredentials } from './shared';
import axios from 'axios';

describe('Compliance: fetchOpenOrders', () => {
    test.each(exchangeClasses)('$name should comply with fetchOpenOrders standards', async ({ name, cls }) => {
        let exchange: any;

        try {
            const mockCreds = getMockCredentials();

            // Initialize exchange with dummy credentials to bypass constructor checks
            try {
                if (name === 'PolymarketExchange') {
                    exchange = new cls({
                        privateKey: mockCreds.ethPrivateKey,
                        apiKey: "dummy_key",
                        apiSecret: "dummy_secret",
                        passphrase: "dummy_passphrase"
                    });
                } else if (name === 'KalshiExchange') {
                    exchange = new cls({
                        apiKey: "dummy_api_key",
                        privateKey: mockCreds.kalshiPrivateKey
                    });
                } else if (name === 'LimitlessExchange') {
                    exchange = new cls({
                        privateKey: mockCreds.ethPrivateKey,
                        apiKey: "dummy_key",
                        apiSecret: "dummy_secret",
                        passphrase: "dummy_passphrase"
                    });
                } else {
                    exchange = new cls();
                }
            } catch (e) {
                console.warn(`Error initializing ${name}:`, e);
                // If init fails (e.g. some validation), we can't test.
                // But for compliance tests we usually expect init to work with dummy creds.
                throw e;
            }

            console.info(`[Compliance] Testing ${name}.fetchOpenOrders`);

            let orders: any[] = [];
            let usedMock = false;

            // Try real call first (will likely fail with dummy creds)
            try {
                orders = await exchange.fetchOpenOrders();
            } catch (error: any) {
                // console.warn(`[Compliance] Real fetchOpenOrders failed for ${name}: ${error.message}. Attempting fallback mock.`);
            }

            // If real call failed or returned empty (and we want to verify structure), use mock
            // Note: fetchOpenOrders usually returns [] on error in some implementations, but here we want to TEST the structure validation.
            // So we force mock if empty.
            if (orders.length === 0) {
                usedMock = true;

                try {
                    if (name === 'PolymarketExchange' || name === 'LimitlessExchange') {
                        // Mock ensureAuth to return a mocked auth object with a mocked CLOB client
                        const mockClobClient = {
                            getOpenOrders: jest.fn().mockResolvedValue([
                                {
                                    id: "mock-order-1",
                                    market: "mock-market-id",
                                    asset_id: "mock-outcome-id",
                                    side: "BUY",
                                    order_type: "GTC",
                                    price: "0.55",
                                    original_size: "10.0",
                                    status: "OPEN",
                                    size_matched: "5.0", // 50% filled
                                    created_at: Math.floor(Date.now() / 1000)
                                },
                                {
                                    id: "mock-order-2",
                                    market: "mock-market-id",
                                    asset_id: "mock-outcome-id",
                                    side: "SELL",
                                    order_type: "GTC",
                                    price: "0.45",
                                    original_size: "20.0",
                                    status: "OPEN",
                                    size_matched: "0.0", // 0% filled
                                    created_at: Math.floor(Date.now() / 1000)
                                }
                            ])
                        };

                        const mockAuth = {
                            getClobClient: jest.fn().mockResolvedValue(mockClobClient),
                            getAddress: jest.fn().mockReturnValue("0x123")
                        };

                        // Use any to access private ensureAuth
                        jest.spyOn(exchange as any, 'ensureAuth').mockReturnValue(mockAuth);
                    } else if (name === 'KalshiExchange') {
                        const getSpy = jest.spyOn(axios, 'get');
                        getSpy.mockImplementation((url: string) => {
                            if (url.includes('/portfolio/orders')) {
                                return Promise.resolve({
                                    data: {
                                        orders: [
                                            {
                                                order_id: "mock-order-1",
                                                ticker: "KX-MOCK",
                                                side: "yes",
                                                type: "limit",
                                                yes_price: 55, // cents -> 0.55
                                                count: 10,
                                                created_time: new Date().toISOString(),
                                                status: "resting", // => 'open'
                                                remaining_count: 5 // => filled = 10 - 5 = 5
                                            },
                                            {
                                                order_id: "mock-order-2",
                                                ticker: "KX-MOCK",
                                                side: "no",
                                                type: "limit",
                                                yes_price: 45, // cents -> 0.45
                                                count: 20,
                                                created_time: new Date().toISOString(),
                                                status: "resting",
                                                remaining_count: 20 // => filled = 0
                                            }
                                        ]
                                    }
                                });
                            }
                            return Promise.reject(new Error(`Unhandled mock GET URL: ${url}`));
                        });
                    }

                    orders = await exchange.fetchOpenOrders();
                } finally {
                    jest.restoreAllMocks();
                }
            }

            // Validation
            expect(Array.isArray(orders)).toBe(true);

            if (usedMock) {
                expect(orders.length).toBeGreaterThan(0);

                // Validate each order
                for (const order of orders) {
                    validateOrder(order, name);
                }

                // Specific checks
                const order1 = orders.find(o => o.id === "mock-order-1");
                expect(order1).toBeDefined();
                expect(order1.side).toBe('buy');
                expect(order1.amount).toBe(10);
                expect(order1.filled).toBe(5);
                expect(order1.remaining).toBe(5);
                expect(order1.status).toBe('open');

                const order2 = orders.find(o => o.id === "mock-order-2");
                expect(order2).toBeDefined();
                expect(order2.remaining).toBe(20);
                expect(order2.filled).toBe(0);

                console.info(`[Compliance] ${name}: Validated using MOCKED response successfully.`);
            } else {
                console.warn(`[Compliance] ${name}: Real API call returned data (or empty). Validating structure if not empty.`);
                for (const order of orders) {
                    validateOrder(order, name);
                }
            }

        } catch (error: any) {
            // Polymarket/Limitless throw "not implemented"?? No, they implemented it.
            // But if they did throw:
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchOpenOrders not implemented.`);
                return;
            }
            throw error;
        }
    }, 60000); // 60s timeout
});
