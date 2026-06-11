/**
 * Hosted trading v0 response mappers.
 *
 * The hosted trading API exposes explicit `/v0/*` JSON shapes. These helpers
 * translate those wire dictionaries to the SDK TypeScript interfaces.
 *
 * Mirrors `sdks/python/pmxt/_hosted_mappers.py`.
 */

import { InvalidOrder } from "./errors";
import { Balance, Order, Position, UserTrade } from "./models";

// ---------------------------------------------------------------------------
// Precision helper
// ---------------------------------------------------------------------------

const SIX_DEC_SCALE = 1_000_000n;

/**
 * Convert a decimal amount to integer micro-units (6-decimal grid).
 *
 * Rejects amounts whose fractional part has more than 6 digits. Pure integer
 * math via BigInt — no float rounding involved.
 */
export function to6dec(amount: number | string | bigint): bigint {
    const str = typeof amount === "bigint" ? `${amount}` : String(amount);
    const negative = str.startsWith("-");
    const cleaned = negative ? str.slice(1) : str;
    const [intPart, fracPart = ""] = cleaned.split(".");
    if (fracPart.length > 6) {
        throw new InvalidOrder(`amount precision exceeds 6 decimals: ${amount}`);
    }
    if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
        throw new InvalidOrder(`invalid amount: ${amount}`);
    }
    const padded = (fracPart + "000000").slice(0, 6);
    const intMag = BigInt(intPart || "0");
    const scaled = intMag * SIX_DEC_SCALE + BigInt(padded);
    return negative ? -scaled : scaled;
}

// ---------------------------------------------------------------------------
// Order mappers
// ---------------------------------------------------------------------------

/** Map an `OrderV0` JSON object to {@link Order}. */
export function orderFromV0(payload: Record<string, unknown>): Order {
    const id = strOrEmpty(payload["id"]);
    const marketId = strOrEmpty(payload["market_id"] ?? payload["marketId"]);
    const outcomeId = strOrEmpty(payload["outcome_id"] ?? payload["outcomeId"]);
    const status = strOrEmpty(payload["status"]);
    const sideRaw = payload["side"];
    const side: Order["side"] = sideRaw === "sell" ? "sell" : "buy";
    const typeRaw = payload["type"];
    const type: Order["type"] = typeRaw === "limit" ? "limit" : "market";

    const order: Order = {
        id,
        marketId,
        outcomeId,
        side,
        type,
        amount: floatOrZero(payload["amount"]),
        status,
        filled: floatOrZero(payload["filled"]),
        remaining: floatOrZero(payload["remaining"]),
        timestamp: timestampToMs(payload["timestamp"]),
    };

    const price = floatOrUndefined(payload["price"]);
    if (price !== undefined) order.price = price;

    const fee = floatOrUndefined(payload["fee"]);
    if (fee !== undefined) order.fee = fee;

    return order;
}

/** Map an {@link Order} back to an `OrderV0` JSON object. */
export function orderToV0(order: Order): Record<string, unknown> {
    const out: Record<string, unknown> = {
        id: order.id,
        market_id: order.marketId,
        outcome_id: order.outcomeId,
        side: order.side,
        type: order.type,
        amount: order.amount,
        status: order.status,
        filled: order.filled,
        remaining: order.remaining,
        timestamp: msToTimestamp(order.timestamp),
    };
    if (order.price !== undefined) out["price"] = order.price;
    if (order.fee !== undefined) out["fee"] = order.fee;
    return out;
}

// ---------------------------------------------------------------------------
// UserTrade mappers
// ---------------------------------------------------------------------------

/** Map a `UserTradeV0` JSON object to {@link UserTrade}. */
export function userTradeFromV0(payload: Record<string, unknown>): UserTrade {
    const sideRaw = payload["side"];
    const side: UserTrade["side"] =
        sideRaw === "buy" || sideRaw === "sell" ? sideRaw : "unknown";

    const trade: UserTrade = {
        id: strOrEmpty(payload["id"]),
        price: floatOrZero(payload["price"]),
        // The v0 wire sends trade amounts in 6-dec micro-shares (verified
        // live: 58139533.0 == 58.139533 shares, matching the same position's
        // decimal `shares`). Normalize so UserTrade.amount means shares,
        // like everywhere else in the SDK.
        amount: floatOrZero(payload["amount"]) / 1_000_000,
        side,
        timestamp: timestampToMs(payload["timestamp"]),
    };

    const orderId = strOrUndefined(payload["order_id"] ?? payload["orderId"]);
    if (orderId !== undefined) trade.orderId = orderId;

    const outcomeId = strOrUndefined(payload["outcome_id"] ?? payload["outcomeId"]);
    if (outcomeId !== undefined) trade.outcomeId = outcomeId;

    const marketId = strOrUndefined(payload["market_id"] ?? payload["marketId"]);
    if (marketId !== undefined) trade.marketId = marketId;

    return trade;
}

/** Map a {@link UserTrade} back to a `UserTradeV0` JSON object. */
export function userTradeToV0(trade: UserTrade): Record<string, unknown> {
    const out: Record<string, unknown> = {
        id: trade.id,
        side: trade.side,
        // Inverse of userTradeFromV0: decimal shares -> 6-dec micro-shares.
        amount: Math.round(trade.amount * 1_000_000),
        price: trade.price,
        timestamp: msToTimestamp(trade.timestamp),
    };
    if (trade.orderId !== undefined) out["order_id"] = trade.orderId;
    if (trade.outcomeId !== undefined) out["outcome_id"] = trade.outcomeId;
    if (trade.marketId !== undefined) out["market_id"] = trade.marketId;
    return out;
}

// ---------------------------------------------------------------------------
// Position mappers
// ---------------------------------------------------------------------------

/**
 * Map a `PositionV0` JSON object to {@link Position}.
 *
 * Optional fields (`outcomeLabel`, `entryPrice`, `currentPrice`,
 * `unrealizedPnL`, `realizedPnL`) surface as `undefined` when missing —
 * **never** a fake `0` or `""`. This keeps the SDK honest about which data
 * the server actually provided.
 */
export function positionFromV0(payload: Record<string, unknown>): Position {
    const size = floatOrZero(payload["shares"] ?? payload["size"]);
    const entryPrice = floatOrUndefined(payload["entry_price"] ?? payload["entryPrice"]);
    const currentPrice = floatOrUndefined(
        payload["current_price"] ?? payload["currentPrice"],
    );

    let unrealizedPnL = floatOrUndefined(
        payload["unrealized_pnl"] ?? payload["unrealizedPnl"] ?? payload["unrealizedPnL"],
    );
    if (
        unrealizedPnL === undefined &&
        entryPrice !== undefined &&
        currentPrice !== undefined
    ) {
        unrealizedPnL = (currentPrice - entryPrice) * size;
    }

    // Position requires marketId/outcomeId/outcomeLabel/entryPrice/currentPrice/unrealizedPnL
    // in the current interface. We construct with safe defaults and only override
    // when present. Per plan v5: the SDK should NOT fabricate financial data —
    // when the server didn't supply entryPrice/currentPrice/outcomeLabel, we mark
    // them via undefined (cast through a partial since the existing Position type
    // hasn't yet been widened to Optional in this parallel-agent change).
    const position = {
        marketId: strOrEmpty(payload["market_id"] ?? payload["marketId"]),
        outcomeId: strOrEmpty(payload["outcome_id"] ?? payload["outcomeId"]),
        outcomeLabel:
            strOrUndefined(payload["outcome_label"] ?? payload["outcomeLabel"]) as
                | string
                | undefined,
        size,
        entryPrice: entryPrice as number | undefined,
        currentPrice: currentPrice as number | undefined,
        unrealizedPnL: unrealizedPnL as number | undefined,
        realizedPnL: floatOrUndefined(
            payload["realized_pnl"] ?? payload["realizedPnl"] ?? payload["realizedPnL"],
        ),
    } as unknown as Position;

    return position;
}

/** Map a {@link Position} back to a `PositionV0` JSON object. */
export function positionToV0(position: Position): Record<string, unknown> {
    const out: Record<string, unknown> = {
        market_id: position.marketId,
        outcome_id: position.outcomeId,
        shares: position.size,
    };
    if (position.outcomeLabel !== undefined && position.outcomeLabel !== "") {
        out["outcome_label"] = position.outcomeLabel;
    }
    if (position.entryPrice !== undefined) out["entry_price"] = position.entryPrice;
    if (position.currentPrice !== undefined) out["current_price"] = position.currentPrice;
    if (position.unrealizedPnL !== undefined) out["unrealized_pnl"] = position.unrealizedPnL;
    if (position.realizedPnL !== undefined) out["realized_pnl"] = position.realizedPnL;
    return out;
}

// ---------------------------------------------------------------------------
// Balance mappers
// ---------------------------------------------------------------------------

/**
 * Map a `BalanceV0` JSON object to {@link Balance}.
 *
 * Hosted-mode semantic: PreFundedEscrow doesn't reserve funds for resting
 * orders, so `available = total` and `locked = 0`. Concurrent limit orders
 * may fail at fill time if cumulative cost exceeds the escrow balance.
 */
export function balanceFromV0(payload: Record<string, unknown>): Balance {
    const total = floatOrZero(payload["amount"] ?? payload["total"]);
    const currency = strOrUndefined(payload["currency"]) ?? "USDC";
    return {
        currency,
        total,
        available: total,
        locked: 0,
    };
}

/** Map a {@link Balance} back to a `BalanceV0` JSON object. */
export function balanceToV0(balance: Balance): Record<string, unknown> {
    return {
        currency: balance.currency,
        amount: balance.total,
    };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function strOrUndefined(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") return value || undefined;
    return String(value);
}

function strOrEmpty(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    return String(value);
}

function floatOrUndefined(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string") {
        if (!value) return undefined;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function floatOrZero(value: unknown): number {
    const converted = floatOrUndefined(value);
    return converted !== undefined ? converted : 0;
}

/**
 * Parse an ISO-8601 string (or numeric) timestamp to milliseconds since epoch.
 * Returns `0` if the input is null/undefined/empty/unparseable.
 */
function timestampToMs(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") {
        return Number.isFinite(value) ? Math.trunc(value) : 0;
    }
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string") {
        if (!value) return 0;
        const normalized = value.endsWith("Z")
            ? value
            : /[+-]\d{2}:?\d{2}$/.test(value)
              ? value
              : value + "Z";
        const ms = Date.parse(normalized);
        return Number.isFinite(ms) ? ms : 0;
    }
    return 0;
}

/** Convert milliseconds-since-epoch back to an ISO-8601 string. */
function msToTimestamp(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) {
        return new Date(value).toISOString();
    }
    if (typeof value === "bigint") {
        return new Date(Number(value)).toISOString();
    }
    return undefined;
}
