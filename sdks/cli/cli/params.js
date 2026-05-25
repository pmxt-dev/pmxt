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
exports.compactRecord = compactRecord;
exports.parseCsv = parseCsv;
exports.readText = readText;
exports.parseJsonValue = parseJsonValue;
exports.parseJsonObject = parseJsonObject;
exports.buildParams = buildParams;
exports.mergeJsonParams = mergeJsonParams;
exports.argsWithOptionalObject = argsWithOptionalObject;
exports.requiredNumber = requiredNumber;
const fs = __importStar(require("node:fs"));
function compactRecord(input) {
    const result = {};
    for (const [key, value] of Object.entries(input)) {
        if (value === undefined || value === null || value === "")
            continue;
        if (Array.isArray(value) && value.length === 0)
            continue;
        if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
            continue;
        result[key] = value;
    }
    return result;
}
function parseCsv(value) {
    if (Array.isArray(value))
        return value.flatMap((entry) => parseCsv(entry) ?? []);
    if (typeof value !== "string" || value.length === 0)
        return undefined;
    const parsed = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    return parsed.length > 0 ? parsed : undefined;
}
function readText(value, label) {
    if (!value.startsWith("@"))
        return value;
    const filePath = value.slice(1);
    if (!filePath)
        throw new Error(`${label} file path cannot be empty`);
    return fs.readFileSync(filePath, "utf8");
}
function parseJsonValue(value, label) {
    if (value === undefined || value === null || value === "")
        return undefined;
    if (typeof value !== "string")
        return value;
    try {
        return JSON.parse(readText(value, label));
    }
    catch (error) {
        throw new Error(`Invalid JSON for ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function parseJsonObject(value, label) {
    const parsed = parseJsonValue(value, label);
    if (parsed === undefined)
        return {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error(`${label} must be a JSON object`);
    return parsed;
}
function buildParams(flags, flagToParam, extras = {}) {
    const params = {};
    for (const [flagName, paramName] of Object.entries(flagToParam))
        params[paramName] = flags[flagName];
    return compactRecord({ ...params, ...extras });
}
function mergeJsonParams(flags, jsonFlagName, params) {
    return compactRecord({ ...parseJsonObject(flags[jsonFlagName], `--${jsonFlagName}`), ...params });
}
function argsWithOptionalObject(params) {
    return Object.keys(params).length > 0 ? [params] : [];
}
function requiredNumber(value, label) {
    if (typeof value !== "number" || Number.isNaN(value))
        throw new Error(`${label} is required`);
    return value;
}
