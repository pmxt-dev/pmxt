"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
class OrderCancel extends base_command_js_1.PmxtCommand {
    static description = "Cancel an existing open order.";
    static aliases = ["cancel-order"];
    static args = { orderId: core_1.Args.string({ description: "Order ID.", required: true }) };
    static flags = { ...base_command_js_1.venueFlags };
    async run() {
        const { args, flags } = await this.parse(OrderCancel);
        const data = await this.runVenue("cancelOrder", [args.orderId], flags);
        this.output(data, flags, "order");
    }
}
exports.default = OrderCancel;
