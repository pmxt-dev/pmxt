import { KalshiExchange } from '../kalshi';
import { CreateOrderParams } from '../../types';
import axios from 'axios';
import { KalshiAuth } from './auth';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock KalshiAuth
jest.mock('./auth');
const MockedKalshiAuth = KalshiAuth as jest.MockedClass<typeof KalshiAuth>;

describe('KalshiExchange', () => {
    let exchange: KalshiExchange;
    const mockCredentials = {
        apiKey: 'test-api-key',
        privateKey: 'mock-private-key'
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock the getHeaders method
        MockedKalshiAuth.prototype.getHeaders = jest.fn().mockReturnValue({
            'KALSHI-ACCESS-KEY': 'test-api-key',
            'KALSHI-ACCESS-TIMESTAMP': '1234567890',
            'KALSHI-ACCESS-SIGNATURE': 'mock-signature',
            'Content-Type': 'application/json'
        });
    });

    describe('Authentication', () => {
        it('should throw error when trading without credentials', async () => {
            exchange = new KalshiExchange();
            await expect(exchange.fetchBalance()).rejects.toThrow('Trading operations require authentication');
        });

        it('should initialize with credentials', () => {
            exchange = new KalshiExchange(mockCredentials);
            expect(exchange).toBeDefined();
        });
    });

    describe('Market Data Methods', () => {
        beforeEach(() => {
            exchange = new KalshiExchange();
        });

        it('should fetch markets', async () => {
            const mockResponse = {
                data: {
                    markets: [
                        {
                            ticker: 'TEST-MARKET',
                            title: 'Test Market',
                            yes_bid: 50,
                            yes_ask: 52,
                            volume: 1000
                        }
                    ]
                }
            };
            mockedAxios.get.mockResolvedValue(mockResponse);

            const markets = await exchange.fetchMarkets();
            expect(markets).toBeDefined();
        });
    });

    describe('Trading Methods', () => {
        beforeEach(() => {
            exchange = new KalshiExchange(mockCredentials);
        });

        describe('createOrder', () => {
            it('should create buy order with yes_price for buy side', async () => {
                const orderParams: CreateOrderParams = {
                    marketId: 'TEST-MARKET',
                    outcomeId: 'yes',
                    side: 'buy',
                    type: 'limit',
                    amount: 10,
                    price: 0.55
                };

                const mockResponse = {
                    data: {
                        order: {
                            order_id: 'order-123',
                            ticker: 'TEST-MARKET',
                            status: 'resting',
                            count: 10,
                            remaining_count: 10,
                            created_time: '2026-01-13T12:00:00Z',
                            queue_position: 1
                        }
                    }
                };

                mockedAxios.post.mockResolvedValue(mockResponse);

                const order = await exchange.createOrder(orderParams);

                expect(mockedAxios.post).toHaveBeenCalledWith(
                    'https://trading-api.kalshi.com/trade-api/v2/portfolio/orders',
                    expect.objectContaining({
                        ticker: 'TEST-MARKET',
                        side: 'yes',
                        action: 'buy',
                        count: 10,
                        type: 'limit',
                        yes_price: 55  // 0.55 * 100
                    }),
                    expect.any(Object)
                );

                expect(order.id).toBe('order-123');
                expect(order.status).toBe('open');
            });

            it('should create sell order with no_price for sell side', async () => {
                const orderParams: CreateOrderParams = {
                    marketId: 'TEST-MARKET',
                    outcomeId: 'no',
                    side: 'sell',
                    type: 'limit',
                    amount: 5,
                    price: 0.45
                };

                const mockResponse = {
                    data: {
                        order: {
                            order_id: 'order-456',
                            ticker: 'TEST-MARKET',
                            status: 'resting',
                            count: 5,
                            remaining_count: 5,
                            created_time: '2026-01-13T12:00:00Z',
                            queue_position: 1
                        }
                    }
                };

                mockedAxios.post.mockResolvedValue(mockResponse);

                await exchange.createOrder(orderParams);

                expect(mockedAxios.post).toHaveBeenCalledWith(
                    'https://trading-api.kalshi.com/trade-api/v2/portfolio/orders',
                    expect.objectContaining({
                        ticker: 'TEST-MARKET',
                        side: 'no',
                        action: 'sell',
                        count: 5,
                        type: 'limit',
                        no_price: 45  // 0.45 * 100
                    }),
                    expect.any(Object)
                );
            });
        });

        describe('fetchOpenOrders', () => {
            it('should sign request without query parameters', async () => {
                const mockResponse = {
                    data: {
                        orders: [
                            {
                                order_id: 'order-123',
                                ticker: 'TEST-MARKET',
                                side: 'yes',
                                type: 'limit',
                                yes_price: 55,
                                count: 10,
                                remaining_count: 10,
                                created_time: '2026-01-13T12:00:00Z'
                            }
                        ]
                    }
                };

                mockedAxios.get.mockResolvedValue(mockResponse);

                await exchange.fetchOpenOrders();

                // Verify the request URL includes query params
                expect(mockedAxios.get).toHaveBeenCalledWith(
                    'https://trading-api.kalshi.com/trade-api/v2/portfolio/orders?status=resting',
                    expect.any(Object)
                );

                // Verify getHeaders was called with base path only (no query params)
                expect(MockedKalshiAuth.prototype.getHeaders).toHaveBeenCalledWith(
                    'GET',
                    '/trade-api/v2/portfolio/orders'
                );
            });

            it('should include ticker in query params when marketId provided', async () => {
                const mockResponse = { data: { orders: [] } };
                mockedAxios.get.mockResolvedValue(mockResponse);

                await exchange.fetchOpenOrders('TEST-MARKET');

                expect(mockedAxios.get).toHaveBeenCalledWith(
                    'https://trading-api.kalshi.com/trade-api/v2/portfolio/orders?status=resting&ticker=TEST-MARKET',
                    expect.any(Object)
                );
            });
        });

        describe('fetchPositions', () => {
            it('should handle positions with zero contracts', async () => {
                const mockResponse = {
                    data: {
                        market_positions: [
                            {
                                ticker: 'TEST-MARKET',
                                position: 0,
                                total_cost: 0,
                                market_exposure: 0,
                                realized_pnl: 0
                            }
                        ]
                    }
                };

                mockedAxios.get.mockResolvedValue(mockResponse);

                const positions = await exchange.fetchPositions();

                expect(positions).toHaveLength(1);
                expect(positions[0].size).toBe(0);
                expect(positions[0].entryPrice).toBe(0);  // Should not throw division by zero
            });

            it('should correctly calculate average price and PnL', async () => {
                const mockResponse = {
                    data: {
                        market_positions: [
                            {
                                ticker: 'TEST-MARKET',
                                position: 10,
                                total_cost: 550,  // 10 contracts at $0.55 each = $5.50 = 550 cents
                                market_exposure: 100,  // $1.00 unrealized PnL
                                realized_pnl: 50  // $0.50 realized PnL
                            }
                        ]
                    }
                };

                mockedAxios.get.mockResolvedValue(mockResponse);

                const positions = await exchange.fetchPositions();

                expect(positions).toHaveLength(1);
                expect(positions[0].size).toBe(10);
                expect(positions[0].entryPrice).toBe(0.55);  // 550 / 10 / 100
                expect(positions[0].unrealizedPnL).toBe(1.00);  // 100 / 100
                expect(positions[0].realizedPnL).toBe(0.50);  // 50 / 100
            });

            it('should handle short positions', async () => {
                const mockResponse = {
                    data: {
                        market_positions: [
                            {
                                ticker: 'TEST-MARKET',
                                position: -5,  // Short position
                                total_cost: 250,
                                market_exposure: -50,
                                realized_pnl: 25
                            }
                        ]
                    }
                };

                mockedAxios.get.mockResolvedValue(mockResponse);

                const positions = await exchange.fetchPositions();

                expect(positions[0].size).toBe(-5);  // Negative for short
                expect(Math.abs(positions[0].size)).toBe(5);  // Absolute value
            });
        });

        describe('fetchBalance', () => {
            it('should correctly convert cents to dollars', async () => {
                const mockResponse = {
                    data: {
                        balance: 10000,  // $100.00 available
                        portfolio_value: 15000  // $150.00 total
                    }
                };

                mockedAxios.get.mockResolvedValue(mockResponse);

                const balances = await exchange.fetchBalance();

                expect(balances).toHaveLength(1);
                expect(balances[0].currency).toBe('USD');
                expect(balances[0].available).toBe(100.00);
                expect(balances[0].total).toBe(150.00);
                expect(balances[0].locked).toBe(50.00);  // 150 - 100
            });
        });

        describe('cancelOrder', () => {
            it('should cancel order successfully', async () => {
                const mockResponse = {
                    data: {
                        order: {
                            order_id: 'order-123',
                            ticker: 'TEST-MARKET',
                            side: 'yes',
                            count: 10,
                            remaining_count: 5,
                            created_time: '2026-01-13T12:00:00Z'
                        }
                    }
                };

                mockedAxios.delete.mockResolvedValue(mockResponse);

                const order = await exchange.cancelOrder('order-123');

                expect(order.status).toBe('cancelled');
                expect(order.filled).toBe(5);  // count - remaining_count
                expect(order.remaining).toBe(0);
            });
        });
    });

    describe('Order Status Mapping', () => {
        beforeEach(() => {
            exchange = new KalshiExchange(mockCredentials);
        });

        it('should map resting to open', async () => {
            const mockResponse = {
                data: {
                    order: {
                        order_id: 'order-123',
                        ticker: 'TEST',
                        status: 'resting',
                        count: 10,
                        created_time: '2026-01-13T12:00:00Z'
                    }
                }
            };

            mockedAxios.get.mockResolvedValue(mockResponse);
            const order = await exchange.fetchOrder('order-123');
            expect(order.status).toBe('open');
        });

        it('should map executed to filled', async () => {
            const mockResponse = {
                data: {
                    order: {
                        order_id: 'order-123',
                        ticker: 'TEST',
                        status: 'executed',
                        count: 10,
                        created_time: '2026-01-13T12:00:00Z'
                    }
                }
            };

            mockedAxios.get.mockResolvedValue(mockResponse);
            const order = await exchange.fetchOrder('order-123');
            expect(order.status).toBe('filled');
        });
    });
});
