/**
 * Hosted-mode HTTP routing for the pmxt TypeScript SDK.
 *
 * When a client is configured with a `pmxtApiKey`, supported method calls are
 * dispatched to the pmxt-hosted trading API instead of the venue's native
 * client. This module owns:
 *
 *   - the static route table mapping SDK method names to hosted endpoints,
 *   - the venue allowlist for hosted trading,
 *   - wallet address resolution for user-scoped reads/trades, and
 *   - the low-level `_tradingRequest` HTTP helper.
 *
 * Mirrors `sdks/python/pmxt/_hosted_routing.py`.
 */

import { NotSupported } from "./errors";
import { MissingWalletAddress, raiseFromResponse } from "./hosted-errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type HostedBase = "catalog" | "trading";

export const HOSTED_CATALOG_BASE_URL = "https://api.pmxt.dev";
export const HOSTED_TRADING_BASE_URL = "https://trade.pmxt.dev";
export const HOSTED_TRADING_VENUES: ReadonlySet<string> = new Set([
    "polymarket",
    "opinion",
    "limitless",
]);

export interface HostedRoute {
    method: HttpMethod;
    path: string;
    base: HostedBase;
    requiresWalletAddress?: boolean;
}

export const HOSTED_METHOD_ROUTES: ReadonlyMap<string, HostedRoute> = new Map([
    ["createOrder",       { method: "POST", path: "/v0/trade/build-order",            base: "trading" }],
    ["buildOrder",        { method: "POST", path: "/v0/trade/build-order",            base: "trading" }],
    ["submitOrder",       { method: "POST", path: "/v0/trade/submit-order",           base: "trading" }],
    ["cancelOrderBuild",  { method: "POST", path: "/v0/orders/cancel/build",          base: "trading" }],
    ["cancelOrder",       { method: "POST", path: "/v0/orders/cancel",                base: "trading" }],
    ["fetchOrder",        { method: "GET",  path: "/v0/orders/{order_id}",            base: "trading" }],
    ["fetchOpenOrders",   { method: "GET",  path: "/v0/orders/open",                  base: "trading", requiresWalletAddress: true }],
    ["fetchMyTrades",     { method: "GET",  path: "/v0/user/{address}/trades",        base: "trading", requiresWalletAddress: true }],
    ["fetchBalance",      { method: "GET",  path: "/v0/user/{address}/balances",      base: "trading", requiresWalletAddress: true }],
    ["fetchPositions",    { method: "GET",  path: "/v0/user/{address}/positions",     base: "trading", requiresWalletAddress: true }],
    ["escrowApproveTx",   { method: "POST", path: "/v0/escrow/approve",               base: "trading" }],
    ["escrowDepositTx",   { method: "POST", path: "/v0/escrow/deposit",               base: "trading" }],
    ["escrowWithdrawTx",  { method: "POST", path: "/v0/escrow/withdraw",              base: "trading" }],
    ["escrowWithdrawals", { method: "GET",  path: "/v0/escrow/{address}/withdrawals", base: "trading", requiresWalletAddress: true }],
]);

/**
 * Minimal duck-typed view of a venue client used by hosted-mode helpers.
 *
 * Defining this as a structural interface keeps `hosted-routing` decoupled
 * from the concrete `Exchange` class and makes unit testing trivial.
 */
export interface HostedClientLike {
    pmxtApiKey?: string;
    exchangeName: string;
    walletAddress?: string;
}

/**
 * Throw {@link NotSupported} if the client is in hosted mode (i.e. has a
 * `pmxtApiKey`) but targets a venue outside the hosted trading allowlist.
 * No-op for non-hosted clients.
 */
export function ensureHostedTradingSupported(client: HostedClientLike): void {
    if (!client.pmxtApiKey) return;
    if (!HOSTED_TRADING_VENUES.has(client.exchangeName)) {
        throw new NotSupported(
            `Hosted trading is only supported for Polymarket, Opinion, and Limitless; ${client.exchangeName} is not supported with pmxtApiKey.`,
        );
    }
}

/**
 * Resolve the wallet address to use for a user-scoped hosted call, preferring
 * an explicit per-call override over the client default. Throws
 * {@link MissingWalletAddress} when neither is set.
 */
export function resolveWalletAddress(client: HostedClientLike, override?: string): string {
    if (override) return override;
    if (client.walletAddress) return client.walletAddress;
    throw new MissingWalletAddress(
        "walletAddress is required for hosted-mode reads and trades; pass it to the exchange constructor or as an override.",
    );
}

/**
 * Substitute `{name}` placeholders in a route path with URL-encoded values
 * from `params`. Throws if a referenced parameter is missing.
 */
export function formatRoutePath(
    route: HostedRoute,
    params: Record<string, string | number | undefined>,
): string {
    return route.path.replace(/\{(\w+)\}/g, (_, key) => {
        const value = params[key];
        if (value === undefined || value === null) {
            throw new Error(`path parameter cannot be undefined: ${key}`);
        }
        return encodeURIComponent(String(value));
    });
}

export interface TradingRequestOptions {
    method: HttpMethod;
    path: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Issue a request against the hosted trading API.
 *
 * NOTE: writes (POST/PUT/DELETE) are NEVER retried. `built_order_id` and
 * `cancel_id` are single-use server-side, so replaying a lost response would
 * 404 even though the original write succeeded. Callers needing retry logic
 * must layer it on top with awareness of this invariant.
 */
export async function _tradingRequest(
    client: HostedClientLike,
    opts: TradingRequestOptions,
): Promise<unknown> {
    if (!client.pmxtApiKey) {
        throw new Error("hosted request requires pmxtApiKey");
    }

    const base = HOSTED_TRADING_BASE_URL.replace(/\/$/, "");
    const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
    let url = base + path;

    if (opts.params) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(opts.params)) {
            if (v !== undefined) qs.append(k, String(v));
        }
        const q = qs.toString();
        if (q) url += `?${q}`;
    }

    const headers: Record<string, string> = {
        Authorization: `Bearer ${client.pmxtApiKey}`,
    };
    if (opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }

    const resp = await fetch(url, {
        method: opts.method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    const text = await resp.text();

    if (!resp.ok) {
        await raiseFromResponse(new Response(text, { status: resp.status, statusText: resp.statusText }));
    }

    if (!text) return null;
    const payload = JSON.parse(text);
    if (
        payload != null &&
        typeof payload === "object" &&
        ((payload as Record<string, unknown>).success === false ||
            typeof (payload as Record<string, unknown>).error === "string")
    ) {
        await raiseFromResponse(new Response(text, { status: resp.status, statusText: resp.statusText }));
    }
    return payload;
}
