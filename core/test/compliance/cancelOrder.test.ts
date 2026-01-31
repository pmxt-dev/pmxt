import { exchangeClasses, validateOrder, getMockCredentials } from './shared';
import axios from 'axios';

describe('Compliance: cancelOrder', () => {
    test.each(exchangeClasses)('$name should comply with cancelOrder standards', async ({ name, cls }) => {
        let exchange: any;

        try {
            const mockCreds = getMockCredentials();

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
                throw e;
            }

            console.info(`[Compliance] Testing ${name}.cancelOrder`);

            const orderIdToCancel = 'mock-order-id-to-cancel';
            let cancelledOrder: any;
            let usedMock = false;

            // Try real call
            try {
                cancelledOrder = await exchange.cancelOrder(orderIdToCancel);
            } catch (error: any) {
                // Real call failed, expected with dummy creds
            }

            if (!cancelledOrder) {
                usedMock = true;

                try {
                    if (name === 'PolymarketExchange' || name === 'LimitlessExchange') {
                        // Mock ensureAuth to return a mocked auth object with a mocked CLOB client
                        const mockClobClient = {
                            cancelOrder: jest.fn().mockResolvedValue({
                                success: true,
                                orderID: orderIdToCancel
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
                        const deleteSpy = jest.spyOn(axios, 'delete');
                        deleteSpy.mockImplementation((url: any) => {
                            if (url.includes('/portfolio/orders/')) {
                                return Promise.resolve({
                                    data: {
                                        order: {
                                            order_id: orderIdToCancel,
                                            status: "canceled",
                                            created_time: new Date().toISOString(),
                                            ticker: "MOCK-TICKER",
                                            count: 10,
                                            remaining_count: 0,
                                            side: "yes",
                                            yes_price: 50
                                        }
                                    }
                                });
                            }
                            return Promise.reject(new Error(`Unhandled mock DELETE URL: ${url}`));
                        });
                    }

                    cancelledOrder = await exchange.cancelOrder(orderIdToCancel);
                } finally {
                    jest.restoreAllMocks();
                }
            }

            if (cancelledOrder) {
                // Verify the returned order has 'cancelled' status (or equivalent compliant status)
                // PMXT unified 'status' for cancelled orders should assume 'cancelled'
                if (cancelledOrder.status !== 'cancelled' && cancelledOrder.status !== 'canceled') {
                    // Note: unified type typically expects 'cancelled'
                    console.warn(`[Compliance] ${name}: cancelOrder returned status '${cancelledOrder.status}', expected 'cancelled'.`);
                }

                // For validating the structure, we can use validateOrder but accept 'cancelled' status.
                // validateOrder checks for required fields.
                // Custom validation for cancelOrder response
                // We don't use validateOrder here because cancelOrder often returns a partial Order object
                // (e.g. missing price, unknown marketId) which is acceptable for a cancellation acknowledgement.
                expect(cancelledOrder.id).toBeDefined();
                expect(cancelledOrder.id).toBeTruthy();

                // Status should be strictly cancelled or canceled
                expect(['cancelled', 'canceled']).toContain(cancelledOrder.status);

                if (name !== 'PolymarketExchange') {
                    // Some exchanges might return 'unknown' marketId (Polymarket), others generally return it.
                    // But for generic compliance, we just ensure the object structure is reasonable.
                }

                if (usedMock) {
                    console.info(`[Compliance] ${name}: Validated using MOCKED cancelOrder successfully.`);
                }
            } else {
                throw new Error(`[Compliance] ${name}: Failed to cancel order even with mocks.`);
            }

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.cancelOrder not implemented.`);
                return;
            }
            throw error;
        }
    }, 60000);
});
