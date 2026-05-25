"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAuthStatusExchange = runAuthStatusExchange;
// @ts-nocheck
const core_1 = require("@oclif/core");
const auth_store_js_1 = require("../../cli/auth-store.js");
const credentials_js_1 = require("../../cli/credentials.js");
function formatSources(sourcesByField) {
    const parts = Object.entries(sourcesByField)
        .map(([field, source]) => `${field}:${source}`);
    return parts.length > 0 ? parts.join(", ") : "none";
}
async function runAuthStatusExchange(exchange, flags = {}, env = process.env) {
    const options = (0, auth_store_js_1.authStoreOptionsFromFlags)(flags, env);
    const store = await (0, auth_store_js_1.readAuthStore)(options);
    if (exchange) {
        const resolved = await (0, credentials_js_1.resolveExchangeCredentials)(exchange, { ...options, store });
        if (!resolved.credentials) {
            return `${exchange} exchange credentials: not configured.`;
        }
        const redacted = (0, credentials_js_1.redactExchangeCredentials)(resolved.credentials);
        const fields = Object.entries(redacted)
            .map(([field, value]) => `${field}=${value}`)
            .join(", ");
        return [
            `${exchange} exchange credentials: configured via ${resolved.source}.`,
            `Fields: ${fields}`,
            `Sources: ${formatSources(resolved.sourcesByField)}`,
        ].join("\n");
    }
    const storedExchanges = Object.keys(store.exchanges).sort();
    const envVars = (0, credentials_js_1.listExchangeCredentialEnvVars)(env);
    const lines = ["Stored exchange credentials:"];
    lines.push(storedExchanges.length > 0 ? storedExchanges.map((name) => `- ${name}`).join("\n") : "none");
    lines.push("Environment exchange credential vars:");
    lines.push(envVars.length > 0 ? envVars.map((name) => `- ${name}`).join("\n") : "none");
    return lines.join("\n");
}
class AuthStatusExchange extends core_1.Command {
    static summary = "Show exchange credential auth status.";
    static description = "Show exchange credential auth status. Precedence is flags > env > auth store.";
    static args = {
        exchange: core_1.Args.string({ required: false, description: "Exchange id, e.g. polymarket or kalshi." }),
    };
    static flags = {
        "auth-store": core_1.Flags.string({
            description: "Path to the PMXT CLI auth store. Defaults to ~/.pmxt/cli-auth.json.",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(AuthStatusExchange);
        this.log(await runAuthStatusExchange(args.exchange, flags));
    }
}
exports.default = AuthStatusExchange;
