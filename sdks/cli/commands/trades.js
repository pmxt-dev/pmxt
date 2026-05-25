"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
class Trades extends base_command_js_1.PmxtCommand {
    static description = "Fetch recent public trades for an outcome.";
    static aliases = ["fetch-trades"];
    static args = { outcomeId: core_1.Args.string({ description: "Outcome ID.", required: true }) };
    static flags = { ...base_command_js_1.venueFlags, start: core_1.Flags.string({ description: "Start time." }), end: core_1.Flags.string({ description: "End time." }), limit: core_1.Flags.integer({ description: "Maximum number of trades." }) };
    async run() {
        const { args, flags } = await this.parse(Trades);
        const data = await this.runVenue("fetchTrades", [args.outcomeId, (0, params_js_1.buildParams)(flags, { start: "start", end: "end", limit: "limit" })], flags);
        this.output(data, flags, "trades");
    }
}
exports.default = Trades;
