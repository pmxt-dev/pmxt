/**
 * Base error class for all PMXT errors
 *
 * All custom errors extend this class to provide consistent error handling
 * across exchanges with HTTP status codes and retry semantics.
 */
export class BaseError extends Error {
    /** HTTP status code */
    public readonly status: number;
    /** Machine-readable error code */
    public readonly code: string;
    /** Whether the operation can be retried */
    public readonly retryable: boolean;
    /** Which exchange threw the error */
    public readonly exchange?: string;

    constructor(
        message: string,
        status: number,
        code: string,
        retryable: boolean = false,
        exchange?: string
    ) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
        this.code = code;
        this.retryable = retryable;
        this.exchange = exchange;

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

// ============================================================================
// 4xx Client Errors
// ============================================================================

/**
 * 400 Bad Request - The request was malformed or contains invalid parameters
 */
export class BadRequest extends BaseError {
    constructor(message: string, exchange?: string) {
        super(message, 400, 'BAD_REQUEST', false, exchange);
    }
}

/**
 * 401 Unauthorized - Authentication credentials are missing or invalid
 */
export class AuthenticationError extends BaseError {
    constructor(message: string, exchange?: string) {
        super(message, 401, 'AUTHENTICATION_ERROR', false, exchange);
    }
}

/**
 * 403 Forbidden - The authenticated user doesn't have permission
 */
export class PermissionDenied extends BaseError {
    constructor(message: string, exchange?: string) {
        super(message, 403, 'PERMISSION_DENIED', false, exchange);
    }
}

/**
 * 404 Not Found - The requested resource doesn't exist
 */
export class NotFound extends BaseError {
    constructor(message: string, exchange?: string) {
        super(message, 404, 'NOT_FOUND', false, exchange);
    }
}

/**
 * 404 Not Found - The requested order doesn't exist
 */
export class OrderNotFound extends BaseError {
    constructor(orderId: string, exchange?: string) {
        super(`Order not found: ${orderId}`, 404, 'ORDER_NOT_FOUND', false, exchange);
    }
}

/**
 * 404 Not Found - The requested market doesn't exist
 */
export class MarketNotFound extends BaseError {
    constructor(marketId: string, exchange?: string) {
        super(`Market not found: ${marketId}`, 404, 'MARKET_NOT_FOUND', false, exchange);
    }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitExceeded extends BaseError {
    /** Number of seconds to wait before retrying */
    public readonly retryAfter?: number;

    constructor(message: string, retryAfter?: number, exchange?: string) {
        super(message, 429, 'RATE_LIMIT_EXCEEDED', true, exchange);
        this.retryAfter = retryAfter;
    }
}

/**
 * 400 Bad Request - The order parameters are invalid
 */
export class InvalidOrder extends BaseError {
    constructor(message: string, exchange?: string) {
        super(message, 400, 'INVALID_ORDER', false, exchange);
    }
}

/**
 * 400 Bad Request - Insufficient funds to complete the operation
 */
export class InsufficientFunds extends BaseError {
    constructor(message: string, exchange?: string) {
        super(message, 400, 'INSUFFICIENT_FUNDS', false, exchange);
    }
}

/**
 * 400 Bad Request - Input validation failed
 */
export class ValidationError extends BaseError {
    public readonly field?: string;

    constructor(message: string, field?: string, exchange?: string) {
        super(message, 400, 'VALIDATION_ERROR', false, exchange);
        this.field = field;
    }
}

// ============================================================================
// 5xx Server/Network Errors
// ============================================================================

/**
 * 503 Service Unavailable - Network connectivity issues (retryable)
 */
export class NetworkError extends BaseError {
    constructor(message: string, exchange?: string) {
        super(message, 503, 'NETWORK_ERROR', true, exchange);
    }
}

/**
 * 503 Service Unavailable - Exchange is down or unreachable (retryable)
 */
export class ExchangeNotAvailable extends BaseError {
    constructor(message: string, exchange?: string) {
        super(message, 503, 'EXCHANGE_NOT_AVAILABLE', true, exchange);
    }
}
