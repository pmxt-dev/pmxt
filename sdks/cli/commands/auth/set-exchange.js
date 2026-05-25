"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAuthSetExchange = runAuthSetExchange;
// @ts-nocheck
const core_1 = require("@oclif/core");
const auth_store_js_1 = require("../../cli/auth-store.js");
const credentials_js_1 = require("../../cli/credentials.js");
function credentialsFromFlags(flags) {
    const fromJson = flags.credentials
        ? (0, credentials_js_1.parseExchangeCredentialsJson)(flags.credentials, "--credentials")
        : {};
    return {
        ...fromJson,
        ...(0, credentials_js_1.normalizeExchangeCredentials)({
            apiKey: flags["api-key"],
            apiSecret: flags["api-secret"],
            passphrase: flags.passphrase,
            apiToken: flags["api-token"],
            privateKey: flags["private-key"],
            signatureType: flags["signature-type"],
            funderAddress: flags["funder-address"] ?? flags["proxy-address"],
            walletAddress: flags["wallet-address"],
            baseUrl: flags["base-url"] ?? flags["venue-base-url"],
        }),
    };
}
async function runAuthSetExchange(exchange, flags, io = {}, env = process.env) {
    const normalizedExchange = exchange.trim();
    if (!normalizedExchange) {
        throw new Error("Exchange is required.");
    }
    let credentials = credentialsFromFlags(flags);
    if (Object.keys(credentials).length === 0) {
        const raw = await (0, credentials_js_1.promptSecret)("Exchange credentials JSON: ", io);
        credentials = (0, credentials_js_1.parseExchangeCredentialsJson)(raw, "credentials JSON");
    }
    await (0, auth_store_js_1.setStoredExchangeCredentials)(normalizedExchange, credentials, (0, auth_store_js_1.authStoreOptionsFromFlags)(flags, env));
    const fields = Object.keys((0, credentials_js_1.redactExchangeCredentials)(credentials)).join(", ");
    const examples = (0, credentials_js_1.exchangeCredentialEnvExamples)(normalizedExchange).join("\n");
    return [
        `Stored ${normalizedExchange} exchange credentials (${fields}).`,
        "Equivalent env examples:",
        examples,
    ].join("\n");
}
class AuthSetExchange extends core_1.Command {
    static summary = "Store venue exchange credentials for CLI use.";
    static description = "Store venue exchange credentials for CLI use. Precedence is flags > env > auth store.";
    static args = {
        exchange: core_1.Args.string({ required: true, description: "Exchange id, e.g. polymarket or kalshi." }),
    };
    static flags = {
        credentials: core_1.Flags.string({ description: "Exchange credentials JSON object." }),
        "api-key": core_1.Flags.string({ description: "Exchange API key." }),
        "api-secret": core_1.Flags.string({ description: "Exchange API secret." }),
        passphrase: core_1.Flags.string({ description: "Exchange API passphrase." }),
        "api-token": core_1.Flags.string({ description: "Exchange API token." }),
        "private-key": core_1.Flags.string({ description: "Exchange private key." }),
        "signature-type": core_1.Flags.string({ description: "Exchange signature type." }),
        "funder-address": core_1.Flags.string({ description: "Exchange funder/proxy wallet address." }),
        "proxy-address": core_1.Flags.string({ description: "Alias for --funder-address." }),
        "wallet-address": core_1.Flags.string({ description: "Exchange wallet address." }),
        "base-url": core_1.Flags.string({ description: "Exchange base URL override." }),
        "venue-base-url": core_1.Flags.string({ description: "Alias for --base-url." }),
        "auth-store": core_1.Flags.string({
            description: "Path to the PMXT CLI auth store. Defaults to ~/.pmxt/cli-auth.json.",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(AuthSetExchange);
        this.log(await runAuthSetExchange(args.exchange, flags));
    }
}
exports.default = AuthSetExchange;
