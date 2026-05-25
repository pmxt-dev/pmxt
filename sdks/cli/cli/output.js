"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.outputResult = outputResult;
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function primitive(value) {
    return value === null || ["string", "number", "boolean"].includes(typeof value);
}
function summarizeRecord(record) {
    const keys = ["id", "marketId", "eventId", "orderId", "title", "question", "slug", "status", "side", "type", "price", "amount", "available", "total"];
    const parts = keys.filter((key) => primitive(record[key])).map((key) => `${key}=${String(record[key])}`);
    return parts.length > 0 ? parts.join(" ") : JSON.stringify(record);
}
function summarizeValue(value) {
    if (isRecord(value))
        return summarizeRecord(value);
    if (primitive(value))
        return String(value);
    return JSON.stringify(value);
}
function outputHuman(command, data, label = "result") {
    if (data === undefined || data === null) {
        command.log("ok");
        return;
    }
    if (Array.isArray(data)) {
        command.log(`${label}: ${data.length}`);
        for (const item of data.slice(0, 10))
            command.log(`- ${summarizeValue(item)}`);
        if (data.length > 10)
            command.log(`... ${data.length - 10} more`);
        return;
    }
    if (isRecord(data)) {
        const primitiveEntries = Object.entries(data).filter(([, value]) => primitive(value));
        if (primitiveEntries.length > 0) {
            for (const [key, value] of primitiveEntries)
                command.log(`${key}: ${String(value)}`);
            for (const [key, value] of Object.entries(data))
                if (Array.isArray(value))
                    command.log(`${key}: ${value.length}`);
            return;
        }
    }
    command.log(JSON.stringify(data, null, 2));
}
function outputResult(command, data, flags, options = {}) {
    if (flags.json) {
        command.log(JSON.stringify(data ?? null, null, 2));
        return;
    }
    outputHuman(command, data, options.label);
}
