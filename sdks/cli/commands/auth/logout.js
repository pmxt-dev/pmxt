"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAuthLogout = runAuthLogout;
// @ts-nocheck
const core_1 = require("@oclif/core");
const auth_store_js_1 = require("../../cli/auth-store.js");
async function runAuthLogout(flags = {}, env = process.env) {
    const result = await (0, auth_store_js_1.clearStoredPmxtApiKey)((0, auth_store_js_1.authStoreOptionsFromFlags)(flags, env));
    return result.changed
        ? "Logged out of PMXT."
        : "No stored PMXT API key was found.";
}
class AuthLogout extends core_1.Command {
    static summary = "Remove the stored PMXT API key.";
    static description = "Remove the stored PMXT API key from the PMXT CLI auth store.";
    static flags = {
        "auth-store": core_1.Flags.string({
            description: "Path to the PMXT CLI auth store. Defaults to ~/.pmxt/cli-auth.json.",
        }),
    };
    async run() {
        const { flags } = await this.parse(AuthLogout);
        this.log(await runAuthLogout(flags));
    }
}
exports.default = AuthLogout;
