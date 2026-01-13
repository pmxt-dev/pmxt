import { KalshiExchange } from '../../../src/exchanges/kalshi';
import axios from 'axios';
import * as crypto from 'crypto';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Generate a valid RSA key pair for testing
const { privateKey: validPrivateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

describe('KalshiExchange - Trading Operations', () => {
    const mockCredentials = {
        apiKey: 'test-key-id',
        privateKey: validPrivateKey
    };

    let exchange: KalshiExchange;

    beforeEach(() => {
        jest.clearAllMocks();
        exchange = new KalshiExchange(mockCredentials);
    });

    describe('createOrder', () => {
        it('should create a buy order successfully', async () => {
            const mockResponse = {
                data: {
                    order: {
                        order_id: 'order-123',
                        ticker: 'PRES-2024',
                        side: 'yes',
                        count: 10,
                        yes_price: 5500,  // $0.55 in cents
                        type: 'limit',
                        status: 'resting',
                        remaining_count: 10,
                        queue_position: 1,
                        created_time: '2024-01-13T12:00:00Z'
                    }
                }
            };

            mockedAxios.post.mockResolvedValue(mockResponse);

            const order = await exchange.createOrder({
                marketId: 'PRES-2024',
                outcomeId: 'yes',
                side: 'buy',
                type: 'limit',
                amount: 10,
                price: 0.55
            });

            expect(order).toMatchObject({
                id: 'order-123',
                marketId: 'PRES-2024',
                side: 'buy',
                type: 'limit',
                amount: 10,
                price: 0.55,
                status: 'open'
            });

            // Verify the request was made correctly
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'https://trading-api.kalshi.com/trade-api/v2/portfolio/orders',
                expect.objectContaining({
                    ticker: 'PRES-2024',
                    side: 'yes',
                    action: 'buy',
                    count: 10,
                    type: 'limit',
                    yes_price: 55  // 0.55 * 100
                }),
                expect.any(Object)
            );
        });

        it('should create a sell order successfully', async () => {
            const mockResponse = {
                data: {
                    order: {
                        order_id: 'order-456',
                        ticker: 'PRES-2024',
                        side: 'no',
                        count: 5,
                        yes_price: 4500,
                        type: 'limit',
                        status: 'resting',
                        remaining_count: 5,
                        queue_position: 0,
                        created_time: '2024-01-13T12:00:00Z'
                    }
                }
            };

            mockedAxios.post.mockResolvedValue(mockResponse);

            const order = await exchange.createOrder({
                marketId: 'PRES-2024',
                outcomeId: 'no',
                side: 'sell',
                type: 'limit',
                amount: 5,
                price: 0.45
            });

            expect(order.side).toBe('sell');
            expect(order.status).toBe('open');
        });
    });

    describe('cancelOrder', () => {
        it('should cancel an order successfully', async () => {
            const mockResponse = {
                data: {
                    order: {
                        order_id: 'order-123',
                        ticker: 'PRES-2024',
                        side: 'yes',
                        count: 10,
                        remaining_count: 0,
                        created_time: '2024-01-13T12:00:00Z'
                    }
                }
            };

            mockedAxios.delete.mockResolvedValue(mockResponse);

            const order = await exchange.cancelOrder('order-123');

            expect(order).toMatchObject({
                id: 'order-123',
                status: 'cancelled',
                remaining: 0
            });

            expect(mockedAxios.delete).toHaveBeenCalledWith(
                'https://trading-api.kalshi.com/trade-api/v2/portfolio/orders/order-123',
                expect.any(Object)
            );
        });
    });

    describe('fetchOrder', () => {
        it('should fetch a specific order', async () => {
            const mockResponse = {
                data: {
                    order: {
                        order_id: 'order-123',
                        ticker: 'PRES-2024',
                        side: 'yes',
                        count: 10,
                        yes_price: 5500,
                        type: 'limit',
                        status: 'resting',
                        remaining_count: 7,
                        created_time: '2024-01-13T12:00:00Z'
                    }
                }
            };

            mockedAxios.get.mockResolvedValue(mockResponse);

            const order = await exchange.fetchOrder('order-123');

            expect(order).toMatchObject({
                id: 'order-123',
                marketId: 'PRES-2024',
                side: 'buy',
                amount: 10,
                filled: 3,  // 10 - 7
                remaining: 7,
                status: 'open'
            });
        });
    });

    describe('fetchOpenOrders', () => {
        it('should fetch all open orders', async () => {
            const mockResponse = {
                data: {
                    orders: [
                        {
                            order_id: 'order-1',
                            ticker: 'PRES-2024',
                            side: 'yes',
                            count: 10,
                            yes_price: 5500,
                            type: 'limit',
                            remaining_count: 10,
                            created_time: '2024-01-13T12:00:00Z'
                        },
                        {
                            order_id: 'order-2',
                            ticker: 'SENATE-2024',
                            side: 'no',
                            count: 5,
                            yes_price: 4000,
                            type: 'limit',
                            remaining_count: 5,
                            created_time: '2024-01-13T12:05:00Z'
                        }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValue(mockResponse);

            const orders = await exchange.fetchOpenOrders();

            expect(orders).toHaveLength(2);
            expect(orders[0].id).toBe('order-1');
            expect(orders[1].id).toBe('order-2');
        });

        it('should filter orders by market', async () => {
            const mockResponse = {
                data: {
                    orders: [
                        {
                            order_id: 'order-1',
                            ticker: 'PRES-2024',
                            side: 'yes',
                            count: 10,
                            yes_price: 5500,
                            type: 'limit',
                            remaining_count: 10,
                            created_time: '2024-01-13T12:00:00Z'
                        }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValue(mockResponse);

            await exchange.fetchOpenOrders('PRES-2024');

            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.stringContaining('ticker=PRES-2024'),
                expect.any(Object)
            );
        });
    });

    describe('fetchPositions', () => {
        it('should fetch all positions', async () => {
            const mockResponse = {
                data: {
                    market_positions: [
                        {
                            ticker: 'PRES-2024',
                            position: 10,  // Long 10 contracts
                            total_cost: 550,  // $5.50 in cents (10 contracts * $0.55)
                            realized_pnl: 1000,  // $10 profit
                            resting_order_count: 0
                        },
                        {
                            ticker: 'SENATE-2024',
                            position: -5,  // Short 5 contracts
                            total_cost: 200,  // $2 in cents (5 contracts * $0.40)
                            realized_pnl: -500,  // $5 loss
                            resting_order_count: 0
                        }
                    ]
                }
            };

            mockedAxios.get.mockResolvedValue(mockResponse);

            const positions = await exchange.fetchPositions();

            expect(positions).toHaveLength(2);

            expect(positions[0]).toMatchObject({
                marketId: 'PRES-2024',
                side: 'long',
                contracts: 10,
                averagePrice: 0.55,  // 5500 / 10 / 100
                realizedPnl: 10  // 1000 / 100
            });

            expect(positions[1]).toMatchObject({
                marketId: 'SENATE-2024',
                side: 'short',
                contracts: 5,
                realizedPnl: -5
            });
        });
    });
});
