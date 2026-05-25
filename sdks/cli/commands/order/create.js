"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrderParams = buildOrderParams;
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
const params_js_1 = require("../../cli/params.js");
const flagsForOrderParams = {
    "market-id": core_1.Flags.string({ description: "Market ID." }),
    "outcome-id": core_1.Flags.string({ description: "Outcome ID." }),
    side: core_1.Flags.option({ options: ["buy", "sell"], description: "Order side." })(),
    type: core_1.Flags.option({ options: ["market", "limit"], description: "Order type." })(),
    amount: (0, base_command_js_1.numberFlag)({ description: "Number of contracts." }),
    price: (0, base_command_js_1.numberFlag)({ description: "Limit price." }),
    fee: (0, base_command_js_1.numberFlag)({ description: "Optional fee rate." }),
    "params-json": core_1.Flags.string({ description: "CreateOrderParams JSON object. CLI flags override this object. Prefix with @ to read a file." }),
};
function buildOrderParams(flags) {
    const params = (0, params_js_1.mergeJsonParams)(flags, "params-json", (0, params_js_1.buildParams)(flags, { "market-id": "marketId", "outcome-id": "outcomeId", side: "side", type: "type", amount: "amount", price: "price", fee: "fee" }));
    validateOrderParams(params);
    return params;
}
function isMissing(value) {
    return value === undefined || value === null || value === "";
}
function requireFiniteNumber(params, key) {
    if (typeof params[key] !== "number" || !Number.isFinite(params[key])) {
        throw new Error(`Invalid order ${key}. Expected a finite number.`);
    }
}
function validateOrderParams(params) {
    const missing = [];
    for (const key of ["marketId", "outcomeId", "side", "type", "amount"]) {
        if (isMissing(params[key]))
            missing.push(key);
    }
    if (params.type === "limit" && isMissing(params.price)) {
        missing.push("price");
    }
    if (missing.length > 0) {
        throw new Error(`Missing required order fields: ${missing.join(", ")}. Provide flags or --params-json.`);
    }
    if (!["buy", "sell"].includes(params.side)) {
        throw new Error("Invalid order side. Expected 'buy' or 'sell'.");
    }
    if (!["market", "limit"].includes(params.type)) {
        throw new Error("Invalid order type. Expected 'market' or 'limit'.");
    }
    requireFiniteNumber(params, "amount");
    if (!isMissing(params.price)) {
        requireFiniteNumber(params, "price");
    }
    if (!isMissing(params.fee)) {
        requireFiniteNumber(params, "fee");
    }
}
class OrderCreate extends base_command_js_1.PmxtCommand {
    static description = "Build and submit a new order.";
    static aliases = ["create-order"];
    static flags = { ...base_command_js_1.venueFlags, ...flagsForOrderParams };
    async run() {
        const { flags } = await this.parse(OrderCreate);
        const data = await this.runVenue("createOrder", [buildOrderParams(flags)], flags);
        this.output(data, flags, "order");
    }
}
exports.default = OrderCreate;
