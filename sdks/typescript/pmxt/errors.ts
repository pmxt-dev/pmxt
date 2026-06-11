/**
 * Typed error classes for pmxt.
 *
 * These mirror the error hierarchy in the core TypeScript library,
 * enabling users to catch specific error types.
 */

export class PmxtError extends Error {
    public readonly code: string;
    public readonly retryable: boolean;
    public readonly exchange?: string;

    constructor(
        message: string,
        code: string = "UNKNOWN_ERROR",
        retryable: boolean = false,
        exchange?: string
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.retryable = retryable;
        this.exchange = exchange;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

// 4xx Client Errors

export class BadRequest extends PmxtError {
    constructor(message: string, exchange?: string) {
        super(message, "BAD_REQUEST", false, exchange);
    }
}

export class AuthenticationError extends PmxtError {
    constructor(message: string, exchange?: string) {
        super(message, "AUTHENTICATION_ERROR", false, exchange);
    }
}

export class PermissionDenied extends PmxtError {
    constructor(message: string, exchange?: string) {
        super(message, "PERMISSION_DENIED", false, exchange);
    }
}

export class NotFoundError extends PmxtError {
    constructor(message: string, exchange?: string, code: string = "NOT_FOUND") {
        super(message, code, false, exchange);
    }
}

export class OrderNotFound extends NotFoundError {
    constructor(orderId: string, exchange?: string) {
        super(`Order not found: ${orderId}`, exchange, "ORDER_NOT_FOUND");
    }
}

export class MarketNotFound extends NotFoundError {
    constructor(marketId: string, exchange?: string) {
        super(`Market not found: ${marketId}`, exchange, "MARKET_NOT_FOUND");
    }
}

export class EventNotFound extends NotFoundError {
    constructor(identifier: string, exchange?: string) {
        super(`Event not found: ${identifier}`, exchange, "EVENT_NOT_FOUND");
    }
}

export class RateLimitExceeded extends PmxtError {
    public readonly retryAfter?: number;

    constructor(message: string, retryAfter?: number, exchange?: string) {
        super(message, "RATE_LIMIT_EXCEEDED", true, exchange);
        this.retryAfter = retryAfter;
    }
}

export class InvalidOrder extends PmxtError {
    constructor(message: string, exchange?: string) {
        super(message, "INVALID_ORDER", false, exchange);
    }
}

export class InsufficientFunds extends PmxtError {
    constructor(message: string, exchange?: string) {
        super(message, "INSUFFICIENT_FUNDS", false, exchange);
    }
}

export class ValidationError extends PmxtError {
    public readonly field?: string;

    constructor(message: string, field?: string, exchange?: string) {
        super(message, "VALIDATION_ERROR", false, exchange);
        this.field = field;
    }
}

// 5xx Server/Network Errors

export class NetworkError extends PmxtError {
    constructor(message: string, exchange?: string) {
        super(message, "NETWORK_ERROR", true, exchange);
    }
}

export class ExchangeNotAvailable extends PmxtError {
    constructor(message: string, exchange?: string) {
        super(message, "EXCHANGE_NOT_AVAILABLE", true, exchange);
    }
}

export class NotSupported extends PmxtError {
    constructor(message: string, exchange?: string) {
        super(message, "NOT_SUPPORTED", false, exchange);
    }
}

// Error code to class mapping
const ERROR_CODE_MAP: Record<string, new (...args: any[]) => PmxtError> = {
    BAD_REQUEST: BadRequest,
    AUTHENTICATION_ERROR: AuthenticationError,
    PERMISSION_DENIED: PermissionDenied,
    NOT_FOUND: NotFoundError,
    ORDER_NOT_FOUND: OrderNotFound,
    MARKET_NOT_FOUND: MarketNotFound,
    EVENT_NOT_FOUND: EventNotFound,
    RATE_LIMIT_EXCEEDED: RateLimitExceeded,
    INVALID_ORDER: InvalidOrder,
    INSUFFICIENT_FUNDS: InsufficientFunds,
    VALIDATION_ERROR: ValidationError,
    NETWORK_ERROR: NetworkError,
    EXCHANGE_NOT_AVAILABLE: ExchangeNotAvailable,
};

/** Convert a server error response object into a typed PmxtError. */
export function fromServerError(errorData: unknown): PmxtError {
    if (typeof errorData === "string") {
        return new PmxtError(errorData);
    }

    const data = errorData as Record<string, unknown>;

    const message = (typeof data.message === "string" ? data.message : undefined) || "Unknown error";
    const code = (typeof data.code === "string" ? data.code : undefined) || "UNKNOWN_ERROR";
    const retryable = typeof data.retryable === "boolean" ? data.retryable : false;
    const exchange = typeof data.exchange === "string" ? data.exchange : undefined;

    const ErrorClass = ERROR_CODE_MAP[code];

    if (ErrorClass === RateLimitExceeded) {
        const retryAfter = typeof data.retryAfter === "number" ? data.retryAfter : undefined;
        return new RateLimitExceeded(message, retryAfter, exchange);
    }
    if (ErrorClass === ValidationError) {
        const field = typeof data.field === "string" ? data.field : undefined;
        return new ValidationError(message, field, exchange);
    }
    if (ErrorClass) {
        return new ErrorClass(message, exchange);
    }

    return new PmxtError(message, code, retryable, exchange);
}

// Hosted error classes live in ./hosted-errors. Re-exported from index.ts
// at the package root, NOT here — re-exporting from errors.ts creates a
// circular dependency (hosted-errors imports PmxtError from errors.ts)
// that crashes tsx/CJS module loaders even though tsc and ts-jest tolerate it.
