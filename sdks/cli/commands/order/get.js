"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
class OrderGet extends base_command_js_1.PmxtCommand {
    static description = "Fetch a specific order by ID.";
    static aliases = ["fetch-order"];
    static args = { orderId: core_1.Args.string({ description: "Order ID.", required: true }) };
    static flags = { ...base_command_js_1.venueFlags };
    async run() {
        const { args, flags } = await this.parse(OrderGet);
        const data = await this.runVenue("fetchOrder", [args.orderId], flags);
        this.output(data, flags, "order");
    }
}
exports.default = OrderGet;
