"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const server_js_1 = require("../../cli/server.js");
class ServerRestart extends core_1.Command {
    static enableJsonFlag = true;
    static summary = "Restart the PMXT sidecar server";
    static description = "Stop the current PMXT sidecar server, then start it again.";
    async run() {
        await this.parse(ServerRestart);
        const result = await (0, server_js_1.executeServerCommand)("restart");
        this.log((0, server_js_1.formatServerCommandResult)(result));
        return result;
    }
}
exports.default = ServerRestart;
