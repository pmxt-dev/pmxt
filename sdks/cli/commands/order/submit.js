"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
const params_js_1 = require("../../cli/params.js");
class OrderSubmit extends base_command_js_1.PmxtCommand {
    static description = "Submit a pre-built order returned by order build.";
    static aliases = ["submit-order"];
    static flags = { ...base_command_js_1.venueFlags, "built-json": core_1.Flags.string({ description: "BuiltOrder JSON object. Prefix with @ to read a file.", required: true }) };
    async run() {
        const { flags } = await this.parse(OrderSubmit);
        const data = await this.runVenue("submitOrder", [(0, params_js_1.parseJsonValue)(flags["built-json"], "--built-json")], flags);
        this.output(data, flags, "order");
    }
}
exports.default = OrderSubmit;
