"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAuthRemoveExchange = runAuthRemoveExchange;
// @ts-nocheck
const core_1 = require("@oclif/core");
const auth_store_js_1 = require("../../cli/auth-store.js");
async function runAuthRemoveExchange(exchange, flags = {}, env = process.env) {
    const normalizedExchange = exchange.trim();
    if (!normalizedExchange) {
        throw new Error("Exchange is required.");
    }
    const result = await (0, auth_store_js_1.clearStoredExchangeCredentials)(normalizedExchange, (0, auth_store_js_1.authStoreOptionsFromFlags)(flags, env));
    return result.changed
        ? `Removed stored ${normalizedExchange} exchange credentials.`
        : `No stored ${normalizedExchange} exchange credentials were found.`;
}
class AuthRemoveExchange extends core_1.Command {
    static summary = "Remove stored exchange credentials.";
    static description = "Remove stored exchange credentials from the PMXT CLI auth store.";
    static args = {
        exchange: core_1.Args.string({ required: true, description: "Exchange id, e.g. polymarket or kalshi." }),
    };
    static flags = {
        "auth-store": core_1.Flags.string({
            description: "Path to the PMXT CLI auth store. Defaults to ~/.pmxt/cli-auth.json.",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(AuthRemoveExchange);
        this.log(await runAuthRemoveExchange(args.exchange, flags));
    }
}
exports.default = AuthRemoveExchange;
