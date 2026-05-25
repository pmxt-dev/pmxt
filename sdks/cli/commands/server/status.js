"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const server_js_1 = require("../../cli/server.js");
class ServerStatus extends core_1.Command {
    static enableJsonFlag = true;
    static summary = "Show PMXT sidecar server status";
    static description = "Show the current PMXT sidecar server status without starting it.";
    async run() {
        await this.parse(ServerStatus);
        const result = await (0, server_js_1.executeServerCommand)("status");
        this.log((0, server_js_1.formatServerCommandResult)(result));
        return result;
    }
}
exports.default = ServerStatus;
