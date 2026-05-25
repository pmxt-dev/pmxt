"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeServerCommand = executeServerCommand;
exports.formatServerCommandResult = formatServerCommandResult;
// @ts-nocheck
const pmxtjs_1 = require("pmxtjs");
async function executeServerCommand(action, options = {}) {
    const manager = options.manager ?? new pmxtjs_1.ServerManager();
    switch (action) {
        case "start":
            await manager.start();
            return { action, ok: true };
        case "stop":
            await manager.stop();
            return { action, ok: true };
        case "restart":
            await manager.restart();
            return { action, ok: true };
        case "status": {
            const status = await manager.status();
            return { action, ok: true, ...status };
        }
        case "health": {
            const healthy = await manager.health();
            return { action, ok: healthy, healthy };
        }
        case "logs": {
            const requestedLines = options.lines ?? 50;
            const lines = manager.logs(requestedLines);
            return { action, ok: true, count: lines.length, lines };
        }
    }
}
function formatServerCommandResult(result) {
    switch (result.action) {
        case "start":
            return "PMXT server started";
        case "stop":
            return "PMXT server stopped";
        case "restart":
            return "PMXT server restarted";
        case "status":
            return formatStatus(result);
        case "health":
            return result.healthy ? "PMXT server healthy" : "PMXT server unhealthy";
        case "logs":
            return result.lines.length > 0
                ? result.lines.join("\n")
                : "No PMXT server logs found";
    }
}
function formatStatus(status) {
    const lines = [`PMXT server ${status.running ? "running" : "stopped"}`];
    if (status.pid !== null)
        lines.push(`pid: ${status.pid}`);
    if (status.port !== null)
        lines.push(`port: ${status.port}`);
    if (status.version !== null)
        lines.push(`version: ${status.version}`);
    if (status.uptimeSeconds !== null) {
        lines.push(`uptime: ${formatDuration(status.uptimeSeconds)}`);
    }
    lines.push(`lock: ${status.lockFile}`);
    return lines.join("\n");
}
function formatDuration(seconds) {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
}
