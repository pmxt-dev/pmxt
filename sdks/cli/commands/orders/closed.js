"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrderHistoryParams = buildOrderHistoryParams;
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
const params_js_1 = require("../../cli/params.js");
const orderHistoryFlags = { "market-id": core_1.Flags.string({ description: "Optional market ID filter." }), since: core_1.Flags.string({ description: "Only return records after this time." }), until: core_1.Flags.string({ description: "Only return records before this time." }), limit: core_1.Flags.integer({ description: "Maximum number of orders." }), cursor: core_1.Flags.string({ description: "Pagination cursor." }) };
function buildOrderHistoryParams(flags) {
    return (0, params_js_1.buildParams)(flags, { "market-id": "marketId", since: "since", until: "until", limit: "limit", cursor: "cursor" });
}
class OrdersClosed extends base_command_js_1.PmxtCommand {
    static description = "Fetch closed orders.";
    static aliases = ["fetch-closed-orders", "closed-orders"];
    static flags = { ...base_command_js_1.venueFlags, ...orderHistoryFlags };
    async run() {
        const { flags } = await this.parse(OrdersClosed);
        const data = await this.runVenue("fetchClosedOrders", (0, params_js_1.argsWithOptionalObject)(buildOrderHistoryParams(flags)), flags);
        this.output(data, flags, "orders");
    }
}
exports.default = OrdersClosed;
