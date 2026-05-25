"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
class OrderBook extends base_command_js_1.PmxtCommand {
    static description = "Fetch the current or historical order book for an outcome.";
    static aliases = ["fetch-order-book", "order-book"];
    static args = { outcomeId: core_1.Args.string({ description: "Outcome ID.", required: true }) };
    static flags = { ...base_command_js_1.venueFlags, limit: core_1.Flags.integer({ description: "Maximum number of bid/ask levels." }), side: core_1.Flags.option({ options: ["yes", "no"], description: "Outcome side." })(), outcome: core_1.Flags.string({ description: "Outcome alias or raw token ID." }), since: core_1.Flags.integer({ description: "Historical start timestamp in milliseconds." }), until: core_1.Flags.integer({ description: "Historical end timestamp in milliseconds." }) };
    async run() {
        const { args, flags } = await this.parse(OrderBook);
        const params = (0, params_js_1.buildParams)(flags, { side: "side", outcome: "outcome", since: "since", until: "until" });
        const methodArgs = [args.outcomeId];
        if (flags.limit !== undefined)
            methodArgs.push(flags.limit);
        if (Object.keys(params).length > 0) {
            if (flags.limit === undefined)
                methodArgs.push(null);
            methodArgs.push(params);
        }
        const data = await this.runVenue("fetchOrderBook", methodArgs, flags);
        this.output(data, flags, "orderbook");
    }
}
exports.default = OrderBook;
