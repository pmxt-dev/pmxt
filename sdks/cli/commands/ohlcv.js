"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
function normalizeDateFlag(value, flagName) {
    if (value === undefined || value === null || value === "")
        return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        throw new Error(`--${flagName} must be a valid date-time string or timestamp.`);
    return parsed.toISOString();
}
function buildOHLCVParams(flags) {
    return (0, params_js_1.buildParams)(flags, { resolution: "resolution", limit: "limit" }, {
        start: normalizeDateFlag(flags.start, "start"),
        end: normalizeDateFlag(flags.end, "end"),
    });
}
class OHLCV extends base_command_js_1.PmxtCommand {
    static description = "Fetch historical OHLCV candles for an outcome.";
    static aliases = ["fetch-ohlcv"];
    static args = { outcomeId: core_1.Args.string({ description: "Outcome ID.", required: true }) };
    static flags = { ...base_command_js_1.venueFlags, resolution: core_1.Flags.string({ description: "Candle resolution.", required: true }), start: core_1.Flags.string({ description: "Start time." }), end: core_1.Flags.string({ description: "End time." }), limit: core_1.Flags.integer({ description: "Maximum number of candles." }) };
    async run() {
        const { args, flags } = await this.parse(OHLCV);
        const data = await this.runVenue("fetchOHLCV", [args.outcomeId, buildOHLCVParams(flags)], flags);
        this.output(data, flags, "candles");
    }
}
exports.default = OHLCV;
