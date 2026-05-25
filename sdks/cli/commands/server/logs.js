"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const server_js_1 = require("../../cli/server.js");
class ServerLogs extends core_1.Command {
    static enableJsonFlag = true;
    static summary = "Show PMXT sidecar server logs";
    static description = "Show recent PMXT sidecar server log lines.";
    static flags = {
        lines: core_1.Flags.integer({
            char: "n",
            default: 50,
            description: "number of trailing log lines to show",
            min: 0,
        }),
    };
    async run() {
        const { flags } = await this.parse(ServerLogs);
        const result = await (0, server_js_1.executeServerCommand)("logs", { lines: flags.lines });
        this.log((0, server_js_1.formatServerCommandResult)(result));
        return result;
    }
}
exports.default = ServerLogs;
