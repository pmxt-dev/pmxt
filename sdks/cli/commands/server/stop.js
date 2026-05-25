"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const server_js_1 = require("../../cli/server.js");
class ServerStop extends core_1.Command {
    static enableJsonFlag = true;
    static summary = "Stop the PMXT sidecar server";
    static description = "Stop the PMXT sidecar server and clean up the server lock file.";
    async run() {
        await this.parse(ServerStop);
        const result = await (0, server_js_1.executeServerCommand)("stop");
        this.log((0, server_js_1.formatServerCommandResult)(result));
        return result;
    }
}
exports.default = ServerStop;
