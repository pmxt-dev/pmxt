"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAuthLogin = runAuthLogin;
// @ts-nocheck
const core_1 = require("@oclif/core");
const auth_store_js_1 = require("../../cli/auth-store.js");
const credentials_js_1 = require("../../cli/credentials.js");
function apiKeyFromFlags(flags) {
    return flags["api-key"] ?? flags.apiKey;
}
async function runAuthLogin(flags, io = {}, env = process.env) {
    const apiKey = apiKeyFromFlags(flags)
        ?? await (0, credentials_js_1.promptSecret)("PMXT API key: ", io);
    const trimmed = apiKey?.trim();
    if (!trimmed) {
        throw new Error("PMXT API key is required.");
    }
    await (0, auth_store_js_1.setStoredPmxtApiKey)(trimmed, (0, auth_store_js_1.authStoreOptionsFromFlags)(flags, env));
    return `Logged in to PMXT as ${(0, credentials_js_1.redactSecret)(trimmed)}.`;
}
class AuthLogin extends core_1.Command {
    static summary = "Store a PMXT API key for CLI use.";
    static description = "Store a PMXT API key for CLI use. Precedence is flags > env > auth store.";
    static flags = {
        "api-key": core_1.Flags.string({
            description: "PMXT API key. Use PMXT_API_KEY for env-based auth.",
        }),
        "auth-store": core_1.Flags.string({
            description: "Path to the PMXT CLI auth store. Defaults to ~/.pmxt/cli-auth.json.",
        }),
    };
    async run() {
        const { flags } = await this.parse(AuthLogin);
        this.log(await runAuthLogin(flags));
    }
}
exports.default = AuthLogin;
