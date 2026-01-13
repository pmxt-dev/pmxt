import { KalshiExchange } from '../../../src/exchanges/kalshi';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

import * as crypto from 'crypto';

// Generate a valid RSA key pair for testing constraints
const { privateKey: validPrivateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

describe('KalshiExchange - fetchBalance', () => {
    const mockCredentials = {
        apiKey: 'test-key-id',
        privateKey: validPrivateKey
    };

    let exchange: KalshiExchange;

    beforeEach(() => {
        jest.clearAllMocks();
        exchange = new KalshiExchange(mockCredentials);
    });

    it('should fetch and map balance correctly', async () => {
        // Mock Kalshi API response
        const mockResponse = {
            data: {
                balance: 10000,          // $100.00 available
                portfolio_value: 15000,  // $150.00 total (including positions)
                updated_ts: 1673456789
            }
        };

        mockedAxios.get.mockResolvedValue(mockResponse);

        const balances = await exchange.fetchBalance();

        // Verify the request was made correctly
        expect(mockedAxios.get).toHaveBeenCalledWith(
            'https://trading-api.kalshi.com/trade-api/v2/portfolio/balance',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'KALSHI-ACCESS-KEY': 'test-key-id',
                    'KALSHI-ACCESS-TIMESTAMP': expect.any(String),
                    'KALSHI-ACCESS-SIGNATURE': expect.any(String)
                })
            })
        );

        // Verify the response mapping
        expect(balances).toHaveLength(1);
        expect(balances[0]).toEqual({
            currency: 'USD',
            total: 150.00,      // portfolio_value / 100
            available: 100.00,  // balance / 100
            locked: 50.00       // total - available
        });
    });

    it('should throw error when not authenticated', async () => {
        const unauthExchange = new KalshiExchange();

        await expect(unauthExchange.fetchBalance()).rejects.toThrow(
            'Trading operations require authentication'
        );
    });

    it('should handle API errors', async () => {
        const mockError = new Error('API Error');
        (mockError as any).response = {
            status: 401,
            data: { error: 'Invalid signature' }
        };

        mockedAxios.get.mockRejectedValue(mockError);

        await expect(exchange.fetchBalance()).rejects.toThrow('API Error');
    });
});
