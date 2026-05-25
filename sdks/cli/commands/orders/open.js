"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
class OrdersOpen extends base_command_js_1.PmxtCommand {
    static description = "Fetch open orders.";
    static aliases = ["fetch-open-orders", "open-orders"];
    static flags = { ...base_command_js_1.venueFlags, "market-id": core_1.Flags.string({ description: "Optional market ID filter." }) };
    async run() {
        const { flags } = await this.parse(OrdersOpen);
        const data = await this.runVenue("fetchOpenOrders", flags["market-id"] ? [flags["market-id"]] : [], flags);
        this.output(data, flags, "orders");
    }
}
exports.default = OrdersOpen;
