"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PmxtCommand = exports.callFlags = exports.enterpriseFlags = exports.routerFlags = exports.venueFlags = exports.credentialFlags = exports.commonFlags = exports.numberFlag = void 0;
const core_1 = require("@oclif/core");
const output_js_1 = require("./output.js");
const runtime_js_1 = require("./runtime.js");
exports.numberFlag = core_1.Flags.custom({
    parse: async (input) => {
        const value = Number(input);
        if (Number.isNaN(value))
            throw new Error(`Expected a number, got '${input}'`);
        return value;
    },
});
exports.commonFlags = {
    json: core_1.Flags.boolean({ description: "Output raw response data as JSON." }),
    "base-url": core_1.Flags.string({ description: "PMXT API base URL. Defaults to hosted when PMXT_API_KEY is set, otherwise the local sidecar." }),
    "pmxt-api-key": core_1.Flags.string({ description: "PMXT API key. Precedence: flags > env > auth store. Env: PMXT_API_KEY." }),
    "auth-store": core_1.Flags.string({ description: "Path to a PMXT CLI auth store JSON file." }),
};
exports.credentialFlags = {
    credentials: core_1.Flags.string({ description: "Venue credentials as a JSON object. Precedence: flags > env > auth store. Env: PMXT_<EXCHANGE>_CREDENTIALS." }),
    "api-key": core_1.Flags.string({ description: "Venue API key. Precedence: flags > env > auth store. Env: PMXT_POLYMARKET_API_KEY or PMXT_<EXCHANGE>_CREDENTIALS." }),
    "api-secret": core_1.Flags.string({ description: "Venue API secret. Precedence: flags > env > auth store. Env: PMXT_POLYMARKET_API_SECRET." }),
    passphrase: core_1.Flags.string({ description: "Venue API passphrase. Precedence: flags > env > auth store. Env: PMXT_POLYMARKET_PASSPHRASE." }),
    "api-token": core_1.Flags.string({ description: "Venue API token. Precedence: flags > env > auth store. Env: PMXT_POLYMARKET_API_TOKEN." }),
    "private-key": core_1.Flags.string({ description: "Venue private key. Precedence: flags > env > auth store. Env: PMXT_POLYMARKET_PRIVATE_KEY." }),
    "signature-type": core_1.Flags.string({ description: "Venue signature type. Precedence: flags > env > auth store. Env: PMXT_POLYMARKET_SIGNATURE_TYPE." }),
    "funder-address": core_1.Flags.string({ description: "Venue funder address. Precedence: flags > env > auth store. Env: PMXT_POLYMARKET_FUNDER_ADDRESS." }),
    "proxy-address": core_1.Flags.string({ description: "Alias for --funder-address." }),
    "wallet-address": core_1.Flags.string({ description: "Venue wallet address. Precedence: flags > env > auth store. Env: PMXT_POLYMARKET_WALLET_ADDRESS." }),
    "venue-base-url": core_1.Flags.string({ description: "Venue-native API base URL credential override." }),
};
exports.venueFlags = { ...exports.commonFlags, exchange: core_1.Flags.string({ char: "e", description: "Venue exchange.", default: "polymarket" }), ...exports.credentialFlags };
exports.routerFlags = { ...exports.commonFlags };
exports.enterpriseFlags = { ...exports.commonFlags };
exports.callFlags = { ...exports.venueFlags, router: core_1.Flags.boolean({ description: "Dispatch to /api/router/:method instead of /api/:exchange/:method." }) };
class PmxtCommand extends core_1.Command {
    async runVenue(method, args, flags) {
        return (0, runtime_js_1.runVenueMethod)(method, args, flags);
    }
    async runRouter(method, args, flags) {
        return (0, runtime_js_1.runRouterMethod)(method, args, flags);
    }
    async runEnterpriseGet(path, params, flags) {
        return (0, runtime_js_1.runEnterpriseGet)(path, params, flags);
    }
    async runEnterpriseSql(query, flags) {
        return (0, runtime_js_1.runEnterpriseSql)(query, flags);
    }
    async runAllowed(method, args, flags) {
        return (0, runtime_js_1.runAllowedMethod)(method, args, flags);
    }
    output(data, flags, label) {
        (0, output_js_1.outputResult)(this, data, flags, { label });
    }
}
exports.PmxtCommand = PmxtCommand;
