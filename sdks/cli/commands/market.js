"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
const markets_js_1 = require("./markets.js");
class Market extends base_command_js_1.PmxtCommand {
    static description = "Fetch a single market by lookup parameters.";
    static aliases = ["fetch-market"];
    static flags = { ...base_command_js_1.venueFlags, ...markets_js_1.marketFlags };
    async run() {
        const { flags } = await this.parse(Market);
        const data = await this.runVenue("fetchMarket", (0, params_js_1.argsWithOptionalObject)((0, markets_js_1.buildMarketParams)(flags)), flags);
        this.output(data, flags, "market");
    }
}
exports.default = Market;
