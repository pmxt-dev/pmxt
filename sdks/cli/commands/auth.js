"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const login_js_1 = require("./auth/login.js");
const logout_js_1 = require("./auth/logout.js");
const remove_exchange_js_1 = require("./auth/remove-exchange.js");
const set_exchange_js_1 = require("./auth/set-exchange.js");
const status_js_1 = require("./auth/status.js");
const status_exchange_js_1 = require("./auth/status-exchange.js");

const ACTION_ALIASES = {
    login: "login",
    logout: "logout",
    status: "status",
    "set-exchange": "set-exchange",
    set: "set-exchange",
    "remove-exchange": "remove-exchange",
    remove: "remove-exchange",
    "status-exchange": "status-exchange",
    exchange: "status-exchange",
};

class Auth extends core_1.Command {
    static summary = "Manage PMXT API key and exchange credential auth.";
    static description = [
        "Manage PMXT API key and exchange credential auth.",
        "",
        "Examples:",
        "  pmxt auth status",
        "  pmxt auth login --api-key pmxt_...",
        "  pmxt auth set-exchange polymarket --private-key 0x...",
        "  pmxt auth status-exchange polymarket",
    ].join("\n");
    static args = {
        action: core_1.Args.string({
            required: false,
            description: "Auth action: status, login, logout, set-exchange, status-exchange, or remove-exchange.",
        }),
        exchange: core_1.Args.string({
            required: false,
            description: "Exchange id for exchange credential actions.",
        }),
    };
    static flags = {
        "api-key": core_1.Flags.string({ description: "PMXT or exchange API key." }),
        "auth-store": core_1.Flags.string({
            description: "Path to the PMXT CLI auth store. Defaults to ~/.pmxt/cli-auth.json.",
        }),
        credentials: core_1.Flags.string({ description: "Exchange credentials JSON object." }),
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
    };
    async run() {
        const { args, flags } = await this.parse(Auth);
        const action = ACTION_ALIASES[args.action ?? "status"];
        if (!action) {
            throw new Error(`Unknown auth action: ${args.action}`);
        }
        if (action === "status") {
            this.log(await (0, status_js_1.runAuthStatus)(flags));
            return;
        }
        if (action === "login") {
            this.log(await (0, login_js_1.runAuthLogin)(flags));
            return;
        }
        if (action === "logout") {
            this.log(await (0, logout_js_1.runAuthLogout)(flags));
            return;
        }
        if (action === "set-exchange") {
            if (!args.exchange) {
                throw new Error("Exchange is required. Example: pmxt auth set-exchange polymarket");
            }
            this.log(await (0, set_exchange_js_1.runAuthSetExchange)(args.exchange, flags));
            return;
        }
        if (action === "remove-exchange") {
            if (!args.exchange) {
                throw new Error("Exchange is required. Example: pmxt auth remove-exchange polymarket");
            }
            this.log(await (0, remove_exchange_js_1.runAuthRemoveExchange)(args.exchange, flags));
            return;
        }
        if (action === "status-exchange") {
            this.log(await (0, status_exchange_js_1.runAuthStatusExchange)(args.exchange, flags));
        }
    }
}
exports.default = Auth;
