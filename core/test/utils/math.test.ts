import { getExecutionPrice, getExecutionPriceDetailed } from '../../src/utils/math';
import { OrderBook } from '../../src/types';

describe('getExecutionPrice', () => {
    describe('basic functionality', () => {
        it('should calculate execution price for a single level buy order', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [{ price: 0.76, size: 150 }],
            };

            const price = getExecutionPrice(orderBook, 'buy', 100);
            expect(price).toBe(0.76);
        });

        it('should calculate execution price for a single level sell order', () => {
            const orderBook: OrderBook = {
                bids: [{ price: 0.75, size: 200 }],
                asks: [],
            };

            const price = getExecutionPrice(orderBook, 'sell', 100);
            expect(price).toBe(0.75);
        });

        it('should calculate volume-weighted average price across multiple levels for buy', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [
                    { price: 0.76, size: 100 },
                    { price: 0.77, size: 100 },
                    { price: 0.78, size: 100 },
                ],
            };

            // Buying 200: 100 at 0.76 + 100 at 0.77 = avg 0.765
            const price = getExecutionPrice(orderBook, 'buy', 200);
            expect(price).toBeCloseTo(0.765, 5);
        });

        it('should calculate volume-weighted average price across multiple levels for sell', () => {
            const orderBook: OrderBook = {
                bids: [
                    { price: 0.75, size: 100 },
                    { price: 0.74, size: 100 },
                    { price: 0.73, size: 100 },
                ],
                asks: [],
            };

            // Selling 200: 100 at 0.75 + 100 at 0.74 = avg 0.745
            const price = getExecutionPrice(orderBook, 'sell', 200);
            expect(price).toBeCloseTo(0.745, 5);
        });
    });

    describe('partial fills', () => {
        it('should handle partial fill at an order level for buy', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [
                    { price: 0.76, size: 100 },
                    { price: 0.77, size: 200 },
                ],
            };

            // Buying 150: 100 at 0.76 + 50 at 0.77 = (76 + 38.5) / 150 = 0.763333...
            const price = getExecutionPrice(orderBook, 'buy', 150);
            expect(price).toBeCloseTo((100 * 0.76 + 50 * 0.77) / 150, 5);
        });

        it('should handle partial fill at an order level for sell', () => {
            const orderBook: OrderBook = {
                bids: [
                    { price: 0.75, size: 100 },
                    { price: 0.74, size: 200 },
                ],
                asks: [],
            };

            // Selling 150: 100 at 0.75 + 50 at 0.74 = (75 + 37) / 150 = 0.746666...
            const price = getExecutionPrice(orderBook, 'sell', 150);
            expect(price).toBeCloseTo((100 * 0.75 + 50 * 0.74) / 150, 5);
        });
    });

    describe('edge cases', () => {
        it('should return 0 for insufficient liquidity', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [{ price: 0.76, size: 100 }],
            };

            const price = getExecutionPrice(orderBook, 'buy', 200);
            expect(price).toBe(0);
        });

        it('should return 0 for empty order book', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [],
            };

            const price = getExecutionPrice(orderBook, 'buy', 100);
            expect(price).toBe(0);
        });

        it('should throw error for zero amount', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [{ price: 0.76, size: 100 }],
            };

            expect(() => getExecutionPrice(orderBook, 'buy', 0)).toThrow(
                'Amount must be greater than 0'
            );
        });

        it('should throw error for negative amount', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [{ price: 0.76, size: 100 }],
            };

            expect(() => getExecutionPrice(orderBook, 'buy', -100)).toThrow(
                'Amount must be greater than 0'
            );
        });

        it('should handle exact liquidity match', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [{ price: 0.76, size: 100 }],
            };

            const price = getExecutionPrice(orderBook, 'buy', 100);
            expect(price).toBe(0.76);
        });
    });

    describe('real-world scenarios', () => {
        it('should calculate price for complex multi-level book (buy)', () => {
            const orderBook: OrderBook = {
                bids: [
                    { price: 0.50, size: 500 },
                    { price: 0.49, size: 1000 },
                ],
                asks: [
                    { price: 0.52, size: 200 },
                    { price: 0.53, size: 300 },
                    { price: 0.54, size: 400 },
                    { price: 0.55, size: 500 },
                ],
            };

            // Buying 600: 200 at 0.52 + 300 at 0.53 + 100 at 0.54
            const expected = (200 * 0.52 + 300 * 0.53 + 100 * 0.54) / 600;
            const price = getExecutionPrice(orderBook, 'buy', 600);
            expect(price).toBeCloseTo(expected, 5);
        });

        it('should calculate price for complex multi-level book (sell)', () => {
            const orderBook: OrderBook = {
                bids: [
                    { price: 0.50, size: 500 },
                    { price: 0.49, size: 1000 },
                    { price: 0.48, size: 1500 },
                ],
                asks: [
                    { price: 0.52, size: 200 },
                    { price: 0.53, size: 300 },
                ],
            };

            // Selling 700: 500 at 0.50 + 200 at 0.49
            const expected = (500 * 0.50 + 200 * 0.49) / 700;
            const price = getExecutionPrice(orderBook, 'sell', 700);
            expect(price).toBeCloseTo(expected, 5);
        });
    });
});

describe('getExecutionPriceDetailed', () => {
    describe('full fill scenarios', () => {
        it('should return fullyFilled=true when sufficient liquidity', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [{ price: 0.76, size: 150 }],
            };

            const result = getExecutionPriceDetailed(orderBook, 'buy', 100);
            expect(result.fullyFilled).toBe(true);
            expect(result.filledAmount).toBe(100);
            expect(result.price).toBe(0.76);
        });
    });

    describe('partial fill scenarios', () => {
        it('should return fullyFilled=false and correct filledAmount when insufficient liquidity', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [{ price: 0.76, size: 100 }],
            };

            const result = getExecutionPriceDetailed(orderBook, 'buy', 200);
            expect(result.fullyFilled).toBe(false);
            expect(result.filledAmount).toBe(100);
            expect(result.price).toBe(0.76);
        });

        it('should return correct filled amount across multiple levels', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [
                    { price: 0.76, size: 100 },
                    { price: 0.77, size: 100 },
                ],
            };

            const result = getExecutionPriceDetailed(orderBook, 'buy', 250);
            expect(result.fullyFilled).toBe(false);
            expect(result.filledAmount).toBe(200);
            expect(result.price).toBeCloseTo((100 * 0.76 + 100 * 0.77) / 200, 5);
        });

        it('should return fullyFilled=true when filling exactly across multiple levels', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [
                    { price: 0.76, size: 100 },
                    { price: 0.77, size: 100 },
                ],
            };

            const result = getExecutionPriceDetailed(orderBook, 'buy', 200);
            expect(result.fullyFilled).toBe(true);
            expect(result.filledAmount).toBe(200);
            expect(result.price).toBeCloseTo((100 * 0.76 + 100 * 0.77) / 200, 5);
        });
    });

    describe('empty book scenarios', () => {
        it('should handle empty ask side', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [],
            };

            const result = getExecutionPriceDetailed(orderBook, 'buy', 100);
            expect(result.fullyFilled).toBe(false);
            expect(result.filledAmount).toBe(0);
            expect(result.price).toBe(0);
        });

        it('should handle empty bid side', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [],
            };

            const result = getExecutionPriceDetailed(orderBook, 'sell', 100);
            expect(result.fullyFilled).toBe(false);
            expect(result.filledAmount).toBe(0);
            expect(result.price).toBe(0);
        });
    });

    describe('error handling', () => {
        it('should throw error for zero amount', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [{ price: 0.76, size: 100 }],
            };

            expect(() => getExecutionPriceDetailed(orderBook, 'buy', 0)).toThrow(
                'Amount must be greater than 0'
            );
        });

        it('should throw error for negative amount', () => {
            const orderBook: OrderBook = {
                bids: [],
                asks: [{ price: 0.76, size: 100 }],
            };

            expect(() => getExecutionPriceDetailed(orderBook, 'buy', -50)).toThrow(
                'Amount must be greater than 0'
            );
        });
    });
});
