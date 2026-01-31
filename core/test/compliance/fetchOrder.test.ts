import { exchangeClasses, validateOrder, getMockCredentials } from './shared';
import axios from 'axios';

describe('Compliance: fetchOrder', () => {
    test.each(exchangeClasses)('$name should comply with fetchOrder standards', async ({ name, cls }) => {
        let exchange: any;

        try {
            const mockCreds = getMockCredentials();

            try {
                if (name === 'PolymarketExchange') {
                    exchange = new cls({
                        privateKey: mockCreds.ethPrivateKey,
                        // Add dummy credentials for ClobClient initialization if needed
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
                throw e;
            }

            console.info(`[Compliance] Testing ${name}.fetchOrder`);

            const orderId = 'mock-order-id-123';
            let order: any;
            let usedMock = false;

            // Try real call first (will likely fail with dummy creds)
            try {
                order = await exchange.fetchOrder(orderId);
            } catch (error: any) {
                // console.warn(`[Compliance] Real fetchOrder failed for ${name}: ${error.message}. Attempting fallback mock.`);
            }

            if (!order) {
                usedMock = true;

                try {
                    if (name === 'PolymarketExchange' || name === 'LimitlessExchange') {
                        // Mock ensureAuth to return a mocked auth object with a mocked CLOB client
                        const mockClobClient = {
                            getOrder: jest.fn().mockResolvedValue({
                                id: orderId,
                                market: "mock-market-id",
                                asset_id: "mock-outcome-id",
                                side: "BUY",
                                order_type: "GTC",
                                price: "0.55",
                                original_size: "10.0",
                                status: "OPEN",
                                size_matched: "5.0", // 50% filled
                                created_at: Math.floor(Date.now() / 1000)
                            })
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
                            if (url.includes(`/portfolio/orders/${orderId}`)) {
                                return Promise.resolve({
                                    data: {
                                        order: {
                                            order_id: orderId,
                                            ticker: "KX-MOCK",
                                            side: "yes",
                                            type: "limit",
                                            yes_price: 55, // cents -> 0.55
                                            count: 10,
                                            created_time: new Date().toISOString(),
                                            status: "resting", // => 'open'
                                            remaining_count: 5 // => filled = 10 - 5 = 5
                                        }
                                    }
                                });
                            }
                            return Promise.reject(new Error(`Unhandled mock GET URL: ${url}`));
                        });
                    }

                    order = await exchange.fetchOrder(orderId);
                } finally {
                    jest.restoreAllMocks();
                }
            }

            if (order) {
                validateOrder(order, name);

                // Extra checks for correctness based on our mocks
                expect(order.id).toBe(orderId);
                if (usedMock) {
                    expect(order.amount).toBe(10);
                    expect(order.filled).toBe(5);
                    expect(order.remaining).toBe(5);
                    expect(order.price).toBe(0.55);
                    console.info(`[Compliance] ${name}: Validated using MOCKED response successfully.`);
                }
            } else {
                throw new Error(`[Compliance] ${name}: Failed to fetch order even with mocks.`);
            }

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchOrder not implemented.`);
                return;
            }
            throw error;
        }
    }, 60000);
});
