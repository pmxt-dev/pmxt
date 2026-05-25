"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
class OrderBooks extends base_command_js_1.PmxtCommand {
    static description = "Fetch order books for multiple outcomes.";
    static aliases = ["fetch-order-books", "order-books"];
    static args = { outcomeIds: core_1.Args.string({ description: "Comma-separated outcome IDs.", required: true }) };
    static flags = { ...base_command_js_1.venueFlags };
    async run() {
        const { args, flags } = await this.parse(OrderBooks);
        const data = await this.runVenue("fetchOrderBooks", [(0, params_js_1.parseCsv)(args.outcomeIds) ?? []], flags);
        this.output(data, flags, "orderbooks");
    }
}
exports.default = OrderBooks;
