"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const base_command_js_1 = require("../../cli/base-command.js");
const params_js_1 = require("../../cli/params.js");
const closed_js_1 = require("./closed.js");
const closed_js_2 = __importDefault(require("./closed.js"));
class OrdersAll extends base_command_js_1.PmxtCommand {
    static description = "Fetch all orders.";
    static aliases = ["fetch-all-orders", "all-orders"];
    static flags = closed_js_2.default.flags;
    async run() {
        const { flags } = await this.parse(OrdersAll);
        const data = await this.runVenue("fetchAllOrders", (0, params_js_1.argsWithOptionalObject)((0, closed_js_1.buildOrderHistoryParams)(flags)), flags);
        this.output(data, flags, "orders");
    }
}
exports.default = OrdersAll;
