"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEPRECATED_METHODS = exports.ALLOWED_ROUTER_METHODS = exports.ALLOWED_VENUE_METHODS = exports.ALLOWED_EXCHANGES = void 0;
exports.readAuthStore = readAuthStore;
exports.resolveRuntimeConfig = resolveRuntimeConfig;
exports.runVenueMethod = runVenueMethod;
exports.runRouterMethod = runRouterMethod;
exports.runEnterpriseGet = runEnterpriseGet;
exports.runEnterpriseSql = runEnterpriseSql;
exports.runAllowedMethod = runAllowedMethod;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const constants_js_1 = require("pmxtjs");
exports.ALLOWED_EXCHANGES = new Set([
    "polymarket", "kalshi", "kalshi-demo", "limitless", "probable", "baozi",
    "myriad", "opinion", "metaculus", "smarkets", "polymarket_us",
    "gemini-titan", "hyperliquid", "mock", "router",
]);
exports.ALLOWED_VENUE_METHODS = new Set([
    "loadMarkets",
    "fetchMarkets",
    "fetchMarketsPaginated",
    "fetchEventsPaginated",
    "fetchEvents",
    "fetchMarket",
    "fetchEvent",
    "fetchOHLCV",
    "fetchOrderBook",
    "fetchOrderBooks",
    "fetchTrades",
    "createOrder",
    "buildOrder",
    "submitOrder",
    "cancelOrder",
    "fetchOrder",
    "fetchOpenOrders",
    "fetchMyTrades",
    "fetchClosedOrders",
    "fetchAllOrders",
    "fetchPositions",
    "fetchBalance",
    "getExecutionPrice",
    "getExecutionPriceDetailed",
    "close",
]);
exports.ALLOWED_ROUTER_METHODS = new Set([
    "fetchMarketMatches",
    "fetchEventMatches",
]);
exports.DEPRECATED_METHODS = new Set([
    "fetchMatches",
    "fetchMatchedMarkets",
    "fetchMatchedPrices",
    "fetchHedges",
    "fetchArbitrage",
]);
const PUBLIC_READ_METHODS = new Set([
    "fetchMarkets",
    "fetchMarket",
    "fetchEvents",
    "fetchEvent",
]);
const CREDENTIAL_FLAG_NAMES = {
    apiKey: ["api-key"],
    apiSecret: ["api-secret"],
    passphrase: ["passphrase"],
    apiToken: ["api-token"],
    privateKey: ["private-key"],
    signatureType: ["signature-type"],
    funderAddress: ["funder-address", "proxy-address"],
    walletAddress: ["wallet-address"],
    baseUrl: ["venue-base-url"],
};
const CREDENTIAL_ENV_NAMES = {
    apiKey: ["API_KEY"],
    apiSecret: ["API_SECRET"],
    passphrase: ["PASSPHRASE"],
    apiToken: ["API_TOKEN"],
    privateKey: ["PRIVATE_KEY"],
    signatureType: ["SIGNATURE_TYPE"],
    funderAddress: ["FUNDER_ADDRESS", "PROXY_ADDRESS"],
    walletAddress: ["WALLET_ADDRESS"],
    baseUrl: ["BASE_URL"],
};
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function firstString(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.length > 0)
            return value;
    }
    return undefined;
}
function normalizeExchange(exchange) {
    return exchange.trim().toLowerCase().replace(/^polymarket-us$/, "polymarket_us");
}
function exchangeEnvPrefix(exchange) {
    return normalizeExchange(exchange).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function trimTrailingSlash(url) {
    return url.replace(/\/+$/, "");
}
function resolveAuthStorePath(explicitPath, env) {
    if (explicitPath)
        return explicitPath;
    if (env.PMXT_AUTH_STORE_PATH)
        return env.PMXT_AUTH_STORE_PATH;
    if (env.PMXT_AUTH_STORE)
        return env.PMXT_AUTH_STORE;
    const home = env.HOME || os.homedir();
    const candidate = home ? path.join(home, ".pmxt", "cli-auth.json") : undefined;
    return candidate && fs.existsSync(candidate) ? candidate : undefined;
}
function readAuthStore(explicitPath, env = process.env) {
    const storePath = resolveAuthStorePath(explicitPath, env);
    if (!storePath)
        return {};
    if (!fs.existsSync(storePath)) {
        if (explicitPath || env.PMXT_AUTH_STORE || env.PMXT_AUTH_STORE_PATH) {
            throw new Error(`Auth store not found: ${storePath}`);
        }
        return {};
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
        return isRecord(parsed) ? parsed : {};
    }
    catch (error) {
        throw new Error(`Failed to read auth store ${storePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function storeCredentials(store, exchange) {
    const normalized = normalizeExchange(exchange);
    const dashed = normalized.replace(/_/g, "-");
    const exchanges = store.exchanges ?? {};
    const credentialMap = isRecord(store.credentials) ? store.credentials : {};
    return {
        ...(isRecord(store.credentials) && !credentialMap[normalized] ? store.credentials : {}),
        ...(exchanges[normalized] ?? exchanges[dashed] ?? {}),
        ...(credentialMap[normalized] ?? credentialMap[dashed] ?? {}),
    };
}
function flagCredential(flags, key) {
    for (const flagName of CREDENTIAL_FLAG_NAMES[key]) {
        const value = flags[flagName];
        if (typeof value === "string" && value.length > 0)
            return value;
    }
    return undefined;
}
function envCredential(env, exchange, key) {
    const prefix = exchangeEnvPrefix(exchange);
    for (const suffix of CREDENTIAL_ENV_NAMES[key]) {
        if (env[`PMXT_${prefix}_${suffix}`])
            return env[`PMXT_${prefix}_${suffix}`];
        if (env[`${prefix}_${suffix}`])
            return env[`${prefix}_${suffix}`];
    }
    const credentialsJson = env[`PMXT_${prefix}_CREDENTIALS`];
    if (credentialsJson) {
        try {
            const parsed = JSON.parse(credentialsJson);
            const camelValue = parsed[key];
            if (typeof camelValue === "string" && camelValue.length > 0)
                return camelValue;
            if (typeof camelValue === "number" || typeof camelValue === "boolean")
                return String(camelValue);
            for (const alias of CREDENTIAL_FLAG_NAMES[key]) {
                const value = parsed[alias] ?? parsed[alias.replace(/-/g, "_")];
                if (typeof value === "string" && value.length > 0)
                    return value;
                if (typeof value === "number" || typeof value === "boolean")
                    return String(value);
            }
        }
        catch {
            return undefined;
        }
    }
    for (const suffix of CREDENTIAL_ENV_NAMES[key]) {
        if (env[`PMXT_VENUE_${suffix}`])
            return env[`PMXT_VENUE_${suffix}`];
        if (env[`PMXT_EXCHANGE_${suffix}`])
            return env[`PMXT_EXCHANGE_${suffix}`];
    }
    return undefined;
}
function coerceCredentialValue(key, value) {
    if (value === undefined || value === false)
        return undefined;
    if (key === "signatureType" && typeof value === "string" && /^-?\d+$/.test(value))
        return Number(value);
    return String(value);
}
function credentialsJsonFromFlags(flags) {
    const raw = flags.credentials ?? flags["credentials-json"];
    if (raw === undefined || raw === null || raw === "")
        return {};
    if (isRecord(raw))
        return raw;
    if (typeof raw !== "string")
        return {};
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`Invalid --credentials JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isRecord(parsed)) {
        throw new Error("Invalid --credentials JSON: expected an object.");
    }
    return parsed;
}
function hasExplicitCredentialInput(flags = {}) {
    if (flags.credentials !== undefined || flags["credentials-json"] !== undefined)
        return true;
    for (const names of Object.values(CREDENTIAL_FLAG_NAMES)) {
        for (const name of names) {
            const value = flags[name];
            if (value !== undefined && value !== null && value !== "")
                return true;
        }
    }
    return false;
}
function resolveCredentials(flags, env, store, exchange, options = {}) {
    const stored = options.ignoreAmbientCredentials ? {} : storeCredentials(store, exchange);
    const flagJson = credentialsJsonFromFlags(flags);
    const credentials = {};
    for (const key of Object.keys(CREDENTIAL_FLAG_NAMES)) {
        const ambientValue = options.ignoreAmbientCredentials ? undefined : envCredential(env, exchange, key);
        const value = coerceCredentialValue(key, flagCredential(flags, key) ?? flagJson[key] ?? ambientValue ?? stored[key]);
        if (value !== undefined && value !== "")
            credentials[key] = value;
    }
    return Object.keys(credentials).length > 0 ? credentials : undefined;
}
function resolveRuntimeConfig(flags = {}, env = process.env, exchangeOverride, options = {}) {
    const store = readAuthStore(firstString(flags["auth-store"]), env);
    const exchange = normalizeExchange(exchangeOverride ?? firstString(flags.exchange, env.PMXT_EXCHANGE, store.defaultExchange) ?? "polymarket");
    if (!exports.ALLOWED_EXCHANGES.has(exchange)) {
        throw new Error(`Unsupported exchange '${exchange}'. Allowed exchanges: ${Array.from(exports.ALLOWED_EXCHANGES).join(", ")}`);
    }
    const pmxtApiKey = firstString(flags["pmxt-api-key"], env.PMXT_API_KEY, store.pmxtApiKey, store.pmxt?.apiKey);
    const baseUrl = trimTrailingSlash(firstString(flags["base-url"], env.PMXT_BASE_URL, store.baseUrl, store.pmxt?.baseUrl) ?? (pmxtApiKey ? constants_js_1.HOSTED_URL : constants_js_1.LOCAL_URL));
    return { baseUrl, exchange, pmxtApiKey, credentials: resolveCredentials(flags, env, store, exchange, options) };
}
function assertAllowedMethod(method, allowed, label) {
    if (exports.DEPRECATED_METHODS.has(method))
        throw new Error(`Method '${method}' is deprecated and is not exposed by the CLI.`);
    if (!allowed.has(method))
        throw new Error(`Method '${method}' is not in the PMXT API Reference ${label} allowlist.`);
}
function authHeaders(config) {
    return config.pmxtApiKey ? { Authorization: `Bearer ${config.pmxtApiKey}` } : {};
}
async function postJson(url, body, config) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(config) },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = text ? text : null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        }
        catch {
            parsed = text;
        }
    }
    if (!response.ok) {
        const message = isRecord(parsed) && isRecord(parsed.error)
            ? firstString(parsed.error.message, parsed.error.code)
            : isRecord(parsed) ? firstString(parsed.message, parsed.error) : undefined;
        throw new Error(message ?? response.statusText);
    }
    if (isRecord(parsed) && parsed.success === false) {
        const error = isRecord(parsed.error) ? parsed.error : {};
        throw new Error(firstString(error.message, error.code) ?? "PMXT request failed");
    }
    return isRecord(parsed) && "data" in parsed ? parsed.data : parsed;
}
function appendQuery(url, params) {
    const target = new URL(url);
    for (const [key, value] of Object.entries(params ?? {})) {
        if (value === undefined || value === null || value === "")
            continue;
        if (Array.isArray(value)) {
            for (const item of value) {
                if (item !== undefined && item !== null && item !== "")
                    target.searchParams.append(key, String(item));
            }
            continue;
        }
        target.searchParams.set(key, String(value));
    }
    return target.toString();
}
async function getJson(url, params, config) {
    const response = await fetch(appendQuery(url, params), {
        method: "GET",
        headers: authHeaders(config),
    });
    const text = await response.text();
    let parsed = text ? text : null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        }
        catch {
            parsed = text;
        }
    }
    if (!response.ok) {
        const message = isRecord(parsed) && isRecord(parsed.error)
            ? firstString(parsed.error.message, parsed.error.code)
            : isRecord(parsed) ? firstString(parsed.message, parsed.error) : undefined;
        throw new Error(message ?? response.statusText);
    }
    if (isRecord(parsed) && parsed.success === false) {
        const error = isRecord(parsed.error) ? parsed.error : {};
        throw new Error(firstString(error.message, error.code) ?? "PMXT request failed");
    }
    return isRecord(parsed) && "data" in parsed ? parsed.data : parsed;
}
async function runVenueMethod(method, args, flags = {}) {
    assertAllowedMethod(method, exports.ALLOWED_VENUE_METHODS, "venue");
    const config = resolveRuntimeConfig(flags, process.env, undefined, {
        ignoreAmbientCredentials: PUBLIC_READ_METHODS.has(method) && !hasExplicitCredentialInput(flags),
    });
    return postJson(`${config.baseUrl}/api/${config.exchange}/${method}`, { args, credentials: config.credentials }, config);
}
async function runRouterMethod(method, args, flags = {}) {
    assertAllowedMethod(method, exports.ALLOWED_ROUTER_METHODS, "router");
    const config = resolveRuntimeConfig(flags, process.env, "router");
    return postJson(`${config.baseUrl}/api/router/${method}`, { args, credentials: config.credentials }, config);
}
async function runEnterpriseGet(path, params = {}, flags = {}) {
    if (!path.startsWith("/v0/"))
        throw new Error(`Enterprise path must start with /v0/: ${path}`);
    const config = resolveRuntimeConfig(flags);
    return getJson(`${config.baseUrl}${path}`, params, config);
}
async function runEnterpriseSql(query, flags = {}) {
    const config = resolveRuntimeConfig(flags);
    return postJson(`${config.baseUrl}/v0/sql`, { query }, config);
}
async function runAllowedMethod(methodInput, args, flags = {}) {
    const routerPrefix = /^(router[:/.])(.+)$/.exec(methodInput);
    const method = routerPrefix ? routerPrefix[2] : methodInput;
    const routeRouter = Boolean(routerPrefix) || Boolean(flags.router) || exports.ALLOWED_ROUTER_METHODS.has(method);
    return routeRouter ? runRouterMethod(method, args, flags) : runVenueMethod(method, args, flags);
}
