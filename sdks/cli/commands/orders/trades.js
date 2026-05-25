"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
const params_js_1 = require("../../cli/params.js");
class OrdersTrades extends base_command_js_1.PmxtCommand {
    static description = "Fetch authenticated user trade history.";
    static aliases = ["fetch-my-trades", "my-trades"];
    static flags = { ...base_command_js_1.venueFlags, "outcome-id": core_1.Flags.string({ description: "Optional outcome ID filter." }), "market-id": core_1.Flags.string({ description: "Optional market ID filter." }), since: core_1.Flags.string({ description: "Only return records after this time." }), until: core_1.Flags.string({ description: "Only return records before this time." }), limit: core_1.Flags.integer({ description: "Maximum number of trades." }), cursor: core_1.Flags.string({ description: "Pagination cursor." }) };
    async run() {
        const { flags } = await this.parse(OrdersTrades);
        const params = (0, params_js_1.buildParams)(flags, { "outcome-id": "outcomeId", "market-id": "marketId", since: "since", until: "until", limit: "limit", cursor: "cursor" });
        const data = await this.runVenue("fetchMyTrades", (0, params_js_1.argsWithOptionalObject)(params), flags);
        this.output(data, flags, "trades");
    }
}
exports.default = OrdersTrades;
