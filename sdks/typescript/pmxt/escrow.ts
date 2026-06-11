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

export class Escrow {
    constructor(private readonly client: HostedClientLike) {}

    /**
     * Build an unsigned approve transaction for a given ERC-20 `token`. When
     * `amountWei` is omitted, the server returns an unlimited approval.
     */
    async approveTx(token: string, amountWei?: bigint): Promise<unknown> {
        const route = HOSTED_METHOD_ROUTES.get("escrowApproveTx")!;
        return _tradingRequest(this.client, {
            method: route.method,
            path: route.path,
            body: {
                token,
                amount_wei: amountWei === undefined ? null : amountWei.toString(),
            },
        });
    }

    /**
     * Build an unsigned deposit transaction for `amount` (USDC, 6-decimal
     * grid). Accepts number, decimal string, or BigInt in micro-units.
     */
    async depositTx(amount: number | string | bigint): Promise<unknown> {
        const route = HOSTED_METHOD_ROUTES.get("escrowDepositTx")!;
        return _tradingRequest(this.client, {
            method: route.method,
            path: route.path,
            body: {
                amount: typeof amount === "bigint" ? amount.toString() : amount,
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
        const route = HOSTED_METHOD_ROUTES.get("escrowWithdrawTx")!;
        const normalizedAmount =
            amount === undefined
                ? null
                : typeof amount === "bigint"
                  ? amount.toString()
                  : amount;
        return _tradingRequest(this.client, {
            method: route.method,
            path: route.path,
            body: { action, amount: normalizedAmount },
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
        const route = HOSTED_METHOD_ROUTES.get("escrowWithdrawals")!;
        const path = formatRoutePath(route, { address });
        return _tradingRequest(this.client, {
            method: route.method,
            path,
            params: { include: opts.include ?? "pending,events" },
        });
    }
}
