/**
 * Hosted-mode escrow namespace.
 *
 * Exposes the `/v0/escrow/*` endpoints of the pmxt hosted trading API as a
 * small ergonomic helper class. Each method returns the raw upstream JSON
 * payload as `unknown` — typed mappers can be layered on later without
 * breaking the wire shape.
 *
 * Mirrors `sdks/python/pmxt/escrow.py`.
 */

import {
    _tradingRequest,
    formatRoutePath,
    HOSTED_METHOD_ROUTES,
    HostedClientLike,
    resolveWalletAddress,
} from "./hosted-routing";
import { ValidationError } from "./errors";

const APPROVAL_TOKENS = new Set(["usdc", "ctf"]);
const WITHDRAW_ACTIONS = new Set(["request", "claim", "cancel"]);
const USDC_SCALE = 1_000_000n;

function isDecimalTokenId(token: string): boolean {
    return /^[0-9]+$/.test(token);
}

function normalizeApprovalToken(token: string): string {
    if (typeof token !== "string") {
        throw new ValidationError(
            "token must be 'usdc', 'ctf', or a decimal CTF token_id string",
            "token",
        );
    }

    const candidate = token.trim();
    const normalized = candidate.toLowerCase();
    if (APPROVAL_TOKENS.has(normalized)) {
        return normalized;
    }
    if (isDecimalTokenId(candidate)) {
        return candidate;
    }
    throw new ValidationError(
        "token must be 'usdc', 'ctf', or a decimal CTF token_id string",
        "token",
    );
}

function normalizeAmountWei(amountWei: bigint | undefined): string | undefined {
    if (amountWei === undefined) {
        return undefined;
    }
    if (typeof amountWei !== "bigint") {
        throw new ValidationError("amount_wei must be a non-negative integer", "amount_wei");
    }
    if (amountWei < 0n) {
        throw new ValidationError("amount_wei must be non-negative", "amount_wei");
    }
    return amountWei.toString();
}

function validateUsdcDecimal(value: string, field: string): void {
    const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(value);
    if (!match) {
        throw new ValidationError(`${field} must be a finite positive number`, field);
    }

    const fractional = match[2] ?? "";
    if (fractional.length > 6) {
        throw new ValidationError(
            `${field} precision exceeds 6 decimals; max precision for USDC is 0.000001`,
            field,
        );
    }

    const scaled = BigInt(match[1]) * USDC_SCALE + BigInt(fractional.padEnd(6, "0"));
    if (scaled <= 0n) {
        throw new ValidationError(`${field} must be positive`, field);
    }
}

function normalizeUsdcAmount(value: number | string | bigint, field: string = "amount"): number | string {
    if (typeof value === "bigint") {
        if (value <= 0n) {
            throw new ValidationError(`${field} must be positive`, field);
        }
        return value.toString();
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new ValidationError(`${field} must be a finite positive number`, field);
        }
        validateUsdcDecimal(String(value), field);
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        validateUsdcDecimal(trimmed, field);
        return trimmed;
    }
    throw new ValidationError(`${field} must be a finite positive number`, field);
}

function normalizeWithdrawAction(action: string): "request" | "claim" | "cancel" {
    if (typeof action === "string" && WITHDRAW_ACTIONS.has(action)) {
        return action as "request" | "claim" | "cancel";
    }
    throw new ValidationError("action must be 'request', 'claim', or 'cancel'", "action");
}

export class Escrow {
    constructor(private readonly client: HostedClientLike) {}

    /**
     * Build an unsigned approve transaction for a given ERC-20 `token`. When
     * `amountWei` is omitted, the server returns an unlimited approval.
     */
    async approveTx(token: string, amountWei?: bigint): Promise<unknown> {
        const address = resolveWalletAddress(this.client);
        const approvalAmount = normalizeAmountWei(amountWei);
        const route = HOSTED_METHOD_ROUTES.get("escrowApproveTx")!;
        return _tradingRequest(this.client, {
            method: route.method,
            path: route.path,
            body: {
                token: normalizeApprovalToken(token),
                user_address: address,
                ...(approvalAmount === undefined ? {} : { amount_wei: approvalAmount }),
            },
        });
    }

    /**
     * Build an unsigned deposit transaction for `amount` (USDC, 6-decimal
     * grid). Accepts number, decimal string, or BigInt in micro-units.
     */
    async depositTx(amount: number | string | bigint): Promise<unknown> {
        const address = resolveWalletAddress(this.client);
        const route = HOSTED_METHOD_ROUTES.get("escrowDepositTx")!;
        return _tradingRequest(this.client, {
            method: route.method,
            path: route.path,
            body: {
                token: "usdc",
                amount: normalizeUsdcAmount(amount),
                user_address: address,
            },
        });
    }

    /**
     * Build an unsigned withdraw transaction. `action` selects the stage of
     * the withdrawal lifecycle: `request` initiates, `claim` finalizes after
     * the timelock, `cancel` aborts a pending request.
     */
    async withdrawTx(
        action: "request" | "claim" | "cancel",
        amount?: number | string | bigint,
    ): Promise<unknown> {
        const normalizedAction = normalizeWithdrawAction(action);
        const address = resolveWalletAddress(this.client);
        const route = HOSTED_METHOD_ROUTES.get("escrowWithdrawTx")!;
        if (normalizedAction === "request") {
            if (amount === undefined) {
                throw new ValidationError("amount is required when action='request'", "amount");
            }
            return _tradingRequest(this.client, {
                method: route.method,
                path: route.path,
                body: {
                    action: normalizedAction,
                    token: "usdc",
                    amount: normalizeUsdcAmount(amount),
                    user_address: address,
                },
            });
        }
        if (amount !== undefined) {
            throw new ValidationError(
                `amount must be omitted when action='${normalizedAction}'`,
                "amount",
            );
        }
        return _tradingRequest(this.client, {
            method: route.method,
            path: route.path,
            body: { action: normalizedAction, token: "usdc", user_address: address },
        });
    }

    /**
     * List the user's withdrawal records. `include` is forwarded verbatim and
     * defaults to `"pending,events"` to match the Python SDK.
     */
    async withdrawals(
        opts: { include?: string; address?: string } = {},
    ): Promise<unknown> {
        const address = resolveWalletAddress(this.client, opts.address);
        const include = (opts.include ?? "pending,events").trim();
        if (!include) {
            throw new ValidationError("include must not be empty", "include");
        }
        const route = HOSTED_METHOD_ROUTES.get("escrowWithdrawals")!;
        const path = formatRoutePath(route, { address });
        return _tradingRequest(this.client, {
            method: route.method,
            path,
            params: { include },
        });
    }
}
