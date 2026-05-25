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
exports.EXCHANGE_CREDENTIAL_FIELDS = void 0;
exports.normalizeExchangeForEnv = normalizeExchangeForEnv;
exports.exchangeCredentialsEnvVar = exchangeCredentialsEnvVar;
exports.exchangeCredentialFieldEnvVar = exchangeCredentialFieldEnvVar;
exports.normalizeExchangeCredentials = normalizeExchangeCredentials;
exports.parseExchangeCredentialsJson = parseExchangeCredentialsJson;
exports.resolvePmxtApiKey = resolvePmxtApiKey;
exports.resolveExchangeCredentials = resolveExchangeCredentials;
exports.resolvePmxtCredentials = resolvePmxtCredentials;
exports.redactSecret = redactSecret;
exports.redactExchangeCredentials = redactExchangeCredentials;
exports.exchangeCredentialEnvExamples = exchangeCredentialEnvExamples;
exports.listExchangeCredentialEnvVars = listExchangeCredentialEnvVars;
exports.promptSecret = promptSecret;
// @ts-nocheck
const auth_store_js_1 = require("./auth-store.js");
exports.EXCHANGE_CREDENTIAL_FIELDS = [
    "apiKey",
    "apiSecret",
    "passphrase",
    "apiToken",
    "privateKey",
    "signatureType",
    "funderAddress",
    "walletAddress",
    "baseUrl",
];
const FIELD_ALIASES = {
    apiKey: "apiKey",
    api_key: "apiKey",
    "api-key": "apiKey",
    key: "apiKey",
    apiSecret: "apiSecret",
    api_secret: "apiSecret",
    "api-secret": "apiSecret",
    secret: "apiSecret",
    passphrase: "passphrase",
    apiToken: "apiToken",
    api_token: "apiToken",
    "api-token": "apiToken",
    token: "apiToken",
    privateKey: "privateKey",
    private_key: "privateKey",
    "private-key": "privateKey",
    signatureType: "signatureType",
    signature_type: "signatureType",
    "signature-type": "signatureType",
    funderAddress: "funderAddress",
    funder_address: "funderAddress",
    "funder-address": "funderAddress",
    proxyAddress: "funderAddress",
    proxy_address: "funderAddress",
    "proxy-address": "funderAddress",
    walletAddress: "walletAddress",
    wallet_address: "walletAddress",
    "wallet-address": "walletAddress",
    baseUrl: "baseUrl",
    base_url: "baseUrl",
    "base-url": "baseUrl",
};
const FIELD_ENV_SUFFIXES = [
    ["apiKey", "API_KEY"],
    ["apiSecret", "API_SECRET"],
    ["passphrase", "PASSPHRASE"],
    ["apiToken", "API_TOKEN"],
    ["privateKey", "PRIVATE_KEY"],
    ["signatureType", "SIGNATURE_TYPE"],
    ["funderAddress", "FUNDER_ADDRESS"],
    ["funderAddress", "PROXY_ADDRESS"],
    ["walletAddress", "WALLET_ADDRESS"],
    ["baseUrl", "BASE_URL"],
];
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asCredentialValue(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
        return value;
    }
    return undefined;
}
function asString(value) {
    const credentialValue = asCredentialValue(value);
    if (credentialValue === undefined || credentialValue === null)
        return undefined;
    return String(credentialValue);
}
function setCredentialField(target, field, value) {
    const credentialValue = asCredentialValue(value);
    if (credentialValue !== undefined) {
        target[field] = credentialValue;
    }
}
function normalizeExchangeForEnv(exchange) {
    const normalized = exchange.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!normalized) {
        throw new Error("Exchange is required.");
    }
    return normalized;
}
function exchangeCredentialsEnvVar(exchange) {
    return `PMXT_${normalizeExchangeForEnv(exchange)}_CREDENTIALS`;
}
function exchangeCredentialFieldEnvVar(exchange, suffix) {
    return `PMXT_${normalizeExchangeForEnv(exchange)}_${suffix}`;
}
function normalizeExchangeCredentials(input) {
    if (!isRecord(input)) {
        return {};
    }
    const credentials = {};
    for (const [key, value] of Object.entries(input)) {
        const field = FIELD_ALIASES[key];
        if (!field)
            continue;
        setCredentialField(credentials, field, value);
    }
    return credentials;
}
function parseExchangeCredentialsJson(raw, label = "credentials JSON") {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`Invalid ${label}: ${error.message}`);
    }
    if (!isRecord(parsed)) {
        throw new Error(`Invalid ${label}: expected a JSON object.`);
    }
    return normalizeExchangeCredentials(parsed);
}
function exchangeCredentialsFromFlags(flags) {
    if (!flags)
        return {};
    let credentials = {};
    const jsonValue = flags.credentials ?? flags.exchangeCredentials;
    if (typeof jsonValue === "string" && jsonValue.trim()) {
        credentials = parseExchangeCredentialsJson(jsonValue, "--credentials");
    }
    else if (isRecord(jsonValue)) {
        credentials = normalizeExchangeCredentials(jsonValue);
    }
    const directFlags = {
        apiKey: flags.apiKey ?? flags.api_key ?? flags["api-key"],
        apiSecret: flags.apiSecret ?? flags.api_secret ?? flags["api-secret"],
        passphrase: flags.passphrase,
        apiToken: flags.apiToken ?? flags.api_token ?? flags["api-token"],
        privateKey: flags.privateKey ?? flags.private_key ?? flags["private-key"],
        signatureType: flags.signatureType ?? flags.signature_type ?? flags["signature-type"],
        funderAddress: flags.funderAddress ?? flags.funder_address ?? flags["funder-address"]
            ?? flags.proxyAddress ?? flags.proxy_address ?? flags["proxy-address"],
        walletAddress: flags.walletAddress ?? flags.wallet_address ?? flags["wallet-address"],
        baseUrl: flags.baseUrl ?? flags.base_url ?? flags["base-url"]
            ?? flags.venueBaseUrl ?? flags.venue_base_url ?? flags["venue-base-url"],
    };
    return {
        ...credentials,
        ...normalizeExchangeCredentials(directFlags),
    };
}
function exchangeCredentialsFromEnv(exchange, env) {
    let credentials = {};
    const jsonEnvVar = exchangeCredentialsEnvVar(exchange);
    const jsonValue = env[jsonEnvVar];
    if (jsonValue && jsonValue.trim()) {
        credentials = parseExchangeCredentialsJson(jsonValue, jsonEnvVar);
    }
    for (const [field, suffix] of FIELD_ENV_SUFFIXES) {
        const envVar = exchangeCredentialFieldEnvVar(exchange, suffix);
        if (env[envVar] !== undefined) {
            setCredentialField(credentials, field, env[envVar]);
        }
    }
    return credentials;
}
function storedExchangeCredentials(exchange, store) {
    const stored = (0, auth_store_js_1.getStoredExchangeCredentials)(store, exchange);
    return normalizeExchangeCredentials(stored ?? {});
}
function assignCredentialsWithSource(target, sourcesByField, source, credentials) {
    for (const field of exports.EXCHANGE_CREDENTIAL_FIELDS) {
        if (credentials[field] !== undefined) {
            target[field] = credentials[field];
            sourcesByField[field] = source;
        }
    }
}
function highestCredentialSource(sourcesByField) {
    if (Object.values(sourcesByField).includes("flag"))
        return "flag";
    if (Object.values(sourcesByField).includes("env"))
        return "env";
    if (Object.values(sourcesByField).includes("store"))
        return "store";
    return "none";
}
async function loadStore(options) {
    if (options.store)
        return options.store;
    return (0, auth_store_js_1.readAuthStore)(options);
}
async function resolvePmxtApiKey(options = {}) {
    const env = options.env ?? process.env;
    const flagValue = asString(options.flags?.pmxtApiKey
        ?? options.flags?.pmxt_api_key
        ?? options.flags?.["pmxt-api-key"]);
    if (flagValue) {
        return { pmxtApiKey: flagValue, source: "flag" };
    }
    const envValue = asString(env.PMXT_API_KEY);
    if (envValue) {
        return { pmxtApiKey: envValue, source: "env" };
    }
    const store = await loadStore(options);
    if (store.pmxtApiKey) {
        return { pmxtApiKey: store.pmxtApiKey, source: "store" };
    }
    return { source: "none" };
}
async function resolveExchangeCredentials(exchange, options = {}) {
    const env = options.env ?? process.env;
    const store = await loadStore(options);
    const resolved = {};
    const sourcesByField = {};
    assignCredentialsWithSource(resolved, sourcesByField, "store", storedExchangeCredentials(exchange, store));
    assignCredentialsWithSource(resolved, sourcesByField, "env", exchangeCredentialsFromEnv(exchange, env));
    assignCredentialsWithSource(resolved, sourcesByField, "flag", exchangeCredentialsFromFlags(options.flags));
    const source = highestCredentialSource(sourcesByField);
    return {
        exchange,
        credentials: source === "none" ? undefined : resolved,
        source,
        sourcesByField,
    };
}
async function resolvePmxtCredentials(exchange, options = {}) {
    const store = await loadStore(options);
    const [pmxt, exchangeCredentials] = await Promise.all([
        resolvePmxtApiKey({ ...options, store }),
        resolveExchangeCredentials(exchange, { ...options, store }),
    ]);
    return {
        pmxtApiKey: pmxt.pmxtApiKey,
        exchangeCredentials: exchangeCredentials.credentials,
        sources: {
            pmxtApiKey: pmxt.source,
            exchangeCredentials: exchangeCredentials.source,
            exchangeCredentialFields: exchangeCredentials.sourcesByField,
        },
    };
}
function redactSecret(value) {
    if (value === undefined || value === null)
        return "<unset>";
    const text = String(value);
    if (text.length <= 8)
        return "*".repeat(Math.max(text.length, 4));
    return `${text.slice(0, 4)}...${text.slice(-4)}`;
}
function redactExchangeCredentials(credentials) {
    if (!credentials)
        return {};
    const redacted = {};
    for (const field of exports.EXCHANGE_CREDENTIAL_FIELDS) {
        if (credentials[field] !== undefined) {
            redacted[field] = redactSecret(credentials[field]);
        }
    }
    return redacted;
}
function exchangeCredentialEnvExamples(exchange) {
    const prefix = normalizeExchangeForEnv(exchange);
    return [
        "PMXT_API_KEY=pmxt_live_...",
        `PMXT_${prefix}_CREDENTIALS='{"apiKey":"...","privateKey":"..."}'`,
        `PMXT_${prefix}_API_KEY=...`,
        `PMXT_${prefix}_PRIVATE_KEY=...`,
        `PMXT_${prefix}_API_TOKEN=...`,
    ];
}
function listExchangeCredentialEnvVars(env = process.env) {
    const names = new Set();
    const pattern = /^PMXT_[A-Z0-9_]+_(CREDENTIALS|API_KEY|API_SECRET|PASSPHRASE|API_TOKEN|PRIVATE_KEY|SIGNATURE_TYPE|FUNDER_ADDRESS|PROXY_ADDRESS|WALLET_ADDRESS|BASE_URL)$/;
    for (const name of Object.keys(env)) {
        if (pattern.test(name) && name !== "PMXT_API_KEY") {
            names.add(name);
        }
    }
    return [...names].sort();
}
function getStdin(io) {
    return io.stdin ?? process.stdin;
}
function getStdout(io) {
    return io.stdout ?? process.stdout;
}
async function promptSecret(message, io = {}) {
    const stdin = getStdin(io);
    const stdout = getStdout(io);
    if (stdin.isTTY && typeof stdin.setRawMode === "function") {
        stdout.write(message);
        return new Promise((resolve, reject) => {
            let value = "";
            const wasRaw = stdin.isRaw;
            const cleanup = () => {
                stdin.off("data", onData);
                stdin.setRawMode(Boolean(wasRaw));
                stdout.write("\n");
            };
            const finish = () => {
                cleanup();
                resolve(value);
            };
            const onData = (chunk) => {
                const text = chunk.toString("utf8");
                for (const char of text) {
                    if (char === "\u0003") {
                        cleanup();
                        reject(new Error("Prompt cancelled."));
                        return;
                    }
                    if (char === "\r" || char === "\n") {
                        finish();
                        return;
                    }
                    if (char === "\u007f" || char === "\b") {
                        value = value.slice(0, -1);
                        continue;
                    }
                    value += char;
                }
            };
            stdin.setRawMode(true);
            stdin.resume();
            stdin.on("data", onData);
        });
    }
    const readline = await Promise.resolve().then(() => __importStar(require("readline")));
    const rl = readline.createInterface({
        input: stdin,
        output: stdout,
        terminal: Boolean(stdin.isTTY && stdout.isTTY),
    });
    return new Promise((resolve) => {
        rl.question(message, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}
