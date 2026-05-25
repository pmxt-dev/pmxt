"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_STORE_DIR_MODE = exports.AUTH_STORE_FILE_MODE = exports.AUTH_STORE_VERSION = void 0;
exports.getAuthStorePath = getAuthStorePath;
exports.authStoreOptionsFromFlags = authStoreOptionsFromFlags;
exports.emptyAuthStore = emptyAuthStore;
exports.readAuthStore = readAuthStore;
exports.writeAuthStore = writeAuthStore;
exports.setStoredPmxtApiKey = setStoredPmxtApiKey;
exports.clearStoredPmxtApiKey = clearStoredPmxtApiKey;
exports.setStoredExchangeCredentials = setStoredExchangeCredentials;
exports.clearStoredExchangeCredentials = clearStoredExchangeCredentials;
exports.findStoredExchangeKey = findStoredExchangeKey;
exports.getStoredExchangeCredentials = getStoredExchangeCredentials;
// @ts-nocheck
const fs_1 = require("fs");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
exports.AUTH_STORE_VERSION = 1;
exports.AUTH_STORE_FILE_MODE = 0o600;
exports.AUTH_STORE_DIR_MODE = 0o700;
function authStorePathFromEnv(env) {
    const configured = env.PMXT_AUTH_STORE_PATH ?? env.PMXT_AUTH_STORE;
    return configured && configured.trim() ? configured : undefined;
}
function getAuthStorePath(options = {}) {
    return options.path
        ?? authStorePathFromEnv(options.env ?? process.env)
        ?? path_1.default.join(os_1.default.homedir(), ".pmxt", "cli-auth.json");
}
function authStoreOptionsFromFlags(flags = {}, env = process.env) {
    const flagPath = typeof flags["auth-store"] === "string" && flags["auth-store"].trim()
        ? flags["auth-store"].trim()
        : typeof flags.authStore === "string" && flags.authStore.trim()
            ? flags.authStore.trim()
            : undefined;
    return { path: flagPath, env };
}
function emptyAuthStore() {
    return {
        version: exports.AUTH_STORE_VERSION,
        exchanges: {},
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStoredCredentialValue(value) {
    return (typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean"
        || value === null);
}
function normalizeExchangeKey(exchange) {
    const normalized = exchange.trim().toLowerCase();
    if (!normalized) {
        throw new Error("Exchange is required.");
    }
    return normalized;
}
function coerceExchangeCredentials(value) {
    if (!isRecord(value))
        return {};
    const credentials = {};
    for (const [key, credentialValue] of Object.entries(value)) {
        if (!key || credentialValue === undefined)
            continue;
        if (isStoredCredentialValue(credentialValue)) {
            credentials[key] = credentialValue;
        }
    }
    return credentials;
}
function coerceStore(value) {
    if (!isRecord(value)) {
        throw new Error("PMXT auth store is not a JSON object.");
    }
    const store = emptyAuthStore();
    if (typeof value.pmxtApiKey === "string" && value.pmxtApiKey.trim()) {
        store.pmxtApiKey = value.pmxtApiKey;
    }
    if (isRecord(value.exchanges)) {
        for (const [exchange, credentials] of Object.entries(value.exchanges)) {
            const normalizedExchange = normalizeExchangeKey(exchange);
            const normalizedCredentials = coerceExchangeCredentials(credentials);
            if (Object.keys(normalizedCredentials).length > 0) {
                store.exchanges[normalizedExchange] = normalizedCredentials;
            }
        }
    }
    if (typeof value.updatedAt === "string") {
        store.updatedAt = value.updatedAt;
    }
    return store;
}
async function chmodBestEffort(targetPath, mode) {
    try {
        await fs_1.promises.chmod(targetPath, mode);
    }
    catch (error) {
        if (!["EINVAL", "ENOTSUP", "EPERM"].includes(error?.code)) {
            throw error;
        }
    }
}
async function readAuthStore(options = {}) {
    const storePath = getAuthStorePath(options);
    let raw;
    try {
        raw = await fs_1.promises.readFile(storePath, "utf8");
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return emptyAuthStore();
        }
        throw error;
    }
    if (!raw.trim()) {
        return emptyAuthStore();
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        throw new Error(`Failed to parse PMXT auth store at ${storePath}: ${error.message}`);
    }
    return coerceStore(parsed);
}
async function writeAuthStore(data, options = {}) {
    const storePath = getAuthStorePath(options);
    const dir = path_1.default.dirname(storePath);
    const normalized = coerceStore({
        ...data,
        version: exports.AUTH_STORE_VERSION,
        updatedAt: new Date().toISOString(),
    });
    await fs_1.promises.mkdir(dir, { recursive: true, mode: exports.AUTH_STORE_DIR_MODE });
    await chmodBestEffort(dir, exports.AUTH_STORE_DIR_MODE);
    const tempPath = path_1.default.join(dir, `.cli-auth.${process.pid}.${Date.now()}.tmp`);
    const file = await fs_1.promises.open(tempPath, "w", exports.AUTH_STORE_FILE_MODE);
    try {
        await file.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    }
    finally {
        await file.close();
    }
    await chmodBestEffort(tempPath, exports.AUTH_STORE_FILE_MODE);
    await fs_1.promises.rename(tempPath, storePath);
    await chmodBestEffort(storePath, exports.AUTH_STORE_FILE_MODE);
    return normalized;
}
async function setStoredPmxtApiKey(apiKey, options = {}) {
    const trimmed = apiKey.trim();
    if (!trimmed) {
        throw new Error("PMXT API key is required.");
    }
    const store = await readAuthStore(options);
    store.pmxtApiKey = trimmed;
    return writeAuthStore(store, options);
}
async function clearStoredPmxtApiKey(options = {}) {
    const store = await readAuthStore(options);
    const changed = Boolean(store.pmxtApiKey);
    delete store.pmxtApiKey;
    return {
        changed,
        store: await writeAuthStore(store, options),
    };
}
async function setStoredExchangeCredentials(exchange, credentials, options = {}) {
    const normalizedExchange = normalizeExchangeKey(exchange);
    const normalizedCredentials = coerceExchangeCredentials(credentials);
    if (Object.keys(normalizedCredentials).length === 0) {
        throw new Error("At least one exchange credential field is required.");
    }
    const store = await readAuthStore(options);
    store.exchanges[normalizedExchange] = normalizedCredentials;
    return writeAuthStore(store, options);
}
async function clearStoredExchangeCredentials(exchange, options = {}) {
    const normalizedExchange = normalizeExchangeKey(exchange);
    const store = await readAuthStore(options);
    const existingKey = findStoredExchangeKey(store, normalizedExchange);
    const changed = Boolean(existingKey);
    if (existingKey) {
        delete store.exchanges[existingKey];
    }
    return {
        changed,
        store: await writeAuthStore(store, options),
    };
}
function findStoredExchangeKey(store, exchange) {
    const normalizedExchange = normalizeExchangeKey(exchange);
    const candidates = [
        normalizedExchange,
        normalizedExchange.replace(/-/g, "_"),
        normalizedExchange.replace(/_/g, "-"),
    ];
    return candidates.find((candidate) => store.exchanges[candidate] !== undefined);
}
function getStoredExchangeCredentials(store, exchange) {
    const key = findStoredExchangeKey(store, exchange);
    return key ? store.exchanges[key] : undefined;
}
