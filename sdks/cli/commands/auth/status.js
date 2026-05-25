"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAuthStatus = runAuthStatus;
// @ts-nocheck
const core_1 = require("@oclif/core");
const auth_store_js_1 = require("../../cli/auth-store.js");
const credentials_js_1 = require("../../cli/credentials.js");
async function runAuthStatus(flags = {}, env = process.env) {
    const options = (0, auth_store_js_1.authStoreOptionsFromFlags)(flags, env);
    const store = await (0, auth_store_js_1.readAuthStore)(options);
    const resolved = await (0, credentials_js_1.resolvePmxtApiKey)({ ...options, store });
    const storePath = (0, auth_store_js_1.getAuthStorePath)(options);
    if (!resolved.pmxtApiKey) {
        return [
            "PMXT API key: not configured.",
            "Set PMXT_API_KEY or run pmxt auth login.",
        ].join("\n");
    }
    const detail = resolved.source === "env"
        ? "PMXT_API_KEY"
        : resolved.source === "store"
            ? storePath
            : resolved.source;
    return `PMXT API key: configured via ${detail} (${(0, credentials_js_1.redactSecret)(resolved.pmxtApiKey)}).`;
}
class AuthStatus extends core_1.Command {
    static summary = "Show PMXT API key auth status.";
    static description = "Show PMXT API key auth status. Precedence is flags > env > auth store.";
    static flags = {
        "auth-store": core_1.Flags.string({
            description: "Path to the PMXT CLI auth store. Defaults to ~/.pmxt/cli-auth.json.",
        }),
    };
    async run() {
        const { flags } = await this.parse(AuthStatus);
        this.log(await runAuthStatus(flags));
    }
}
exports.default = AuthStatus;
