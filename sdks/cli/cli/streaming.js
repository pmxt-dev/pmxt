"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exchangeCredentialFlags = exports.feedHttpFlags = exports.streamControlFlags = exports.pmxtCredentialFlags = void 0;
exports.parseCommaList = parseCommaList;
exports.parseJsonObject = parseJsonObject;
exports.writeJson = writeJson;
exports.getAuthStorePath = getAuthStorePath;
exports.readAuthStore = readAuthStore;
exports.resolveCliCredentials = resolveCliCredentials;
exports.fetchPmxtData = fetchPmxtData;
exports.streamJsonl = streamJsonl;
exports.buildWebSocketUrl = buildWebSocketUrl;
// @ts-nocheck
const core_1 = require("@oclif/core");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = __importDefault(require("path"));
const ws_1 = __importDefault(require("ws"));
const pmxtjs_1 = require("pmxtjs");
const runtime_js_1 = require("./runtime.js");
const CREDENTIAL_KEYS = [
    "apiKey",
    "apiSecret",
    "apiToken",
    "passphrase",
    "privateKey",
    "proxyAddress",
    "signatureType",
];
exports.pmxtCredentialFlags = {
    "auth-profile": core_1.Flags.string({
        description: "Auth store profile to read after flags and environment variables",
    }),
    "auth-store": core_1.Flags.string({
        description: "Path to a PMXT CLI auth store JSON file",
    }),
    "base-url": core_1.Flags.string({
        description: "PMXT API base URL",
        env: pmxtjs_1.ENV.BASE_URL,
    }),
    "pmxt-api-key": core_1.Flags.string({
        description: "Hosted PMXT API key",
        env: pmxtjs_1.ENV.API_KEY,
    }),
};
exports.feedHttpFlags = {
    ...exports.pmxtCredentialFlags,
    json: core_1.Flags.boolean({
        description: "Output raw response data as JSON.",
    }),
};
exports.streamControlFlags = {
    "max-messages": core_1.Flags.integer({
        description: "Stop after this many data messages.",
    }),
    "timeout-ms": core_1.Flags.integer({
        description: "Fail if no data message arrives within this many milliseconds.",
    }),
};
exports.exchangeCredentialFlags = {
    "api-key": core_1.Flags.string({
        description: "Exchange API key",
    }),
    "api-secret": core_1.Flags.string({
        description: "Exchange API secret",
    }),
    "api-token": core_1.Flags.string({
        description: "Exchange API token",
    }),
    credentials: core_1.Flags.string({
        description: "Exchange credentials as a JSON object",
    }),
    "funder-address": core_1.Flags.string({
        description: "Exchange funder address",
    }),
    passphrase: core_1.Flags.string({
        description: "Exchange API passphrase",
    }),
    "private-key": core_1.Flags.string({
        description: "Exchange private key",
    }),
    "proxy-address": core_1.Flags.string({
        description: "Alias for --funder-address",
    }),
    "signature-type": core_1.Flags.integer({
        description: "Exchange signature type",
    }),
    "venue-base-url": core_1.Flags.string({
        description: "Venue-native API base URL credential override",
    }),
    "wallet-address": core_1.Flags.string({
        description: "Exchange wallet address",
    }),
};
function parseCommaList(value) {
    if (!value)
        return undefined;
    const parsed = value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    return parsed.length > 0 ? parsed : undefined;
}
function parseJsonObject(value) {
    if (!value)
        return {};
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new pmxtjs_1.PmxtError("Expected params to be a JSON object");
    }
    return parsed;
}
function writeJson(value, stdout = process.stdout) {
    stdout.write(`${JSON.stringify(value)}\n`);
}
function getAuthStorePath(env = process.env) {
    return env.PMXT_AUTH_STORE_PATH || env.PMXT_AUTH_STORE || path_1.default.join(env.HOME || (0, os_1.homedir)(), ".pmxt", "cli-auth.json");
}
function readAuthStore(env = process.env) {
    const file = getAuthStorePath(env);
    if (!(0, fs_1.existsSync)(file))
        return {};
    try {
        return JSON.parse((0, fs_1.readFileSync)(file, "utf8"));
    }
    catch {
        return {};
    }
}
function resolveCliCredentials(flags, options = {}) {
    const env = options.env ?? process.env;
    const runtimeEnv = normalizeRuntimeEnv(env, options.targetName);
    const runtime = (0, runtime_js_1.resolveRuntimeConfig)(flags, runtimeEnv, options.targetKind === "exchange" ? options.targetName : "polymarket");
    return {
        baseUrl: runtime.baseUrl,
        ...(runtime.pmxtApiKey ? { pmxtApiKey: runtime.pmxtApiKey } : {}),
        ...(options.targetKind === "exchange" && runtime.credentials ? { exchangeCredentials: runtime.credentials } : {}),
    };
}
async function fetchPmxtData(pathname, credentials, query = {}) {
    const resolved = (0, pmxtjs_1.resolvePmxtBaseUrl)({
        baseUrl: credentials.baseUrl,
        pmxtApiKey: credentials.pmxtApiKey,
    });
    const url = new URL(pathname, ensureTrailingSlash(resolved.baseUrl));
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null)
            continue;
        url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
        headers: resolved.pmxtApiKey ? { Authorization: `Bearer ${resolved.pmxtApiKey}` } : {},
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new pmxtjs_1.PmxtError(errorMessage(body) || response.statusText);
    }
    const body = await response.json();
    if (body.success === false) {
        throw new pmxtjs_1.PmxtError(errorMessage(body) || "PMXT request failed");
    }
    return body.data;
}
async function streamJsonl(options) {
    const stdout = options.stdout ?? process.stdout;
    const stderr = options.stderr ?? process.stderr;
    const prepared = await prepareWebSocket(options.credentials);
    const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const message = {
        id,
        action: "subscribe",
        method: options.method,
        args: options.args,
        ...options.target,
        ...(options.credentials.exchangeCredentials ? { credentials: options.credentials.exchangeCredentials } : {}),
    };
    await new Promise((resolve, reject) => {
        const ws = new ws_1.default(prepared.url);
        let settled = false;
        let lines = 0;
        let timeout;
        const clearDataTimeout = () => {
            if (timeout)
                clearTimeout(timeout);
            timeout = undefined;
        };
        const armDataTimeout = () => {
            clearDataTimeout();
            if (options.timeoutMs === undefined)
                return;
            timeout = setTimeout(() => {
                finish(new pmxtjs_1.PmxtError(`Timed out after ${options.timeoutMs}ms waiting for streaming data`));
            }, options.timeoutMs);
        };
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            clearDataTimeout();
            process.off("SIGINT", onInterrupt);
            try {
                if (ws.readyState === ws_1.default.OPEN) {
                    ws.send(JSON.stringify({ ...message, action: "unsubscribe" }));
                    ws.close(1000, "client_done");
                }
            }
            catch {
                // ignore close failures
            }
            if (error)
                reject(error);
            else
                resolve();
        };
        const onInterrupt = () => finish();
        process.once("SIGINT", onInterrupt);
        ws.on("open", () => {
            ws.send(JSON.stringify(message));
            armDataTimeout();
        });
        ws.on("message", (raw) => {
            let parsed;
            try {
                parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString());
            }
            catch {
                return;
            }
            if (parsed.event === "error") {
                const text = errorMessage(parsed) || "Streaming error";
                stderr.write(`${text}\n`);
                finish(new pmxtjs_1.PmxtError(text));
                return;
            }
            if (parsed.event !== "data")
                return;
            writeJson(parsed, stdout);
            lines += 1;
            armDataTimeout();
            if (options.maxMessages !== undefined && lines >= options.maxMessages) {
                finish();
            }
        });
        ws.on("error", (error) => {
            finish(error instanceof Error ? error : new Error(String(error)));
        });
        ws.on("close", () => {
            finish();
        });
    });
}
function buildWebSocketUrl(baseUrl, auth) {
    const url = new URL("ws", ensureTrailingSlash(baseUrl));
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (auth?.value) {
        url.searchParams.set(auth.name, auth.value);
    }
    return url.toString();
}
async function prepareWebSocket(credentials) {
    const resolved = (0, pmxtjs_1.resolvePmxtBaseUrl)({
        baseUrl: credentials.baseUrl,
        pmxtApiKey: credentials.pmxtApiKey,
    });
    if (resolved.isHosted) {
        return {
            url: buildWebSocketUrl(resolved.baseUrl, resolved.pmxtApiKey ? { name: "apiKey", value: resolved.pmxtApiKey } : undefined),
        };
    }
    if (resolved.baseUrl === pmxtjs_1.LOCAL_URL) {
        const manager = new pmxtjs_1.ServerManager();
        await manager.ensureServerRunning();
        const token = manager.getAccessToken();
        const baseUrl = `http://localhost:${manager.getRunningPort()}`;
        return {
            url: buildWebSocketUrl(baseUrl, token ? { name: "token", value: token } : undefined),
        };
    }
    return { url: buildWebSocketUrl(resolved.baseUrl) };
}
function clean(value) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function ensureTrailingSlash(value) {
    return value.endsWith("/") ? value : `${value}/`;
}
function envPrefix(value) {
    return (value || "EXCHANGE").replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}
function errorMessage(body) {
    const error = body?.error;
    if (typeof error === "string")
        return error;
    if (error && typeof error.message === "string")
        return error.message;
    if (typeof body?.message === "string")
        return body.message;
    return undefined;
}
function getStoreBuckets(store, profile, options) {
    const buckets = [];
    const targetName = options.targetName;
    const plural = options.targetKind ? `${options.targetKind}s` : undefined;
    if (profile) {
        const profileStore = readNestedValue(store, `profiles.${profile}`);
        buckets.push(readNestedValue(profileStore, `${plural}.${targetName}`));
        buckets.push(readNestedValue(profileStore, targetName || ""));
        buckets.push(profileStore);
    }
    buckets.push(readNestedValue(store, `${plural}.${targetName}`));
    buckets.push(readNestedValue(store, `${options.targetKind}.${targetName}`));
    buckets.push(readNestedValue(store, targetName || ""));
    buckets.push(readNestedValue(store, "default"));
    buckets.push(readNestedValue(store, "credentials"));
    buckets.push(store);
    return buckets.filter((bucket) => {
        return !!bucket && typeof bucket === "object" && !Array.isArray(bucket);
    });
}
function parseOptionalNumber(value) {
    if (value === undefined)
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function normalizeRuntimeEnv(env, targetName) {
    const normalized = env.PMXT_AUTH_STORE_PATH && !env.PMXT_AUTH_STORE
        ? { ...env, PMXT_AUTH_STORE: env.PMXT_AUTH_STORE_PATH }
        : { ...env };
    if (!targetName)
        return normalized;
    const prefix = envPrefix(targetName);
    for (const suffix of [
        "API_KEY",
        "API_SECRET",
        "PASSPHRASE",
        "API_TOKEN",
        "PRIVATE_KEY",
        "SIGNATURE_TYPE",
        "FUNDER_ADDRESS",
        "PROXY_ADDRESS",
        "WALLET_ADDRESS",
        "BASE_URL",
    ]) {
        const scoped = `PMXT_${prefix}_${suffix}`;
        const runtime = `${prefix}_${suffix}`;
        if (normalized[scoped] && !normalized[runtime]) {
            normalized[runtime] = normalized[scoped];
        }
    }
    return normalized;
}
function readNestedValue(obj, key) {
    if (!obj || typeof obj !== "object" || !key)
        return undefined;
    let current = obj;
    for (const part of key.split(".")) {
        if (!current || typeof current !== "object")
            return undefined;
        current = current[part];
    }
    return current;
}
