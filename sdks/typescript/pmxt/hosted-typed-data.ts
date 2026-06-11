/**
 * Hosted trading EIP-712 validation guardrails.
 *
 * Three layers (mirrors `sdks/python/pmxt/_hosted_typeddata.py`):
 *   1. Schema validation — per-route shape, domain, types, message keys, deadline
 *   2. Economic match — typed_data economics agree with the user's build request
 *   3. Post-sign — exact 65-byte length, low-s canonical, v ∈ {27, 28}, recovery
 *
 * Layer 3 uses the optional `ethers` peer dependency for typed-data verification.
 */

import { InvalidSignature } from "./hosted-errors";
import { to6dec } from "./hosted-mappers";
import { TypedData } from "./signers";

// The constants module is updated in a parallel-agent change to add these
// allowlists. We import them at runtime so we don't hard-fail if the change
// hasn't landed yet (the imports are typed below).
import * as constants from "./constants";

// ---------------------------------------------------------------------------
// Schema fixtures
// ---------------------------------------------------------------------------

type FieldList = ReadonlyArray<{ readonly name: string; readonly type: string }>;

const EIP712_DOMAIN_FIELDS: FieldList = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
];

const ORDER_PARAMS_FIELDS: FieldList = [
    { name: "user", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "worstPrice", type: "uint256" },
    { name: "maxCostUsdc", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
];

const SELL_ORDER_PARAMS_FIELDS: FieldList = [
    { name: "user", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "tokenAmount", type: "uint256" },
    { name: "worstPrice", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
];

const CROSS_CHAIN_ORDER_PARAMS_FIELDS: FieldList = [
    { name: "user", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "maxCostUsdc", type: "uint256" },
    { name: "worstPrice", type: "uint256" },
    { name: "destEscrow", type: "address" },
    { name: "oracleKey", type: "address" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
];

const CROSS_CHAIN_SELL_PAY_PARAMS_FIELDS: FieldList = [
    { name: "user", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "tokenAmount", type: "uint256" },
    { name: "worstPrice", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
];

const CROSS_CHAIN_SELL_PULL_PARAMS_FIELDS: FieldList = [
    { name: "user", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "tokenAmount", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
];

const CANCEL_ORDER_FIELDS: FieldList = [
    { name: "user", type: "address" },
    { name: "path", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
];

const CANCEL_PULL_FIELDS: FieldList = [
    { name: "user", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
];

interface DomainSchema {
    readonly name: string;
    readonly version: string;
    readonly chainId: number;
    /** Allowlist source key — looked up against constants at validation time. */
    readonly allowlistKey: "prefunded" | "venue";
}

interface TypedDataSchema {
    readonly primaryType: string;
    readonly domain: DomainSchema;
    readonly fields: FieldList;
    readonly messageKeys: ReadonlySet<string>;
    readonly walletField: string;
}

function messageKeysFromFields(fields: FieldList): ReadonlySet<string> {
    return new Set(fields.map((f) => f.name));
}

const PREFUNDED_DOMAIN: DomainSchema = {
    name: "PreFundedEscrow",
    version: "1",
    chainId: 137,
    allowlistKey: "prefunded",
};

const VENUE_DOMAIN: DomainSchema = {
    name: "VenueEscrow",
    version: "1",
    chainId: 56,
    allowlistKey: "venue",
};

export type HostedRoute =
    | "polymarket_buy"
    | "polymarket_sell"
    | "opinion_buy"
    | "opinion_sell_polygon"
    | "opinion_sell_bsc_pull"
    | "cancel_polymarket"
    | "cancel_opinion_polygon"
    | "cancel_opinion_bsc_pull";

const SCHEMAS: Readonly<Record<HostedRoute, TypedDataSchema>> = {
    polymarket_buy: {
        primaryType: "OrderParams",
        domain: PREFUNDED_DOMAIN,
        fields: ORDER_PARAMS_FIELDS,
        messageKeys: messageKeysFromFields(ORDER_PARAMS_FIELDS),
        walletField: "user",
    },
    polymarket_sell: {
        primaryType: "SellOrderParams",
        domain: PREFUNDED_DOMAIN,
        fields: SELL_ORDER_PARAMS_FIELDS,
        messageKeys: messageKeysFromFields(SELL_ORDER_PARAMS_FIELDS),
        walletField: "user",
    },
    opinion_buy: {
        primaryType: "CrossChainOrderParams",
        domain: PREFUNDED_DOMAIN,
        fields: CROSS_CHAIN_ORDER_PARAMS_FIELDS,
        messageKeys: messageKeysFromFields(CROSS_CHAIN_ORDER_PARAMS_FIELDS),
        walletField: "user",
    },
    opinion_sell_polygon: {
        primaryType: "CrossChainSellPayParams",
        domain: PREFUNDED_DOMAIN,
        fields: CROSS_CHAIN_SELL_PAY_PARAMS_FIELDS,
        messageKeys: messageKeysFromFields(CROSS_CHAIN_SELL_PAY_PARAMS_FIELDS),
        walletField: "user",
    },
    opinion_sell_bsc_pull: {
        primaryType: "CrossChainSellPullParams",
        domain: VENUE_DOMAIN,
        fields: CROSS_CHAIN_SELL_PULL_PARAMS_FIELDS,
        messageKeys: messageKeysFromFields(CROSS_CHAIN_SELL_PULL_PARAMS_FIELDS),
        walletField: "user",
    },
    cancel_polymarket: {
        primaryType: "CancelOrder",
        domain: PREFUNDED_DOMAIN,
        fields: CANCEL_ORDER_FIELDS,
        messageKeys: messageKeysFromFields(CANCEL_ORDER_FIELDS),
        walletField: "user",
    },
    cancel_opinion_polygon: {
        primaryType: "CancelOrder",
        domain: PREFUNDED_DOMAIN,
        fields: CANCEL_ORDER_FIELDS,
        messageKeys: messageKeysFromFields(CANCEL_ORDER_FIELDS),
        walletField: "user",
    },
    cancel_opinion_bsc_pull: {
        primaryType: "CancelPull",
        domain: VENUE_DOMAIN,
        fields: CANCEL_PULL_FIELDS,
        messageKeys: messageKeysFromFields(CANCEL_PULL_FIELDS),
        walletField: "user",
    },
};

// secp256k1 group order / 2, for canonical low-s check.
export const SECP256K1_HALF_N =
    0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;

// ---------------------------------------------------------------------------
// Layer 1 — Schema validation
// ---------------------------------------------------------------------------

/**
 * Validate the structural shape of a typed-data payload before signing.
 * Throws {@link InvalidSignature} on any mismatch.
 */
export function validateTypedData(
    typedData: TypedData,
    route: string,
    walletAddress: string,
): void {
    const schema = schemaFor(route);
    if (typedData === null || typeof typedData !== "object") {
        schemaFail("typed_data must be an object");
    }

    if (typedData.primaryType !== schema.primaryType) {
        schemaFail(
            `primaryType expected '${schema.primaryType}' got '${typedData.primaryType}'`,
        );
    }

    const types = typedData.types;
    if (types === null || typeof types !== "object") {
        schemaFail("types must be an object");
    }
    const domain = typedData.domain;
    if (domain === null || typeof domain !== "object") {
        schemaFail("domain must be an object");
    }
    const message = typedData.message;
    if (message === null || typeof message !== "object") {
        schemaFail("message must be an object");
    }

    validateDomain(domain, schema.domain);
    validateTypes(types, schema);
    validateMessage(message, schema, walletAddress);
}

function validateDomain(
    domain: TypedData["domain"],
    expected: DomainSchema,
): void {
    const actualKeys = Object.keys(domain).sort();
    const expectedKeys = ["chainId", "name", "verifyingContract", "version"];
    if (
        actualKeys.length !== expectedKeys.length ||
        actualKeys.some((k, i) => k !== expectedKeys[i])
    ) {
        schemaFail(
            `domain keys expected ${JSON.stringify(expectedKeys)} got ${JSON.stringify(actualKeys)}`,
        );
    }

    if (domain.name !== expected.name) {
        schemaFail(`domain.name expected '${expected.name}' got '${domain.name}'`);
    }
    if (domain.version !== expected.version) {
        schemaFail(
            `domain.version expected '${expected.version}' got '${domain.version}'`,
        );
    }
    const chainId = asInt(domain.chainId, "domain.chainId");
    if (chainId !== expected.chainId) {
        schemaFail(`domain.chainId expected ${expected.chainId} got ${chainId}`);
    }

    const verifyingContract = normalizeAddress(domain.verifyingContract);
    if (verifyingContract === null) {
        schemaFail("domain.verifyingContract must be an EVM address");
    }

    const allowlist = allowedAddresses(expected.allowlistKey, expected.chainId);
    if (allowlist.size === 0) {
        schemaFail(
            `no allowlisted verifyingContract configured for chain ${expected.chainId}`,
        );
    }
    if (!allowlist.has(verifyingContract!)) {
        schemaFail("domain.verifyingContract is not allowlisted");
    }
}

function validateTypes(
    types: Record<string, Array<{ name: string; type: string }>>,
    schema: TypedDataSchema,
): void {
    const typeNames = new Set(Object.keys(types));
    const allowed = new Set([schema.primaryType, "EIP712Domain"]);
    for (const name of typeNames) {
        if (!allowed.has(name)) {
            schemaFail(`unexpected type entry: '${name}'`);
        }
    }
    if (!typeNames.has("EIP712Domain")) {
        schemaFail("types.EIP712Domain is required");
    }
    if (!typeNames.has(schema.primaryType)) {
        schemaFail(`types.${schema.primaryType} is required`);
    }

    if (!fieldListsEqual(types["EIP712Domain"], EIP712_DOMAIN_FIELDS)) {
        schemaFail("types.EIP712Domain field order mismatch");
    }

    if (!fieldListsEqual(types[schema.primaryType], schema.fields)) {
        schemaFail(`types.${schema.primaryType} fields mismatch`);
    }
}

function validateMessage(
    message: Record<string, unknown>,
    schema: TypedDataSchema,
    walletAddress: string,
): void {
    const actualKeys = new Set(Object.keys(message));
    if (
        actualKeys.size !== schema.messageKeys.size ||
        [...actualKeys].some((k) => !schema.messageKeys.has(k))
    ) {
        schemaFail(
            `message keys expected ${JSON.stringify([...schema.messageKeys].sort())} got ${JSON.stringify([...actualKeys].sort())}`,
        );
    }

    const walletValue = message[schema.walletField];
    if (!addressesEqual(walletValue, walletAddress)) {
        schemaFail(`message.${schema.walletField} does not match wallet_address`);
    }

    const deadlineKey =
        "deadline" in message ? "deadline" : "expiry" in message ? "expiry" : null;
    if (deadlineKey === null) {
        schemaFail("message.deadline/expiry is required");
    }
    const deadline = asInt(message[deadlineKey!], `message.${deadlineKey}`);
    if (deadline <= Math.floor(Date.now() / 1000)) {
        schemaFail(`message.${deadlineKey} is expired`);
    }
}

// ---------------------------------------------------------------------------
// Layer 2 — Economic match
// ---------------------------------------------------------------------------

/**
 * Reject typed-data whose economics don't agree with the user's original
 * build request / build response. Guards against a compromised server
 * returning valid-shape typed-data with altered amounts or wrong target.
 */
export function validateEconomics(
    typedData: TypedData,
    route: string,
    buildRequest: any,
    buildResponse: any,
): void {
    schemaFor(route); // assert known route
    if (typedData === null || typeof typedData !== "object") {
        economicFail("typed_data must be an object");
    }
    const message = typedData.message;
    if (message === null || typeof message !== "object") {
        economicFail("message must be an object");
    }

    if (route === "polymarket_buy") {
        validatePolymarketBuyEconomics(message, buildRequest);
        validateWorstPrice(message, route, buildRequest, buildResponse);
    } else if (route === "polymarket_sell") {
        validatePolymarketSellEconomics(message, buildRequest);
        validateWorstPrice(message, route, buildRequest, buildResponse);
    } else if (
        route === "opinion_buy" ||
        route === "opinion_sell_polygon" ||
        route === "opinion_sell_bsc_pull"
    ) {
        validateOpinionMarketId(message, buildResponse);
    }
    // cancel_* routes: no economic check — chain enforces nonce.
}

function validatePolymarketBuyEconomics(
    message: Record<string, unknown>,
    buildRequest: any,
): void {
    const denom = getField(buildRequest, "denom");
    if (denom !== "usdc") {
        economicFail(`denom expected 'usdc' got ${JSON.stringify(denom)}`);
    }
    const amount = firstPresent(
        getField(buildRequest, "amount"),
        getField(buildRequest, "amount_usdc"),
        getField(buildRequest, "amountUsdc"),
    );
    if (amount === MISSING) economicFail("amount missing");

    const expected = to6decOrFail(amount, "max_cost_usdc");
    const actual = messageBigInt(message, "max_cost_usdc", "maxCostUsdc");
    if (actual !== expected) {
        economicFail(`max_cost_usdc expected ${expected} got ${actual}`);
    }
}

function validatePolymarketSellEconomics(
    message: Record<string, unknown>,
    buildRequest: any,
): void {
    const denom = getField(buildRequest, "denom");
    if (denom !== "shares") {
        economicFail(`denom expected 'shares' got ${JSON.stringify(denom)}`);
    }
    const amount = firstPresent(
        getField(buildRequest, "amount"),
        getField(buildRequest, "shares"),
    );
    if (amount === MISSING) economicFail("amount missing");

    const expected = to6decOrFail(amount, "shares_6dec");
    const actual = messageBigInt(
        message,
        "shares_6dec",
        "shares6dec",
        "tokenAmount",
    );
    if (actual !== expected) {
        economicFail(`shares_6dec expected ${expected} got ${actual}`);
    }
}

const SIX_DEC_DIVISOR = 1_000_000;

function validateWorstPrice(
    message: Record<string, unknown>,
    route: "polymarket_buy" | "polymarket_sell",
    buildRequest: any,
    buildResponse: any,
): void {
    const worstPriceMicro = messageBigInt(message, "worst_price", "worstPrice");
    const worstPrice = Number(worstPriceMicro) / SIX_DEC_DIVISOR;

    // Hosted MARKET orders pin worst_price to the tick-grid extreme by
    // design ("textbook market semantics"): the binding user protection is
    // max_cost_usdc (buys) / shares_6dec (sells), validated above. A
    // slippage bound on worst_price would reject every server-built market
    // order, so only sanity-check the price domain here.
    const orderType = String(
        firstPresent(
            getField(buildRequest, "order_type"),
            getField(buildRequest, "orderType"),
            "market",
        ),
    ).toLowerCase();
    if (orderType === "market") {
        if (!(worstPrice > 0 && worstPrice < 1)) {
            economicFail(
                `worst_price expected within (0, 1) got ${worstPrice}`,
            );
        }
        return;
    }

    const slippagePctRaw = firstPresent(
        getField(buildRequest, "slippage_pct"),
        getField(buildRequest, "slippagePct"),
        getField(buildResponse, "slippage_pct"),
        getField(buildResponse, "slippagePct"),
        20,
    );
    const slippagePct = toFiniteNumber(slippagePctRaw, "slippage_pct");

    if (route === "polymarket_buy") {
        const bestPrice = toFiniteNumber(
            firstPresent(
                getPath(buildResponse, "quote", "best_price"),
                getField(buildResponse, "best_price"),
                getField(buildResponse, "best_ask"),
                getField(buildResponse, "bestAsk"),
            ),
            "quote.best_price",
        );
        const upper = bestPrice * (1 + slippagePct / 100);
        if (worstPrice > upper) {
            economicFail(`worst_price expected <= ${upper} got ${worstPrice}`);
        }
    } else {
        const bestPrice = toFiniteNumber(
            firstPresent(
                getPath(buildResponse, "quote", "best_price"),
                getField(buildResponse, "best_price"),
                getField(buildResponse, "best_bid"),
                getField(buildResponse, "bestBid"),
            ),
            "quote.best_price",
        );
        const lower = bestPrice * (1 - slippagePct / 100);
        if (worstPrice < lower) {
            economicFail(`worst_price expected >= ${lower} got ${worstPrice}`);
        }
    }
}

function validateOpinionMarketId(
    message: Record<string, unknown>,
    buildResponse: any,
): void {
    const expected = firstPresent(
        getPath(buildResponse, "resolved", "opinion_market_id"),
        getPath(buildResponse, "resolved", "opinionMarketId"),
        getField(buildResponse, "opinion_market_id"),
        getField(buildResponse, "opinionMarketId"),
        getPath(buildResponse, "params", "opinion_market_id"),
        getPath(buildResponse, "params", "opinionMarketId"),
    );
    if (expected === MISSING) economicFail("resolved.opinion_market_id missing");

    const actual = firstPresent(
        getField(message, "opinion_market_id"),
        getField(message, "opinionMarketId"),
    );
    if (actual === MISSING) economicFail("message.opinion_market_id missing");

    if (idValue(actual) !== idValue(expected)) {
        economicFail(`opinion_market_id expected ${expected} got ${actual}`);
    }
}

// ---------------------------------------------------------------------------
// Layer 3 — Post-sign verification
// ---------------------------------------------------------------------------

/**
 * Verify a signature against typed-data and return the normalized signature.
 *
 * Performs:
 *   - exact 65-byte length (0x + 130 hex)
 *   - low-s canonical check
 *   - v ∈ {27, 28} (normalizes {0,1} → {27,28})
 *   - typed-data recovery, asserting recovered address === walletAddress
 *
 * Throws {@link InvalidSignature} on any failure.
 */
export function verifySignature(
    typedData: TypedData,
    signature: string,
    walletAddress: string,
): string {
    if (typeof signature !== "string" || !SIGNATURE_RE.test(signature)) {
        throw new InvalidSignature(
            0,
            "signature must be 0x-prefixed 65-byte hex",
        );
    }

    const hex = signature.slice(2);
    const sHex = hex.slice(64, 128);
    const sValue = BigInt("0x" + sHex);
    if (sValue > SECP256K1_HALF_N) {
        throw new InvalidSignature(0, "non-canonical (high-s)");
    }

    let vByte = parseInt(hex.slice(128, 130), 16);
    let normalized = signature;
    if (vByte === 0 || vByte === 1) {
        vByte += 27;
        normalized = "0x" + hex.slice(0, 128) + vByte.toString(16).padStart(2, "0");
    }
    if (vByte !== 27 && vByte !== 28) {
        throw new InvalidSignature(0, `invalid recovery byte: ${vByte}`);
    }

    let ethers: any;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ethers = require("ethers");
    } catch {
        throw new InvalidSignature(
            0,
            "ethers is required for hosted signature verification",
        );
    }

    let recovered: string;
    try {
        // ethers expects `types` WITHOUT the EIP712Domain entry.
        const types = { ...typedData.types };
        delete types["EIP712Domain"];
        recovered = ethers.verifyTypedData(
            typedData.domain,
            types,
            typedData.message,
            normalized,
        );
    } catch (exc) {
        throw new InvalidSignature(
            0,
            `signature recovery failed: ${(exc as Error).message}`,
        );
    }

    if (!addressesEqual(recovered, walletAddress)) {
        throw new InvalidSignature(
            0,
            `signature signer mismatch: expected ${walletAddress} got ${recovered}`,
        );
    }

    return normalized;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MISSING: unique symbol = Symbol("missing");

function schemaFor(route: string): TypedDataSchema {
    const schema = (SCHEMAS as Record<string, TypedDataSchema | undefined>)[route];
    if (!schema) schemaFail(`unknown typed-data route: '${route}'`);
    return schema!;
}

function schemaFail(message: string): never {
    throw new InvalidSignature(0, `typed_data schema mismatch: ${message}`);
}

function economicFail(message: string): never {
    throw new InvalidSignature(0, `economic mismatch: ${message}`);
}

function fieldListsEqual(actual: unknown, expected: FieldList): boolean {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) {
        const a = actual[i] as { name?: unknown; type?: unknown };
        const e = expected[i];
        if (a === null || typeof a !== "object") return false;
        if (a.name !== e.name || a.type !== e.type) return false;
    }
    return true;
}

function asInt(value: unknown, label: string): number {
    if (typeof value === "boolean") schemaFail(`${label} must be an integer`);
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isInteger(parsed)) return parsed;
        // Allow big numeric strings that fit safe integer range
        try {
            return Number(BigInt(value));
        } catch {
            schemaFail(`${label} must be an integer`);
        }
    }
    schemaFail(`${label} must be an integer`);
}

function normalizeAddress(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const candidate = value.trim();
    if (!ADDRESS_RE.test(candidate)) return null;
    return candidate.toLowerCase();
}

function addressesEqual(left: unknown, right: unknown): boolean {
    const a = normalizeAddress(left);
    const b = normalizeAddress(right);
    return a !== null && a === b;
}

function allowedAddresses(
    key: "prefunded" | "venue",
    chainId: number,
): Set<string> {
    const raw =
        key === "prefunded"
            ? (constants as any).PREFUNDED_ESCROW_ADDRESSES
            : (constants as any).VENUE_ESCROW_ADDRESSES;
    const list: unknown[] = [];
    if (raw == null) {
        // empty
    } else if (typeof raw === "string") {
        list.push(raw);
    } else if (Array.isArray(raw)) {
        list.push(...raw);
    } else if (raw instanceof Set) {
        for (const v of raw) list.push(v);
    } else if (typeof raw === "object") {
        const lookup =
            (raw as Record<string, unknown>)[String(chainId)] ??
            (raw as Record<number, unknown>)[chainId];
        if (typeof lookup === "string") list.push(lookup);
        else if (Array.isArray(lookup)) list.push(...lookup);
    }
    const out = new Set<string>();
    for (const v of list) {
        const normalized = normalizeAddress(v);
        if (normalized !== null) out.add(normalized);
    }
    return out;
}

function getField(container: unknown, key: string): unknown {
    if (container === null || container === undefined) return MISSING;
    if (typeof container === "object") {
        const obj = container as Record<string, unknown>;
        if (key in obj) return obj[key];
        return MISSING;
    }
    return MISSING;
}

function getPath(container: unknown, ...keys: string[]): unknown {
    let current: unknown = container;
    for (const key of keys) {
        current = getField(current, key);
        if (current === MISSING) return MISSING;
    }
    return current;
}

function firstPresent(...values: unknown[]): unknown {
    for (const v of values) {
        if (v !== MISSING && v !== null && v !== undefined) return v;
    }
    return MISSING;
}

function to6decOrFail(amount: unknown, label: string): bigint {
    try {
        return to6dec(amount as number | string | bigint);
    } catch (exc) {
        throw new InvalidSignature(
            0,
            `economic mismatch: ${label} must fit the 6-decimal grid (${(exc as Error).message})`,
        );
    }
}

function messageBigInt(
    message: Record<string, unknown>,
    ...keys: string[]
): bigint {
    for (const key of keys) {
        if (key in message) {
            const v = message[key];
            if (typeof v === "bigint") return v;
            if (typeof v === "number" && Number.isInteger(v)) return BigInt(v);
            if (typeof v === "string" && v.trim().length > 0) {
                try {
                    return BigInt(v);
                } catch {
                    economicFail(`message.${key} must be an integer`);
                }
            }
            economicFail(`message.${key} must be an integer`);
        }
    }
    economicFail(`message.${keys[0]} missing`);
}

function toFiniteNumber(value: unknown, label: string): number {
    if (value === MISSING || value === null || value === undefined) {
        economicFail(`${label} missing`);
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) economicFail(`${label} must be finite`);
        return value;
    }
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string") {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) economicFail(`${label} must be a number`);
        return parsed;
    }
    economicFail(`${label} must be a number`);
}

function idValue(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "bigint") return value.toString();
    return JSON.stringify(value);
}
