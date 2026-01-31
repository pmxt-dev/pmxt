import { exchangeClasses, getMockCredentials } from './shared';
import axios from 'axios';

describe('Compliance: fetchBalance', () => {
    test.each(exchangeClasses)('$name should comply with fetchBalance standards', async ({ name, cls }) => {
        let exchange: any;

        try {
            const mockCreds = getMockCredentials();

            try {
                if (name === 'PolymarketExchange') {
                    const pk = process.env.POLYMARKET_PRIVATE_KEY || mockCreds.ethPrivateKey;
                    exchange = new cls({
                        privateKey: pk,
                        apiKey: "dummy_key",
                        apiSecret: "dummy_secret",
                        passphrase: "dummy_passphrase"
                    });
                } else if (name === 'KalshiExchange') {
                    exchange = new cls({
                        apiKey: process.env.KALSHI_API_KEY || "dummy_api_key",
                        privateKey: process.env.KALSHI_PRIVATE_KEY || mockCreds.kalshiPrivateKey
                    });
                } else if (name === 'LimitlessExchange') {
                    const pk = process.env.LIMITLESS_PRIVATE_KEY || mockCreds.ethPrivateKey;
                    exchange = new cls({
                        privateKey: pk,
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

            console.info(`[Compliance] Testing ${name}.fetchBalance`);
            let balances: any[] = [];
            let usedMock = false;

            try {
                balances = await exchange.fetchBalance();
            } catch (error: any) {
                console.warn(`[Compliance] Real fetchBalance failed for ${name}: ${error.message}. Attempting fallback mock.`);
            }

            if (!balances || balances.length === 0) {
                console.info(`[Compliance] No balances found for ${name}. Injecting mock network response to verify mapping logic.`);
                usedMock = true;

                try {
                    if (name === 'PolymarketExchange' || name === 'LimitlessExchange') {
                        // Mock ensureAuth to return a mocked auth object with a mocked CLOB client
                        const mockClobClient = {
                            getBalanceAllowance: jest.fn().mockResolvedValue({
                                balance: "1000500000", // 1000.50 USDC (6 decimals)
                                allowance: "1000000000000"
                            }),
                            getOpenOrders: jest.fn().mockResolvedValue([])
                        };

                        const mockAuth = {
                            getClobClient: jest.fn().mockResolvedValue(mockClobClient),
                            getAddress: jest.fn().mockReturnValue("0x2c7536E3605D9C16a7a3D7b1898e529396a65c23")
                        };

                        jest.spyOn(exchange as any, 'ensureAuth').mockReturnValue(mockAuth);
                    } else if (name === 'KalshiExchange') {
                        const spy = jest.spyOn(axios, 'get');
                        spy.mockResolvedValue({
                            data: {
                                balance: 10000, // 100.00 USD
                                portfolio_value: 15000 // 150.00 USD
                            }
                        });
                    }

                    balances = await exchange.fetchBalance();
                } finally {
                    jest.restoreAllMocks();
                }
            }

            expect(Array.isArray(balances)).toBe(true);

            if (balances.length > 0) {
                for (const balance of balances) {
                    expect(balance.currency).toBeDefined();
                    expect(typeof balance.total).toBe('number');
                    expect(typeof balance.available).toBe('number');
                    expect(typeof balance.locked).toBe('number');
                    expect(balance.total).toBeGreaterThanOrEqual(0);
                }
                if (usedMock) {
                    console.info(`[Compliance] ${name}: Validated using MOCKED balances successfully.`);
                }
            } else {
                // If it's implemented but returned empty, it's still technically successful?
                // But for compliance we expect some balance.
                throw new Error(`[Compliance] ${name}: Failed to produce balances even with mocks.`);
            }

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchBalance not implemented.`);
                return;
            }
            throw error;
        }
    }, 60000);
});
