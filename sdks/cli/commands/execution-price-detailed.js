"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
class ExecutionPriceDetailed extends base_command_js_1.PmxtCommand {
    static description = "Calculate detailed execution price information.";
    static aliases = ["get-execution-price-detailed"];
    static flags = { ...base_command_js_1.venueFlags, "orderbook-json": core_1.Flags.string({ description: "OrderBook JSON object. Prefix with @ to read a file.", required: true }), side: core_1.Flags.option({ options: ["buy", "sell"], description: "Order side.", required: true })(), amount: (0, base_command_js_1.numberFlag)({ description: "Number of contracts to simulate.", required: true }) };
    async run() {
        const { flags } = await this.parse(ExecutionPriceDetailed);
        const data = await this.runVenue("getExecutionPriceDetailed", [(0, params_js_1.parseJsonValue)(flags["orderbook-json"], "--orderbook-json"), flags.side, (0, params_js_1.requiredNumber)(flags.amount, "--amount")], flags);
        this.output(data, flags, "execution-price");
    }
}
exports.default = ExecutionPriceDetailed;
