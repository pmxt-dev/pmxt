"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const server_js_1 = require("../../cli/server.js");
class ServerStart extends core_1.Command {
    static enableJsonFlag = true;
    static summary = "Start the PMXT sidecar server";
    static description = "Start the PMXT sidecar server if it is not already running.";
    async run() {
        await this.parse(ServerStart);
        const result = await (0, server_js_1.executeServerCommand)("start");
        this.log((0, server_js_1.formatServerCommandResult)(result));
        return result;
    }
}
exports.default = ServerStart;
