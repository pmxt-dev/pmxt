import { exchangeClasses, validateOrder, getMockCredentials } from './shared';
import axios from 'axios';

describe('Compliance: createOrder', () => {
    test.each(exchangeClasses)('$name should comply with createOrder standards', async ({ name, cls }) => {
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

            console.info(`[Compliance] Testing ${name}.createOrder`);

            const orderParams = {
                marketId: 'mock-market-id',
                outcomeId: 'mock-outcome-id',
                side: 'buy' as const,
                type: 'limit' as const,
                amount: 10,
                price: 0.5
            };

            let order: any;
            let usedMock = false;

            // Try real call - it's expected to fail due to dummy credentials/no balance, 
            // but we follow the pattern of the other tests.
            try {
                // For safety and efficiency, we might want to skip real calls for createOrder 
                // unless specified, but let's stick to the codebase's pattern if it allows it.
                // Given createOrder might actually try to send a real transaction if it had real keys,
                // we should be careful. However, with dummy keys, it will just fail.
                order = await exchange.createOrder(orderParams);
            } catch (error: any) {
                // console.warn(`[Compliance] Real createOrder failed for ${name}: ${error.message}. Attempting fallback mock.`);
            }

            if (!order) {
                usedMock = true;

                try {
                    if (name === 'PolymarketExchange' || name === 'LimitlessExchange') {
                        // Mock ensureAuth to return a mocked auth object with a mocked CLOB client
                        // This bypasses the complex network calls made by the CLOB SDK
                        const mockClobClient = {
                            createAndPostOrder: jest.fn().mockResolvedValue({
                                success: true,
                                orderID: "mock-order-id-123"
                            }),
                            getTickSize: jest.fn().mockResolvedValue("0.01")
                        };

                        const mockAuth = {
                            getClobClient: jest.fn().mockResolvedValue(mockClobClient),
                            getAddress: jest.fn().mockReturnValue("0x123")
                        };

                        // Use any to access private ensureAuth
                        jest.spyOn(exchange as any, 'ensureAuth').mockReturnValue(mockAuth);
                    } else if (name === 'KalshiExchange') {
                        const postSpy = jest.spyOn(axios, 'post');
                        postSpy.mockImplementation((url: any) => {
                            if (url.includes('/portfolio/orders')) {
                                return Promise.resolve({
                                    data: {
                                        order: {
                                            order_id: "mock-kalshi-id",
                                            status: "resting",
                                            created_time: new Date().toISOString(),
                                            ticker: orderParams.marketId,
                                            count: orderParams.amount,
                                            remaining_count: orderParams.amount,
                                            side: "yes",
                                            yes_price: 50
                                        }
                                    }
                                });
                            }
                            return Promise.reject(new Error(`Unhandled mock POST URL: ${url}`));
                        });
                    }

                    order = await exchange.createOrder(orderParams);
                } finally {
                    jest.restoreAllMocks();
                }
            }

            if (order) {
                validateOrder(order, name);
                if (usedMock) {
                    console.info(`[Compliance] ${name}: Validated using MOCKED order successfully.`);
                }
            } else {
                throw new Error(`[Compliance] ${name}: Failed to produce order even with mocks.`);
            }

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.createOrder not implemented.`);
                return;
            }
            throw error;
        }
    }, 60000);
});
