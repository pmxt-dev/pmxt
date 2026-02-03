import axios, { AxiosError } from 'axios';
import {
    BaseError,
    BadRequest,
    AuthenticationError,
    PermissionDenied,
    NotFound,
    OrderNotFound,
    MarketNotFound,
    RateLimitExceeded,
    InvalidOrder,
    InsufficientFunds,
    ValidationError,
    NetworkError,
    ExchangeNotAvailable,
} from '../../src/errors';
import { ErrorMapper } from '../../src/utils/error-mapper';
import { PolymarketErrorMapper } from '../../src/exchanges/polymarket/errors';
import { KalshiErrorMapper } from '../../src/exchanges/kalshi/errors';
import { LimitlessErrorMapper } from '../../src/exchanges/limitless/errors';

describe('Error Classes', () => {
    describe('BaseError', () => {
        it('should create error with all properties', () => {
            const error = new BaseError('Test error', 400, 'TEST_ERROR', true, 'TestExchange');
            expect(error.message).toBe('Test error');
            expect(error.status).toBe(400);
            expect(error.code).toBe('TEST_ERROR');
            expect(error.retryable).toBe(true);
            expect(error.exchange).toBe('TestExchange');
            expect(error.name).toBe('BaseError');
        });

        it('should default retryable to false', () => {
            const error = new BaseError('Test error', 400, 'TEST_ERROR');
            expect(error.retryable).toBe(false);
        });
    });

    describe('BadRequest', () => {
        it('should have correct properties', () => {
            const error = new BadRequest('Bad request', 'TestExchange');
            expect(error.status).toBe(400);
            expect(error.code).toBe('BAD_REQUEST');
            expect(error.retryable).toBe(false);
            expect(error.exchange).toBe('TestExchange');
        });
    });

    describe('AuthenticationError', () => {
        it('should have correct properties', () => {
            const error = new AuthenticationError('Invalid API key', 'TestExchange');
            expect(error.status).toBe(401);
            expect(error.code).toBe('AUTHENTICATION_ERROR');
            expect(error.retryable).toBe(false);
        });
    });

    describe('PermissionDenied', () => {
        it('should have correct properties', () => {
            const error = new PermissionDenied('No permission', 'TestExchange');
            expect(error.status).toBe(403);
            expect(error.code).toBe('PERMISSION_DENIED');
            expect(error.retryable).toBe(false);
        });
    });

    describe('NotFound', () => {
        it('should have correct properties', () => {
            const error = new NotFound('Resource not found', 'TestExchange');
            expect(error.status).toBe(404);
            expect(error.code).toBe('NOT_FOUND');
            expect(error.retryable).toBe(false);
        });
    });

    describe('OrderNotFound', () => {
        it('should have correct properties and message', () => {
            const error = new OrderNotFound('order123', 'TestExchange');
            expect(error.status).toBe(404);
            expect(error.code).toBe('ORDER_NOT_FOUND');
            expect(error.message).toBe('Order not found: order123');
            expect(error.retryable).toBe(false);
        });
    });

    describe('MarketNotFound', () => {
        it('should have correct properties and message', () => {
            const error = new MarketNotFound('market456', 'TestExchange');
            expect(error.status).toBe(404);
            expect(error.code).toBe('MARKET_NOT_FOUND');
            expect(error.message).toBe('Market not found: market456');
            expect(error.retryable).toBe(false);
        });
    });

    describe('RateLimitExceeded', () => {
        it('should have correct properties', () => {
            const error = new RateLimitExceeded('Too many requests', 60, 'TestExchange');
            expect(error.status).toBe(429);
            expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
            expect(error.retryable).toBe(true);
            expect(error.retryAfter).toBe(60);
        });

        it('should work without retryAfter', () => {
            const error = new RateLimitExceeded('Too many requests', undefined, 'TestExchange');
            expect(error.retryAfter).toBeUndefined();
        });
    });

    describe('InvalidOrder', () => {
        it('should have correct properties', () => {
            const error = new InvalidOrder('Invalid tick size', 'TestExchange');
            expect(error.status).toBe(400);
            expect(error.code).toBe('INVALID_ORDER');
            expect(error.retryable).toBe(false);
        });
    });

    describe('InsufficientFunds', () => {
        it('should have correct properties', () => {
            const error = new InsufficientFunds('Not enough balance', 'TestExchange');
            expect(error.status).toBe(400);
            expect(error.code).toBe('INSUFFICIENT_FUNDS');
            expect(error.retryable).toBe(false);
        });
    });

    describe('ValidationError', () => {
        it('should have correct properties', () => {
            const error = new ValidationError('Invalid field', 'fieldName', 'TestExchange');
            expect(error.status).toBe(400);
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.field).toBe('fieldName');
            expect(error.retryable).toBe(false);
        });

        it('should work without field', () => {
            const error = new ValidationError('Validation failed');
            expect(error.field).toBeUndefined();
        });
    });

    describe('NetworkError', () => {
        it('should have correct properties', () => {
            const error = new NetworkError('Connection failed', 'TestExchange');
            expect(error.status).toBe(503);
            expect(error.code).toBe('NETWORK_ERROR');
            expect(error.retryable).toBe(true);
        });
    });

    describe('ExchangeNotAvailable', () => {
        it('should have correct properties', () => {
            const error = new ExchangeNotAvailable('Exchange down', 'TestExchange');
            expect(error.status).toBe(503);
            expect(error.code).toBe('EXCHANGE_NOT_AVAILABLE');
            expect(error.retryable).toBe(true);
        });
    });
});

describe('ErrorMapper', () => {
    const mapper = new ErrorMapper('TestExchange');

    describe('mapError', () => {
        it('should pass through BaseError instances', () => {
            const original = new BadRequest('Test error');
            const mapped = mapper.mapError(original);
            expect(mapped).toBeInstanceOf(BadRequest);
            expect(mapped.message).toBe('Test error');
        });

        it('should add exchange context to BaseError without exchange', () => {
            const original = new BadRequest('Test error');
            const mapped = mapper.mapError(original);
            expect(mapped.exchange).toBe('TestExchange');
        });

        it('should handle network error codes', () => {
            const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
            const mapped = mapper.mapError(error);
            expect(mapped).toBeInstanceOf(NetworkError);
            expect(mapped.message).toContain('Connection refused');
        });

        it('should handle generic errors', () => {
            const error = new Error('Generic error');
            const mapped = mapper.mapError(error);
            expect(mapped).toBeInstanceOf(BadRequest);
            expect(mapped.message).toBe('Generic error');
        });
    });

    describe('extractErrorMessage', () => {
        it('should extract from axios error with string data', () => {
            const error = {
                isAxiosError: true,
                response: {
                    data: 'Error message'
                }
            } as any;
            const message = mapper['extractErrorMessage'](error);
            expect(message).toBe('Error message');
        });

        it('should extract from nested error.message', () => {
            const error = {
                isAxiosError: true,
                response: {
                    data: {
                        error: {
                            message: 'Nested error message'
                        }
                    }
                }
            } as any;
            const message = mapper['extractErrorMessage'](error);
            expect(message).toBe('Nested error message');
        });

        it('should extract from data.message', () => {
            const error = {
                isAxiosError: true,
                response: {
                    data: {
                        message: 'Direct message'
                    }
                }
            } as any;
            const message = mapper['extractErrorMessage'](error);
            expect(message).toBe('Direct message');
        });

        it('should extract from data.errorMsg', () => {
            const error = {
                isAxiosError: true,
                response: {
                    data: {
                        errorMsg: 'Error msg field'
                    }
                }
            } as any;
            const message = mapper['extractErrorMessage'](error);
            expect(message).toBe('Error msg field');
        });

        it('should handle Error objects', () => {
            const error = new Error('Standard error');
            const message = mapper['extractErrorMessage'](error);
            expect(message).toBe('Standard error');
        });

        it('should handle string errors', () => {
            const message = mapper['extractErrorMessage']('String error');
            expect(message).toBe('String error');
        });
    });

    describe('mapBadRequestError', () => {
        it('should detect insufficient funds', () => {
            const error = mapper['mapBadRequestError']('Insufficient balance', {});
            expect(error).toBeInstanceOf(InsufficientFunds);
        });

        it('should detect invalid order', () => {
            const error = mapper['mapBadRequestError']('Invalid tick size', {});
            expect(error).toBeInstanceOf(InvalidOrder);
        });

        it('should detect validation error', () => {
            const error = mapper['mapBadRequestError']('Validation failed', {});
            expect(error).toBeInstanceOf(ValidationError);
        });

        it('should return BadRequest for unmatched patterns', () => {
            const error = mapper['mapBadRequestError']('Unknown error', {});
            expect(error).toBeInstanceOf(BadRequest);
            expect(error).not.toBeInstanceOf(InvalidOrder);
        });
    });

    describe('mapNotFoundError', () => {
        it('should detect order not found', () => {
            const error = mapper['mapNotFoundError']('Order order123 not found', {});
            expect(error).toBeInstanceOf(OrderNotFound);
            expect(error.message).toContain('order123');
        });

        it('should detect market not found', () => {
            const error = mapper['mapNotFoundError']('Market market456 not found', {});
            expect(error).toBeInstanceOf(MarketNotFound);
            expect(error.message).toContain('market456');
        });

        it('should return NotFound for unmatched patterns', () => {
            const error = mapper['mapNotFoundError']('Resource not found', {});
            expect(error).toBeInstanceOf(NotFound);
            expect(error).not.toBeInstanceOf(OrderNotFound);
        });
    });
});

describe('PolymarketErrorMapper', () => {
    const mapper = new PolymarketErrorMapper();

    it('should extract errorMsg field', () => {
        const error = {
            isAxiosError: true,
            response: {
                data: {
                    errorMsg: 'Polymarket error'
                }
            }
        } as any;
        const message = mapper['extractErrorMessage'](error);
        expect(message).toBe('Polymarket error');
    });

    it('should detect API key errors as authentication errors', () => {
        const error = mapper['mapBadRequestError']('Invalid API key', {});
        expect(error).toBeInstanceOf(AuthenticationError);
    });

    it('should detect proxy errors as authentication errors', () => {
        const error = mapper['mapBadRequestError']('Proxy signature failed', {});
        expect(error).toBeInstanceOf(AuthenticationError);
    });

    it('should detect tick size as invalid order', () => {
        const error = mapper['mapBadRequestError']('Invalid tick size', {});
        expect(error).toBeInstanceOf(InvalidOrder);
    });
});

describe('KalshiErrorMapper', () => {
    const mapper = new KalshiErrorMapper();

    it('should format error messages with status code', () => {
        const error = {
            isAxiosError: true,
            response: {
                status: 400,
                data: {
                    error: {
                        message: 'Kalshi error'
                    }
                }
            }
        } as any;
        const message = mapper['extractErrorMessage'](error);
        expect(message).toBe('[400] Kalshi error');
    });

    it('should detect balance errors as insufficient funds', () => {
        const error = mapper['mapBadRequestError']('Insufficient balance', {});
        expect(error).toBeInstanceOf(InsufficientFunds);
    });
});

describe('LimitlessErrorMapper', () => {
    const mapper = new LimitlessErrorMapper();

    it('should extract errorMsg field', () => {
        const error = {
            isAxiosError: true,
            response: {
                data: {
                    errorMsg: 'Limitless error'
                }
            }
        } as any;
        const message = mapper['extractErrorMessage'](error);
        expect(message).toBe('Limitless error');
    });

    it('should detect API key errors as authentication errors', () => {
        const error = mapper['mapBadRequestError']('Invalid API key', {});
        expect(error).toBeInstanceOf(AuthenticationError);
    });
});
