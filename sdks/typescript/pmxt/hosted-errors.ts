/**
 * Hosted trading error hierarchy and upstream response mapping.
 *
 * Mirrors the Python implementation in `pmxt/_hosted_errors.py`. TypeScript
 * does not support multiple inheritance, so each hosted error class extends
 * the semantically-closest legacy parent (e.g. `InsufficientEscrowBalance`
 * extends `InsufficientFunds`) so existing `instanceof` checks continue to
 * match. `HostedTradingError[Symbol.hasInstance]` uses the `static
 * isHostedError = true` flag so callers can also catch any hosted-mode failure
 * with `e instanceof HostedTradingError`.
 */

import {
    AuthenticationError,
    ExchangeNotAvailable,
    InsufficientFunds,
    InvalidOrder,
    NotFoundError,
    PmxtError,
    ValidationError,
} from "./errors";

export class HostedTradingError extends PmxtError {
    static readonly isHostedError = true;
    readonly status: number;
    readonly detail: string;

    static [Symbol.hasInstance](value: unknown): boolean {
        if (this !== HostedTradingError) {
            return Function.prototype[Symbol.hasInstance].call(this, value);
        }
        const ctor = (value as { constructor?: { isHostedError?: boolean } } | null)?.constructor;
        return ctor != null && ctor.isHostedError === true;
    }

    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.name = this.constructor.name;
    }
}

export class InsufficientEscrowBalance extends InsufficientFunds {
    static readonly isHostedError = true;
    readonly status: number;
    readonly detail: string;

    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.name = this.constructor.name;
    }
}

export class OrderSizeTooSmall extends InvalidOrder {
    static readonly isHostedError = true;
    readonly status: number;
    readonly detail: string;

    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.name = this.constructor.name;
    }
}

export class InvalidApiKey extends AuthenticationError {
    static readonly isHostedError = true;
    readonly status: number;
    readonly detail: string;

    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.name = this.constructor.name;
    }
}

export class OutcomeNotFound extends NotFoundError {
    static readonly isHostedError = true;
    readonly status: number;
    readonly detail: string;

    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.name = this.constructor.name;
    }
}

export class CatalogUnavailable extends ExchangeNotAvailable {
    static readonly isHostedError = true;
    readonly status: number;
    readonly detail: string;

    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.name = this.constructor.name;
    }
}

export class BuiltOrderExpired extends InvalidOrder {
    static readonly isHostedError = true;
    readonly status: number;
    readonly detail: string;

    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.name = this.constructor.name;
    }
}

export class InvalidSignature extends AuthenticationError {
    static readonly isHostedError = true;
    readonly status: number;
    readonly detail: string;

    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.name = this.constructor.name;
    }
}

export class NoLiquidity extends InvalidOrder {
    static readonly isHostedError = true;
    readonly status: number;
    readonly detail: string;

    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
        this.name = this.constructor.name;
    }
}

/**
 * Local validation failure. Not a hosted-mode upstream error, so does NOT
 * carry the `isHostedError` flag.
 */
export class MissingWalletAddress extends ValidationError {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

/**
 * Returns true if `e` is a hosted trading error — either an instance of
 * {@link HostedTradingError} or any subclass that carries the
 * `static isHostedError = true` marker.
 */
export function isHostedError(e: unknown): boolean {
    if (e instanceof HostedTradingError) return true;
    const ctor = (e as { constructor?: { isHostedError?: boolean } } | null)?.constructor;
    return ctor != null && ctor.isHostedError === true;
}

/**
 * Read an upstream `Response` and throw the matching hosted trading error.
 * Always throws — return type is `never`.
 */
export async function raiseFromResponse(response: Response): Promise<never> {
    const status = response.status;
    let detail = "";

    try {
        const body = await response.json();
        if (body != null && typeof body === "object") {
            const record = body as Record<string, unknown>;
            const candidate =
                (typeof record.detail === "string" ? record.detail : undefined) ||
                (typeof record.message === "string" ? record.message : undefined) ||
                (typeof record.error === "string" ? record.error : undefined);
            detail = candidate || JSON.stringify(body);
        } else {
            detail = typeof body === "string" ? body : JSON.stringify(body);
        }
    } catch {
        try {
            detail = await response.text();
        } catch {
            detail = `HTTP ${status}`;
        }
    }

    if (status === 401) {
        throw new InvalidApiKey(status, detail);
    }
    if (detail.startsWith("Insufficient escrow balance")) {
        throw new InsufficientEscrowBalance(status, detail);
    }
    if (detail.includes("below the minimum")) {
        throw new OrderSizeTooSmall(status, detail);
    }
    if (detail.includes("catalog: no outcome")) {
        throw new OutcomeNotFound(status, detail);
    }
    if (detail.startsWith("catalog:")) {
        throw new CatalogUnavailable(status, detail);
    }
    if (detail.includes("built_order_id expired") || detail.includes("cancel_id expired")) {
        throw new BuiltOrderExpired(status, detail);
    }
    if (detail.includes("Invalid signature")) {
        throw new InvalidSignature(status, detail);
    }
    if (detail.includes("book has no resting asks") || detail.includes("book has no resting bids")) {
        throw new NoLiquidity(status, detail);
    }

    throw new HostedTradingError(status, detail);
}
